# MONITOR-RETENTION: хранение и purge инстансов Monitor (7 дней)

`lane: ready` → **принят 15 авг 2026 (2FA одобрен).** Зачислен в hub как часть `CANON` `monitor-hub.md` (раздел III. Retention).

## As-built (что реально сделано)

- **`orchestrator/utils/monitor_retention.py`** (новый модуль):
  - `purge_by_run_id(run_id, dry_run=False)` — удаляет NDJSON + sidecar + MP4 по `run_id`, **не трогая** `runs_index.ndjson`/meta.
  - `lazy_sweep_monitor_artifacts()` — ленивый TTL-свип (раз в час, `_SWEEP_INTERVAL_SECONDS = 3600`), удаляет артефакты старше `KDT_MONITOR_RETENTION_DAYS` (default 7).
  - `_META_KEEP_NAMES` — meta-файлы (`runs_index.ndjson`, `meta.json`, `retention_policy.json`…) не удаляются.
- **`live_server.py`** — `GET /api/artifacts/orphans`, `POST /api/artifacts/purge`, `POST /api/monitor/purge` (по run_id), `POST /api/artifacts/hold`; `lazy_sweep_monitor_artifacts()` на входе в `do_GET`.
- **meta-ledger бессрочен** — история чартов в админке строится из `runs_index.ndjson`, не страдает от purge.
- Тесты: `orchestrator/tests/test_monitor_retention.py` — 18 passed (вместе с ACL).

## Тезис

Инстансы Monitor (лог/NDJSON/видео прогона) хранятся и удаляются **по тому же принципу, что и остальные репорты** (reports). До отдельной политики — **on demand purge** + **таймер 7 дней**.

Важное разделение владельца:

- **meta-историю** (запись в реестре/ledger: `run_id`, `check_id`, `status`, `ci_verdict`, `owner_user_id`, таймстемпы) — **хранить всегда**, не удалять по таймеру.
- **сам отчёт** (NDJSON журнала, MP4-видео, sidecar) — **можно удалять через 7 дней**.

То есть история чартов в админке строится из meta-ledger и живёт вечно, а тяжёлые артефакты протухают.

## As-built якорь

### Что уже есть (бэкенд)
- `orchestrator/utils/diary_bus.py`:
  - `export_ndjson_path_for_run_id(run_id)` — архив по run_id (NDJSON + sidecar.json с `run_id`, `created_at`).
  - `LIVE_EXPORTS_DIR` — каталог экспортов.
- `orchestrator/utils/run_recording.py`:
  - `find_video_for_run(run_id)` — видео в `reports/video` (`VIDEO_DIR`).
- `orchestrator/utils/live_server.py`:
  - `GET /api/runs/index` → `list_run_index` — **append-only ledger** с `run_id`, `check_id`, `ci_verdict`, `owner_user_id` (это и есть meta-история, кандидат «хранить вечно»).
  - `GET /api/artifacts/index`, `/api/artifacts/orphans`, `/api/artifacts/audit`, `POST /api/artifacts/purge`, `POST /api/artifacts/hold` — **каркас purge артефактов уже есть** (см. `live_server.py` `do_GET`/`do_POST`).
- `orchestrator/utils/lab_clean.py` / `lab_clean.ps1` — ручная чистка стенда.

### Фронт (админка)
- `cosmo/src/admin/` — `RunsPanel`, `retentionPolicySerialize`, `gatePolicySerialize`; есть `LIVE_RETENTION_POLICY_URL = /api/retention/policy`.
- История чартов уже читает runs-index (`mergeLiveAdminRuns`, `collectAdminRuns`).

## Что сделать (набросок, не финал)

1. **On demand purge**: кнопка в админке → `POST /api/artifacts/purge` по `run_id` (удалить NDJSON+видео+sidecar, **не трогая** meta-ledger запись).
2. **Таймер 7 дней**: фоновый джоб (или lazily при обращении) — удалять артефакты старше `created_at + 7d`, сохраняя meta-ledger.
3. **Разделение слоёв**: meta-ledger (`runs/index`) — immutable, не чистить; артефакты — TTL 7 дней + manual purge.
4. **История чартов в админке** — строится только из meta-ledger, поэтому остаётся полной даже после purge артефактов.

## К какому FRIEND дозреет

К FRIEND «Retention / Lifecycle» — столп хранения и протухания артефактов. Рядом с уже существующей retention-policy админки.

## Честная «не обещаем»

- Фоновый таймер vs lazy-cleanup — выбор реализации (нет планировщика в Live-процессе; вероятно lazy при `list_run_index` или отдельный шаг `lab_clean`).
- `POST /api/artifacts/purge` — надо сверить, что он уже умеет удалять по run_id или только по имени артефакта.
- «7 дней» — конфигурируемая константа, а не хардкод в коде (через env/политику).
