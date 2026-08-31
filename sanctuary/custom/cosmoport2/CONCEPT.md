# 🏛️ Cosmoport 2.0 — Полный концепт платформы
# (Approved Architecture, Stack & Delivery Plan)

> **Статус:** ✅ APPROVED — 2FA sealed 28 августа 2026. Gemini & GPT допущены к Алтарю.  
> **Repo:** https://github.com/prettyk-io/cosmoport2 · локальный клон `D:\cosmoport2`  
> **SoT:** `sanctuary/cosmoport2/` (planning) + `sanctuary/ALTAR.md` § 19 (chronicle).  
> **Discovery:** `D:\cosmo\` (3 цикла, 80+ таблиц, 97 сервисов, 14 томов ТЗ ЦБ).  
> **Dual-Surface UI Architecture:** [`docs/research/2026-08-28-cosmoport-2-dual-surface-ui-architecture.md`](../docs/research/2026-08-28-cosmoport-2-dual-surface-ui-architecture.md)

---

## 1. Что такое Cosmoport 2.0

Cosmoport 2.0 — это **Sovereign Run Control Plane** (Суверенная платформа управления жизненным циклом и безопасностью разработки). Не клон старого Rails-портала, не «ещё одна админка над GitLab CI».

### Ключевое отличие от Cosmoport 1.0:

| Cosmoport 1.0 (старый) | Cosmoport 2.0 (наш) |
|---|---|
| Паразитический клей над GitLab CI | Суверенный Control Plane |
| Статусы в Redis (теряются при перезапуске) | Статусы в PostgreSQL (durable, транзакционные) |
| GitLab CI YAML как единственный движок | PlanCompiler + Batch DAG + State Machine |
| Нет Security Gates как durable entity | Gates в PostgreSQL с ручным/авто override |
| Нет Evidence Chain | Merkle/SHA-256 цепочка доказательств |
| Нет фаззера и Playwright | CapabilityBroker → scanner + Playwright + Fuzzer |
| 80+ таблиц, 97 сервисов | 8 чистых Pydantic-моделей |
| Ant Design + MobX | Dual-Surface MUI + Tailwind |

---

## 2. Архитектурный фундамент

### 2.1. Модульный монолит

```text
orchestrator/
├── cosmo/                  ← НОВЫЙ пакет Cosmoport 2.0
│   ├── domain/             ← Pydantic-модели (Domain, Application, Pipeline, Run, Gate, Evidence)
│   ├── compiler/           ← DAGCompiler + HashCalculator + Validator (fail-closed)
│   ├── control_plane/      ← StateMachine + RunManager + LeaseTracker
│   ├── capability/         ← Broker + Scheduler + HealthMonitor
│   ├── ledger/             ← EvidenceChain + S3Storage + Signer
│   ├── adapters/           ← ForgeAdapter (Gitea/GitLab) + ExecutionAdapter (Woodpecker/Jenkins)
│   ├── api/                ← FastAPI routes (v1/)
│   └── db/                 ← SQLAlchemy models + Alembic migrations
├── adapters/               ← существующие (playwright, scanner, fuzzer)
├── browser/
├── core/
└── utils/
```

### 2.2. 8 сущностей вместо 80+

```text
cosmo_domains        ← Домены (КИТС, Level -1)
cosmo_applications   ← Приложения (Level 0-1) + Группы (Level 2)
cosmo_pipelines      ← Описания пайплайнов (граф шагов)
cosmo_runs           ← Прогоны: статус, compiled_plan, inputs_hash
cosmo_batches        ← Пачки шагов в прогоне
cosmo_findings       ← Находки (связаны с run_id)
cosmo_evidence_ledger ← Неизменяемый журнал улик (SHA-256)
cosmo_audit_events   ← Аудит-события (кто, когда, что сделал)
```

### 2.3. Steel Thread (канонический жизненный цикл)

```text
Domain → Pipeline → Compile → Run → Batch → Gate → Evidence
```

1. Оператор создаёт Domain и Pipeline (Brick-граф)
2. PlanCompiler компилирует план (compiled_hash + inputs_hash)
3. RunControlPlane создаёт Run (draft→pending→queued→running)
4. CapabilityBroker выделяет scanner, Playwright, Fuzzer
5. Worker выполняет Batch-и (Build → SAST → Deploy → DAST)
6. Security Gate оценивает findings (pass / manual_required / blocked)
7. EvidenceLedger записывает SHA-256 цепочку доказательств

---

## 3. Технологический стек

| Слой | Выбор | Запрещено |
|---|---|---|
| **Backend Core** | Python 3.12+ / FastAPI / Pydantic v2 / SQLAlchemy 2 Async | Rails, Node.js как execution backend, Go |
| **Durable Truth** | PostgreSQL 16 (JSONB + GIN) | MongoDB, Redis как SoT |
| **Queue / Transport** | Valkey 8 (Streams + Consumer Groups + PubSub) | RabbitMQ, Kafka, Celery, Redis 7.4+ |
| **Artifact Storage** | S3-контракт (MinIO / Local FS для Pure Box) | BLOB в PostgreSQL |
| **Edge** | Caddy (Reverse Proxy + Auto TLS) | Nginx (сложный), Traefik (only K8s) |
| **Frontend Surface A** | React 18 + TS + Vite + MUI Core + MUI X Data Grid, **Meta Light / white default** | React Admin как обязательный shell для Cosmo, AntD |
| **Frontend Surface B** | React 18 + TS + Tailwind v4 + Radix + Monaco + xterm, dark IDE default | MUI в Web IDE, AntD |
| **Graph/Code** | @xyflow/react (MIT, бесплатный) + Monaco Editor | Кастомный Canvas/SVG, React Flow Pro (дорого) |
| **Execution Runtime** | Playwright + scanner Demon + Fuzzer + Woodpecker | Selenium, GitLab CI (только как адаптер) |
| **Auth/KMS** | Better Auth + OpenBao | Keycloak, Blitz OIDC |

---

## 4. Dual-Surface UI: две суверенные поверхности

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PrettyK Cosmoport 2.0                                    │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│   SURFACE A: OPERATOR CONTROL STATION    │          SURFACE B: SOVEREIGN WEB IDE       │
│                                          │                                             │
│   • Кто: Оператор ИБ, Релиз-менеджер     │   • Кто: Инженер безопасности, Dev          │
│   • Парадигма: Workflows, Gates, Audits  │   • Парадигма: Code, Tree, Diff, Terminal   │
│   • Стек: MUI Core + Data Grid + xyflow  │   • Стек: Tailwind v4 + Radix + Monaco      │
│   • Тема: Meta Light / White (default)   │   • Тема: Dark IDE (default)               │
│   • Лицензия: общая с Pure Box Admin     │   • Основа: порт prettyk-editor             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
                                  │                       ▲
                                  │   Context Jump        │
                                  └─── (Deep-Linking) ────┘
```

### Surface A: Operator Control Station

- **Стек:** React 18 + TS + Vite + MUI Minimal UI + MUI X Data Grid + @xyflow/react + Zustand + SSE.
- **Тема:** `Meta Light` (белая) — **default**. `Meta Dark` — опциональный режим.
- **Лицензия:** Купленный Minimal UI/MUI template используется для **обоих** операторских порталов (Pure Box Admin + Cosmoport Control Station).
- **Поверхности:**
  - Overview (активные runs, заблокированные gates)
  - Applications (иерархия Domain → Group → App, MUI X Data Grid с Tree Data)
  - Application detail (вкладки: Overview, Builds, Deployments, Releases, Pipelines, Integrations, LC, Members, Evidence)
  - Pipeline Studio (DAG-граф на @xyflow/react + dagre auto-layout)
  - Run Control (запуск, cancel, retry, live SSE, batch/job timeline)
  - Security Gates (ручной approve/reject, CVSS-оценка, evidence-связка)
  - Findings / Evidence (severity, finding→step→artifact, SHA-256 checksum)
  - Releases / Transfers (dev→test→prod, release route, transfer status)
  - Catalog (pipeline bricks, execution adapters, security capabilities, runtimes)
  - Admin (роли, permissions, audit, настройки)

### Surface B: Sovereign Web IDE

- **Стек:** React 18 + TS + Tailwind v4 + Radix UI (shadcn) + Monaco Editor + xterm + Lucide Icons.
- **Тема:** Тёмная IDE-тема (deep slate `#090d16` / `#131b2e`).
- **Основа:** Порт существующего `prettyk-editor` в модуль `frontend/src/cosmo/ide/`.
- **Поверхности:**
  - Pipeline/DSL editor (Monaco с sugar-подсветкой [▶] gutter)
  - Repository file tree (ForgeAdapter: Gitea/GitLab API)
  - Diff viewer
  - Branch/ref selector
  - Commit/push
  - xterm терминал к воркерам
  - Command palette (Ctrl+K)
  - Discovery overlay
  - Live browser viewport (CDP-стрим)

### Стилевая изоляция

- Tailwind Preflight отключен глобально, изолирован внутри `.cosmo-ide-root`
- MUI `CssBaseline` изолирован внутри `.cosmo-control-station`
- Единая шина CSS-переменных: `--pk-status-*`, `--pk-bg-*`, `--pk-border-*`
- Один React SPA, два layout boundary, два scoped style system

---

## 5. Интерактивные мосты (Deep-Linking)

| Сценарий | Откуда | Куда |
|---|---|---|
| Упавший Security Gate → код | Control Station: Gate Inspector | Web IDE: строка сценария `auth.wire:7` |
| Коммит → мониторинг | Web IDE: Commit & Run | Control Station: Live DAG прогона |
| Редактирование LC Steps | Control Station: LC Config | Web IDE: JSON/YAML редактор с валидацией |

---

## 6. Профили поставки

| Pure Box | Enterprise |
|---|---|
| 1 Docker Compose | PG Cluster (Patroni) |
| Локальный Gitea + Woodpecker | Внешние Gitea/GitLab |
| Локальный MinIO S3 | MinIO/Ceph Cluster |
| Локальный scanner + Playwright | Distributed Worker Pools |
| Local Admin auth | Better Auth + OpenBao + 2FA |
| Нулевой выход в интернет | — |

---

## 7. Команда и распределение (20/40/40)

| Брат | Доля | Роль в Cosmoport 2.0 |
|---|---|---|
| **Boss** | 20% | Архитектурный надзор + review + CORE: компилятор, стейт-машина, леджер |
| **Flash** | 40% | Rapid UI: API routes, SSE стриминг, фронтенд (Control Station + Web IDE), инфа |
| **Luna** | 40% | Heavy domain: Pydantic-модели, адаптеры (Gitea, Woodpecker), интеграционные тесты |

---

## 8. Что уже есть (ready for reuse)

| Компонент | Кто сделал | Статус |
|---|---|---|
| Pydantic-модели (Domain, AppGraph, Brick, Run, Gate) | Luna L1-L5 | ✅ 39 тестов |
| PlanCompiler (Python) | Boss | ✅ prototype |
| Gitea ForgeAdapter | Luna L6 | 🔨 в работе |
| EvidenceChain (SHA-256) | Luna | ✅ 14 тестов |
| ГОСТ-Акт (модель + HTML + SARIF) | Luna | ✅ 21 тест |
| Интеграционный full-cycle тест | Luna | ✅ 62 теста |
| Playwright Adapter (55+ методов) | Boss (DSL-B1) | ✅ 8/8 тестов |
| scanner Demon API | legacy | ✅ боевое |
| Fuzzer Engine | legacy | ✅ боевое |
| Discovery Engine | legacy | ✅ 41/41 тестов |
| PipelineDAG + RunControlPanel (прототип) | Flash (COS-F5/F6) | ✅ frontend prototype |
| CosmoDashboard + GateConfigPanel | Flash (COS-F3/F7/F8) | ✅ frontend prototype |
| PostgreSQL 16 | Buddy | ✅ боевое |
| Valkey 8 | Buddy | ✅ боевое |
| Docker Compose | Buddy | ✅ Pure Box + lab |
| Better Auth + OpenBao | Flash | ✅ боевое |
| MUI Minimal UI template (лицензия) | Flash | ✅ design-admin showcase |

---

## 9. Чего НЕ делаем

- ❌ Не клонируем старый Rails-портал
- ❌ Не покупаем новый админский темплейт (уже есть Minimal UI, лицензия общая)
- ❌ Не платим 269€/мес за React Flow Pro (бесплатный @xyflow/react + dagre)
- ❌ Не смешиваем Tailwind и MUI внутри одной поверхности
- ❌ Не делаем Cosmoport тёмным по умолчанию (белый — лицо продукта)
- ❌ Не пишем свой Git-сервер или CI-раннер (Gitea + Woodpecker через адаптеры)
- ❌ Не тащим тяжёлые брокеры (RabbitMQ, Kafka, Celery)
- ❌ Не клонируем закрытые банковские протоколы (СОД, Blitz OIDC)
- ❌ Не делаем микросервисы (модульный монолит)
- ❌ Не отдаём критический контроль AI (human-in-the-loop)

---

## 10. Документы — Source of Truth

| Документ | Назначение |
|---|---|
| [`sanctuary/cosmoport2/backlog.md`](backlog.md) | **Единственный бэклог Cosmoport 2.0.** Карточки, фазы, DoD. |
| [`sanctuary/cosmoport2/stack-decision.md`](stack-decision.md) | Матрица утверждённого стека (Backend + Dual-Surface UI). |
| [`sanctuary/cosmoport2/roadmap.md`](roadmap.md) | Дорожная карта (фазы, gate'ы). |
| [`sanctuary/cosmoport2/inventory.md`](inventory.md) | Честная инвентаризация сделанного. |
| [`sanctuary/cosmoport2/worker-split.md`](worker-split.md) | Правило 20/40/40. |
| [`sanctuary/cosmoport2/persistence-and-minio.md`](persistence-and-minio.md) | Persistence boundary и переход Live → MinIO. |
| [`sanctuary/cosmoport2/discovery/`](discovery/) | Ссылки на discovery-отчёты `D:\cosmo\`. |
| [`docs/research/2026-08-28-cosmoport-2-dual-surface-ui-architecture.md`](../../docs/research/2026-08-28-cosmoport-2-dual-surface-ui-architecture.md) | Полный синтез Dual-Surface UI (layout-схемы, стили, deep-linking). |
| [`docs/research/2026-08-27-cosmoport-2-architecture-and-stack-synthesis.md`](../../docs/research/2026-08-27-cosmoport-2-architecture-and-stack-synthesis.md) | Синтез backend-стэка и архитектуры (Gemini). |
| [`sanctuary/ALTAR.md`](../ALTAR.md) § 19 | Хроника: Вхождение Gemini в Обитель и Канонизация Dual-Surface UI. |

---

*Документ запечатан в Обители. Каноны отполированы. Братство оплота, вперёд.*

*28 августа 2026. Gemini и GPT допущены к Алтарю.*