# 🏛️ PrettyK Cosmoport 2.0: Синтез стека и суверенная архитектура платформы

> **Статус:** Architectural Vision & Stack Decision Synthesis (Gemini Magic Touch).  
> **Автор:** Sanctuary Keeper & Gemini Architect.  
> **Контекст:** Результаты 3 циклов Discovery старого Cosmoport (`D:\cosmo\`), анализ 80+ таблиц, 97 сервисов, 14 документов ТЗ и текущего суверенного ядра PrettyK (`prettyk-dev`).  
> **Дата:** 27 августа 2026.  
> **Принцип:** *«Заменяемые инфраструктурные субстраты + Суверенное ядро безопасности PrettyK»*.

---

## 1. Манифест Cosmoport 2.0: от «клея над чужими пайплайнами» к Суверенному Control Plane

### Урок старого Cosmoport (1.0):
Старый Cosmoport (Ruby on Rails + React/AntD + GitLab CI + Redis) выполнял благородную задачу в масштабах ЦБ/КИТС, но архитектурно страдал от трёх родовых травм:
1. **Паразитическая природа:** Cosmoport не владел выполнением — он был хрупким оркестратором GitLab CI API. Если GitLab падал, терялся вебхук или менялся раннер — Cosmoport терял связь с реальностью.
2. **Redis как ложный источник истины:** Статусы джобов и стейт выполнения жили в Redis. Мигнул стенд → Redis стёрт → состояние сотен релизов потеряно («кого опрашивали? хер знает»).
3. **Раздутый микро-ад:** 97 сервисных классов в Rails, дублирование логики политик в Pundit, 80+ таблиц с размазанными внешними ключами и зависимость от монструозных внешних систем (СОД, Blitz OIDC, OpenShift, Nexus, Jira, Confluence).

### Архитектурная парадигма PrettyK Cosmoport 2.0:
PrettyK Cosmoport 2.0 — это **не клон Rails-приложения** и не «ещё один портал со ссылками на GitLab». 
Это **Sovereign Run Control Plane (Суверенная платформа управления жизненным циклом и безопасностью)**.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               PrettyK Cosmoport 2.0                                     │
│                                                                                         │
│   ┌───────────────────┐     ┌──────────────────────┐     ┌──────────────────────────┐   │
│   │   Domain Graph    │ ──> │   DAG Plan Compiler  │ ──> │    Run Control Plane     │   │
│   │ (Levels 0-3, Apps)│     │(inputs_hash / hashes)│     │(PostgreSQL State Machine)│   │
│   └───────────────────┘     └──────────────────────┘     └────────────┬─────────────┘   │
│                                                                       │                 │
│                                                     ┌─────────────────┴─────────────┐   │
│                                                     ▼                               ▼   │
│                                            ┌──────────────────┐           ┌─────────────────┐
│                                            │ Execution Engine │           │  SecOps Engine  │
│                                            │ (Woodpecker/Git) │           │ (PW/scanner/Fuzzer) │
│                                            └────────┬─────────┘           └────────┬────────┘
│                                                     │                              │    │
│                                                     └──────────────┬───────────────┘    │
│                                                                    ▼                    │
│                                                         ┌─────────────────────┐         │
│                                                         │ Security Gates &    │         │
│                                                         │ Immutable Evidence  │         │
│                                                         └─────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

PrettyK **арендует** generic-инфраструктуру (Git-фордж Gitea, CI-раннеры Woodpecker), но **единолично владеет**:
- Компиляцией графа зависимостей и планов (`PlanCompiler`);
- Машиной состояний и жизненным циклом запусков (`RunControlPlane`);
- Защитными средами и фаззинг-лучами (`CapabilityBroker`, Playwright, scanner, Fuzzer);
- Политикой допуска и стоп-гейтами (`SecurityGates`);
- Неизменяемым криптографическим реестром улик (`EvidenceChain Ledger`).

---

## 2. Технологический стек: Бескомпромиссный выбор

Мы не плодим зоопарк технологий. Выбор каждого слоя продиктован требованиями к скорости, безопасности, изоляции и возможностям поставки в закрытый контур (Airgap / Pure Box).

### Сводная матрица стека

| Слой / Подсистема | Выбранный стек | Почему именно он | Что отбросили и почему |
|---|---|---|---|
| **Backend Core & Control Plane** | **Python 3.12+ (FastAPI + Pydantic v2 + SQLAlchemy 2 Async)** | Родной язык для SecOps рантайма (Playwright, scanner API, Fuzzer, Discovery). Единое адресное пространство с движком. Строгие Pydantic-контракты. | **Ruby on Rails:** легаси, медленный, сложный в поддержке.<br>**Node.js:** плох для CPU-bound криптографии и SecOps-инструментария.<br>**Go:** избыточный бойлерплейт для динамических DSL-моделей. |
| **Durable Source of Truth** | **PostgreSQL 16 (JSONB + GIN + WAL archiving)** | Единственный источник истины. Транзакционная стейт-машина. JSONB для динамических DAG-артефактов и findings без потери строгой реляционности. | **SQLite:** только для локального Pure Box.<br>**MongoDB / NoSQL:** отсутствие ACID и строгих реляционных инвариантов для аудита. |
| **Transport, Leases & Telemetry** | **Valkey 8 (Streams + Consumer Groups + PubSub)** | Свободный форк (BSD) без лицензионных рисков Redis Ltd. Идеален для очередей задач (XREADGROUP, XACK, XAUTOCLAIM) и live SSE. | **Redis 7.4+:** лицензионный капкан (SSPL/RSALv2).<br>**RabbitMQ / Kafka:** оверинжиниринг и лишние JVM/Erlang брокеры на старте. |
| **Artifact & Evidence Storage** | **S3-совместимый контракт (MinIO / Ceph / Local File Engine)** | Неизменяемые бинарные артефакты (видео прогонов, PCAP-дампы, сырые логи, скриншоты, HAR). База данных не раздувается бинарниками. | **Хранение BLOB в PostgreSQL:** деградация производительности WAL и бэкапов. |
| **Edge & Ingress** | **Caddy (Reverse Proxy + Automatic HTTPS)** | Один бинарник, конфиг в 10 строк, автоматический TLS, встроенный rate-limiting и reverse proxy без зоопарка nginx-модулей. | **Nginx:** сложный конфиг, ручные сертификаты.<br>**Traefik:** избыточен вне чистого Kubernetes. |
| **Frontend UI / Control Station** | **React 18 + TypeScript + Vite + TailwindCSS + Ant Design / MUI** | Быстрый рендер, богатая экосистема готовых виджетов (AntD/ProComponents для таблиц аудита, xyflow для DAG-графов, Monaco для DSL). | **Vue / Svelte:** разрыв с существующей базой компонентов PrettyK Studio.<br>**Next.js / SSR:** не нужен для интранет-инструмента и усложняет airgap. |
| **Graph & Code Surfaces** | **@xyflow/react (React Flow) + Monaco Editor** | Канонические интерактивные редакторы графов пайплайнов и кода PrettyK DSL с поддержкой sugar-автокомплита и диагностики. | Кастомный Canvas/SVG: слишком дорого писать и поддерживать с нуля. |
| **Security & Execution Runtime** | **Playwright + OWASP scanner Demon + PrettyK Fuzzer + Woodpecker** | Современный headless/CDP браузер, автоматический proxy-перехват, независимый генератор атак и легковесный CI-движок. | **Selenium:** легаси, медленный протокол HTTP JSON Wire.<br>**GitLab CI / Jenkins:** тяжеловесные монстры (оставлены только как опциональные внешние адаптеры). |
| **Auth & KMS Boundary** | **Better Auth (Drizzle / PG) + OpenBao (Vault Fork)** | Локальный суверенный auth-сервер без внешних зависимостей. Секреты хранятся в OpenBao (MPL-2.0 форк Vault). | **Keycloak:** тяжеловесный Java-комбайн.<br>**Blitz OIDC:** закрытая проприетарная специфика ЦБ. |

---

## 3. Архитектура модульного монолита (Modular Monolith)

PrettyK Cosmoport 2.0 строится как **модульный монолит** в рамках одного Python-пакета. Никаких микросервисов на старте: сервисные границы определяются модулями, интерфейсами и строгими Pydantic-контрактами.

### Структура слоёв ядра (`cosmo/`)

```text
orchestrator/
├── cosmo/
│   ├── domain/               # Чистые доменные сущности (Pydantic / Dataclasses)
│   │   ├── app_graph.py      # Домены, Системы, Приложения (Level 0–3)
│   │   ├── pipeline_brick.py # Кирпичи пайплайнов (Build, Scan, Deploy, Test)
│   │   ├── plan.py           # Скомпилированный DAG, CompiledHash, InputsHash
│   │   ├── run_state.py      # Состояния Run, Batch, Job (State Machine)
│   │   ├── gate_policy.py    # Пороговые правила допуска и ручные аппрувы
│   │   └── evidence.py       # Модель улик, контрольные суммы, provenance
│   │
│   ├── compiler/             # Детерминированный компилятор планов
│   │   ├── dag_compiler.py   # Топологическая сортировка, склейка кирпичей
│   │   ├── hash_calculator.py# Канонический JSON, SHA-256 хэширование
│   │   └── validator.py      # Fail-closed валидатор графа и версий компонентов
│   │
│   ├── control_plane/        # Машина состояний и диспетчер
│   │   ├── state_machine.py  # Транзакционные переходы состояний в PostgreSQL
│   │   ├── run_manager.py    # Жизненный цикл Run/Batch/Job
│   │   ├── lease_tracker.py  # Контроль зависаний воркеров и heartbeat
│   │   └── gate_evaluator.py # Оценка findings против политик допуска
│   │
│   ├── capability/           # Брокер защищённых сред (Capability Broker)
│   │   ├── broker.py         # Аллокатор портов, привязка к run_id
│   │   ├── scheduler.py      # Capability-aware диспетчеризация (scanner/PW/Fuzz)
│   │   └── health_monitor.py # Liveness, Readiness, Execution Readiness
│   │
│   ├── ledger/               # Неизменяемый журнал улик (Evidence Ledger)
│   │   ├── evidence_chain.py # Merkle/SHA-256 цепочка шагов и артефактов
│   │   ├── s3_storage.py     # Интеграция с MinIO / S3 BLOB storage
│   │   └── signer.py         # Подписание Актов соответствия (ГОСТ / SEC)
│   │
│   ├── adapters/             # Внешние субстраты (Pluggable Adapters)
│   │   ├── forge/            # Git-форджи
│   │   │   ├── base.py       # Интерфейс ForgeAdapter
│   │   │   ├── gitea.py      # Канонический адаптер Gitea REST API
│   │   │   └── gitlab.py     # Адаптер совместимости с GitLab
│   │   ├── execution/        # CI-раннеры
│   │   │   ├── base.py       # Интерфейс ExecutionAdapter
│   │   │   ├── woodpecker.py # Канонический адаптер Woodpecker (gRPC/YAML)
│   │   │   └── jenkins.py    # Легаси-адаптер Jenkins (опциональный)
│   │   └── security/         # Интеграция с рантаймами SecOps
│   │       ├── scanner_ctl.py    # Управление scanner Demon API
│   │       ├── pw_ctl.py     # Управление Playwright CDP
│   │       └── dojo_ctl.py   # Экспорт в DefectDojo / Allure
│   │
│   ├── api/                  # Внешний REST / SSE интерфейс (FastAPI)
│   │   ├── v1/
│   │   │   ├── domains.py    # Управление доменами и графом приложений
│   │   │   ├── pipelines.py  # CRUD и компиляция пайплайнов
│   │   │   ├── runs.py       # Запуск, отмена, ретрай, статус прогонов
│   │   │   ├── gates.py      # Ручной аппрув гейтов оператором ИБ
│   │   │   └── events.py     # SSE-стриминг живых логов и прогресса
│   │   └── deps.py           # Auth, RBAC scope и DB session dependencies
│   │
│   └── db/                   # Слой персистентности (SQLAlchemy 2 + Alembic)
│       ├── models/           # Реляционные таблицы PostgreSQL
│       ├── session.py        # Async Engine & Connection Pool
│       └── migrations/       # Миграции схемы данных
```

---

## 4. Канонический жизненный цикл запуска: The Steel Thread

Сквозная цепочка выполнения одного прогона от клика до подписанного акта безопасности:

```text
[ Разработчик / ИБ / Webhook ]
              │
              ▼ 1. POST /api/v1/runs { pipeline_id, target_env, inputs }
    ┌───────────────────┐
    │  FastAPI Ingress  │ ──> Проверка RBAC & Scope (Better Auth + OpenBao)
    └─────────┬─────────┘
              │
              ▼ 2. Compile & Freeze
    ┌───────────────────┐
    │   PlanCompiler    │ ──> Проверка графа, pin-версий -> compiled_hash + inputs_hash
    └─────────┬─────────┘
              │
              ▼ 3. Persist State
    ┌───────────────────┐
    │   PostgreSQL 16   │ ──> Создание записи Run (state = 'pending'), генерация Batch DAG
    └─────────┬─────────┘
              │
              ▼ 4. Queue Dispatch
    ┌───────────────────┐
    │  Valkey 8 Streams │ ──> XADD cosmo:runs:ready { run_id, capabilities }
    └─────────┬─────────┘
              │
              ▼ 5. Capability-Aware Worker Lease
    ┌───────────────────┐
    │  Python Worker    │ ──> XREADGROUP + Lock Lease -> state = 'running'
    └─────────┬─────────┘
              │
              ├─> Batch 1: Build & Package (Woodpecker ExecutionAdapter)
              ├─> Batch 2: Static Analysis (SAST / Dependency Check)
              ├─> Batch 3: Deploy Stage (Ephemeral Lab Host)
              │
              ▼ 6. SecOps Live Attack Beam (Capability Broker)
    ┌───────────────────┐
    │  SecOps Runtime   │ ──> Playwright CDP + scanner Demon (:8080) + Fuzzer (:8767)
    └─────────┬─────────┘
              │
              ▼ 7. Telemetry & Evidence Streaming
    ┌───────────────────┐
    │  Valkey Pub/Sub   │ ──> SSE Stream -> React Studio / Monitor UI
    │  MinIO / S3       │ ──> BLOB Upload (Screenshots, Har, Video, Raw Logs)
    └─────────┬─────────┘
              │
              ▼ 8. Security Gate Evaluation
    ┌───────────────────┐
    │   SecurityGates   │ ──> Critical/High Findings? 
    └─────────┬─────────┘           │
              ├─────────────────────┴─────────────────────┐
              ▼ (Clean / Minor)                           ▼ (Critical Found)
     [ Gate PASSED ]                             [ Gate BLOCKED ]
              │                                           │
              ▼ 9. Merkle Seal                            ▼ (Wait for IB Sign-off)
    ┌───────────────────┐                        ┌──────────────────┐
    │  Evidence Ledger  │                        │  Manual Override │
    │ (Signed SHA-256)  │                        │  (with Audit Log)│
    └───────────────────┘                        └──────────────────┘
```

---

## 5. Модель данных: как 80+ таблиц Cosmoport 1.0 превращаются в 8 чистых сущностей

Вместо каскадов Rails-моделей старого портала, PrettyK использует строгую нормализованную реляционную схему в PostgreSQL с JSONB-контейнерами для полиморфных данных:

```
┌─────────────────────────────────┐          ┌─────────────────────────────────┐
│          cosmo_domains          │          │        cosmo_applications       │
├─────────────────────────────────┤          ├─────────────────────────────────┤
│ id (UUID, PK)                   │ 1      N │ id (UUID, PK)                   │
│ slug (VARCHAR, Unique)          │─────────<│ domain_id (UUID, FK)            │
│ name (VARCHAR)                  │          │ name (VARCHAR)                  │
│ git_org (VARCHAR)               │          │ level (INT: 0=Lib, 1=App, 2=Grp)│
│ rbac_policy (JSONB)             │          │ repo_binding (JSONB)            │
└─────────────────────────────────┘          └────────────────┬────────────────┘
                                                              │ 1
                                                              │
                                                              │ N
┌─────────────────────────────────┐          ┌────────────────┴────────────────┐
│           cosmo_runs            │          │        cosmo_pipelines          │
├─────────────────────────────────┤          ├─────────────────────────────────┤
│ id (UUID, PK)                   │ N      1 │ id (UUID, PK)                   │
│ correlation_id (VARCHAR)        │─────────<│ app_id (UUID, FK)               │
│ pipeline_id (UUID, FK)          │          │ name (VARCHAR)                  │
│ state (ENUM: pending..succeeded)│          │ ir_version (VARCHAR)            │
│ compiled_plan (JSONB)           │          │ graph_definition (JSONB)        │
│ inputs_hash (VARCHAR)           │          │ quality_gate_id (VARCHAR)       │
│ lease_worker_id (VARCHAR)       │          │ retry_policy (JSONB)            │
│ lease_expires_at (TIMESTAMPTZ)  │          └─────────────────────────────────┘
└────────────────┬────────────────┘
                 │ 1
                 ├──────────────────────────────┬──────────────────────────────┐
                 │ N                            │ N                            │ N
┌────────────────┴────────────────┐ ┌───────────┴────────────┐ ┌──────────────┴──────────────┐
│          cosmo_batches          │ │      cosmo_findings    │ │     cosmo_evidence_ledger    │
├─────────────────────────────────┤ ├────────────────────────┤ ├──────────────────────────────┤
│ id (UUID, PK)                   │ │ id (UUID, PK)          │ │ id (UUID, PK)                │
│ run_id (UUID, FK)               │ │ run_id (UUID, FK)      │ │ run_id (UUID, FK)            │
│ batch_index (INT)               │ │ batch_id (UUID, FK)    │ │ step_id (VARCHAR)            │
│ name (VARCHAR)                  │ │ dedup_key (VARCHAR)    │ │ artifact_type (VARCHAR)      │
│ state (ENUM)                    │ │ severity (ENUM)        │ │ s3_path (VARCHAR)            │
│ inputs_hash (VARCHAR)           │ │ title (VARCHAR)        │ │ sha256_checksum (VARCHAR)    │
│ output_artifacts (JSONB)        │ │ details (JSONB)        │ │ provenance_meta (JSONB)      │
└─────────────────────────────────┘ └────────────────────────┘ └──────────────────────────────┘
```

### Преимущества такой модели:
1. **Воспроизводимость на 100%:** Поле `compiled_plan` в таблице `cosmo_runs` хранит полный замороженный снимок плана на момент запуска. Даже если пайплайн изменили через секунду, история неизменна.
2. **Идемпотентность и кэширование:** Поле `inputs_hash` в `cosmo_batches` позволяет пропускать сборку тяжелых артефактов, если хэш исходников и окружения не изменился.
3. **Строгая граница улик:** Любая запись в `cosmo_evidence_ledger` сопровождается `sha256_checksum`. Подделка лога или скриншота задним числом невозможна.

---

## 6. Профили поставки: Pure Box vs Enterprise

Платформа обязана работать в двух режимах без изменения бизнес-кода:

```
                      ┌─────────────────────────────────┐
                      │     PrettyK Cosmoport Core      │
                      │  (FastAPI / Pydantic / Engine)  │
                      └────────────────┬────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌───────────────────────────────┐             ┌───────────────────────────────────────┐
│     Profile 1: PURE BOX       │             │        Profile 2: ENTERPRISE          │
│   (Single-node / Airgap)      │             │      (Multi-tenant Bank Infra)        │
├───────────────────────────────┤             ├───────────────────────────────────────┤
│ • 1 Docker Compose стек       │             │ • PostgreSQL 16 Cluster (HA / Patroni)│
│ • Встроенный Gitea & Woodpecker│             │ • Valkey 8 Cluster (Streams)          │
│ • Локальный MinIO S3          │             │ • Внешние Gitea/GitLab + Woodpecker   │
│ • Локальный scanner & Playwright  │             │ • Distributed Worker Pools            │
│ • Аутентификация: Local Admin │             │ • MinIO / Ceph S3 Cluster             │
│ • Нулевой выход в интернет    │             │ • Better Auth + OpenBao KMS + 2FA     │
└───────────────────────────────┘             └───────────────────────────────────────┘
```

---

## 7. Санитарный фильтр: Чего мы НЕ делаем (Anti-Scope)

1. ❌ **Не пишем свой Git-сервер или CI-раннер.** Используем готовые Gitea и Woodpecker через адаптеры.
2. ❌ **Не тащим тяжелые брокеры (RabbitMQ / Kafka / Celery).** Valkey Streams полностью закрывает потребности очередей, воркер-лизов и телеметрии.
3. ❌ **Не клонируем закрытые банковские протоколы (СОД, Blitz OIDC).** Заменяем их чистыми стандартами (Gitea API, стандартный OIDC/OAuth2).
4. ❌ **Не делаем микросервисы.** Модульный монолит на Python обеспечивает наивысшую скорость разработки и простоту отладки.
5. ❌ **Не отдаем критический контроль AI.** QWEN используется как ассистент генерации планов с обязательным предпросмотром человеком (Human-in-the-loop), но не как бесконтрольный исполнитель.

---

## 8. Итог и план перехода к реализации

| Этап | Задача | Исполнитель | Deliverable |
|---|---|---|---|
| **P0 Core** | PostgreSQL DDL + Pydantic модели + PlanCompiler | **Boss** | Схемы БД, компилятор планов, расчет хэшей, unit-тесты |
| **P0 Adapters** | Gitea ForgeAdapter + Woodpecker ExecutionAdapter | **Flash / Boss** | Клиенты интеграции с Git и CI, смоук-тесты |
| **P0 Engine** | Capability Broker + State Machine + Evidence Ledger | **Boss / Luna** | Диспетчер воркеров, переходы состояний, сбор улик |
| **P0 UI/API** | REST API + SSE + React Pipeline DAG & Run Control | **Flash** | Полнофункциональный интерфейс запуска и мониторинга |

*Документ зафиксирован в базе знаний Обители. Путь открыт.*
