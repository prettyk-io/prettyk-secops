# MONITOR-INSTANCE-BINDING: Monitor — свой экран на каждый instance проверки

`lane: evolve`

## Тезис

Monitor должен быть **множественным по instance**: каждый запущенный прогон проверки порождает свой мониторный экран, привязанный к `run_id` (а не один «хост» на всех). Открытие `:8767` без `run_id` сегодня показывает глобальный meta (последний прогон), и это не разделено по инстансам.

Связка инстансов:

```
Editor  #/check/<check_id>
   └─ запуск → run_id
        └─ Monitor  :8767/?run_id=<run_id>&check_id=<check_id>
              └─ биндится к этому прогону, показывает его id в хедере
```

## Почему это отдельный узел

1. **run_id в URL обязателен, но не достаточен.** `?run_id=` уже роутит replay-SSE (`/api/diary`), journal и recording. Не хватает: (а) **отображения** инстанс-id в хедере Monitor; (б) **запрета** показа «чужого» прогона тому, кто открыл голый `:8767` без привязки.
2. **ACL по инстансу уже написан на бэке, но Monitor его не использует.** `live_pers_acl.may_view_owner / redact_meta_for_caller / filter_evidence_list` лежат мёртвым грузом — `index.html` их не зовёт.

## As-built якорь

### Бэкенд (уже есть)
- `orchestrator/utils/live_server.py`:
  - `GET /api/meta?run_id=…` → meta + `requested_run_id` (строка 264–271).
  - `GET /api/diary?run_id=…&channel=…` — SSE с фильтром по run_id (строка 162–166).
  - `GET /api/journal?run_id=…&preset=signal` — replay journal (строка 738).
  - `GET /api/recording?run_id=…` — MP4 с Range (строка 1004).
  - `GET /api/export?run_id=…` — NDJSON экспорта (строка 1098).
- `orchestrator/utils/live_pers_acl.py`:
  - `may_view_owner(caller, owner)` — admin видит всё; оператор только своё.
  - `redact_meta_for_caller(meta, caller)` — чужому режет `novnc_url` / hook-URL.
  - `filter_evidence_list(items, caller)` — фильтр чужого в evidence.
- `orchestrator/utils/diary_bus.py`:
  - события тегируются `run_id` из `KDT_RUN_ID`.
  - `export_ndjson_path_for_run_id(run_id)` — найти архив по run_id.
- `orchestrator/utils/lab_run.py`:
  - `KDT_RUN_ID` пробрасывается в дочерний процесс; `set_meta(run_id=…)`.

### Фронт (Monitor, что есть)
- `orchestrator/static/live/index.html`:
  - `run_id` читается из query → `replayMode` → replay SSE/journal/recording.
  - `refreshMeta()` при replay дергает `/api/meta?run_id=…` и пишет статус «архив #<run_id[:8]>» (строка 1761).
  - **Нет** поля инстанса в хедере вне replay (live-режим показывает только «онлайн/прогон»).
  - `statusLabel` в replay показывается только `slice(0,8)` — не полный id.

## Что сделать (набросок, не финал)

1. **Instance-id в хедере всегда** (live и replay): читать `run_id` (и `check_id`) из query или meta, показывать компактно `#<run_id[:8]>` + полный в `title`/tooltip.
2. **ACL в Monitor**: передать `caller` (из `X-KDT-User`/cookie) и применить `may_view_owner`; чужой инстанс без прав → заглушка «нет доступа», не «пустой хост».
3. **Голый `:8767` без run_id** — не показывать чужой meta; либо список своих инстансов, либо явный «выберите проверку».

## К какому FRIEND дозреет

К FRIEND «Runtime-shell / Live» — столп множественности и ACL Monitor. Возможно, тонкий FRIEND `MONITOR-INSTANCE`.

## Честная «не обещаем»

- Cross-origin caller-идентификация Monitor (8767) vs Editor (5173) — решается отдельно (cookie / `X-KDT-User` / query-токен).
- Механика «список инстансов» на голом `:8767` — UX-вопрос, не «сделать как сказано».
- Полный `run_id` в UI — возможно, хватит префикса + tooltip.
