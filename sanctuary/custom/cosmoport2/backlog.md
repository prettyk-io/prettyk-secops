# Cosmoport 2.0 — Бэклог (standalone)

> **Статус:** 🟡 PLAN — фундамент утверждён, карточки нарезаны.  
> **Концепт:** [`CONCEPT.md`](CONCEPT.md).  
> **Стек:** [`stack-decision.md`](stack-decision.md).  
> **Roadmap:** [`roadmap.md`](roadmap.md).  
> **Инвентаризация:** [`inventory.md`](inventory.md).  
> **Хроника Алтаря:** [`../ALTAR.md`](../ALTAR.md) § 19.

---

## Архитектурный контекст (не перерешиваем)

| Решение | Зафиксировано |
|---|---|
| **Backend:** Python/FastAPI/Pydantic/SQLAlchemy + PostgreSQL + Valkey + S3/MinIO | ✅ |
| **Frontend Surface A (Control Station):** MUI Minimal UI + MUI X Data Grid + @xyflow/react, **Meta Light / white default** | ✅ |
| **Frontend Surface B (Web IDE):** Tailwind v4 + Radix + Monaco + xterm, dark IDE default | ✅ |
| **Лицензия MUI/Minimal UI:** общая для Pure Box Admin и Cosmoport Control Station | ✅ |
| **React Flow:** бесплатный MIT `@xyflow/react` + dagre, Pro НЕ покупаем | ✅ |
| **Модульный монолит:** `orchestrator/cosmo/` | ✅ |
| **8 сущностей:** domains, applications, pipelines, runs, batches, findings, evidence_ledger, audit_events | ✅ |
| **Распределение:** 20/40/40 (Boss 20% / Flash 40% / Luna 40%) | ✅ |

### Уже готово (reuse foundation)

| Компонент | Кто | Статус |
|---|---|---|
| Pydantic-модели (Domain, AppGraph, Brick, Run, Gate) | Luna L1-L5 | ✅ 39 тестов |
| PlanCompiler Python + Batch DAG Executor | Boss | ✅ prototype |
| Gitea ForgeAdapter | Luna L6 | 🔨 в работе |
| EvidenceChain SHA-256 | Luna | ✅ 14 тестов |
| ГОСТ-Акт модель + HTML + SARIF | Luna | ✅ 21 тест |
| Full-cycle integration test (Domain→Run→Gate→Evidence→Акт) | Luna | ✅ 62 теста |
| Playwright Adapter (55+ методов) | Boss DSL-B1 | ✅ 8/8 |
| scanner Demon API | legacy | ✅ боевое |
| Fuzzer Engine | legacy | ✅ боевое |
| Discovery Engine | legacy | ✅ 41/41 |
| PipelineDAG + RunControlPanel (прототип) | Flash COS-F5/F6 | ✅ |
| CosmoDashboard + GateConfigPanel | Flash COS-F3/F7/F8 | ✅ |
| PostgreSQL 16 + Valkey 8 | Buddy | ✅ |
| MUI Minimal UI template (лицензия) | Flash | ✅ design-admin |

---

# Фаза 1: Backend Core — Steel Thread

## COS-001: PostgreSQL DDL + SQLAlchemy ORM + Alembic

**Est:** 4–6h · **Тип:** Core / Backend · **Кому:** Boss / Luna

### Контекст
6 таблиц через SQLAlchemy 2 Async + Alembic:
- `cosmo_domains`, `cosmo_applications`, `cosmo_pipelines`
- `cosmo_runs`, `cosmo_batches`, `cosmo_evidence_ledger`

### DoD
- [ ] Все 6 таблиц созданы, `alembic upgrade head` применяется
- [ ] SQLAlchemy модели зеркалят Pydantic-схемы без потери типов
- [ ] JSONB-поля (compiled_plan, inputs, metadata) валидируются на запись
- [ ] ENUM-типы зафиксированы
- [ ] Индексы: FK, UNIQUE на correlation_id, GIN на JSONB
- [ ] Модели импортируются из `orchestrator.cosmo.db.models`

## COS-002: PlanCompiler (Python)

**Est:** 3–5h · **Тип:** Core / Compiler · **Кому:** Boss

### Контекст
Порт `planCompiler.ts` → Python. `compile_pipeline(pipeline, inputs) → PipelinePlan`:
- Детерминированный compiled_hash (SHA-256 канонизированного JSON)
- Топологический порядок шагов
- Fail-closed: циклы, висячие рёбра, `version="latest"`
- Нормализация перед хэшированием

### DoD
- [ ] Одинаковые входы → одинаковый compiled_hash
- [ ] Граф с циклами → PlanCompilationError
- [ ] CompiledBatch правильно группируют шаги
- [ ] Юнит-тесты: хэширование, валидация, граничные случаи

## COS-003: RunControlPlane — State Machine в PostgreSQL

**Est:** 5–7h · **Тип:** Core / State Machine · **Кому:** Boss

### Контекст
Транзакционная стейт-машина в PG:
- `create_run` — идемпотентно (pipeline_id + inputs → один run)
- Transition: draft→pending→queued→running→succeeded/failed
- Lease: worker продлевает; истечение → expired (retryable)
- `recover_stale`: все running с истекшим lease → expired
- Retry: новый attempt, без дублей findings/evidence

### DoD
- [ ] create_run с idempotency
- [ ] Запрещённые переходы → исключение
- [ ] Lease + recovery
- [ ] Retry с retryOf + attemptNumber+1
- [ ] Таймлайн переходов (from_state, to_state, event, reason, timestamp)
- [ ] Юнит-тесты: все переходы, идемпотентность, lease, retry, recovery

## COS-004: CapabilityBroker — Аллокатор портов и сессий

**Est:** 3–4h · **Тип:** Core / Infra · **Кому:** Luna

### Контекст
Брокер изолированных сессий: привязка к run_id, аллокация портов, health check, освобождение.

### DoD
- [ ] acquire(run_id, capability) → port/host
- [ ] release(run_id) → возврат ресурсов
- [ ] Два run не могут получить один порт одновременно
- [ ] Health: healthy/degraded/unavailable
- [ ] Авто-освобождение при succeeded/failed/expired

## COS-005: EvidenceLedger — Неизменяемый журнал улик

**Est:** 4–6h · **Тип:** Core / Security · **Кому:** Boss

### Контекст
SHA-256 цепочка доказательств:
- Каждый шаг → SHA-256 хэш
- Артефакты в S3/MinIO
- Метаданные в PG: путь, хэш, timestamp, run_id, step_id, provenance
- `verify_chain(run_id)` → проверка целостности

### DoD
- [ ] record_evidence → запись в PG + S3
- [ ] verify_chain → True/False
- [ ] Ни один артефакт не может быть изменён без нарушения цепочки
- [ ] S3 adapter: put/get/delete (для тестов — local FS)
- [ ] Provenance: кто, когда, из какого шага

## COS-006: Интеграционный smoke-тест Steel Thread

**Est:** 4–6h · **Тип:** Тесты / Интеграция · **Кому:** Luna

### Контекст
Один сквозной тест: mock Gitea + mock Woodpecker + реальный compiler + реальная state machine + реальный ledger.

### DoD
- [ ] create_pipeline → compile → create_run → run_batches → evaluate_gate → record_evidence
- [ ] Прогон: draft→pending→queued→running→succeeded
- [ ] Gate блокирует при Critical findings
- [ ] Evidence записано, цепочка верифицируется
- [ ] Тест без внешних сервисов (mock Gitea, mock Woodpecker)

---

# Фаза 2: Адаптеры

## COS-007: Gitea ForgeAdapter — добить + тесты

**Est:** 2–4h · **Тип:** Integration / Adapter · **Кому:** Luna

### DoD
- [ ] create_repo — идемпотентно
- [ ] link_repo, get_repo
- [ ] register_webhook, unregister_webhook
- [ ] Токен только через config/secrets
- [ ] Mock-тесты: все CRUD операции

## COS-008: Woodpecker ExecutionAdapter

**Est:** 3–5h · **Тип:** Integration / Adapter · **Кому:** Luna + Boss

### DoD
- [ ] submit_run: генерация YAML из PipelineDefinition
- [ ] get_status, get_logs, cancel_run
- [ ] Mock-тесты: все операции
- [ ] ExecutionAdapter (abstract base class) — для будущего Jenkins

## COS-009: scanner ctl + Playwright ctl

**Est:** 2–3h · **Тип:** Integration / Adapter · **Кому:** Luna

### DoD
- [ ] start_zap / zap_status / stop_zap через CapabilityBroker
- [ ] start_playwright / playwright_status через CapabilityBroker
- [ ] Изоляция по run_id
- [ ] Авто-освобождение при завершении run

---

# Фаза 3: API & Frontend Integration

## COS-010: FastAPI routes

**Est:** 5–7h · **Тип:** API · **Кому:** Flash

### Endpoints
```text
POST/GET  /api/v1/domains
POST/GET  /api/v1/applications
POST/GET  /api/v1/pipelines
POST      /api/v1/pipelines/:id/compile
POST/GET  /api/v1/runs
POST      /api/v1/runs/:id/cancel, retry, transition
POST      /api/v1/gates/:id/approve, reject
GET       /api/v1/events?run_id=:id  (SSE)
```

### DoD
- [ ] Pydantic response schemas
- [ ] Swagger на `/docs`
- [ ] Auth + domain-scope
- [ ] 422/404/409 при конфликтах
- [ ] SSE events по run_id

## COS-011: SSE стриминг — Valkey PubSub → Frontend

**Est:** 3–4h · **Тип:** Infra / Frontend · **Кому:** Flash

### DoD
- [ ] Publish событий в Valkey при каждом изменении state
- [ ] SSE-коннект из Frontend
- [ ] Reconnect при обрыве
- [ ] Backpressure: очередь в Valkey
- [ ] История событий через REST (не только SSE)

## COS-012: Порт Frontend localStorage → REST API

**Est:** 3–4h · **Тип:** Frontend · **Кому:** Flash

### DoD
- [ ] Все UI-компоненты читают через REST, не localStorage
- [ ] Loading/error states
- [ ] 401/403 → редирект на логин
- [ ] SSE-подписка на статус run
- [ ] Без регрессии существующих тестов

---

# Фаза 4: Dual-Surface UI — Control Station + Web IDE

## COS-020: CSS Style Boundaries (Control Station vs Web IDE)

**Est:** 2–3h · **Тип:** Frontend / Infra · **Кому:** Flash

### Контекст
Изоляция MUI и Tailwind в одном SPA: `CssBaseline` → `.cosmo-control-station`, Tailwind Preflight → `.cosmo-ide-root`.

### DoD
- [ ] Preflight отключен глобально, включен только внутри `.cosmo-ide-root`
- [ ] `CssBaseline` работает только внутри `.cosmo-control-station`
- [ ] CSS-переменные `--pk-*` доступны в обоих контекстах
- [ ] Нет конфликтов стилей при переключении между поверхностями
- [ ] Переключатель Control Station ↔ Web IDE в header

## COS-021: Control Station Shell (MUI Minimal UI + Meta Light default)

**Est:** 4–6h · **Тип:** Frontend · **Кому:** Flash

### Контекст
Основной операторский shell на MUI Minimal UI template:
- Белая тема Meta Light как default
- Meta Dark как переключаемый режим
- Сайдбар: Домены, Приложения, Пайплайны, Прогоны, Гейты, Каталог, Аудит, Настройки
- Header: Domain selector, Env selector, Active Runs, User

### DoD
- [ ] MUI Theme (Meta Light) применён
- [ ] Сайдбар с навигацией
- [ ] Header с контекстными селекторами
- [ ] Dark mode toggle
- [ ] Сохранение контекста (domain_id, app_id, run_id)

## COS-022: Control Station Core Views

**Est:** 6–8h · **Тип:** Frontend · **Кому:** Flash

### Контекст
Основные экраны Control Station на реальном REST API:
- Applications (MUI X Data Grid с Tree Data: Domain → Group → App)
- Application detail (вкладки)
- Runs History (MUI X Data Grid с Master-Detail для findings)
- Pipeline DAG (@xyflow/react + dagre auto-layout)
- Gate Inspector (ручной approve/reject)

### DoD
- [ ] Applications table с Tree Data
- [ ] Application detail с вкладками
- [ ] Runs table с Master-Detail
- [ ] Pipeline DAG с auto-layout
- [ ] Gate Inspector с кнопками approve/reject
- [ ] Все компоненты читают из REST API, не localStorage

## COS-023: Web IDE Core Port

**Est:** 4–6h · **Тип:** Frontend · **Кому:** Flash + Luna

### Контекст
Порт существующего `prettyk-editor` в модуль `frontend/src/cosmo/ide/`:
- Monaco Wire Editor (DSL + YAML)
- xterm терминал
- File tree (ForgeAdapter mock)
- Quick actions (Compile, Run Lab, Fuzz)
- Command palette (Ctrl+K)

### DoD
- [ ] Monaco Editor с sugar-подсветкой
- [ ] xterm терминал подключен
- [ ] File tree с базовыми операциями
- [ ] Панель быстрых действий
- [ ] Command palette

## COS-024: Deep-Linking (Control Station ↔ Web IDE)

**Est:** 2–3h · **Тип:** Frontend · **Кому:** Flash

### Контекст
Контекстные переходы между поверхностями:
- Gate Inspector → строка сценария в Web IDE
- Web IDE Commit & Run → Control Station Live DAG
- LC Steps Config → Web IDE JSON/YAML редактор

### DoD
- [ ] Переход Gate → Web IDE (строка + позиция курсора)
- [ ] Переход Commit → Control Station (run_id, DAG)
- [ ] HUD-нотификация при создании run из Web IDE
- [ ] Сохранение контекста при переключении поверхностей

## COS-025: Live Telemetry Integration

**Est:** 2–3h · **Тип:** Frontend + Backend · **Кому:** Boss + Flash

### Контекст
SSE-телеметрия в обеих поверхностях:
- Control Station: live DAG (активный луч по выполняемому шагу)
- Web IDE: статус-бар (run status, findings count, gate result)

### DoD
- [ ] SSE-подписка в Control Station: обновление DAG и статусов
- [ ] SSE-статус в Web IDE статус-баре
- [ ] Reconnect при обрыве SSE
- [ ] История событий через REST

---

# Фаза 5: Инфраструктура

## COS-013: Docker Compose — Gitea + Woodpecker + MinIO + Cosmo API

**Est:** 2–3h · **Тип:** Infra / DevOps · **Кому:** Buddy

### DoD
- [ ] Один docker-compose.yml для всего стека
- [ ] Gitea :3000, Woodpecker :8000, MinIO :9000, Cosmo API :8100
- [ ] Healthchecks с condition: service_healthy
- [ ] Pure Box режим: локальные образы

## COS-014: Caddy Reverse Proxy

**Est:** 1h · **Тип:** Infra · **Кому:** Buddy

### DoD
- [ ] Caddyfile: Frontend :5173, API :8100, Gitea :3000, MinIO :9000
- [ ] Automatic TLS

## COS-015: Health Endpoints

**Est:** 1h · **Тип:** Infra · **Кому:** Boss

### DoD
- [ ] GET /live → 200
- [ ] GET /ready → 200 (PG + Valkey + Gitea)
- [ ] GET /health → 200 + детали

---

# Фаза 6: Приёмка

## COS-016: Сквозной smoke-тест на живом стенде

**Est:** 3–4h · **Тип:** QA / Acceptance · **Кому:** Luna + Keeper

### GWT
- **Given:** стенд поднят, Gitea + Woodpecker + scanner + Playwright живы
- **When:** создан Domain → Pipeline → скомпилирован → запущен Run
- **Then:** Woodpecker выполняет build→sast→deploy→dast; scanner сканирует; Gate принимает решение; Evidence записано; SSE показывает статус

## COS-017: Идемпотентность и Recovery

**Est:** 2–3h · **Тип:** QA / Resilience · **Кому:** Luna

### GWT
- Два одинаковых запуска → один run
- Valkey очищен → статусы восстановлены из PG
- Ни один run/finding/evidence не существует только в Valkey

## COS-018: Security — No Secret Leakage

**Est:** 1–2h · **Тип:** Security / Audit · **Кому:** Boss

### DoD
- [ ] Токены не попадают в pipeline_snapshot
- [ ] Plaintext-секреты не видны в логах
- [ ] Frontend не получает токены/секреты
- [ ] Evidence ledger не содержит секретов
- [ ] OpenBao — единственный источник секретов

---

# Сводка: все карточки

| ID | Фаза | Что | Est | Кому |
|---|---|---|---|---|
| COS-001 | 1 | PostgreSQL DDL + SQLAlchemy + Alembic | 4-6h | Boss / Luna |
| COS-002 | 1 | PlanCompiler (Python) | 3-5h | Boss |
| COS-003 | 1 | RunControlPlane (State Machine) | 5-7h | Boss |
| COS-004 | 1 | CapabilityBroker | 3-4h | Luna |
| COS-005 | 1 | EvidenceLedger | 4-6h | Boss |
| COS-006 | 1 | Интеграционный smoke-тест | 4-6h | Luna |
| COS-007 | 2 | Gitea ForgeAdapter | 2-4h | Luna |
| COS-008 | 2 | Woodpecker ExecutionAdapter | 3-5h | Luna + Boss |
| COS-009 | 2 | scanner ctl + Playwright ctl | 2-3h | Luna |
| COS-010 | 3 | FastAPI routes | 5-7h | Flash |
| COS-011 | 3 | SSE стриминг | 3-4h | Flash |
| COS-012 | 3 | Порт Frontend (REST) | 3-4h | Flash |
| COS-020 | 4 | CSS Style Boundaries | 2-3h | Flash |
| COS-021 | 4 | Control Station Shell (MUI + Meta Light) | 4-6h | Flash |
| COS-022 | 4 | Control Station Core Views | 6-8h | Flash |
| COS-023 | 4 | Web IDE Core Port | 4-6h | Flash + Luna |
| COS-024 | 4 | Deep-Linking | 2-3h | Flash |
| COS-025 | 4 | Live Telemetry Integration | 2-3h | Boss + Flash |
| COS-013 | 5 | Docker Compose | 2-3h | Buddy |
| COS-014 | 5 | Caddy Reverse Proxy | 1h | Buddy |
| COS-015 | 5 | Health Endpoints | 1h | Boss |
| COS-016 | 6 | Сквозной smoke | 3-4h | Luna + Keeper |
| COS-017 | 6 | Идемпотентность + Recovery | 2-3h | Luna |
| COS-018 | 6 | Security Leak Check | 1-2h | Boss |
| **Итого** | — | **24 карточки** | **~64-88h** | — |

## Распределение по братьям

| Брат | Карточки | Часы |
|---|---|---|
| **Boss** (20%) | COS-001, COS-002, COS-003, COS-005, COS-008, COS-015, COS-018, COS-025 | ~21-29h |
| **Flash** (40%) | COS-010, COS-011, COS-012, COS-020, COS-021, COS-022, COS-023, COS-024, COS-025 | ~30-41h |
| **Luna** (40%) | COS-001, COS-004, COS-006, COS-007, COS-008, COS-009, COS-016, COS-017, COS-023 | ~24-34h |
| **Buddy** | COS-013, COS-014 | 3-4h |

---

*Бэклог Cosmoport 2.0 запечатан. Назначение карточек — по команде Максима.*