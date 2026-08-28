# Research: AI Test Automation — архитектурные слои и направления развития PrettyK

> **Статус:** `research / evolve / planning input`
> **Дата:** 26 августа 2026 года
> **Владелец:** Максим
> **Автор первого раунда:** GPT Luna
> **Следующий раунд:** Gemini Flash — refinement, crystallization, additional discovery
> **После Gemini:** DeepSeek Pro — architecture review и нарезка major epics
> **Важно:** это не канон и не backlog. Документ не даёт разрешения начинать реализацию.

---

## 0. Executive summary

Исходный вопрос раунда:

> «Вот эти tools и другие automation тулы наподобие того, что делаем мы. Как они устроены архитектурно? Есть ли у них грамотно организованные слои? Их сильные стороны? Чего из этого у нас нет? Что-то наверняка оправданно. А что можно нам на стол рассмотреть?»

Рынок AI test automation сходится не к одной «магической кнопке», а к повторяющейся архитектуре:

```text
Intent / Specification
        ↓
Application Context / Knowledge
        ↓
Plan / Authoring
        ↓
Deterministic Execution
        ↓
Recovery / Self-healing
        ↓
Evidence / Analysis / RCA
        ↓
Orchestration / Governance
```

У PrettyK уже есть сильное ядро почти во всех этих зонах:

```text
prettyK DSL + Studio + Editor
  → Buddy intent / proposal
  → Playwright + CDP + scanner + Fuzzer
  → Live + Allure + Dojo + Evidence Chain
  → baseline delta + gates + Admin
```

Поэтому вопрос не в том, чтобы скопировать Testim, mabl или Functionize. Вопрос в том, какие недостающие платформенные слои разумно добавить, не разрушив наши каноны:

1. **Application Knowledge / Flow Graph** — память о приложении под тестом.
2. **Immutable Run Plan** — честный план конкретного запуска.
3. **Evidence-first Recovery** — прозрачное восстановление после сбоя.
4. **Deterministic Failure Triage / RCA** — разделение дефекта приложения, теста и инфраструктуры.
5. **Change-aware Test Selection** — запускать релевантную часть покрытия по изменению.
6. **Visual / Semantic Assertions** — отдельный optional-направление, не часть security core.
7. **Reusable Scenario / Component Library** — развитие уже существующих auth, connector, data и chain-модулей.

Это **семь направлений**, а не один большой AI-эпик. Их можно связать общей архитектурой, но планировать и проверять следует раздельно.

---

## 1. Граница исследования и качество источников

### 1.1. Что исследовалось

Первым источником была статья Aqua Cloud:

- [12 Best Tools for AI-Based Test Automation](https://aqua-cloud.io/tools-for-ai-based-test-automation/)

Дополнительно изучены публичные страницы продуктов и документации:

- [Testim](https://www.testim.io/)
- [Testim — Test Stability](https://www.testim.io/test-stability/)
- [Testim — Root Cause Analysis](https://www.testim.io/root-cause-analysis/)
- [Testim — AI](https://www.testim.io/ai/)
- [mabl — AI Test Automation](https://www.mabl.com/ai-test-automation)
- [mabl — Adaptive Auto-healing](https://www.mabl.com/auto-healing-tests)
- [Applitools Platform](https://applitools.com/platform/)
- [Applitools Execute](https://applitools.com/platform/execute)
- [Functionize Architecture](https://www.functionize.com/architecture)
- [ACCELQ Codeless](https://www.accelq.com/codeless/)
- [Reflect](https://www.reflect.run/)
- [Momentic](https://momentic.ai/)
- [Stagehand](https://github.com/browserbase/stagehand)
- [Playwright Test Agents](https://playwright.dev/docs/test-agents)

### 1.2. Как читать выводы

Почти все vendor-страницы — маркетинговые материалы. Формулировки вроде «до 95 % снижения maintenance» или «AI learns your app» — это claims поставщика, а не подтверждённые независимые измерения.

Надёжнее всего использовать из этих материалов:

- повторяющиеся архитектурные идеи;
- публично описанные артефакты и state transitions;
- ограничения, которые сами поставщики вынуждены признавать;
- границы между генеративным и детерминированным runtime.

Не следует принимать на веру:

- рекламные проценты;
- заявления о полном отсутствии flaky tests;
- обещания «zero maintenance»;
- утверждения, что любой plain-English flow автоматически превращается в надёжный тест.

---

## 2. Рынок: это не один класс продуктов

Статья Aqua Cloud смешивает несколько разных классов:

| Класс | Примеры | Главная ценность |
|---|---|---|
| Test management + AI generation | aqua cloud | Requirements → test cases, traceability |
| Browser/UI automation | Testim, mabl, Reflect, Functionize | User flows, regression, self-healing |
| Visual regression | Applitools, Katalon | Что реально видит пользователь |
| Business-process automation | ACCELQ, Tosca | Модели бизнес-процессов и reusable assets |
| Browser/device cloud | Sauce Labs | Масштаб браузеров, устройств и параллельных runs |
| Code/static analysis | Parasoft | Нишевый анализ кода и defect patterns |
| Release governance | Digital.ai | Readiness, quality gates, release decisions |
| Agent runtime | Stagehand, Playwright Agents | Планирование, browser actions, extraction, healing |

PrettyK не должен сравниваться с каждым из них как с прямым конкурентом. Наше ядро ближе всего к пересечению:

```text
Browser automation
+ Security testing
+ DAST / fuzzing
+ Agentic authoring
+ Evidence / gates
+ Airgap delivery
```

---

## 3. Общая reference architecture

### 3.1. Слой Intent / Specification

Пользователь описывает, **что нужно проверить**, а не обязан вручную писать каждый технический locator.

Варианты на рынке:

- plain English;
- requirements из Jira;
- Figma/Linear/docs;
- визуальная запись действий;
- YAML в репозитории;
- внутренний DSL.

Устойчивый продукт всё равно должен переводить свободное намерение в более строгий артефакт. Иначе каждый повторный запуск будет новым толкованием одного и того же текста.

### 3.2. Слой Application Context

Это память о приложении под тестом:

- страницы и состояния;
- доступные элементы и их семантика;
- роли и auth-контексты;
- user-flow transitions;
- network/API transitions;
- предыдущие test runs;
- edge cases и findings;
- покрытие и пробелы.

Functionize называет этот слой Application Context и Data Foundation. Momentic говорит о знании продукта и графе user flows. ACCELQ ставит business-process blueprint в центр всей quality lifecycle.

### 3.3. Слой Plan / Authoring

Сильные продукты разделяют намерение и исполнение:

```text
user intent
  → ordered plan
  → concrete actions
  → expected outcomes
```

Официальные Playwright Agents делают это буквально тремя агентами:

```text
Planner → Markdown plan
Generator → executable tests
Healer → failure recovery
```

### 3.4. Слой Deterministic Execution

AI хорошо подходит для поиска вариантов и понимания контекста. Но результат проверки должен быть воспроизводимым.

Типовые решения:

- pinned runtime/model;
- deterministic locator resolution;
- browser/device worker;
- isolated VM/context;
- snapshot-based rendering;
- отсутствие нового LLM-reasoning на каждом шаге;
- фиксированный timeout/retry policy.

Applitools и Functionize особенно явно продают границу «generative intent + deterministic core».

### 3.5. Слой Recovery / Self-healing

Self-healing — не только замена CSS selector. Более зрелый pipeline выглядит так:

```text
step failed
  → classify failure
  → inspect current state
  → find candidate
  → score candidate
  → retry safe action
  → verify intended outcome
  → record recovery evidence
  → accept / ask operator / fail
```

Ключевой вопрос — меняет ли recovery тест молча. Для security-продукта ответ должен быть отрицательным.

### 3.6. Слой Evidence / Analysis / RCA

Сильные продукты собирают не только pass/fail:

- screenshot каждого шага;
- video/session replay;
- DOM/AX snapshot;
- console logs;
- HAR/network;
- visual diff;
- failure reason;
- root-cause hints;
- comparison with last successful run;
- reproducible step sequence.

У PrettyK этот слой уже имеет хороший security-уклон: Allure, scanner, DefectDojo, Live, baseline delta и Evidence Chain.

### 3.7. Слой Orchestration / Governance

На верхнем уровне продукты предоставляют:

- test suites;
- schedules;
- CI/PR triggers;
- parallelism;
- test selection;
- flaky/quarantine;
- RBAC;
- audit;
- release dashboards;
- integrations;
- traceability от requirement до result.

Именно этот слой превращает browser automation в платформу, а не в красивый recorder.

---

## 4. Что у сильных продуктов стоит изучить

### 4.1. Testim: стабильность и повторное использование

Публично заявленные сильные стороны:

- Smart Locators анализируют множество DOM-атрибутов;
- учитываются текст, положение, цвет и контекст элемента;
- locators могут proactively пересчитываться;
- automated waits учитывают историю runs;
- repeated steps превращаются в shared groups;
- есть screenshots, console logs, HAR и failure tags;
- AI используется не только при authoring, но и в TestOps.

**Что применимо нам:** reusable steps, rich failure context, formalized recovery.

**Что не копировать:** обещание скрыть всю сложность за auto-healing. Для PrettyK факт восстановления должен быть виден оператору.

### 4.2. mabl: lifecycle, а не отдельная AI-фича

mabl описывает AI как контур полного lifecycle:

```text
create
  → run
  → analyze
  → recover
  → maintain
```

Сильные идеи:

- генерация тестов из natural language и Jira;
- parallel execution;
- autonomous failure triage;
- adaptive multi-layer auto-healing;
- human-in-the-loop, когда агенту не хватает контекста;
- continuous testing вместо исключительно фиксированного расписания.

**Что применимо нам:** не отдельный «AI assistant», а связанный lifecycle от intent до maintenance.

### 4.3. Applitools: самый чистый публичный слойный пример

Applitools прямо показывает архитектуру:

```text
CREATE
  → EXECUTE
  → ANALYZE
```

#### Create

- website scan;
- NLP step authoring;
- test/data generation;
- browser recorder;
- API builder;
- SDK/MCP.

#### Execute

- deterministic LM;
- coded-locator healing;
- browser/device grid;
- parallel cloud execution;
- schedules и CI.

#### Analyze

- visual baseline grouping;
- auto-accept similar diffs;
- root-cause analysis;
- dashboards и test insights.

**Что применимо нам:** как минимум разделять authoring, execution и analysis на уровне модели продукта, даже если физически мы остаёмся монолитом.

### 4.4. Functionize: generative intent, deterministic core

У Functionize наиболее полезная для нас формулировка:

```text
Agent interprets what you mean.
Deterministic / ML core verifies what the app does.
```

Их публичная архитектура:

```text
Thin Platform Interface
  → Agent Layer
  → Execution Agent
  → Application Context
  → Data Foundation
```

Особенно ценны:

- isolated VM на запуск;
- видимый screenshot и bounding box каждого resolved element;
- step changes создают restore point;
- in-run matching не переписывает сам тест;
- runtime/model можно pin-ить для воспроизводимости;
- отдельный app knowledge layer.

**Что применимо нам:** Run Plan, restore point, visible resolution, app context.

### 4.5. ACCELQ: бизнес-процесс и модульность

ACCELQ ставит в центр не отдельный test case, а business-process model.

Сильные стороны, которые они декларируют:

- design-first;
- modularity и reuse;
- web/mobile/API/backend/mainframe в единой модели;
- integrated data designer;
- logical business-driven plans;
- change management;
- extension interface.

**Что применимо нам:** наши auth, connectors, data modules и chain могут постепенно стать единой библиотекой проверяемых компонентов.

**Что не нужно копировать:** попытку сразу охватить все типы enterprise-приложений. Ширина ACCELQ — не автоматически правильная ширина PrettyK.

### 4.6. Momentic: spec, graph, cache и PR-контур

Momentic интересен не только browser automation, но и инженерной упаковкой:

- human-readable tests в YAML в репозитории;
- spec — source of truth;
- единый CLI;
- app knowledge из docs, guides, code, Jira, Linear, Figma;
- user-flow graph;
- тесты из PR/diff;
- session replay;
- root-cause analysis;
- step cache;
- snapshots для portable replay;
- triage, classification и quarantine;
- отдельный reviewer проверяет фактический outcome AI action.

**Что применимо нам:** portable run snapshot, app-flow graph, outcome verification, quarantine и change-aware exploration.

**Что не копировать:** второй YAML-SoT. У PrettyK уже есть prettyK DSL.

### 4.7. Playwright Agents и Stagehand: нижний agent runtime

Playwright даёт каноническую цепочку:

```text
planner → generator → healer
```

Stagehand, в свою очередь, полезен как низкоуровневый browser-agent layer:

```text
act
observe
extract
```

Его сильные идеи:

- Playwright-like deterministic API;
- trimmed accessibility tree для экономии токенов;
- низкая latency за счёт близости к браузеру;
- self-healing actions;
- nested iframes и closed Shadow DOM;
- batch commands;
- OpenTelemetry.

**Что применимо нам:** формализовать observe/act/extract как разные операции, не смешивать read-only observation с destructive action, использовать AX trimming для agent context.

---

## 5. PrettyK: что уже есть

### 5.1. Intent и authoring

У нас уже есть:

- `BuddyEngine`: `intent → skeleton → clarify → proposal → run → evidence`;
- Studio v2;
- Editor Reborn;
- Monaco;
- prettyK DSL;
- WireK как derived view;
- Action Hub с явным Submit;
- wired/Pydantic contract;
- data modules, auth modules, connectors, chain.

Сильная сторона — явная семантика, а не свободный текст, который каждый раз трактуется заново.

### 5.2. Execution

У нас есть:

- Playwright Browser Core;
- `launch`;
- `connectOverCDP` к Chrome `:9222`;
- multi-context;
- headless/headed;
- Browser Stage;
- scanner MITM;
- Fast Fuzzer;
- DAST waves;
- bounded run;
- soft/hard/failsafe semantics.

Для security automation это более глубокий runtime, чем у большинства перечисленных UI-first продуктов.

### 5.3. Discovery и heal

Уже канонизированы:

- DOM/AX discovery;
- label-driven actions;
- visible/enabled/editable checks;
- ambiguity handling;
- weighted attribute scoring;
- soft gate для heal;
- `HEAL`, `HEAL_MISS`, `ERROR`;
- запрет silent SoT rewrite;
- operator acceptance locator candidate.

Наш подход сознательно не превращает heal в оправдание ложного зелёного.

### 5.4. Evidence и security control

У нас уже есть:

- Live :8767;
- diary/NDJSON;
- Allure;
- scanner;
- DefectDojo;
- Evidence Chain;
- fingerprints;
- baseline delta;
- `NEWLY_OBSERVED`, `NOT_OBSERVED`, `CHANGED`;
- `incomparable` для несовместимых runs;
- Qwen как advisory layer;
- gates и admission;
- ACL, retention, legal hold;
- airgap-границы.

Главное: AI не имеет права самостоятельно создавать findings, менять severity/gate или утверждать root cause без evidence.

---

## 6. Где у PrettyK есть разрыв

| Слой | Что есть | Что пока не подтверждено как полноценный as-built слой |
|---|---|---|
| Intent | Buddy, prettyK, Studio, Editor | Явный immutable Run Plan |
| App context | DOM/AX/network/console discovery | Persistent AUT knowledge graph |
| Planning | Intent → skeleton → proposal | Отдельный plan artifact и plan diff |
| Execution | Playwright, CDP, scanner, fuzz, contexts | Промышленный worker/VM scale и device grid |
| Recovery | Weighted heal, failsafe, soft/hard | Полная recovery state machine, restore points, outcome reviewer |
| Evidence | Live, Allure, Dojo, baseline, chain | Единый failure taxonomy и RCA workflow |
| Orchestration | Admin, gates, runs, retention | Полный scheduler, impact selection, quarantine/flaky registry |
| Visual | Browser panel, screenshots | Отдельный visual/semantic assertion engine |
| Reuse | Auth, connectors, data, chain | Общая reusable component/scenario library |

Часть этих разрывов уже описана в существующих research-документах, особенно в:

- [`2026-08-24-prettyk-ci-concept.md`](2026-08-24-prettyk-ci-concept.md)
- [`2026-08-23-automation-lab-concept.md`](2026-08-23-automation-lab-concept.md)
- [`../../sanctuary/pure/discovery-heal.md`](../../sanctuary/pure/discovery-heal.md)
- [`../../sanctuary/pure/pw-browser-core.md`](../../sanctuary/pure/pw-browser-core.md)
- [`../../sanctuary/system-map.json`](../../sanctuary/system-map.json)

---

## 7. Семь отдельных концептов для дальнейшего planning

Это не готовые эпики. Это независимые направления, которые Gemini должен уточнить, объединить только там, где это разумно, и дополнить новыми вариантами.

### CONCEPT A — Application Knowledge / Flow Graph

#### Проблема

PrettyK умеет исследовать приложение в рамках конкретного discovery/run, но ещё не имеет отдельной долговременной модели приложения под тестом.

#### Тезис

Собирать из discovery и evidence machine-readable граф:

```text
Target Application
  → pages
  → states
  → controls
  → roles
  → actions
  → API/network transitions
  → scenarios
  → findings
  → coverage
```

#### Почему отдельный концепт

Это слой памяти и контекста. Он не должен автоматически чинить тесты, запускать сканирование или менять SoT.

#### Возможная ценность

- видеть пробелы покрытия;
- строить context-aware discovery;
- связывать UI-flow и security findings;
- питать Buddy уточнённым контекстом;
- подготовить change-aware selection.

#### Главный риск

Построить ещё одну статическую карту, которая устаревает. Источник должен быть связан с реальными runs и иметь честный freshness/status.

---

### CONCEPT B — Immutable Run Plan / Replay Snapshot

#### Проблема

Между intent, DSL и фактическим запуском может потеряться ответ на вопрос: «Что именно было запущено?»

#### Тезис

Каждый run получает неизменяемый derived plan:

```text
plan_id
source_intent
check_revision
ordered_steps
preconditions
expected_outcomes
auth/data context
allowed recovery policy
budget
runtime/tool versions
```

После начала run план не изменяется. Recovery proposal и runtime observations сохраняются отдельно.

#### Почему отдельный концепт

Run Plan — это контракт воспроизводимости и аудита. Он не обязан знать, как строится AUT graph или как классифицируется failure.

#### Возможная ценность

- replay;
- plan diff;
- честный audit;
- reproduce finding;
- сравнение intent с фактическим execution.

#### Каноническая граница

`prettyK` остаётся authoring SoT. Run Plan — только immutable derived artifact, не второй редактируемый язык.

---

### CONCEPT C — Evidence-first Recovery

#### Проблема

Текущий heal имеет правильные safety-ограничения, но ещё не оформлен как полный протокол восстановления.

#### Тезис

```text
STEP_FAILED
  → FAILURE_CLASSIFIED
  → STATE_OBSERVED
  → CANDIDATE_FOUND
  → SAFE_RETRY
  → OUTCOME_VERIFIED
  → RECOVERY_ACCEPTED
  или OPERATOR_REVIEW / HARD_FAILURE
```

Каждое восстановление должно сохранять:

- исходный шаг;
- observed state;
- candidate и score;
- выполненный retry;
- фактический outcome;
- причину решения;
- ссылку на screenshots/AX/network evidence.

#### Почему отдельный концепт

Это evolution `discovery-heal`, а не новая AI-фича и не часть обычного locator resolver.

#### Возможная ценность

- меньше false failures;
- видимый recovery trail;
- безопасная адаптация UI;
- restore point без silent rewrite;
- возможность сравнивать качество heal.

#### Жёсткий запрет

Recovery не меняет SoT и не превращает security failure в success автоматически.

---

### CONCEPT D — Deterministic Failure Triage / RCA

#### Проблема

Красный run может означать совершенно разные вещи:

- баг приложения;
- дефект теста;
- locator miss;
- auth/data failure;
- network/infra problem;
- contract drift;
- security finding.

#### Тезис

Сначала детерминированно классифицировать failure по evidence:

```text
APP_BUG
TEST_DEFECT
LOCATOR_MISS
AUTH_FAILURE
DATA_FAILURE
NETWORK_FAILURE
INFRASTRUCTURE_FAILURE
CONTRACT_DRIFT
TIMEOUT
SECURITY_FINDING
UNKNOWN
```

Затем Qwen может объяснить уже вычисленный результат человеческим языком.

#### Почему отдельный концепт

RCA — аналитический слой после run. Он не должен быть слит с execution и не должен влиять на security gate без утверждённого deterministic результата.

#### Возможная ценность

- меньше ручного triage;
- маршрутизация к владельцу;
- failure trends;
- честное различие test failure и product defect;
- подготовка quarantine/flaky registry.

---

### CONCEPT E — Change-aware Test Selection / Orchestration

#### Проблема

При росте coverage полный suite становится дорогим. Рынок предлагает запускать тесты по изменившемуся коду, продуктовой области или flow.

#### Тезис

```text
changed file/module/endpoint
  → affected AUT graph nodes
  → dependent scenarios
  → required security checks
  → selected run plan
```

Первый слой должен быть deterministic:

- tags;
- wired references;
- connector dependencies;
- auth dependencies;
- chain slots;
- endpoint references;
- explicit ownership.

AI может позже давать advisory suggestions, но не должен один решать, что security-проверку можно пропустить.

#### Почему отдельный концепт

Это orchestration/optimization, а не knowledge graph и не healing.

#### Возможная ценность

- быстрее PR feedback;
- меньше лишних runs;
- понятная причина выбора теста;
- risk-based security coverage.

---

### CONCEPT F — Visual / Semantic Assertions

#### Проблема

Functional test может быть зелёным, даже если пользователь видит сломанный layout, accessibility issue или неверное визуальное состояние.

#### Тезис

Добавить optional assertions:

- screenshot/component checkpoint;
- semantic state assertion;
- accessibility signals;
- dynamic-content masking;
- baseline grouping;
- visual diff evidence.

#### Почему отдельный концепт

Visual regression — отдельный класс ценности и отдельная стоимость false positives. Он не должен незаметно стать обязательной частью каждого security run.

#### Решение для planning

Сначала PoC на одном экране и одном baseline. Не начинать с полноценного Applitools-клона.

---

### CONCEPT G — Reusable Scenario / Component Library

#### Проблема

Без повторного использования suite начинает дублировать login, setup, data preparation, token injection и connector calls.

#### Тезис

Развить существующие сущности в versioned component library:

```text
Auth Context
Data Preparation
Browser Discovery
API Probe
Chain Setup
scanner Scan
Finding Normalization
Evidence Pack
Quality Gate
```

Каждый компонент должен иметь:

- входы;
- outputs;
- required permissions;
- network scope;
- produced evidence;
- runtime/tool version;
- compatibility;
- risk level.

#### Почему отдельный концепт

Это reuse и component governance. Он связан с Pipeline IR, но не равен ему и не должен автоматически превращаться в generic CI.

#### Что уже есть

Auth modules, connectors, data modules и chain — существующая основа, которую разумно развивать, а не заменять.

---

## 8. Что не следует делать

### 8.1. Не заменять prettyK на plain English

Plain English — хороший вход в Buddy. Но не лучший SoT для security execution:

- неоднозначность;
- слабый diff;
- сложнее audit;
- сложнее gate;
- сложнее airgap;
- риск различного толкования между runs.

Правильная схема:

```text
Natural-language intent
  → Buddy clarification
  → prettyK proposal
  → operator approval
  → deterministic run
```

### 8.2. Не ставить LLM-локатор на каждый шаг

Это создаёт:

- latency;
- стоимость;
- nondeterminism;
- сложный аудит;
- риск ложного успеха.

Weighted locator resolution и явный heal gate — более здоровая основа.

### 8.3. Не делать silent healing

Запрещённый сценарий:

```text
test changed silently
  → green
```

Допустимый сценарий:

```text
candidate repair
  → evidence
  → diff
  → reason
  → operator acceptance
```

### 8.4. Не строить сразу универсальную enterprise-платформу

ACCELQ, Sauce Labs и другие показывают ширину рынка, но не доказывают, что PrettyK должен одновременно покрывать:

- desktop;
- mobile;
- mainframe;
- SAP;
- Salesforce;
- device farm;
- generic CI;
- visual AI;
- test management.

Сначала следует укрепить собственную ось: security intent → safe execution → proof.

### 8.5. Не делать visual AI обязательным security core

Visual layer полезен, но должен быть optional и isolated. Security gate не должен зависеть от случайного pixel diff.

---

## 9. Предлагаемая целевая картина

Это не утверждённая архитектура, а материал для Gemini:

```text
                         ┌────────────────────────┐
                         │  Operator Intent        │
                         │  prettyK / Buddy        │
                         └───────────┬────────────┘
                                     ↓
                         ┌────────────────────────┐
                         │  Application Knowledge  │
                         │  AUT Flow / Context     │
                         └───────────┬────────────┘
                                     ↓
                         ┌────────────────────────┐
                         │  Approved Run Plan      │
                         │  immutable snapshot     │
                         └───────────┬────────────┘
                                     ↓
       ┌─────────────────────────────┴─────────────────────────────┐
       ↓                                                           ↓
┌───────────────┐                                         ┌────────────────┐
│ Playwright    │                                         │ scanner / Fuzzer   │
│ Browser Core  │                                         │ Security plane │
└───────┬───────┘                                         └───────┬────────┘
        └──────────────────────┬──────────────────────────────────┘
                               ↓
                    ┌────────────────────────┐
                    │ Recovery / Heal        │
                    │ gated, visible, safe   │
                    └───────────┬────────────┘
                                ↓
                    ┌────────────────────────┐
                    │ Evidence + Triage       │
                    │ Live / Allure / Dojo     │
                    │ baseline / RCA / Qwen    │
                    └───────────┬────────────┘
                                ↓
                    ┌────────────────────────┐
                    │ Gate / Export / Replay  │
                    │ Admin / CI / audit      │
                    └────────────────────────┘
```

В этой картине AI не является владельцем всего процесса. Он может участвовать в нескольких местах, но роли разделены:

| AI-функция | Допустимая роль |
|---|---|
| Intent assistant | Уточнить намерение и предложить план |
| Discovery assistant | Найти кандидатов и пробелы покрытия |
| Locator recovery | Предложить candidate repair под policy |
| Failure analyst | Объяснить уже классифицированный failure |
| Coverage advisor | Предложить дополнительные сценарии |
| Security gate | **Не AI-решение; deterministic policy** |
| Scope expansion | **Запрещено без operator approval** |

---

## 10. Вопросы для Gemini Flash

Gemini должен не просто «переписать красивее», а провести второй discovery-раунд.

### Архитектурная проверка

1. Действительно ли семь концептов независимы, или какие-то следует объединить?
2. Является ли Application Knowledge Graph отдельным продуктовым слоем или частью Discovery?
3. Достаточно ли Run Plan как derived artifact, или нужен отдельный IR?
4. Где должна проходить граница между Buddy, Planner и Runtime?
5. Какие данные должны быть durable, а какие ephemeral?
6. Как не превратить flow graph в статический кладбищенский JSON?

### Продуктовая проверка

1. Какой из концептов даёт максимальный customer value первым?
2. Что является differentiator PrettyK, а что commodity-функцией?
3. Какие направления принадлежат SecOps Lab, а какие могут войти в Automation Lab?
4. Нужна ли отдельная visual branch или её следует отложить?
5. Какую минимальную историю можно показать заказчику без enterprise-театра?

### Safety / honesty check

1. Где auto-healing может превратить finding в false green?
2. Какие действия обязаны оставаться fail-closed?
3. Где нужен human approval?
4. Какие vendor claims нельзя принимать за acceptance criteria?
5. Как сохранить airgap и не превратить AI в внешний обязательный endpoint?

### Ожидаемый результат Gemini

Gemini должен вернуть:

- уточнённую reference architecture;
- карту зависимостей между концептами;
- предложения, что объединить и что развести;
- новые разумные направления, если они обнаружены;
- продуктовые примеры и UX-модель;
- recommendation по порядку discovery/PoC;
- список вещей, которые не следует делать.

Gemini не должен:

- писать код;
- менять канон;
- добавлять карточки в backlog;
- объявлять концепты принятыми эпиками.

---

## 11. Handoff для DeepSeek Pro после Gemini

После Gemini документ передаётся DeepSeek как архитектурный input.

DeepSeek должен:

1. проверить, не смешаны ли product layers, runtime layers и governance;
2. проверить контракты между концептами;
3. отличить уже as-built от research/concept;
4. оценить dependency order;
5. определить, где нужен PoC, а где сразу Plan;
6. нарезать **несколько major epics**, а не один AI mega-epic;
7. для каждого major epic определить:
   - customer outcome;
   - boundary;
   - dependencies;
   - out-of-scope;
   - risks;
   - acceptance strategy;
   - Boss/Flash ownership;
   - whether it requires Sanctuary 2FA.

Предварительно ожидаемая форма:

```text
Major Epic A — Application Knowledge / Flow Graph
Major Epic B — Immutable Run Plan / Replay
Major Epic C — Evidence-first Recovery
Major Epic D — Failure Triage / RCA
Major Epic E — Change-aware Selection / Orchestration
Major Epic F — Visual Assertions (optional / later)
Major Epic G — Reusable Components (possibly part of Pipeline IR)
```

Этот список предварительный. DeepSeek имеет право доказать, что два направления следует объединить или, наоборот, разрезать ещё мельче.

---

## 12. Предварительная рекомендация по порядку

До решения Gemini и DeepSeek можно обозначить только гипотезу порядка:

```text
1. Application Knowledge / Flow Graph
2. Immutable Run Plan / Replay Snapshot
3. Evidence-first Recovery
4. Failure Triage / RCA
5. Change-aware Selection / Orchestration
6. Reusable Component Library
7. Visual / Semantic Assertions
```

Но порядок не является решением. Возможна более сильная связка:

```text
Run Plan + Evidence-first Recovery
```

или:

```text
Application Knowledge + Change-aware Selection
```

Именно это должен проверить второй research-раунд.

---

## 13. Central design principle

```text
AI может предложить.
Детерминированное ядро проверяет.
Evidence доказывает.
Policy ограничивает.
Оператор утверждает.
```

Это не декоративная формула. Она определяет границы всей будущей архитектуры:

- AI не расширяет scope;
- AI не меняет policy;
- AI не создаёт security finding без evidence;
- AI не переписывает SoT молча;
- AI не превращает несовместимый run в «почти зелёный»;
- любой recovery оставляет след;
- любой release decision имеет reproducible proof.

---

## 14. Out of scope этого research-документа

- реализация любого из концептов;
- изменение prettyK DSL;
- замена wired/Pydantic-контрактов;
- замена Playwright Browser Core;
- перенос системы на plain English или YAML;
- построение generic CI;
- полноценный device cloud;
- копирование Applitools visual platform;
- молчаливый self-healing;
- добавление записей в `sanctuary/pure/INDEX.md`;
- добавление эпиков в `docs/backlog.md` до второго research-раунда.

---

## 15. Источники

### Market overview

- [Aqua Cloud — 12 Best Tools for AI-Based Test Automation](https://aqua-cloud.io/tools-for-ai-based-test-automation/)

### Product architecture and capabilities

- [Testim](https://www.testim.io/)
- [Testim — Test Stability](https://www.testim.io/test-stability/)
- [Testim — Root Cause Analysis](https://www.testim.io/root-cause-analysis/)
- [mabl — AI Test Automation](https://www.mabl.com/ai-test-automation)
- [mabl — Adaptive Auto-healing](https://www.mabl.com/auto-healing-tests)
- [Applitools — Platform](https://applitools.com/platform/)
- [Applitools — Execute](https://applitools.com/platform/execute)
- [Functionize — Architecture](https://www.functionize.com/architecture)
- [ACCELQ — Codeless](https://www.accelq.com/codeless/)
- [SmartBear Reflect](https://www.reflect.run/)
- [Momentic](https://momentic.ai/)

### Runtime foundations

- [Browserbase Stagehand](https://github.com/browserbase/stagehand)
- [Playwright Test Agents](https://playwright.dev/docs/test-agents)

### Internal PrettyK references

- [`sanctuary/system-map.json`](../../sanctuary/system-map.json)
- [`sanctuary/pure/INDEX.md`](../../sanctuary/pure/INDEX.md)
- [`sanctuary/pure/prettyk-core.md`](../../sanctuary/pure/prettyk-core.md)
- [`sanctuary/pure/discovery-heal.md`](../../sanctuary/pure/discovery-heal.md)
- [`sanctuary/pure/pw-browser-core.md`](../../sanctuary/pure/pw-browser-core.md)
- [`sanctuary/pure/runtime-shell.md`](../../sanctuary/pure/runtime-shell.md)
- [`sanctuary/pure/monitor-hub.md`](../../sanctuary/pure/monitor-hub.md)
- [`docs/research/2026-08-24-prettyk-ci-concept.md`](2026-08-24-prettyk-ci-concept.md)
- [`docs/research/2026-08-23-automation-lab-concept.md`](2026-08-23-automation-lab-concept.md)

---

## 16. Состояние после первого раунда Luna

- Исследование проведено по нескольким vendor и primary sources.
- Сформирована общая reference architecture.
- Разделены семь самостоятельных направлений.
- Зафиксированы сильные стороны PrettyK и реальные gaps.
- Зафиксированы запреты против black-box AI и silent healing.
- Документ готов к рафинированию Gemini.
- После Gemini требуется отдельный DeepSeek planning round.
- Канон и backlog не менялись.