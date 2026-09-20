# PK-DEBT-RED — сверка red-счёта полного suite

> **Карточка:** RC2-5 (Run Control wave 2 — Debt).  
> **Исполнитель:** Luna (worker).  
> **Дата сверки:** 2026-09-20.  
> **Раннер:** `D:\prettyk-secops\.venv\Scripts\python.exe -m pytest -q` (rootdir `D:\prettyk-secops`).  
> **Зачем:** закрыть «предсуществующий хвост» из backlog (L940, L1218: 47–48 red: browser-каталог, gate_policy env, fuzz/teardown/juice) и честно объяснить каждый оставшийся red.

---

## 1. Итоговый baseline

```
2 failed, 2192 passed, 60 skipped, 15 warnings in 379.01s
```

Было (PROGRESS.md, 2026-09-20, non-heavy): `2099 passed, 47 skipped; 20 fail + 8 collect-error`.

Снижение: **20 fail + 8 collect-error → 2 fail**, collect-errors → 0.

---

## 2. Что закрыто в этом проходе

### 2.1. 8 collect-error → 0 (stale-импорты `scanner_*` → `zap_*`)

Модули `orchestrator.utils.scanner_work_stream` и родственные переименованы в `zap_*`, но импорты остались старыми:

| Файл | Строка |
|---|---|
| `orchestrator/corpus/pipeline.py` | 19 |
| `orchestrator/utils/gather_info.py` | 17 |
| `orchestrator/utils/reporter.py` | 575 |
| `orchestrator/tests/test_capability_zap.py` | 3 (`adapters.capability_scanner` → `adapters.capability_zap`) |
| `orchestrator/tests/test_zap_context.py` | 6 |
| `orchestrator/tests/test_zap_report_summary.py` | 6 |
| `orchestrator/tests/test_zap_work_stream.py` | 7 |

Символы внутри модулей уже назывались `zap*` — правились только пути модулей.

### 2.2. Тестовые зависимости

`orchestrator/requirements-dev.txt`: добавлены `fakeredis>=2.0.0,<3`, `pytest-asyncio>=0.23,<2` (`bs4` уже был). Установлены в `.venv`.

### 2.3. 15 падений `test_run_lease.py` — утечка event loop (не баг lease)

Симптом: `RuntimeError: Runner.run() cannot be called from a running event loop` + каскад `coroutine ... was never awaited`. Проявлялось **только в полном suite**, изолированно lease был зелёный.

Root cause: `orchestrator/tests/test_pw_airgap_phase2.py::test_playwright_adapter_cdp_clear_cache_no_browser` вызывает `PlaywrightAdapter.cdp_clear_browser_cache()` → `sync_playwright().start()` поднимает `ProactorEventLoop` в главном потоке. Браузер не запускается, исключение глушится `_ensure_cdp`, а `stop()`/`shutdown()` не вызывается → loop остаётся `running=True` до конца процесса и отравляет **все** последующие async-тесты.

Фикс (только тест, продукт не тронут): `try/finally: ad.shutdown()` в `test_pw_airgap_phase2.py:55-58`.

Диагностика: pytest-плагин-проба, отмечавший первый тест, после которого в главном потоке остался running loop (см. «Воспроизведение»).

### 2.4. Конфиг pytest

`pytest.ini`: добавлены `asyncio_mode = auto` и `asyncio_default_fixture_loop_scope = function`. Совпадает с намерением репо (комментарий PARITY-LIVE в `test_browser_runtime_parity.py:11-13`).

---

## 3. Оставшийся red (2) — ЗАКРЫТ (Boss/BBA, 2026-09-20)

| Тест | Причина | Диспозиция |
|---|---|---|
| `test_browser_service.py::test_observe_event_enriches_and_pops` | BBA-5 в `browser/browser_service.py:528-529` возвращает `{"event": None}` при `_page is None` — **до** разбора очереди `_observed_events`. Тест кладёт событие через `_on_click` и ждёт его извлечение и обогащение. Контракт теста разошёлся с поведением BBA-5. | **✅ ЗАКРЫТ (Boss/BBA).** |
| `test_browser_service.py::test_observe_candidates_end_to_end_via_click_handler` | То же: `req["event"]`/`evt` = None из-за раннего `return` при `_page is None`. | **✅ ЗАКРЫТ (Boss/BBA).** |

Решение принято владельцем BBA (Boss): в `_cmd_observe_event` **сначала отдаются уже накопленные события** (enrich умеет `page=None`), а `connected: False` сообщается **отдельным полем** — liveness-проверка (`page.evaluate("1")`) считает `connected`, не блокируя отдачу очереди. Событие, собранное до отвала CDP, честно доходит до оператора; при отвале `connected: False` + `_page` сбрасывается для будущего reconnect.

**Итог BBA-5 (Boss):** `test_browser_service.py` = 55 passed / 1 skipped; browser-контур без env = 141 passed / 1 skipped; live BBA-6 (CDP Chrome/128) = 1 passed. Red-счёт по этому долгу → **0**.

---

## 4. Остаточный риск (не red, вне дефолтного цикла)

60 skipped — маркеры `heavy`/`lab` (`pytest.ini`): fuzz/teardown/juice/masking/scanner_dojo и прочий лаб-контур. В дефолтном прогоне не выполняются. Для полной сверки нужен `pytest -m "heavy or lab"` на поднятом стенде. Это не red-долг, а непроверенная зона — фиксируется отдельно.

---

## 5. Воспроизведение

```powershell
# Полный baseline
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest -q

# Только оставшийся red
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest `
  "orchestrator/tests/test_browser_service.py::test_observe_event_enriches_and_pops" `
  "orchestrator/tests/test_browser_service.py::test_observe_candidates_end_to_end_via_click_handler" -q
```

**DoD RC2-5:** red-счёт снижен с 20 fail + 8 collect-error до 2 fail; каждый оставшийся red объяснён (FOLLOW-UP BBA/Boss); collect-errors 0.