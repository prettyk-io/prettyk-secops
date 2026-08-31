# Cosmoport 2.0 — Persistence Boundary и переход от Live к MinIO

> **Статус:** PLAN / architectural finding. Не канон pure и не разрешение удалять Live прямо сейчас.  
> **Дата:** 27 августа 2026.  
> **Цель:** сохранить все сущности и записи Live при переносе транспорта/хранилища в Cosmo Control Plane.

## 1. Короткий ответ

**Да, MinIO пора интегрировать.** Но MinIO не заменяет Live и не является базой сущностей.

Правильная схема:

```text
PostgreSQL  — сущности, состояния, индексы, аудит, provenance
MinIO/S3    — большие и неизменяемые бинарные артефакты
Valkey      — ephemeral queue/pubsub/live transport
API/SSE     — новая поверхность чтения и live-доставки
Live :8767  — временный compatibility facade, затем удаляется
```

**Live можно удалить как отдельный UI/HTTP-сервис только после того, как его данные и контракты переехали.** Нельзя путать удаление пульта с удалением журнала.

## 2. Что Live хранит фактически сейчас

По текущему коду `orchestrator/utils/` Live — это не единая база, а набор persistence-механизмов.

| Текущий объект | Где фактически живёт | Что это по смыслу | Целевой владелец |
|---|---|---|---|
| `checks_registry.json` | `reports/live/` через checks API | Check/Workspace registry | PostgreSQL `checks`/`pipelines` |
| `runs_index.ndjson` | `reports/live/` | список запусков и app/instance grouping | PostgreSQL `runs` + projections |
| `meta.json` | `reports/live/` | live session/meta, не полноценная история | PostgreSQL run/session state; Valkey cache |
| `diary.ndjson` | `reports/live/` | append-only operational events | PostgreSQL `run_events`/audit; Valkey fan-out |
| `run_summary.json` | `reports/live/` или run directory | итог прогона, verdict, counts, hints | PostgreSQL `run_summaries` / `runs` snapshot |
| `run_ui_summary.json` | `reports/live/` | UI-проекция результата | rebuildable projection из PG |
| `severity_trend.ndjson` | `reports/live/` | тренд для UI | PostgreSQL trend/events или rebuildable projection |
| `artifact_index.json` | `reports/live/` | check → runs → artifact paths, holds | PostgreSQL `artifacts` + retention/legal hold |
| `check_evidence_refs.json` | `reports/live/` | evidence links/history | PostgreSQL `evidence_refs` / ledger |
| `discovery_<session>.json` | `reports/live/` | discovery IR | PostgreSQL discovery record + artifact object |
| `reports/runs/<run_id>/` | local filesystem | Wired, runner logs, cuts, summaries, resources | PG metadata + MinIO objects |
| `reports/video/` | local filesystem / mounted volume | browser recordings | MinIO object |
| `reports/allure-results/` | local filesystem / mounted volume | Allure raw results | MinIO object or Allure-owned storage |
| `reports/scanner-results/` | local filesystem | scanner reports/XML | MinIO object |

### Важное ограничение текущего Live

`_DISCOVERY_SESSIONS` в `live_server.py` — in-memory registry. При рестарте процесса активные discovery sessions теряются; при stop IR уже выгружается в `reports/live/discovery_<session>.json`.

Это означает:

- Live сейчас умеет **публиковать и экспортировать** данные;
- Live не является полноценным durable control plane;
- часть записей durable только потому, что пишется в файлы;
- PostgreSQL и MinIO в текущем `docker-compose.infra.yml` ещё не подключены к этому контуру.

## 3. Что именно значит «удалить Live»

Не делать грубое удаление `live_server.py` и `reports/live/`.

### Можно убрать позже

- отдельный Live HTML/UI на `:8767`;
- старые прямые frontend-запросы к `/api/...` Live;
- compatibility endpoints после миграции клиентов;
- in-process SSE implementation, если API/SSE Control Plane стал владельцем доставки.

### Нельзя убрать до миграции

- diary/event semantics;
- run index и check registry;
- run summary и verdict;
- evidence references и legal hold;
- discovery IR;
- retention/purge rules;
- redaction и audit trail;
- существующие run directories и бинарные evidence.

## 4. Целевая модель хранения

### PostgreSQL — записи и сущности

В PostgreSQL должны жить:

```text
checks / workspaces
domains
applications / targets
pipelines / pipeline revisions
runs
batches / jobs
run_events
gate_decisions
findings
evidence_records
artifact_records
discovery_sessions
retention_policies
legal_holds
audit_events
```

Для каждого run минимально нужен durable snapshot:

```text
run_id
check_id / workspace_id
pipeline_id + pipeline_revision
compiled_plan_json
compiled_hash
inputs_hash
state / verdict / gate
actor / owner
started_at / ended_at
worker_id / lease_expires_at
tool_versions
```

`run_summary.json` остаётся экспортным форматом и compatibility artifact, но не единственным источником статуса.

### Valkey — Ephemeral Transport и запрет атомарного флуда

> **ЖЕЛЕЗОБЕТОННЫЙ КАНОН:** В Valkey (Pub/Sub / Streams) и SSE **категорически запрещено** гнать атомарные микро-события на каждую строчку фаззинга ($N \times \text{dictionaries} \times \text{corpus} \times \text{mutations}$).

Попытка спамить миллионы событий на каждый payload положит Valkey, сожрёт CPU воркера и повесит браузерный UI (DOM freeze).

#### Правила гранулярности событий для Valkey и SSE:

1. **Уровень шага (Wire Step):**
   - События старта и завершения шага: `STEP_START`, `STEP_END`, `STEP_FAILED`.
   - Решение гейта: `GATE_DECISION`, `SECURITY_GATE`.
2. **Циклы и итерации (Loops):**
   - Если пайплайн выполняет цикл по сущностям — ровно **1 событие на мембер цикла / итерацию** (или пачку), а **не** $N \times M$ событий по каждому вложенному пейлоаду.
3. **Словари и мутации (Dictionaries & Corpus):**
   - Все словари шага/корпуса = **1 суммарное событие** (`FUZZ_DICTIONARY_SET_LOADED` / `FUZZ_BATCH_CONFIG`).
   - Деление по корпусам — максимум 1 агрегированное событие на корпусную фазу (`CORPUS_PASS_START` / `CORPUS_PASS_END`), без поэлементного перебора.
4. **Прогресс фаззинга (Throttled Ticks):**
   - Прогресс гонится агрегированным пульсом (тиками) с частотой не чаще **1–2 Гц** (Heartbeat/Progress tick):
     ```json
     { "type": "FUZZ_PROGRESS", "step_id": "fuzz_api", "completed": 4500, "total": 20000, "rps": 450, "anomalies_count": 2 }
     ```
5. **Сигнальные аномалии (Signal Hits):**
   - Конкретные аномалии (`TARGET_HIT`, HTTP 500, WAF bypass, timing anomaly) отправляются как штучные сигнальные события только тогда, когда аномалия **реально зафиксирована** (низкая частота, высокая ценность).
6. **Сырой лог пейлоадов:**
   - Полный пошаговый дамп всех $N$ миллионов попыток пишется локальным буфером раннера прямо в сжатый файл-артефакт (`runs/{run_id}/logs/fuzzer_raw.ndjson.gz`) и затем загружается в **MinIO**, минуя Valkey и PostgreSQL `run_events`.

### MinIO/S3 — большие артефакты

В MinIO не надо складывать доменную модель целиком. Он принимает:

```text
pk/<tenant-or-domain>/<run_id>/
  evidence/<evidence_id>/screenshot.png
  evidence/<evidence_id>/har.json
  evidence/<evidence_id>/video.mp4
  evidence/<evidence_id>/raw-response.bin
  logs/diary.ndjson
  logs/runner.log
  reports/scanner.xml
  reports/allure-results/<file>
  discovery/<session_id>.json
```

В PostgreSQL для каждого объекта:

```text
artifact_id
run_id / step_id / finding_id
object_key
content_type
size_bytes
sha256
created_at
provenance
retention_class
legal_hold
```

**Правило:** объект без записи в `artifact_records` считается orphan; запись без доступного объекта считается incomplete evidence. Ни один из этих случаев не должен тихо превращаться в зелёный gate.

## 5. ArtifactStore contract

Сначала нужен единый интерфейс, а не прямые вызовы MinIO по всему коду:

```text
ArtifactStore.put(stream, key, content_type, metadata) -> ArtifactRef
ArtifactStore.get(key) -> stream / bytes
ArtifactStore.head(key) -> ArtifactMetadata
ArtifactStore.delete(key) -> result
ArtifactStore.copy(source, target) -> ArtifactRef
ArtifactStore.verify(ref) -> bool
```

Реализации:

```text
LocalArtifactStore  — Pure Box / тесты / airgap без MinIO
S3ArtifactStore     — Enterprise / MinIO / Ceph / внешний S3
```

Остальной код знает только `ArtifactStore`. Так Pure Box не ломается, а Enterprise получает MinIO без второго доменного пути.

## 6. Порядок интеграции

### Шаг 1 — Persistence inventory и contract freeze

- перечислить все producers/consumers `reports/live/*`;
- зафиксировать `run_id`, `check_id`, `instance_id`, `session_name` и их различия;
- определить, какие файлы являются источником, а какие UI-проекцией;
- определить retention/legal hold для каждого класса данных;
- написать migration wired.

### Шаг 2 — ArtifactStore с Local backend

- вынести запись screenshot/video/log/report через интерфейс;
- сохранить текущий filesystem backend;
- добавить checksum, size, content type, provenance;
- покрыть orphan/incomplete/duplicate cases;
- не менять UI и Live endpoint на этом шаге.

### Шаг 3 — MinIO в Enterprise-профиль

- добавить MinIO в отдельный compose-профиль/stack;
- bucket policy, health/readiness, credentials boundary;
- bucket versioning/retention — только после проверки операционной модели;
- локальный Pure Box оставить на `LocalArtifactStore`;
- секреты брать через OpenBao boundary, не из frontend.

### Шаг 4 — Backfill существующих artifacts

- пройти `reports/runs`, `reports/video`, `reports/allure-results`, `reports/scanner-results`, `reports/live/exports`;
- загрузить объекты с детерминированными keys;
- вычислить SHA-256 и создать artifact records;
- повторный запуск backfill должен быть идемпотентным;
- исходные файлы не удалять до verify + retention decision.

### Шаг 5 — Durable records в PostgreSQL

- перенести registry/index/summary/events/evidence references;
- сделать PG authoritative для статусов и истории;
- оставить JSON/NDJSON только как export/import/compatibility formats;
- восстановление после рестарта проверять только из PG + object store.

### Шаг 6 — Control API и SSE

- API читает entities и statuses из PostgreSQL;
- Valkey доставляет live events, но не хранит истину;
- SSE Control Plane заменяет Live SSE;
- старый Live временно проксирует или читает новый API.

### Шаг 7 — Только после этого удалить Live UI/server

- перевести frontend/admin/Allure links на новый API/object URLs;
- провести полный browser/run/evidence smoke;
- провести restart/recovery и retention tests;
- включить compatibility facade только при необходимости;
- удалить `:8767` как отдельный продуктовый пульт.

## 7. Ответ на вопрос «не пора ли?»

**Пора начать, но не с удаления Live.**

Правильный ближайший foundation-slice:

```text
ArtifactStore interface
→ LocalArtifactStore parity
→ MinIO compose/profile
→ artifact metadata + checksum
→ backfill reports
→ PG records for runs/events/evidence
→ Control API/SSE
→ Live retirement
```

Это отдельный приоритет Cosmoport 2.0 и должен идти раньше полноценного удаления Live. Иначе мы просто выкинем единственный работающий пульт, а потом будем археологами у `reports/live/diary.ndjson`.

## 8. Приёмочные gates

- [ ] После рестарта исчезновение Valkey не удаляет run/status/evidence.
- [ ] После рестарта API восстанавливает run history из PostgreSQL.
- [ ] Каждый бинарный artifact имеет PG record + checksum + object key.
- [ ] Backfill повторяем и не создаёт дублей.
- [ ] Missing object/incomplete evidence виден как ошибка, не как pass.
- [ ] Pure Box работает на LocalArtifactStore без обязательного MinIO.
- [ ] Enterprise работает с MinIO через S3 contract.
- [ ] Live UI выключен, но все старые сущности и записи доступны через новый API.
- [ ] `reports/live` не является единственным источником истины.
- [ ] Никакого флуда микро-событиями в Valkey/SSE: фаззинг передаёт только 1 событие на шаг/словари/итерацию цикла, тики прогресса не чаще 1–2 Гц, штучные аномалии; сырой дамп пишется в MinIO-артефакт.

## 9. Решение по срокам

Минимальный **artifact foundation** — несколько часов плотной работы. Полный перенос persistence + API + retirement Live — отдельный срез примерно на **12–20 бото-часов**, потому что сложность не в подключении MinIO, а в миграции семантики:

```text
check → run → event → finding → evidence → artifact → retention
```

Вот эту цепочку нельзя разрезать посередине.