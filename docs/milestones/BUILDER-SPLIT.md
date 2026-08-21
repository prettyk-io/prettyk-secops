# Разделение труда: DeepSeek ↔ Builder

> **21 августа 2026.** После Keeper/GPT-ревью. Передай это DeepSeek как scope на завтра.

---

## DeepSeek (Heavy Backend) — скопипастить ему

### Файлы и что делать

#### 1. `orchestrator/utils/diary_bus.py` — фильтр экспорта по run_id

Функция `export_diary_snapshot(run_id, filter_preset)` сейчас экспортирует **весь** `diary.ndjson` без фильтрации по run. Надо:

```python
# В export_diary_snapshot():
# После чтения file_backlog — фильтровать события по run_id:
events = read_file_backlog("all")
if run_id:
    events = [e for e in events if str(e.get("run_id") or "") == run_id]
```

Тест: `test_diary_live.py::test_journal_latest_run_id_filter` уже есть как скелет (MON-3), допиши assert что события только нужного run_id.

---

#### 2. `orchestrator/utils/diary_bus.py` + `orchestrator/utils/live_server.py` — hooks per-run

Сейчас `set_results_hook(service, report_url)` пишет в глобальный `results_hooks.json`. Надо добавить `run_id` и `check_id` в hook entry и сделать `get_results_hooks(run_id=None)` с фильтрацией.

```python
# diary_bus.py
def set_results_hook(service, report_url, *, run_id="", check_id="", **extra):
    # Добавить run_id, check_id в entry
    entry["run_id"] = run_id
    entry["check_id"] = check_id

def get_results_hooks(run_id=None):
    # Если run_id задан — фильтровать хуки по нему
```

В `live_server.py::_serve_results_hooks()` — читать `?run_id=` из query.

---

#### 3. `orchestrator/utils/run_ui_summary.py` + `orchestrator/utils/live_server.py` — summary/trend per-run

`build_run_ui_summary()` и `persist_run_ui_summary()` сейчас пишут в глобальный `run_ui_summary.json`. Надо:

- Писать `run_id` в summary.
- `read_run_ui_summary(run_id=None)` — фильтрация по run_id.
- `_serve_summary_latest()` в `live_server.py` читает `?run_id=` из query.
- `read_severity_trend()` аналогично.

---

#### 4. `orchestrator/utils/reporter.py` — Allure per-check

Уже есть `allure_project.py::slugify_allure_project_id()` который берёт `KDT_CHECK_ID`. Проверь что `finalize_reports()` в `reporter.py` передаёт правильный `check_id` при вызове `set_results_hook(service="allure", ...)`.

---

#### 5. `orchestrator/adapters/defectdojo_client.py` — Dojo per-check engagement

Уже есть `KDT_DEFECTDOJO_ENGAGEMENT_MODE=check` и product `exp01-baseline`. Проверь:
- engagement создаётся per-check (не общий `engagement=1`)
- test_id передаётся при import
- gate фильтрует findings по test_id (не по продукту целиком)
- `set_results_hook(service="dojo", ..., run_id=..., check_id=...)`

---

#### 6. `orchestrator/lab/llm_server.py` — QWEN delta contract

QWEN на `:8766`. Убедись что:
- Принимает current run_id + baseline run_id
- Возвращает структурированный delta с severity
- Ошибка QWEN не роняет gate (fallback "QWEN unavailable")

---

#### 7. `orchestrator/core/controller.py` + `orchestrator/core/gate_policy_load.py` — алгоритмический gate

- Gate должен получать counts конкретного run (не глобальные)
- Policy source читается из `config/gate_policy.lab.json`
- Gate verdict пишется в run_summary с source

---

#### 8. `orchestrator/core/executive_conclusion.py` — assessment per-run

- Executive class берётся из counts конкретного run
- Не использовать stale summary

---

#### 9. `orchestrator/utils/run_package.py` — package readiness

- Package собирается только при наличии Allure + Dojo hooks для ЭТОГО run
- Secrets redacted: `redact_diary_text()` в `diary.ndjson`, `redact_secrets_for_draft()` в `Wired.json`
- `KDT_PACKAGE_ALLOW_SECRETS=1` escape hatch

---

#### 10. `orchestrator/tests/` — contract tests

- `test_diary_live.py`: journal возвращает события только нужного run_id
- `test_notify_results_hooks.py`: hooks фильтруются по run_id
- `test_run_summary.py`: run_summary содержит run_id

---

## Builder (Frontend / Live HTML) — моя часть

### 2.4 ✅ Live link always visible — УЖЕ РАБОТАЕТ
`resultsCheckId` ставится из `?check_id=` при инициализации и никогда не сбрасывается.

### 3.2 ✅ ResultsJournalPanel — УЖЕ ГОТОВО
Панель принимает `runId`, при null показывает placeholder «Запустите проверку».

### 3.4 SummaryPanel / Locator strips hide for zero-run — ДЕЛАЮ
`ResultsWorkspace.tsx`: скрывать SummaryPanel, TrendChart, LocatorHealStrip, LocatorLabelStrip когда у check нет runs.

### 4.1-4.3 Live views verify — ДЕЛАЮ
Проверить headless/non-headless переключение VNC/video, playhead.