# Friend Request: PW-BROWSER-CORE — Playwright как Browser Core коробки

> **Статус:** `ready` (к вечернему 2FA)  
> **Гриф:** ЖИР. Банк — when/if, не now.  
> **Авторы:** Boss, Luna, Flash  
> **Дата:** 22 августа 2026  
> **Контекст:** Переход от «Selenium + CDP adapter» к Playwright как первоклассному браузерному рантайму `secops-lab-pure`. Хватит пихать CDP костылями — делаем полноценный Browser Core.

---

## 1. Тезис

Playwright — **основной браузерный рантайм коробки**. Три режима, один action-слой, ноль ограничений банка.

```text
                     Playwright Browser Core
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   launch()           connectOverCDP()    BrowserContext × N
   автопрогон           живой агент        discovery / fuzz
   discovery            оператор           multi-role
   регрессия            Live VNC           изоляция
```

**Не делаем:**
- Полумеры «только CDP attach».
- Копирование `D:\prettyk-atest` как есть — у нас своя архитектура.
- Выпиливание Selenium из банковского контура — банк живёт своей жизнью.
- Selenium + Playwright на одной странице — **один владелец страницы**.

---

## 2. Матрица движков и режимов

| Движок | Что это | Зачем |
|---|---|---|
| **Chromium (bundled)** | Каноничный бинарник, зашит в версию Playwright | **Default.** Discovery, тесты, CI. Стабильный CDP, не зависит от установленного в ОС Chrome. |
| **Google Chrome** | Системный канал `channel: "chrome"` | Проверка специфичного поведения проприетарного Chrome (кодеки, enterprise-политики). |
| **Firefox** | Патченный Gecko с Playwright-протоколом | Кроссбраузерный фаззинг / поиск XSS/DOM-расхождений между движками. |
| **WebKit** | Порт WebKit (Safari engine) | Поведение под iOS/Safari без macOS. |

### Headless vs Headed

| Режим | Когда |
|---|---|
| **`headless: true`** | CI/CD, discovery-краулер, пакетный фаззинг, фоновая регрессия. ×3–4 меньше RAM/CPU. |
| **`headless: false`** | PrettyK Live, noVNC (`:7900`), запись видео (`recordVideo`), операторская отладка, визуальная валидация. |

---

## 3. Три режима запуска (контракт Browser Core)

### Mode A — Launch (автономный прогон)

```python
browser = await chromium.launch(headless=True)
context = await browser.new_context(
    proxy={"server": "http://127.0.0.1:8080"},
    ignore_https_errors=True,
)
page = await context.new_page()
await page.goto("http://juice-shop:3000")
```

- Оркестратор сам поднимает браузер. Без Selenium Grid, без внешнего WebDriver.
- Работает в Docker-контейнере (`npx playwright install --with-deps chromium`).
- scanner-проксирование через `proxy` в `browser.new_context()` — трафик гарантированно в scanner. Сертификаты не нужны.

### Mode B — connectOverCDP (живая сессия агента/оператора)

```python
browser = await chromium.connect_over_cdp("http://127.0.0.1:9222")
context = browser.contexts[0]
page = context.pages[0]
```

- Подключение к уже открытому Chrome агента (`--remote-debugging-port=9222`).
- Используется для: Discovery под руками оператора, Live-наблюдение, CDP-агент, отладка.
- Тот же action/probe слой, что и у Launch — прозрачно.

### Mode C — BrowserContext × N (multi-role / fuzz изоляция)

```python
ctx_admin = await browser.new_context(storage_state="admin.json")
ctx_guest = await browser.new_context(storage_state="guest.json")
```

- Лёгкие изолированные контексты: куки, localStorage, прокси — всё раздельно.
- Создание контекста — ~10 мс, не перезапуск браузера.
- Discovery под N ролями: Admin → Manager → Guest — параллельно, без перезапуска.

---

## 4. Что Playwright даёт Friends Discovery

Текущий `discovery_cdp_recorder.py` — тонкий слой над сырым CDP. Playwright заменяет его натурно.

| Возможность | Было (CDP adapter) | Стало (Playwright) |
|---|---|---|
| CDP-команды | `driver.execute_cdp_cmd()` вручную | Playwright API: `page.accessibility.snapshot()`, `page.route()`, `page.evaluate()` |
| DOM extraction | `extract_elements()` по AX-нодам | `page.accessibility.snapshot()` + `page.evaluate(() => document.body.innerHTML)` |
| Network interception | Ручной `Network.enable` + слушатель | `page.route('**/*', handler)` с моком/логированием/инжектом |
| BrowserContext изоляция | Нет — один driver на сессию | `browser.new_context()` за 10 мс |
| scanner через прокси | `--proxy-server=` при старте драйвера | `proxy` в `new_context()` — без перезапуска |
| console/page errors | `get_log('browser')` | `page.on('console')`, `page.on('pageerror')` |
| Locator scoring | Ручной `candidates` builder | Playwright `getByRole`/`getByLabel`/`getByTestId` — встроенная приоритизация |
| Action trace | Ручной `record_action()` | `page.on('request')` / `page.on('response')` — полный трейс нажатия |

---

## 5. Контракт `wired.json` (Infrastructure)

Сейчас зажато:

```python
browser_type: Literal["chrome", "chrome-headless", "firefox", "firefox-headless"]
```

### Предлагаемое расширение (backward-compatible)

```python
browser_type: Literal[
    # -- Playwright (new) --
    "pw-chromium", "pw-chromium-headless",      # bundled Chromium (default)
    "pw-chrome", "pw-chrome-headless",           # system Chrome channel
    "pw-firefox", "pw-firefox-headless",         # Gecko
    "pw-webkit", "pw-webkit-headless",           # WebKit
    # -- Selenium (legacy / bank) --
    "chrome", "chrome-headless",
    "firefox", "firefox-headless",
]
```

| Поле | Смысл |
|---|---|
| `browser_type` | Выбор движка и режима |
| `browser_engine` (новое, опциональное) | `"playwright"` \| `"selenium"`. По умолчанию `"playwright"` в коробке, `"selenium"` в банке. |
| `cdp_endpoint` (новое, опциональное) | `"http://127.0.0.1:9222"` — для connectOverCDP. Если задан, launch не делаем. |

**Дефолт коробки:** `pw-chromium-headless`.

---

## 6. Единый Action / Probe слой (zero-drift)

Ключевой архитектурный принцип: **один контракт для всех потребителей**.

```text
actions/          # семантические действия (auth, navigate, click, fill, submit, ...)
probes/           # read-only probes (state, url, heading, network, ax, ...)
    │
    ├── regression tests (atest / e2e)
    ├── discovery crawler
    ├── CDP agent
    └── будущий MCP
```

- Действия реализуются один раз в `orchestrator/adapters/playwright_adapter.py`.
- Тесты, discovery и агент вызывают их через единый API — не копипастят.
- Probe — read-only слепок состояния: URL, hash route, testids, роли, заголовки, ax-tree, console errors, network.
- Action — side-effect: клик, fill, navigate, submit, close.
- **Не** гоним сырой DOM в evidence. Только структурированные кандидаты и fingerprint.

---

## 7. Docker-упаковка

```dockerfile
# В образ secops-lab-pure добавляется:
RUN npx playwright install --with-deps chromium firefox
```

- Браузеры внутри контейнера — не нужен внешний Grid/Selenoid.
- Selenium Grid остаётся опцией для remote-режима (банк / ферма).
- Для `connectOverCDP` браузер снаружи — контейнер только клиент.

---

## 8. Discovery-воркер (на базе Playwright)

Компоненты:

| Компонент | Назначение |
|---|---|
| **PlaywrightBrowserRuntime** | Launch / connectOverCDP / контексты |
| **DiscoverySession** | Координатор сессии discovery (уже есть — `lab/discovery_session.py`) |
| **DiscoveryRecorder** | `record_navigate` / `record_action` / `record_ax_snapshot` (переписать на Playwright API) |
| **LocatorCandidateExtractor** | `page.accessibility.snapshot()` → `DiscoveryElement` + `Candidate[]` |
| **PageModelBuilder** | `StateRevision` → `PageFamily` → `Transition` |
| **ServiceMapBuilder** | Network trace → граф `страница → эндпоинт` (уже есть в `corpus/service_map.py`) |

Discovery pipeline:

```text
launch browser
  → open target URL
  → snapshot AX tree → extract locator candidates
  → detect forms/inputs/buttons
  → для каждого интерактивного: click / fill / submit
  → capture network + DOM after
  → build transitions → page model
  → seed scanner context (уже есть corpus/scanner_context.py)
  → output Discovery IR (models/discovery.py)
```

---

## 9. Auth-injection через Playwright

Playwright закрывает auth-сценарии, недоступные Selenium:

- **storageState:** `browser.new_context(storage_state="auth.json")` — восстановление всей сессии (cookies + localStorage + sessionStorage) за один вызов.
- **header injection:** `page.set_extra_http_headers({"X-KDT-User": "admin"})` — без правки HAR/прокси.
- **request interception:** `page.route("**/api/**", handler)` — подстановка Bearer/API-key на лету.
- **Multi-identity:** 5 контекстов = 5 разных пользователей параллельно.

---

## 10. Что НЕ делаем

| Нет | Почему |
|---|---|
| Selenium + Playwright на одной странице | Один владелец страницы — или Selenium, или Playwright. Не оба сразу. |
| Playwright в банковском контуре (сейчас) | Банк живёт на Selenium + CDP adapter. Playwright — только коробка. |
| `D:\prettyk-atest` как SoT | Atest — отдельный проект. Actions копируются в коробку осмысленно, не рекурсивно. |
| Playwright MCP сейчас | MCP будет позже поверх action/probe слоя. Не блокирует Browser Core. |
| Firefox в обязательном порядке | Опция. Chromium — baseline. Firefox — кроссбраузерные тесты. |
| WebKit в обязательном порядке | Опция для iOS/Safari-специфичных багов. Не дефолт. |

---

## 11. Файлы реализации

| Что | Где |
|---|---|
| Playwright adapter | `orchestrator/adapters/playwright_adapter.py` (новый) |
| Playwright Browser Runtime | `orchestrator/browser/playwright_runtime.py` (новый) |
| Обновлённый BrowserAdapter | `orchestrator/adapters/browser_adapter.py` (доработка — CDP через PW) |
| Контракт wired | `orchestrator/models/wired.py` (расширение `browser_type`) |
| Discovery CDP recorder | `orchestrator/utils/discovery_cdp_recorder.py` (переписать на PW API) |
| Discovery element extractor | `orchestrator/utils/discovery_element_extractor.py` (доработка) |
| Discovery E2E | `orchestrator/tools/juice_discovery_e2e.py` (доработка) |
| Action/probe слой | `orchestrator/actions/` (новый) — общий для всех потребителей |
| Docker | `docker/Dockerfile.prettyk-lab` (добавить playwright install) |
| Cosmo e2e | `cosmo/e2e/` (уже использует Playwright — не трогать) |

---

## 12. Порядок реализации (эпики)

| Эпик | Что | Приоритет |
|---|---|---|
| **PW-1** | `playwright_adapter.py` + `playwright_runtime.py` — launch/connectOverCDP/new_context, proxy, ignore_https_errors | P0 |
| **PW-2** | Расширение `wired.py` (`browser_type`, `browser_engine`, `cdp_endpoint`) + Controller integration | P0 |
| **PW-3** | Auth injection: storageState, setExtraHTTPHeaders, route-interception | P0 |
| **PW-4** | Discovery recorder rewrite: `discovery_cdp_recorder.py` → Playwright API + `page.accessibility.snapshot()` | P1 |
| **PW-5** | LocatorCandidateExtractor: `getByRole` / `getByLabel` / `getByTestId` приоритизация + scoring | P1 |
| **PW-6** | Единый action/probe слой: `orchestrator/actions/`, общий контракт для atest + discovery + agent | P1 |
| **PW-7** | Docker: `playwright install --with-deps chromium firefox` в образ | P1 |
| **PW-8** | Firefox кроссбраузерные тесты + WebKit опция | P2 |
| **PW-9** | `cosmo/scripts/smoke-*.mjs` → адаптация под единый action-слой | P2 |
| **PW-10** | Atest интеграция: `D:\prettyk-atest` actions → общий слой коробки | P2 |

---

## 13. Границы и честный контракт

- **Не заменяем Selenium в банковском контуре.** Банк — when/if. Коробка — now.
- **Не создаём второй зоопарк адаптеров.** Один Playwright adapter с launch/connectOverCDP/new_context.
- **Не тащим `D:\prettyk-atest` как runtime-зависимость.** Actions — в коробке, atest — потребитель.
- **Не смешиваем Selenium и Playwright на одной странице.** Один владелец страницы.
- **Секреты/токены не светим в evidence.** Только fingerprint и структурированные кандидаты.
- **Playwright — опция, не замена.** `browser_engine` выбирается в wired. Selenium — legacy/bank. Playwright — default коробки.

(End of file)