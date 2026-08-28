# Playwright Browser Core

> **CANON** — hub topic. Slice: **22 августа 2026** (2FA sealed: Playwright как основной браузерный рантайм коробки).  
> FRIEND origin: [`../../docs/friend-requests/PW-BROWSER-CORE.md`](../../docs/friend-requests/PW-BROWSER-CORE.md).  
> Связь: [`runtime-shell.md`](runtime-shell.md) · [`discovery-heal.md`](discovery-heal.md) · [`prettyk-core.md`](prettyk-core.md).  
> Реестр: [`INDEX.md`](INDEX.md).

## 1. Тезис

Playwright — **основной браузерный рантайм коробки `prettyk-pure`**. Selenium остаётся legacy-опцией.

```text
                   Playwright Browser Core
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
 launch()           connectOverCDP()    BrowserContext × N
 автопрогон           живой агент        discovery / fuzz
 discovery            оператор            multi-role
 регрессия            Live VNC            изоляция
```

## 2. Режимы запуска

| Режим | Метод | Когда |
|---|---|---|
| **Autonomous Launch** | `browserType.launch()` | Автопрогон, discovery, регрессия, CI. Оркестратор сам поднимает браузер. |
| **Live Attach** | `browserType.connectOverCDP()` | Сессия оператора/агента через Chrome `:9222`. |
| **Multi-context** | `browser.new_context()` | Изоляция кук/storage/прокси для N ролей без перезапуска браузера. |

## 3. Движки

| Движок | Статус | Назначение |
|---|---|---|
| **Chromium (bundled)** | **Default** | Discovery, тесты, CI. Стабильный CDP. Не зависит от установленного в ОС Chrome. |
| **Google Chrome** | Opt-in | Специфичное поведение проприетарного Chrome. |
| **Firefox** | Opt-in | Кроссбраузерный фаззинг (XSS/DOM-расхождения). |
| **WebKit** | Opt-in | iOS/Safari-специфичные баги. |

## 4. Режимы отображения

| Режим | Когда |
|---|---|
| **`headless: true`** | CI/CD, discovery-краулер, пакетный фаззинг. |
| **`headless: false`** (headed) | PrettyK Live, noVNC `:7900`, запись видео, операторская отладка. |

## 5. Контракт wired (Infrastructure)

### browser_type

```python
browser_type: Literal[
    # Playwright
    "pw-chromium", "pw-chromium-headless",   # bundled (default)
    "pw-chrome", "pw-chrome-headless",        # system Chrome
    "pw-firefox", "pw-firefox-headless",      # Gecko
    "pw-webkit", "pw-webkit-headless",        # WebKit
    # Selenium (legacy / bank)
    "chrome", "chrome-headless",
    "firefox", "firefox-headless",
]
```

### Новые поля

| Поле | Тип | Смысл |
|---|---|---|
| `browser_engine` | `"playwright"` \| `"selenium"` | Выбор адаптера. По умолчанию `"playwright"`. |
| `cdp_endpoint` | `Optional[str]` | URL Chrome DevTools, например `http://127.0.0.1:9222`. Если задан — attach, не launch. |

**Дефолт коробки:** `pw-chromium-headless`, `browser_engine=playwright`.

## 6. Единый Action / Probe слой

```text
orchestrator/actions/     # семантические действия (auth, navigate, click, fill, submit)
orchestrator/probes/      # read-only probes (state, url, heading, network, ax)
    │
    ├── regression tests (cosmo/e2e)
    ├── discovery crawler
    ├── CDP agent
    └── будущий MCP
```

**Правило:** actions/probes пишутся один раз. Все потребители — через единый API. Не копипастим.

## 7. Playwright vs Selenium: граница

| Ситуация | Playwright | Selenium |
|---|---|---|
| Коробка `prettyk-pure` (default) | **Основной** | Legacy fallback |
| Банк / airgap (when/if) | Нет | Основной |
| Одна страница | Либо PW, либо Selenium. **Не вместе.** | |
| Docker-упаковка | `playwright install --with-deps chromium` | Через Grid |

## 8. scanner + Playwright (MITM-проксирование)

```python
context = await browser.new_context(
    proxy={"server": "http://127.0.0.1:8080"},
    ignore_https_errors=True,
)
```

Без `--proxy-server=`, без `accept_insecure_certs`, без ручной установки CA. Трафик гарантированно в scanner.

## 9. Auth-injection

| Механизм | Playwright API |
|---|---|
| Полное восстановление сессии | `browser.new_context(storage_state="auth.json")` |
| HTTP-заголовки | `page.set_extra_http_headers({"X-KDT-User": "admin"})` |
| Перехват запросов | `page.route("**/api/**", handler)` |
| Multi-identity | N контекстов = N пользователей параллельно |

## 10. Discovery через Playwright

| Компонент | Playwright API |
|---|---|
| AX snapshot | `page.accessibility.snapshot()` |
| DOM extraction | `page.evaluate()` |
| Network interception | `page.route()` / `page.on('request')` / `page.on('response')` |
| Console / page errors | `page.on('console')` / `page.on('pageerror')` |
| Locator scoring | `getByRole` → `getByLabel` → `getByTestId` — встроенная приоритизация |
| Action trace | Network listener + accessibility snapshot на каждое действие |

## 11. Компоненты реализации

| Компонент | Файл | Статус |
|---|---|---|
| Playwright adapter | `orchestrator/adapters/playwright_adapter.py` | Новый |
| Browser Runtime | `orchestrator/browser/playwright_runtime.py` | Новый |
| Контракт wired | `orchestrator/models/wired.py` | Расширение |
| Discovery recorder | `orchestrator/utils/discovery_cdp_recorder.py` | Переписать на PW API |
| Element extractor | `orchestrator/utils/discovery_element_extractor.py` | Доработка |
| Action/probe слой | `orchestrator/actions/` | Новый |
| Docker | `docker/Dockerfile.prettyk-lab` | Добавить playwright install |
| Smoke-скрипты | `cosmo/scripts/smoke-*.mjs` | Уже используют PW |

## 12. Эпики

| Эпик | Что | Приоритет |
|---|---|---|
| **PW-1** | `playwright_adapter.py` + `playwright_runtime.py` — launch / connectOverCDP / new_context / proxy / ignore_https_errors | P0 |
| **PW-2** | Расширение `wired.py` + Controller integration | P0 |
| **PW-3** | Auth injection: storageState, setExtraHTTPHeaders, route | P0 |
| **PW-4** | Discovery recorder rewrite на Playwright API | P1 |
| **PW-5** | LocatorCandidateExtractor | P1 |
| **PW-6** | Единый action/probe слой | P1 |
| **PW-7** | Docker: `playwright install` в образ | P1 |
| **PW-8** | Firefox + WebKit кроссбраузерные тесты | P2 |
| **PW-9** | `cosmo/scripts/smoke-*.mjs` → единый action-слой | P2 |

## 13. Честные границы

| Нет | Почему |
|---|---|
| Selenium + Playwright на одной странице | Один владелец страницы. |
| Копирование `D:\prettyk-atest` в коробку | Actions — в коробке, atest — потребитель. |
| Замена Selenium в банке сейчас | Банк — when/if. |
| Второй зоопарк адаптеров | Один Playwright adapter с launch / attach / context. |
| Секреты/токены в evidence | Только fingerprint и структурированные кандидаты. |

(End of file)