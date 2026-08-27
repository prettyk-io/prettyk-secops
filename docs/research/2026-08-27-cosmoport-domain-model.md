# Cosmoport Domain Model — App Graph, Pipeline Compiler & Batch DAG

> **Статус:** `research / discovery` — не канон, не backlog  
> **Дата:** 27 августа 2026  
> **Профиль:** `cosmo-custom` (пак поверх коробки `prettyk-pure`)  
> **Связанное:** [`../cosmo-strategy.md`](../cosmo-strategy.md) · [`cosmoport-ib-poc.md`](cosmoport-ib-poc.md) · [`sanctuary/pure/auth-roles.md`](../sanctuary/pure/auth-roles.md)  
> **Предшествующее исследование:** Gitea/Forgejo vs Woodpecker vs Jenkins vs PrettyK-native (archived — forge/CI boundary decision)

---

## 0. Мотивация

У банка в портале Cosmoport несколько команд («КИТС» в терминах регламента ЦБ):

- Команда Цифрового Рубля
- Команда Розничных Платежей
- Команда Корпоративного Кредитования
- …и другие

У каждой команды — **свой Git-домен** (отдельный Gitea), **своя иерархия приложений**, **своя RBAC-матрица** и **свой набор pipeline-кирпичей** (часть общая из коробки, часть переопределена под домен).

PrettyK — **один на всех**, и он оркестрирует поверх доменов.

Эта модель формализует сущности, из которых строится Граф приложений, и процесс компиляции графа в DAG батчей.

---

## 1. Сущности

### 1.1. Domain (КИТС) — Level −1

```text
Domain = {
  id:          "digital-ruble" | "retail-payments" | "corp-lending" | ...
  label:       "Цифровой рубль" | "Розничные платежи" | ...
  forge:       ForgeBinding        // Gitea instance
  rbac:        DomainRBAC          // роли и команды домена
  bricks:      BrickOverride[]     // переопределения кирпичей (поверх общего каталога)
  quota:       DomainQuota         // лимиты на run/batch/storage/CPU
}
```

**Свойства Domain'а:**

- Domain — **boundary изоляции**: репозитории одного домена не видны другому домену.
- У каждого Domain'а — **свой Gitea instance** (multi-Gitea — архитектурное требование, не опция).
- RBAC внутри домена независим: `admin_sec` домена «Цифровой рубль» ≠ `admin_sec` домена «Розничные платежи».
- Pipeline Bricks наследуются из общего каталога коробки (`prettyk-pure`) и могут быть переопределены на уровне домена (`cosmo-custom`).

### 1.2. Уровни иерархии (Level 0–3)

```text
Domain (Level −1)
  │
  ├── Level 0: Libraries / Configs / Shared Pipeline Bricks
  │     ├── lib-common-utils       (git repo)
  │     ├── lib-security-headers   (git repo)
  │     └── brick-sast-template    (pipeline brick definition)
  │
  ├── Level 1: Apps / Services     (1 app = 1 git repo)
  │     ├── payment-hub            (git repo)
  │     ├── account-service        (git repo)
  │     └── notification-worker    (git repo)
  │
  ├── Level 2: Groups
  │     ├── group: payments        (содержит payment-hub, account-service)
  │     └── group: notifications   (содержит notification-worker)
  │
  └── Level 3: Groups of Groups
        └── group-of-groups: retail-suite
              ├── group: payments
              └── group: notifications
```

**Правила иерархии:**

- **Level 0** — не деплоится самостоятельно. Поставляет библиотеки, конфиги и определения Pipeline Bricks.
- **Level 1** — атомарная единица: 1 app = 1 git repository. Имеет свой жизненный цикл (build → scan → deploy → test).
- **Level 2** — логическая группировка. Bricks и политики могут быть назначены на группу и унаследованы всеми apps внутри.
- **Level 3** — группа групп. Обычно соответствует бизнес-домену или контуру (например, «все сервисы розничных платежей»).
- Наследование: политика, назначенная на Level 3, действует на все Level 2 → Level 1 внутри. Переопределение на нижнем уровне — разрешено.

### 1.3. Application

```text
Application = {
  id:             "payment-hub"
  domain_id:      "digital-ruble"
  level:          1
  group_id:       "payments"           // Level 2 parent
  repo_binding:   RepositoryBinding    // связь с Gitea repo
  pipeline_plan:  PipelinePlan | null  // скомпилированный план (кэш)
}
```

### 1.4. RepositoryBinding

```text
RepositoryBinding = {
  forge_id:       "gitea-digital-ruble"  // какой Gitea instance
  repo_path:      "digital-ruble/payment-hub"
  default_branch: "main"
  webhook_id:     "wh_xxx"              // webhook в Gitea
}
```

### 1.5. Pipeline Brick

```text
PipelineBrick = {
  id:             "brick-sast-sonarqube"
  name:           "SAST — SonarQube"
  type:           "sast" | "sca" | "build" | "deploy" | "dast" | "autotest" | "gate"
  source:         "core" | "domain:{domain_id}"   // откуда взят кирпич
  definition: {
    executor:     "sonarqube-scanner"   // capability
    image:        "sonarsource/sonar-scanner-cli:latest"
    timeout_s:    600
    inputs:       { project_key: string, sources: string }
    outputs:      { sarif_report: artifact_ref }
  }
  gates:          GateRef[]             // встроенные гейты (если type="gate" — сам является гейтом)
  depends_on:     BrickRef[]            // зависимости от других кирпичей
}
```

**Каталог кирпичей:**

```
prettyk-pure (коробка — общий каталог)
  ├── brick-build-docker
  ├── brick-sast-sonarqube
  ├── brick-sca-trivy
  ├── brick-sca-code-scoring
  ├── brick-sast-kcs
  ├── brick-deploy-stage
  ├── brick-deploy-prod
  ├── brick-dast-zap
  ├── brick-autotest-playwright
  └── brick-gate-severity-threshold

cosmo-custom (пак — переопределения под конкретный банк)
  ├── domain:digital-ruble/
  │     ├── brick-deploy-stage     (переопределение: специфичный раннер)
  │     └── brick-gate-cbr-policy  (новый: политика ЦБ)
  └── domain:retail-payments/
        └── brick-dast-zap         (переопределение: кастомный контекст)
```

**Правила разрешения кирпичей:**
1. Сначала ищем в `domain:{domain_id}`.
2. Если нет — берём из `core` (коробка).
3. Кирпич может `depends_on` другие кирпичи — это формирует DAG.

### 1.6. Pipeline Plan

```text
PipelinePlan = {
  id:              "plan-payment-hub-v2.1.0"
  application_id:  "payment-hub"
  level:           "app" | "group" | "group-of-groups"
  scope_id:        "payment-hub" | "payments" | "retail-suite"
  bricks:          BrickRef[]          // выбранные кирпичи
  batches:         Batch[]             // скомпилированные батчи (DAG)
  compiled_at:     timestamp
  compiled_hash:   string             // хеш для детекта изменений
}
```

**Как компилируется план:**

```text
1. PrettyK Plan Compiler берёт Application (или Group / Group of Groups).
2. Определяет набор Pipeline Bricks:
   - из политики домена;
   - из политики группы (Level 2/3);
   - из конфига приложения (Level 1);
   - из триггера запуска (плановая / pre-release / emergency / manual).
3. Разрешает depends_on — строит DAG.
4. Группирует кирпичи в Batches по типу:
   - все build-кирпичи → Build Batch
   - все sast/sca → Static Scan Batch
   - все deploy → Deploy Batch
   - все dast/autotest → Dynamic Test Batch
5. Между Batches вставляет Security Gates.
6. Возвращает скомпилированный PipelinePlan.
```

### 1.7. Batch

```text
Batch = {
  id:              "batch-001"
  type:            "build" | "static_scan" | "deploy" | "dynamic_test"
  bricks:          BrickRef[]          // кирпичи внутри батча
  status:          "pending" | "running" | "passed" | "failed" | "blocked"
  artifacts:       ArtifactRef[]       // выходные артефакты
  evidence:        EvidenceRef[]       // ссылки на evidence
  started_at:      timestamp | null
  finished_at:     timestamp | null
}
```

**Почему Batch ≠ Job:**

- Batch — это логическая единица PrettyK: «все SAST-сканеры для этого приложения».
- Job — это единица исполнения (Woodpecker workflow / Jenkins stage / Gitea Action job).
- Один Batch может породить несколько Jobs (SonarQube + Trivy + KCS — три jobs в одном Static Scan Batch).
- PrettyK оперирует Batches. Execution engine оперирует Jobs. Не даём engine диктовать семантику.

**Идемпотентность Batches:**

- Один и тот же Batch с теми же inputs (git ref, конфиг, версии образов) должен давать тот же артефакт.
- PrettyK хранит `compiled_hash` плана и хеши inputs каждого Batch'а.
- При повторном запуске: если хеш совпал → можно переиспользовать артефакт (опционально).
- Без этого evidence chain рассыпается: нельзя доказать, что findings относятся именно к этой версии кода.

### 1.8. Security Gate

```text
Gate = {
  id:               "gate-static-severity"
  type:             "automatic" | "manual"
  position:         "post-build" | "post-scan" | "post-deploy" | "pre-prod"
  policy: {
    rules: [
      { finding_type: "critical", action: "block" },
      { finding_type: "high",     action: "warn",  max_count: 5 },
      { finding_type: "medium",   action: "pass" }
    ]
  }
  decision:         "pass" | "block" | "manual_required" | null
  decided_by:       user_id | "system" | null
  decided_at:       timestamp | null
  evidence:         EvidenceRef[]
  signature:        string | null        // подпись решения (для ГОСТ-Акта)
}
```

**Gate как явная сущность (не «if в скрипте»):**

- Gate — это не условие в YAML. Это запись в durable storage.
- Gate имеет: входные findings, политику, решение, автора решения, таймстемп и подпись.
- Gate — это доказательная база для ГОСТ-Акта и аудита.
- Gate может быть `automatic` (политика решает) или `manual` (человек принимает решение).
- Если Gate блокирует → весь Pipeline Plan останавливается. Дальнейшие Batches не запускаются.

**Цепочка гейтов в типовом прогоне:**

```text
Build Batch
  │
  ▼
Gate: Build Integrity       ← автоматический: все артефакты собрались? хеши совпали?
  │
  ▼
Static Scan Batch           ← SonarQube + Trivy + KCS + CodeScoring
  │
  ▼
Gate: Static Severity       ← автоматический/ручной: критикалы блокируют, high — warn
  │
  ▼
Deploy Batch (stage/test)
  │
  ▼
Gate: Deploy Readiness      ← автоматический: URLs живы? health checks зелёные?
  │
  ▼
Dynamic Test Batch          ← DAST (ZAP) + Autotests (Playwright) + Fuzzer
  │
  ▼
Gate: Dynamic Severity      ← автоматический/ручной: findings DAST + autotests
  │
  ▼
Admission Gate              ← ручной: Администратор ИБ утверждает допуск
  │
  ▼
Готово: Evidence → Findings → ГОСТ-Акт
```

### 1.9. Run

```text
Run = {
  id:              "run-20260827-001"
  plan_id:         "plan-payment-hub-v2.1.0"
  trigger:         "scheduled" | "pre_release" | "emergency" | "manual"
  initiator: {
    user_id:       "petrov@cbr.ru"
    role:          "sec_expert"
  }
  domain_id:       "digital-ruble"
  status:          "pending" | "running" | "passed" | "failed" | "blocked"
  batches:         Batch[]
  gates:           Gate[]
  findings:        Finding[]
  evidence_ledger: EvidenceLedgerRef
  started_at:      timestamp
  finished_at:     timestamp | null
}
```

**Связь с существующей моделью Cosmoport PoC:**

```text
Администратор ИБ (admin_sec):
  → открывает лесенку Cosmoport
  → выбирает: Domain = «Цифровой рубль»
  → выбирает: Application = «Платёжный хаб», Build = v2.1.0, Deploy = stage
  → назначает исполнителя: Эксперт ИБ Петров
  → PrettyK Plan Compiler строит PipelinePlan
  → Run создан, Batches скомпилированы
```

### 1.10. RBAC внутри Domain'а

```text
DomainRBAC = {
  domain_id:      "digital-ruble"
  members: [
    { user_id: "ivanov",  role: "admin_sec",       teams: ["payments", "notifications"] },
    { user_id: "petrov",  role: "sec_expert",       teams: ["payments"] },
    { user_id: "sidorov", role: "admin_abnormal",   teams: ["*"] },
    { user_id: "smirnov", role: "user",             teams: ["payments"] }
  ]
}
```

**Связь с канонической 5-ролевой моделью (`sanctuary/pure/auth-roles.md`):**

| Роль (канон) | Внутри Domain'а |
|---|---|
| `admin_sec` | Администратор ИБ домена. Нарезает болванки, назначает исполнителей, утверждает Admission Gates. |
| `admin_abnormal` | НШР домена. Внештатные проверки (emergency). |
| `admin_service` | Инфраструктурный админ домена. Следит за Gitea, раннерами, здоровьем. |
| `sec_expert` | Эксперт ИБ домена. Исполняет проверки, ставит маркеры находок. |
| `user` | Наблюдатель домена. Видит свои приложения и отчёты. |

Роль назначается **на домен** + опциональный **scope команд** (teams). Один и тот же пользователь может иметь роль `sec_expert` в домене «Цифровой рубль» и `user` в домене «Розничные платежи».

---

## 2. Граф батчей (полный DAG)

```text
                          ┌──────────────────────────┐
                          │     PrettyK Plan          │
                          │       Compiler            │
                          └────────────┬─────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            ▼                          ▼                          ▼
    ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
    │  Build Batch  │         │  Build Batch   │         │  Build Batch  │
    │  (app-1)      │         │  (app-2)       │         │  (app-3)      │
    └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
            │                         │                         │
            └─────────────┬───────────┴───────────┬─────────────┘
                          │                       │
                          ▼                       │
                  ┌───────────────┐               │
                  │ Gate: Build   │               │
                  │ Integrity     │◄──────────────┘
                  └───────┬───────┘      (ждёт все Build Batches)
                          │
                          ▼
                  ┌───────────────┐
                  │ Static Scan   │
                  │ Batch         │  ← SonarQube + Trivy + KCS + CodeScoring
                  │ (all apps)    │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Gate: Static  │
                  │ Severity      │  ← automatic/manual
                  └───────┬───────┘
                          │
            ┌─────────────┼─────────────┐
            │                           │
            ▼                           ▼
    ┌───────────────┐          ┌───────────────┐
    │ Deploy Batch  │          │ Deploy Batch  │
    │ (stage)       │          │ (test)        │
    └───────┬───────┘          └───────┬───────┘
            │                          │
            └─────────────┬────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Gate: Deploy  │
                  │ Readiness     │  ← health checks, URLs alive
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Dynamic Test  │
                  │ Batch         │  ← DAST (ZAP) + Autotests (Playwright) + Fuzzer
                  │ (all deploys) │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Gate: Dynamic │
                  │ Severity      │  ← automatic/manual
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Admission     │
                  │ Gate          │  ← manual: admin_sec утверждает
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Evidence      │
                  │ Ledger        │  ← immutable evidence + findings
                  │ + ГОСТ-Акт    │
                  └───────────────┘
```

---

## 3. Адаптеры — внешние контракты

### 3.1. ForgeAdapter

```text
interface ForgeAdapter {
  // Регистрация домена
  registerDomain(domain: DomainConfig): ForgeBinding

  // Webhooks
  onPush(domain_id, repo_path, ref): void
  onPR(domain_id, repo_path, pr_id, action): void

  // Статусы
  setCommitStatus(domain_id, repo_path, commit_sha, status: CommitStatus): void

  // Репозитории
  getRepoInfo(domain_id, repo_path): RepoInfo
  listRepos(domain_id, group_path?): Repo[]

  // Аутентификация (delegate)
  resolveUser(domain_id, token): UserInfo
}
```

**META (канонический default): Gitea.**

- Gitea — self-hosted, production-ready, используется в gitea.com/gitea.
- Поддерживает webhooks, commit statuses, API для репозиториев.
- Multi-instance: каждый Domain → свой Gitea instance → свой ForgeBinding.

**Option: Jenkins (как forge — если Jenkins уже есть в стеке заказчика).**

- Поддерживается как второй adapter.
- «Мало ебли»: не лезем в plugin-зоопарк, не пытаемся сделать из него security authority.
- Просто: получил webhook → отдал статус → получил репо-инфо.

**Option: GitLab, Forgejo, etc.** — любые другие forge через тот же интерфейс.

### 3.2. ExecutionAdapter

```text
interface ExecutionAdapter {
  // Запуск
  submitJob(job: JobSpec): JobHandle

  // Статус и логи
  getJobStatus(job_handle): JobStatus
  streamLogs(job_handle): Stream<LogLine>

  // Управление
  cancelJob(job_handle): void

  // Capabilities
  listCapabilities(): Capability[]
}
```

**META (канонический default): Woodpecker.**

- Лёгкий, server + agents, Docker/Kubernetes/local backends.
- DAG через `depends_on`, labels для capability selection.
- One-shot ephemeral agents.
- PostgreSQL для серьёзных установок.
- Forge — внешний (через webhook/auth/status) — совпадает с нашей моделью.

**Option: Jenkins.**

- Для заказчиков, у которых Jenkins уже в стеке.
- Поддерживается как второй adapter — тот же контракт.
- Не лезем в plugin-зоопарк, не используем Jenkins как security authority.

**Option: Gitea Actions, GitLab CI, etc.** — любые другие CI-движки через тот же интерфейс.

### 3.3. SecurityCapabilityBroker

```text
interface SecurityCapabilityBroker {
  // Запуск security-specific раннеров
  startZAPDemon(run_id: string): ZAPSession
  startPlaywrightCDP(run_id: string): CDPSession
  startFuzzer(run_id: string, dictionaries: DictRef[]): FuzzerSession

  // Изоляция
  isolate(run_id: string, policy: IsolationPolicy): Sandbox

  // Остановка и очистка
  teardown(run_id: string): void
}
```

Security-раннеры (ZAP, Playwright CDP, Fuzzer) не запускаются через generic ExecutionAdapter. Они требуют:

- Изоляции (сетевой, файловой).
- Привязки к `run_id` (для evidence chain).
- Контролируемого teardown (не оставлять висячих контейнеров/прокси).

---

## 4. Evidence Chain

```text
Run
  └── Batch
        └── Job (executed by Woodpecker / Jenkins)
              └── Step
                    └── Evidence
                          ├── timestamp
                          ├── type: "screenshot" | "raw_request" | "raw_response" | "log" | "alert" | "finding" | "decision"
                          ├── content_ref: artifact_store://...
                          ├── hash: sha256
                          └── provenance: {
                                run_id, batch_id, job_id, step_id,
                                capability: "zap-demon" | "playwright-cdp" | "fuzzer" | ...
                              }
```

**Свойства Evidence Chain:**

- Каждая запись иммутабельна.
- Хеш связывает evidence с конкретным шагом и батчем.
- Provenance позволяет восстановить полную цепочку: кто запустил, на каком раннере, с какими inputs.
- Evidence Chain — основа для Smooth Rewind (Studio Forensics).

---

## 5. Что уже есть vs что нужно построить

| Компонент | Статус | Для Domain Model нужно |
|---|---|---|
| Domain (КИТС) | **Нет** | Сущность первого класса в модели |
| Level 0–3 иерархия | **Нет** | Модель + API |
| Application + RepositoryBinding | Mock (2 приложения) | Расширить до production-модели |
| Pipeline Brick | **Нет** | Каталог кирпичей + BrickOverride |
| Pipeline Plan Compiler | **Нет** | Ядро всей системы |
| Batch DAG | **Нет** | Компиляция плана в батчи |
| Security Gate | **Нет** (сейчас — логика в коде) | Сущность + durable storage |
| ForgeAdapter (multi-instance) | **Нет** | Интерфейс + Gitea implementation |
| ExecutionAdapter | **Нет** | Интерфейс + Woodpecker implementation |
| SecurityCapabilityBroker | Частично (ZAP/Playwright/Fuzzer есть) | Формализовать контракт |
| Evidence Chain | Частично (Monitor пишет) | Иммутабельный ledger |
| Domain RBAC | Частично (FE-only, 5 ролей) | Бэкенд + scope команд |
| Run Control Plane | **Нет** | Durable Run/Batch/Gate state machine |
| ГОСТ-Акт автогенерация | Локально (HTML-примеры) | Автоматическая сборка из findings + evidence |

---

## 6. Что НЕ делаем

- **Не** пишем свой Git-сервер (Gitea закрывает).
- **Не** пишем свой универсальный CI-движок (Woodpecker / Jenkins закрывают).
- **Не** делаем Batch = Job (разные уровни абстракции).
- **Не** храним security-решения в YAML (Gates — durable storage).
- **Не** плодим зоопарк форджей без причины (Gitea META, остальные — опции).
- **Не** брендируем PrettyK под ЦБ (коробка остаётся коробкой, пак — паком).
- **Не** коммитим CBR-пакет в git.

---

## 7. Следующие шаги

1. **Domain Model → Run Control Plane спецификация** (Трек 2).
2. **Run Control Plane → нарезка на Boss и Flash** (Трек 3).
3. **Реализация:** Boss — ядро (PostgreSQL schema, Plan Compiler, Gate state machine), Flash — адаптеры (ForgeAdapter/Gitea, ExecutionAdapter/Woodpecker, API).