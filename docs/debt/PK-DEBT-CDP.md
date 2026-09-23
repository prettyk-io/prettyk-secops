# PK-DEBT-CDP — аудит кладбища CDP

> **Карточка:** CDP-DEBT (Поток 5).  
> **Исполнитель:** Luna (worker).  
> **Дата:** 2026-09-22.  
> **Задача:** не осталось второго источника правды для browser-действий; `cdp_*` костыли KILL или сведены к Playwright-native; единый путь = `browser_service.py`.

---

## 1. Вердикт по каждому CDP-артефакту

| Артефакт | Строк | Статус | Вердикт |
|---|---|---|---|
| `adapters/browser_adapter.py` | 164 | **Жив** | Уже чист (DSL-B6). Единственный `cdp_command` = escape hatch через Selenium `execute_cdp_cmd`. Создаётся только на legacy-пути `PK_BROWSER_RUNTIME=selenium` (`core/controller.py:232`). Не сносить. |
| `adapters/playwright_adapter.py` (CDP SURFACE L856-896) | — | **Жив** | `cdp_command` + 4 тонких `cdp_*` обёртки через `page.context.new_cdp_session`. НЕ Selenium-дубли, НЕ мёртвые: `cdp_clear_browser_cache`/`cdp_clear_browser_cookies`/`cdp_network_enable`/`cdp_network_disable` зарегистрированы в `core/method_id.py` («ОчиститьКэш», «ОчиститьCookies», «ВключитьNetwork», «ВыключитьNetwork»). Playwright **не имеет** native-эквивалента `Network.clearBrowserCache`/`clearBrowserCookies` — только через CDP. MERGE в «чистый Playwright API» невозможен. |
| `utils/discovery_cdp_recorder.py` | 89 | **Мёртв** | Ни разу не импортируется в боевом коде и тестах. PW-4 уже снёс логику в `discovery_pw_recorder.py`; файл был тонкой backwards-compat обёрткой (re-export `DiscoveryRecorder` + 3 dead функции `record_navigate`/`record_ax_snapshot`/`record_action`). **KILL выполнен** — файл удалён. |
| `browser/cdp_viewport_relay.py` | 377 | **Жив** | Профильный VP-релей screencast `:9224` (`Page.startScreencast`). Активно тестируется (`test_cdp_viewport_relay.py`, `test_browser_session_relay.py`, `test_browser_runtime_parity.py`), поднимается `lab_ensure_ui.ps1`. НЕ сносить. |
| `tools/juice_cdp_e2e.py`, `tools/*.py` | — | Инструмент | lab/e2e утилиты, не боевой путь прогона. Вне scope. |

---

## 2. Вывод: двойного пути нет

- **Единый источник browser-действий** — `browser/browser_service.py` (`_BrowserWorker`, Playwright, один CDP-коннект на поток). Click/type/observe/replay целиком держатся на нём.
- Selenium-путь (`WebDriverAdapter` + `BrowserAdapter`) остаётся исключительно за флагом `PK_BROWSER_RUNTIME=selenium` как legacy fallback (дефолт — `playwright`). Курируется DSL-B6/RC2-8, «вторым источником правды» не является — это отдельный runtime, а не дубль одной операции.
- `cdp_command` (в обоих адаптерах) — осознанный escape hatch, оставлен по контракту DSL-B6; мертвых `cdp_*`-костылей Selenium-style не осталось.

## 3. Что изменено

- **KILL:** `orchestrator/utils/discovery_cdp_recorder.py` (мёртвый, 89 строк).
- Прод-логика `browser_service.py`, `browser_adapter.py`, `playwright_adapter.py`, `cdp_viewport_relay.py` — **не трогались** (чистые уже по DSL-B6/PW-4/VP-фиксам).

## 4. Верификация

Browser-контур (10 файлов):

```
302 passed, 2 skipped, 0 failed in 7.37s
```

Файлы: `test_cdp_cleanup.py`, `test_cdp_viewport_relay.py`, `test_browser_session_relay.py`, `test_pw_airgap_and_cdp.py`, `test_allowlist_registry.py`, `test_method_id.py`, `test_methods_placement_smoke.py`, `test_browser_runtime_parity.py`, `test_browser_service.py`, `test_browser_step_execute.py`.