# SALVAGE-OLD-LIVE: исследование и граница вывода KDT Live

> **Статус:** RESEARCH / assessment. Это не разрешение удалять Live и не
> архитектурный контракт Control Plane.
>
> **Дата:** 28 августа 2026.
>
> **Объект:** `orchestrator/utils/live_server.py`, файловые persistence-модули
> `orchestrator/utils/*`, текущие frontend consumers и существующие Monitor
> FRIEND-requests.

## 1. Короткий вывод

`Live :8767` нельзя спасать как единый будущий сервис. Сейчас под одним HTTP
портом смешаны пять разных вещей:

1. файловый event bus и SSE-транспорт;
2. read-model для Results/Admin;
3. реестр запусков и evidence/artifact-ссылок;
4. выдача локальных бинарных артефактов и экспортов;
5. legacy Monitor UI, admin actions, lab Intruder, AI proxy и discovery.

Salvage должен сохранить **семантику и данные**, а не весь текущий HTTP surface.
Целевой результат — новый владелец каждой сущности и projection, после чего
`:8767` остаётся только временным compatibility facade и удаляется.

Базовый вывод существующего persistence-исследования сохраняется:

```text
PostgreSQL  — entities, run state, events, findings, evidence refs, audit
S3/MinIO   — immutable/binary artifacts and large logs
Valkey     — ephemeral fan-out / queue, never source of truth
API/SSE    — canonical read and live-delivery surface
Live :8767 — temporary compatibility facade
```

Это исследование уточняет, что именно надо перенести и какие текущие контракты
нельзя принимать за durable truth.

## 2. As-built persistence

Пути объявлены в `orchestrator/utils/paths.py`:

| Объект | Фактическое место | Текущая роль | Оценка |
|---|---|---|---|
| `diary.ndjson` | `reports/live/` | append-only события + SSE backlog | сохранить семантику, сменить владельца |
| `meta.json` | `reports/live/` | cross-process snapshot текущей сессии | только projection/cache |
| `results_hooks.json` | `reports/live/` | глобальные Allure/Dojo/scanner links и extras | rebuildable run projection |
| `runs_index.ndjson` | `reports/live/` | append/upsert ledger запусков | мигрировать в durable runs |
| `run_summary.json` | `reports/live/` | последний итог прогона | мигрировать как run snapshot/export |
| `run_ui_summary.json` | `reports/live/` | последний Results summary | rebuildable projection, сейчас глобальная |
| `severity_trend.ndjson` | `reports/live/` | последние 24 trend points | projection, не history SoT |
| `check_evidence_refs.json` | `reports/live/` | check → evidence refs/history | мигрировать в evidence records |
| `artifact_index.json` | `reports/live/` | check → runs → локальные paths/holds | мигрировать в artifact records + holds |
| `exports/*.ndjson` + sidecars | `reports/live/exports/` | replay journal по run | мигрировать как event export/artifact |
| `discovery_<id>.json` | `reports/live/` | остановленная discovery IR | мигрировать как discovery record + artifact |
| `reports/runs/<run_id>/` | filesystem | wired/run data, logs, summaries | object storage + metadata |
| `reports/video/` | filesystem | recording | object storage + artifact metadata |
| `reports/allure-results/` | filesystem | Allure raw results | object storage/Allure-owned storage |
| `reports/scanner-results/` | filesystem | scanner XML/reports | object storage + finding provenance |

### 2.1. Durable-ность сейчас неполная

- `diary_bus` пишет NDJSON на диск, но in-process `_buffer` и subscriber queue
  живут только в процессе; queue имеет размер 1000 и при `Full` событие теряется
  из live fan-out.
- `live_server._DISCOVERY_SESSIONS` полностью in-memory. После рестарта активная
  сессия исчезает; IR становится durable только после `/stop`.
- `run_ui_summary.json`, `run_summary.json` и `results_hooks.json` глобальны.
  Новый run может перетереть projection предыдущего run.
- `severity_trend.ndjson` ограничен 24 строками и не является полной историей.
- `runs_index` append-only физически, но `upsert` добавляет новую строку; SoT —
  последняя запись по `run_id`, а не каждая строка.
- `artifact_index` хранит локальные пути, а не проверенные объектные ссылки.
  Запись может остаться после удаления файла.

Следствие: перед backfill нужно определить, какой файл является источником для
каждого поля. Нельзя просто «залить все JSON в PostgreSQL» и объявить миграцию
готовой.

## 3. Endpoint inventory

Маршруты ниже фактически заведены в `live_server.py` на дату исследования.
Классификация означает судьбу семантики, а не обязательное сохранение URL.

### 3.1. Core run/read surface

| Endpoint | Consumer / producer | Фактический источник | Решение |
|---|---|---|---|
| `GET /api/meta` | Editor, Studio, Monitor, Admin | `diary_bus.get_meta()` + `meta.json` | **migrate** в run/session read-model; временный facade |
| `GET /api/runs/index` | Admin RunsPage, merge helpers, Monitor | `runs_index.ndjson` | **migrate** в `runs` query; compatibility до cutover |
| `GET /api/runs/apps` | Monitor, Admin AppsLedgerPanel | projection из runs index | **rebuild** из canonical runs/instances |
| `GET /api/run_summary/latest` | Results/Studio | глобальный `run_summary.json` | **migrate** в `GET /runs/{run_id}/summary`; `latest` deprecate |
| `GET /api/summary/latest` | ResultsSummaryPanel | глобальный `run_ui_summary.json` | **rebuild** per-run projection |
| `GET /api/summary/trend` | Results/Admin chart | глобальный `severity_trend.ndjson` | **rebuild** from run summaries; no 24-point SoT |
| `GET /api/results/hooks` | Results live poll, Admin | глобальный `results_hooks.json` | **rebuild** per-run integrations projection |
| `POST /api/results/hooks` | Reporter / Allure / Dojo / scanner | writes hooks file through Live | **migrate** to run-scoped ingestion |
| `GET /api/journal`, `/api/journal/latest` | ResultsJournalPanel, Monitor, spider completions | export NDJSON or current diary | **migrate** query contract; old URL facade only |
| `GET /api/diary` (SSE) | Studio, Monaco, WarZone, Monitor | `diary.ndjson` tail | **migrate** to canonical event stream/SSE |
| `POST /api/run/event` | runner → Live (`run_ended`) | export + meta + runs index | **migrate** to run finalization command |
| `GET /api/export`, `/api/export/latest` | Monitor/download consumers | `reports/live/exports` | **migrate** to export/artifact download API |
| `GET /api/package/latest` | Results download | package assembled from local files | **migrate** to run package artifact; ACL required |

### 3.2. Evidence, artifacts and retention

| Endpoint | Фактическая роль | Решение |
|---|---|---|
| `GET /api/evidence` | `check_evidence_refs.json`, filtered by caller | **migrate** to evidence query/read-model |
| `GET /api/artifacts/index` | badge summary from `artifact_index.json` | **rebuild** from artifact records |
| `GET /api/artifacts/orphans` | filesystem scan against index | **retain as admin diagnostic**, move out of Live |
| `GET /api/artifacts/audit` | cleanup audit log | **migrate** to audit/retention service |
| `POST /api/artifacts/purge` | delete check-owned artifacts | **move** to artifact/retention service |
| `POST /api/monitor/purge` | delete Monitor NDJSON/sidecars/MP4 by run | **move** to artifact/retention service |
| `POST /api/artifacts/hold` | legal hold in artifact index | **migrate** to durable legal hold record |
| `GET/POST /api/retention/policy` | policy file read/write | **move** to policy/admin API |
| `GET /api/admin/retention/status` | storage scan | **move** to artifact/retention API |
| `POST /api/admin/retention/clean` | cleanup execution | **move** to controlled worker/API |
| `POST /api/admin/retention/clean_temp` | temporary dump cleanup | **move** to worker/ops surface |

### 3.3. Recording and execution/WARZONE

| Endpoint | Фактическая роль | Решение |
|---|---|---|
| `GET /api/recording?run_id=` | local MP4 with HTTP Range | **migrate** to artifact download/Range API |
| `GET /api/recording/status?run_id=` | local path, size, ready flag | **rebuild** from artifact record; never expose filesystem path |
| `GET /api/execution/timeline` | markers read from raw diary | **rebuild** from canonical run events |
| `GET /api/execution/snapshot` | derives active beams from raw diary at `t` | **migrate** as scene projection/read API |
| `GET /api/execution/scene-graph` | `meta.scene_graph` or empty graph | **rebuild** from compiled plan/run snapshot |
| `GET /api/warzone/scene` (SSE) | EventJournal built from diary | **migrate** to canonical WarZone event stream |
| `GET /api/warzone/scene/at?t=` | EventJournal scene state + hash | **migrate** to seek API over durable event log |

Current WARZONE routes are not independent persistence. They reconstruct state
from `diary.ndjson`, so they inherit diary loss, global-file ambiguity and ACL
problems. They must not become a second event source.

### 3.4. Other surfaces currently hidden behind Live

| Endpoint family | Actual owner by semantics | Decision |
|---|---|---|
| `/api/dojo/*` | DefectDojo integration/admin projection | **move** to integration/admin API; retain run provenance |
| `/api/auth/vault/*` | auth-vault service | **move** to auth/admin API; Live must not own it |
| `/api/lab/intruder/*` | lab Intruder engine | **move** to lab service API; not part of run journal |
| `/api/ai/*` | optional AI proxy | **move** to AI service boundary; default-off behavior remains |
| `/api/gate/policy` | gate policy read/write | **move** to policy API; run stores resolved policy/hash |
| `/api/debug/pause`, `/resume` | runtime control | **move** to authenticated run control API |
| `/api/discovery/*` | browser discovery lifecycle | **migrate** lifecycle/IR; do not preserve in-memory sessions |

These routes should not be pulled into a new «Live replacement» wholesale. The
salvage unit is the domain contract and provenance, not the current URL grouping.

## 4. Frontend consumers that block removal

### Direct Live consumers

- `frontend/src/results/ResultsJournalPanel.tsx` — polls
  `/api/journal/latest?run_id=...&preset=...` every 4 seconds.
- `frontend/src/results/useResultsLivePoll.ts` — `/api/meta` and
  `/api/results/hooks`.
- `frontend/src/results/ResultsSummaryPanel.tsx` — `/api/summary/trend` and
  `/api/summary/latest`.
- `frontend/src/results/fetchLiveRunSummary.ts` and `Studio.tsx` —
  `/api/run_summary/latest`.
- `frontend/src/results/downloadRunPackage.ts` — `/api/package/latest`.
- `frontend/src/admin/adminApi.ts`, `mergeLiveAdminRuns.ts`, `RunsPage.tsx` —
  meta, runs, summaries, evidence, Dojo and retention endpoints.
- `frontend/src/admin/syncEvidenceFromLive.ts` — `/api/evidence`.
- `frontend/src/studio/execution/useExecutionSSE.ts` — `/api/diary` SSE.
- `frontend/src/studio/graph/useGraphTelemetry.ts` and
  `frontend/src/studio/useWarRoomTelemetry.ts` — telemetry channel on diary SSE.
- `frontend/src/studio/execution/useSceneGraph.ts` — execution scene graph.
- `frontend/src/studio/execution/useExecutionVideoSource.ts` — Live meta/video
  path contract.
- `frontend/src/warzone/useWarZoneTelemetry.ts` — `/api/warzone/scene` SSE.
- `frontend/src/monaco/trafficMirror.ts` and `spiderCompletions.ts` — diary and
  journal/runs lookups.
- `frontend/src/lab/labApi.ts` — Intruder endpoints.

### Embedded legacy Monitor

`orchestrator/static/live/index.html` is itself a large consumer of Live:

- `/api/runs/apps`, `/api/runs/index`, `/api/meta`;
- `/api/recording`, `/api/journal`, `/api/diary`;
- debug pause/resume;
- deep-link `run_id` replay mode.

It is not enough to migrate React consumers and leave this HTML behind. Removal
gate must include either replacement of the embedded Monitor or a deliberate
decision that it is an archived compatibility client.

## 5. Contract findings requiring correction before migration

### 5.1. Run identity is not frozen

The code uses several identifiers:

- `RUN_ID` / `PK_RUN_ID` in environment and diary events;
- `session_name` in meta and some fallback URLs;
- `check_id` as a grouping key for evidence/artifacts;
- `instance_id`, `app_code`, `deploy_url` in the runs projection.

The code comments correctly warn not to put `session_name` in URLs, but several
fallbacks still derive a run identity from `session_name` or `check_id`. Before
backfill freeze:

```text
run_id       = immutable canonical run identifier
check_id     = stable check/config identity
instance_id  = deployed target instance identity (optional)
session_name = display label only, never a lookup key
```

Every legacy record needs an explicit `identity_resolution` result:
`exact`, `derived`, `unresolved`. `unresolved` must remain visible and must not
silently be assigned to the current run.

### 5.2. Global projections cause cross-run collisions

`run_summary.json`, `run_ui_summary.json`, `severity_trend.ndjson` and
`results_hooks.json` are global. A canonical API must be run-scoped:

```text
GET /runs/{run_id}
GET /runs/{run_id}/summary
GET /runs/{run_id}/events
GET /runs/{run_id}/evidence
GET /runs/{run_id}/artifacts
GET /runs/{run_id}/integrations
```

The exact URLs are a target-contract decision for Gemini/architecture review;
the non-negotiable property is that `latest` is a convenience query, not the
identity of a run and not the source of truth.

### 5.3. Journal normalization drops structured telemetry

`run_journal._as_event()` retains only `ts`, `kind`, `channel`, `text` and
`pretty`. Structured fields attached by `diary_bus.append()` — for example
`beam_id`, `sourceNodeId`, `targetNodeId`, `severity`, `recording_ready` and
`state_hash` — are lost in the journal projection.

Therefore:

- `/api/journal` is a **human signal projection**, not a lossless event log;
- `/api/warzone/scene` currently reads raw diary separately to recover telemetry;
- migration must preserve a lossless event envelope first, then build filtered
  human journal and WarZone projections from it;
- no consumer may reconstruct domain state from the human journal projection.

### 5.4. Legacy event filtering can cross-contaminate runs

`export_diary_snapshot()` includes events with no `run_id` when exporting a
specific run (`not e.get("run_id") or ...`). This is a backwards-compatibility
choice, but it makes an old unscoped event indistinguishable from an event of
the requested run. Backfill must mark such events `run_scope=unknown`; it must
not attach them to a run without provenance.

### 5.5. ACL is inconsistent and is not an authentication boundary

Current identity comes from client-controlled `X-PK-User` or `pk_user` cookie.
`may_view_run()` then compares it with `owner_user_id` from the file index/meta.
This is a lab ACL helper, not a production principal boundary.

Observed behavior:

- run-specific `/api/journal`, `/api/diary`, `/api/meta`, `/api/export` and
  recording routes call `_gate_run_id()`;
- a run with an owner and no caller gets 403;
- unowned/`legacy` records are visible by policy;
- `/api/evidence` filters rows, but many global projections are not run-gated;
- `runs/index` with no caller currently returns the full list;
- wildcard CORS is enabled and explicitly allows `X-PK-User`.

The `403` seen for `run_id=97f64eef7c34` is therefore expected from this ACL
path, not evidence that the journal data is absent. The durable fix is an
authenticated principal propagated by the API boundary and an explicit
authorization decision for every run-scoped read. No localhost bypass or
allow-all compatibility exception belongs in the migration.

### 5.6. Local paths leak through current contracts

Recording status, run summaries, artifact index and export metadata may expose
absolute filesystem paths. The target contract should expose `artifact_id`,
content type, size, checksum, provenance and an authorized download URL/handle;
never a server filesystem path.

## 6. Salvage boundary

### Preserve as domain semantics

1. Run identity, ownership, check/instance relationship and lifecycle state.
2. Lossless ordered run events with timestamps, kind, channel, structured payload,
   provenance and source process.
3. Final verdict/gate, scenario counts, tool versions and compiled-plan hashes.
4. Evidence references, finding provenance, history and integration identifiers.
5. Artifact metadata, checksums, object keys, retention class and legal holds.
6. Discovery IR and its relation to the compiled plan/run.
7. Recording/video, Allure, scanner, runner logs and raw event exports.
8. Audit trail for cleanup, migration, redaction and authorization decisions.

### Rebuild as projections

- `meta.json` / `/api/meta`;
- `runs/apps` grouping;
- Results summary and severity trend;
- signal/error journal filtering;
- Dojo/Allure/scanner hook tiles;
- Monitor scene graph and WarZone scene state;
- package wireds and downloadable links.

### Deprecate after consumers move

- `/api/journal/latest` as an unqualified latest endpoint;
- global `/api/summary/latest`, `/api/summary/trend` and hooks endpoints;
- direct `/api/diary` file-tail SSE;
- direct filesystem path and `/api/export*` compatibility downloads;
- embedded Monitor HTML at `:8767`.

### Move out of Live rather than recreate

Dojo sync, auth-vault, Intruder, AI proxy, retention/purge, gate-policy writes
and runtime pause/resume need their own authenticated boundaries. Replacing
Live with another monolith containing all these routes would preserve the
coupling that salvage is intended to remove.

## 7. Migration sequence

This is a research-derived order, not an implementation assignment.

### Phase A — inventory and freeze

- create a wired of every `reports/live/*`, run directory and binary artifact;
- freeze identifier resolution and event schema;
- classify records as exact/derived/unresolved;
- calculate retention/legal-hold obligations before copying or deleting anything;
- snapshot hashes and sizes; do not mutate source files.

### Phase B — lossless local foundation

- define `EventRecord` and `ArtifactRecord` contracts;
- implement a `LocalArtifactStore` and an idempotent import wired;
- preserve raw event fields instead of routing them through `run_journal`;
- create per-run projections from the imported lossless records;
- make orphan and incomplete evidence explicit failures/diagnostics.

### Phase C — durable target

- persist runs, events, summaries, evidence refs, artifacts, discovery records,
  retention and audit in the selected durable stores;
- upload large files with deterministic object keys and SHA-256;
- keep filesystem source until verification and retention decision;
- make restart recovery read only durable records/object storage, not Live memory.

### Phase D — canonical API/SSE and consumer cutover

- implement run-scoped reads and authenticated authorization;
- implement event delivery with bounded/throttled transport, while raw high-volume
  payload logs remain artifacts;
- move React and embedded Monitor consumers in batches;
- add compatibility facade only for clients not yet migrated;
- compare old/new projections for the same run before switching each consumer.

### Phase E — retirement proof

Only after all gates below pass:

- disable new writes to old Live contracts;
- observe zero compatibility traffic for the agreed window;
- archive source files according to retention/legal hold;
- remove static Monitor and `:8767` service;
- verify that no frontend or runner import/URL still targets the old surface.

## 8. Acceptance gates for Gemini review

The next architect/research pass should accept or reject these gates explicitly:

1. A restarted API reconstructs run history without `meta.json`, in-memory Live
   state or Valkey availability.
2. Every event is either assigned to one canonical `run_id` or visibly marked
   unresolved; no legacy unscoped event is silently copied into a run.
3. Journal filtering does not destroy structured telemetry required by WarZone.
4. A repeated backfill produces no duplicate run/event/artifact records.
5. Every artifact has metadata, checksum, provenance and an authorized retrieval
   path; no filesystem path is exposed to clients.
6. Missing object, orphan record and incomplete evidence cannot become a green
   security gate.
7. Run-specific reads enforce authenticated ownership/admin policy consistently;
   no localhost bypass, client-supplied identity trust or allow-all fallback.
8. Global latest projections are demonstrably rebuildable and cannot overwrite
   another run's authoritative state.
9. WarZone forward/backward seek produces the same state hash from the canonical
   event log, not from a second hidden event source.
10. Pure Box works with local storage; enterprise storage is an implementation of
    the same ArtifactStore contract.
11. All old frontend consumers and the embedded Monitor have a named replacement
    or an explicit deprecation owner.
12. Only after the above, `:8767` and its compatibility endpoints are removable.

## 9. Open decisions — do not silently decide during implementation

- canonical durable store and schema migration tool for the pure/enterprise
  split;
- exact authenticated principal propagation from the API gateway to run reads;
- whether canonical live delivery is SSE over API, WebSocket, or another bounded
  transport;
- event retention and raw-fuzzer-log artifact policy;
- legacy `run_id` recovery when only `session_name`/filesystem names remain;
- compatibility window and traffic measurement for `:8767`;
- ownership of Dojo, auth-vault, Intruder, AI, retention and runtime-control API;
- final URL/schema names for the canonical run/evidence/artifact endpoints.

## 10. Sources inspected

- `orchestrator/utils/live_server.py`
- `orchestrator/utils/diary_bus.py`
- `orchestrator/utils/run_journal.py`
- `orchestrator/utils/runs_index.py`
- `orchestrator/utils/evidence_refs.py`
- `orchestrator/utils/artifact_index.py`
- `orchestrator/utils/reporter.py`
- `orchestrator/utils/run_ui_summary.py`
- `orchestrator/utils/live_pers_acl.py`
- `orchestrator/utils/paths.py`
- `frontend/src/api/apiBase.ts`
- `frontend/src/results/ResultsJournalPanel.tsx`
- `frontend/src/studio/execution/useExecutionSSE.ts`
- `frontend/src/warzone/useWarZoneTelemetry.ts`
- `orchestrator/static/live/index.html`
- `docs/friend-requests/MONITOR-MULTI-REPLAY.md`
- `docs/friend-requests/MONITOR-INSTANCE-BINDING.md`
- `sanctuary/cosmoport2/persistence-and-minio.md`