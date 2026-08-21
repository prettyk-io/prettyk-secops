# MONITOR-MULTI-REPLAY: множественный Monitor + повторяемый replay

`lane: evolve`

## Тезис

Monitor (Live `:8767`) из «одного окна на текущий прогон» вырастает в реестр экземпляров: под каждую параллельную проверку поднимается свой монитор; любой завершённый прогон (pass / quality‑gate fail / падение) можно переоткрыть постфактум и воспроизвести заново — видео (VNC) и лог (diary).

## As-built якорь

### Что уже есть (почему это evolve, не ready)
- `orchestrator/utils/live_server.py` — `ThreadingHTTPServer` на `127.0.0.1:8767`, **один** порт, **один** глобальный `_server`. Множественного монитора нет: вторая параллельная проверка не получит свой порт/окно.
- Diary — файловый шина: `diary_bus` (`orchestrator/utils/diary_bus.py`), NDJSON + SSE `/api/diary?channel=all`. Есть `latest_export_ndjson_path()` и `/api/export/latest`.
- Replay лога частично есть: `/api/journal/latest` → `build_journal_from_export` / `build_journal_from_live_diary` (`run_journal.py`). Это чтение **последнего** экспорта, не произвольного check_id.
- Runs index: `GET /api/runs/index` → `list_run_index` (append-only ledger с `run_id`, `check_id`, `ci_verdict`). Зачаток реестра, но без привязки к видео/файлам конкретного прогона.
- VNC: `index.html` встраивает noVNC `http://127.0.0.1:7900/?autoconnect=1&resize=scale` (одна браузерная сессия). Записи видео VNC **нет**.

### Что надо построить (целевой контракт)
1. **Множественность:** монитор под каждый активный прогон, ключ — `check_id`/`run_id`. Варианты: мульти-порт (8767 + 8768… по чеку) или один порт с `?run_id=` роутингом. Порт-роутинг проще совместить с существующим SSE.
2. **Replay лога:** `/api/journal?run_id=…` / `/api/export?run_id=…` — читать архив конкретного прогона, не «latest». Требует хранения экспортов по `run_id` (уже частично есть в `reports/`).
3. **Replay видео:** записывать VNC-сессию прогона (см. research по отмотке) и давать её на `/api/recording?run_id=…` с seekable timeline.

## К какому FRIEND дозреет

К FRIEND «Runtime-shell / Live» (мониторинг = runtime-контур). Возможно, отдельный тонкий FRIEND `MONITOR-REGISTRY` под реестр экземпляров + replay-артефактов.

## Честная «не обещаем»

- Сейчас только **один** Live-порт и **один** noVNC. Множественность — реальная перестройка, не «добавить кнопку».
- Запись видео VNC и его перемотка — отдельная исследовательская задача (см. `docs/research/2026-08-15-monitor-rewind.md`), не в этом evolve.
- Retention записей и архива экспортов — зависит от ART (artifact cleanup), не решается здесь.
- Постфактум-реплей требует, чтобы артефакты прогона пережили cleanup (legal hold / retention policy).