# Browser Runtime — Airgap Unification (Playwright)

> **Статус:** `evolve` — план, требует вердикта Максима по решающему развилке (см. §6).
> **Дата:** 27 авг 2026. **Автор:** Dev-режим (DeepSeek V4 Pro).
> **Проблема:** окна Chrome на десктопе оператора + два браузерных мира (Selenium Grid для execution, Playwright для authoring) + отсутствие браузерного рантайма на проде (airgap).

---

## 1. Факты (из кода, не из головы)

### Два браузерных мира сегодня

| Мир | Где живёт | Бинарь | Для чего | Стрим в коробку |
|---|---|---|---|---|
| **Selenium Grid** | `services/docker-compose.yml`: `selenium/hub` + `node-chrome` + `node-firefox` + `chrome-video` (4 образа) | Selenium'овские Chrome/Firefox | **Execution** (прогоны) | noVNC `:7900`/`:7901` |
| **Playwright** | `requirements.txt` строка 2: `playwright>=1.62` | свой Chromium (`chromium-1234` = "Chrome for Testing" 151.0.7922.34), Firefox (`firefox-1538` = 153.0), WebKit | **Authoring** (запись шагов) + полуготовый execution | нет (сейчас headless + скриншот) |

### Split-brain в коде (подтверждён)

- **Execution (Controller)** жёстко на Selenium: `core/controller.py:179` → `WebDriverAdapter(...)` + `BrowserAdapter(webdriver_adapter)`. Никакого Playwright в боевом пути прогона.
- **`BrowserAdapter`** (745 строк) — Selenium CDP через `execute_cdp_cmd` (cache/cookies/console logs).
- **`PlaywrightAdapter`** (428 строк) — написан ПОЛНОСТЬЮ (nav/click/fill/type/cookies/storage/screenshot/auth/headers/init-script), но **не подключён** к Controller. Docstring врёт «Registers as both webdriver and browser» — grep показывает, что Controller импортирует только `WebDriverAdapter`/`BrowserAdapter`.
- **`automation_runner.py`** (consumer) — Playwright-only, но «no scanner/Dojo/Allure» (стендалон).
- **`browser_service.py`** (authoring) — ad-hoc глобалы Playwright, headless + скриншот-костыль.
- Registry привязан к Selenium: `wired_validate.py`, `export_keywords.py`, `locator_heal_runtime.py`, `gather_info.py`, `session_bridge.py`, `selene_bridge.py` → все на `WebDriverAdapter`.

### Airgap — что это значит для доставки

- Нет Docker Hub / PyPI / npm в момент деплоя.
- Всё возится как pre-baked артефакты: `docker save` образов, wheel-tarball'ы, npm bundle.
- Правило: **минимум разных образов, каждый самодостаточен** (браузер + системные либы + ffmpeg внутри).

---

## 2. Ответы на вопросы Максима

### Q1. Что лучше для airgap?

**Один Playwright-образ вместо четырёх Selenium.** Playwright официально собирает в один образ `mcr.microsoft.com/playwright/python` (или свой Dockerfile с `playwright install --with-deps chromium firefox`) сразу **chromium + firefox + webkit + ffmpeg + все системные зависимости**. Для airgap это идеал: один `docker save` → один `docker load`, ноль внешних зависимостей в момент развёртывания.

### Q2. Если тянем Playwright — съехать в него хромом И лисой?

**Да.** Playwright тащит оба (и webkit бонусом) в одном бинаре-наборе. Selenium для этого держит два отдельных node-образа + hub + video-sidecar. Держать оба мира = платить двойной размер образа и двойную матрицу обновлений без причины.

### Q3. Execution туда перевести? Это возможно?

**Да, возможно.** Более того, кодовая база УЖЕ на полпути: `PlaywrightAdapter` реализован целиком, `PlaywrightBrowserRuntime` (launch/connect_over_cdp/new_context/close) готов, `automation_runner.py` уже гоняет wired-сценарии на Playwright. Но честно:

**Миграция execution — это недели, не weekend.** Затронуто боевое ядро:
- Controller → переключить с `WebDriverAdapter` на `PlaywrightAdapter` (за флагом).
- `BrowserAdapter` CDP-поверхность → `page.context.new_cdp_session()` / нативные Playwright-эквиваленты.
- `locator_heal_runtime`, `gather_info`, `selene_bridge`, `session_bridge` → WebDriver-специфика, переписывается.
- Видео: Grid `chrome-video` (MP4 + `run_id` нейминг) → Playwright `record_video_dir` (webm) + ffmpeg-транскод.
- Live-вид: Grid noVNC `:7900/:7901` → headed Playwright под **Xvfb** + noVNC (тот же пользовательский результат).
- ~15 тест-файлов + `wired_validate.py` + `export_keywords.py` (registry `webdriver`→Playwright).

### Нюансы, которые нельзя замалчивать

1. **Прокси в scanner.** Execution гонит трафик браузера через scanner-прокси (`127.0.0.1:port`). В контейнере loopback = сам контейнер → тот же грабли, что уже решены в `webdriver_adapter._resolve_proxy` (`host.docker.internal`). Playwright-контейнеру нужен тот же маршрут.
2. **Playwright Firefox ≠ Selenium Firefox.** Playwright гоняет патченный Gecko (juggler-протокол). Для DAST покрытия это настоящий Gecko, но не бинарно тот же Firefox, что в Selenium. Для сканера риск низкий, для «браузерного покрытия» — стоит зафиксировать.
3. **Видеоформат.** `record_video_dir` даёт webm, Monitor сейчас ждёт MP4 (`?run_id=` replay). `<video>` ест оба, но транскод через ffmpeg нужен для точного контракта.

---

## 3. Целевая архитектура (после миграции)

```
Коробка (prod / airgap):
  ┌─ Playwright container (один образ: chromium+firefox+webkit+ffmpeg) ─┐
  │   - authoring  → headed Chromium под Xvfb → стрим в коробку (noVNC)  │
  │   - execution  → headless ИЛИ headed под Xvfb (operator watch)        │
  │   - observe→DSL → expose_binding + AX snapshot (Playwright-native)    │
  │   - video      → record_video_dir (+ ffmpeg → MP4 для Monitor)        │
  └───────────────────────────────────────────────────────────────────────┘
        │  прокси → scanner (host.docker.internal, как уже сделано у Selenium)
        ▼
  scanner (отдельный контейнер, как сейчас) — сканер, браузер только водит.

Юзер (airgap):
  - открывает веб-UI коробки в СВОЁМ браузере (он у него и так есть)
  - видит стрим (noVNC / screencast), кликает в UI
  - на его десктопе НИЧЕГО не спавнится
```

**Ключевой инвариант:** бинарь браузера = зависимость образа коробки, а НЕ «Chrome с десктопа юзера». Десктоп юзера трогаем ровно ноль раз.

---

## 4. Нарезка эпиков (пофазовая, с GWT-приёмкой)

### Эпик PW-AIRGAP-1 — Authoring на Playwright в контейнере (сначала боль с окнами)

| ID | Что получает оператор | GWT (приёмка) |
|---|---|---|
| **PW-A1** | Один контейнер Playwright (chromium+firefox+webkit) поднимается compose'ом, headed Chromium под Xvfb, noVNC на канон-порту. | **Given:** `lab_up` поднят. **When:** контейнер стартовал. **Then:** один Playwright-процесс, headed-браузер живёт в контейнере, на десктопе хоста ноль окон Chrome; noVNC отдаёт живой экран. |
| **PW-A2** | `browser_service.py` authoring привязывается к headed-браузеру контейнера, а не к headless-костылю. Клик = живой DOM (hover/анимация живые). | **Given:** автор открыл Studio/BrowserStage. **When:** он кликает по живому стриму. **Then:** реальный клик в headed Chromium; observe ловит event → proposal → DSL; hover/фокус живые. |
| **PW-A3** | Стрим в коробку — `<iframe>` noVNC (или CDP screencast), не скриншот-поллинг. | **Given:** браузер поднят. **When:** открыт BrowserStage. **Then:** живой поток, не снимки; скриншот-поллинг удалён из авторского пути. |
| **PW-A4** | Ровно один браузер на сессию авторинга; повторный вход переиспользует, не спавнит. | **Given:** браузер жив. **When:** повторно открыт таб/студия. **Then:** тот же `browserId`, новых процессов нет; `status()` не запускает браузер никогда. |

### Эпик PW-AIRGAP-2 — Execution parity на Playwright (за флагом)

| ID | Что получает оператор | GWT (приёмка) |
|---|---|---|
| **PW-E1** | Controller умеет гонять прогон через `PlaywrightAdapter` за флагом `PK_BROWSER_RUNTIME=playwright`, дефолт остаётся `selenium`. | **Given:** wired с chrome/firefox. **When:** run с флагом playwright. **Then:** навигация/клики/заполнения идут через Playwright; scanner-прокси подхвачен; evidence тот же контракт. |
| **PW-E2** | CDP-поверхность `BrowserAdapter` (cache/cookies/console logs) переписана на Playwright-native/`new_cdp_session`. | **Given:** шаг «ОчиститьКэш»/«ОчиститьCookies». **When:** run на playwright. **Then:** результат идентичен Selenium; консоль-логи собраны. |
| **PW-E3** | Видео: `record_video_dir` + `run_id` нейминг + ffmpeg→MP4; Monitor replay работает. | **Given:** run записан. **When:** открыт Monitor `?run_id=`. **Then:** видео воспроизводится тем же путём, что и Grid-видео. |
| **PW-E4** | Live-вид execution: headed под Xvfb → noVNC, оператор видит прогон. | **Given:** run в headed-режиме. **When:** открыт Live. **Then:** живой экран прогона, не пустой desktop. |
| **PW-E5** | Parity-прогон: одинаковый wired гоняется на Selenium и Playwright (chrome+firefox, headed+headless) до зелёного. | **Given:** набор wired-фикстур. **When:** parity run. **Then:** одинаковые verdict/evidence, расхождения = баг, фиксируется до cutover. |

### Эпик PW-AIRGAP-3 — Cutover + Airgap bundle

| ID | Что получает оператор | GWT (приёмка) |
|---|---|---|
| **PW-C1** | Дефолт переключён на Playwright; Selenium Grid выпилен из compose (hub/node/video). | **Given:** parity зелёный. **When:** cutover. **Then:** execution идёт на Playwright; Grid-сервисы не поднимаются; wired `browser_type` контракт не сломан. |
| **PW-C2** | Airgap bundle: один образ Playwright (браузеры+либы+ffmpeg) экспортируется `docker save`, грузится `docker load` на чистом хосте. | **Given:** чистый airgap-хост без интернета. **When:** load + up. **Then:** `playwright install` НЕ вызывается (браузеры уже в образе); authoring+execution работают офлайн. |
| **PW-C3** | Registry вычищен: `export_keywords`/`wired_validate`/тесты больше не тянут `WebDriverAdapter` как боевой путь. | **Given:** cutover. **When:** `test_suite_imports` + smoke. **Then:** registry maps на Playwright; 0 ссылок на боевой Selenium-путь. |

### Out of scope (явно)

- Переписывание scanner (сканер) — не трогаем, он отдельный.
- WebKit как обязательное браузерное покрытие — бонус в образе, в wired не добавляем без приказа.
- Crawler-функции `crawl_urls`/`gather_info` на полную замену — мигрируем только то, что в боевом пути прогона.

---

## 5. Оценка усилий (порядок)

| Эпик | Объём | Риск |
|---|---|---|
| PW-AIRGAP-1 (authoring) | средний, разблокирует боль «окна» сразу | низкий |
| PW-AIRGAP-2 (execution parity) | крупный (боевое ядро + видео + live + CDP) | средний/высокий |
| PW-AIRGAP-3 (cutover + bundle) | средний | средний |

---

## 6. Решающий развилок (нужен вердикт Максима)

Два пути, оба «чистые», но разный риск/скорость:

- **Путь A — Unify now (рекомендую):** сразу PW-1 → PW-2 → PW-3, один Playwright-мир, Selenium выпиливается после parity. Дольше, но это финальная чистая архитектура и airgap-оптимум.
- **Путь B — Authoring first, execution потом:** PW-1 сейчас (гасит боль с окнами и закрывает authoring), Selenium execution живёт как есть, PW-2/PW-3 отдельным заходом. Меньше риска для боевого прогона, но split-brain живёт дольше.

**Мой вердикт: Путь A**, потому что split-brain уже дорого стоит (PlaywrightAdapter написан впустую, два мира образов, authoring-костыль на headless). С флагом `PK_BROWSER_RUNTIME` и parity-прогоном риск cutover управляем — Selenium остаётся фолбэком до зелёного.
