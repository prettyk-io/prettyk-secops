# Concept: PrettyK CI — Security Pipeline Platform

> **Статус:** concept / evolve · 24 августа 2026 г.  
> **Профиль:** `secops-lab-pure` + `cosmo-custom`  
> **Не CANON:** концепт для обсуждения и последующей нарезки.

## 1. Тезис

PrettyK не становится ещё одним Jenkins или GitLab CI. PrettyK становится **security pipeline platform**, которая:

1. понимает смысл security-проверки, scope, policy и evidence;
2. умеет запускать собственный нативный Security Pipeline;
3. подключается к внешним CI/CD-системам через адаптеры;
4. экспортирует свои security-компоненты во внешние пайпы;
5. возвращает из каждого запуска воспроизводимое доказательство — **Proof-Carrying Security Run**.

Коротко:

> **Свой смысл и контракт — свои. Generic CI execution — не наш велосипед.**

---

## 2. Что сказал заказчик

> «Нам нужны свои механизмы? Мы однозначно будем подключаемы к любому. Но свой тоже бы надо иметь возможность предоставлять? Брат тулы или свое писать?»

## 3. Продуктовый интент

Команда безопасности должна уметь собрать проверку как понятный граф действий, запустить её самостоятельно или встроить в существующий CI/CD, не теряя:

- scope и разрешения;
- policy и approvals;
- auth references;
- версий инструментов;
- retry/cancel semantics;
- статуса каждого шага;
- findings и их lifecycle;
- evidence и provenance.

Пользователь должен один раз описать security intent, а не переписывать его отдельно для PrettyK, GitHub Actions, GitLab CI, Jenkins, Tekton и Argo.

---

## 4. Граница: что берём готовым, что строим сами

### Используем как кирпичи

- GitHub Actions reusable workflows;
- GitLab CI/CD Components и Catalog;
- Jenkins Declarative/Scripted Pipeline;
- Azure DevOps pipelines;
- Tekton Tasks/Pipelines/TaskRuns/PipelineRuns;
- Argo Workflows и DAG;
- Docker/Kubernetes как execution substrate;
- OpenBao для secrets;
- MinIO/S3 для artifacts;
- OpenTelemetry для traces/metrics/log correlation.

### Строим как PrettyK-ценность

- security pipeline semantics;
- canonical pipeline IR;
- tool/capability catalog;
- target scope и safety policy;
- finding/evidence lifecycle;
- security-specific approvals и quality gates;
- native worker execution;
- run debugger, replay и proof package;
- adapter compiler/exporter;
- UI, где DSL, граф, run и evidence — одна система.

### Чего не строим

- собственный generic shell runner;
- собственный контейнерный scheduler;
- копию Kubernetes;
- ещё один универсальный CI с тысячей плагинов;
- бесконтрольное исполнение произвольного кода из UI.

---

## 5. PrettyK Pipeline IR

Канонический pipeline должен описывать не YAML-синтаксис конкретного вендора, а наблюдаемое поведение:

### Pipeline

- цель и тип проверки;
- target/application/environment;
- разрешённый scope;
- policy и required approvals;
- последовательные и параллельные ветки;
- matrix по target, browser, API или environment;
- timeout, retry, cancellation;
- требуемые capabilities;
- ожидаемые outputs и evidence;
- quality-gate semantics.

### Pipeline component

Переиспользуемый versioned security-блок:

```text
Browser Discovery
API Contract Probe
Auth Context
scanner Active Scan
Corpus Fuzzing
Finding Normalization
Quality Gate
Evidence Package
DefectDojo Sync
```

Каждый компонент объявляет, что он получает, что производит, какие права требует и какие артефакты оставляет.

### Tool capability

Инструмент описывается не строкой shell-команды, а capability-контрактом:

- назначение;
- входы;
- выходы;
- required permissions;
- network access;
- resource profile;
- supported environments;
- version/digest;
- risk level;
- evidence types.

Это позволит подключать внешний scanner, не превращая каждый новый tool в отдельный самописный мини-фреймворк.

---

## 6. Два способа работы

### A. Native PrettyK Pipeline

```text
Discover
  ↓
Authorize scope
  ↓
Prepare auth context
  ↓
Browser / API exploration
  ↓
scanner / API / Fuzzing
  ↓
Normalize findings
  ↓
Quality Gate
  ↓
Evidence package
  ↓
Notify / Export
```

Native mode использует PrettyK workers и понимает доменные сущности PrettyK без потери смысла.

### B. External Pipeline Integration

PrettyK подключается к внешнему пайпу через:

- reusable CI component/action;
- CLI command;
- REST/API trigger;
- webhook trigger;
- status/check callback;
- artifact/evidence export;
- signed result and provenance metadata.

Внешний pipeline остаётся хозяином общего build/deploy процесса, а PrettyK — хозяином security assessment и security evidence.

---

## 7. Совместимость без вранья

У разных CI-систем разная семантика. Поэтому обещаем не «магический импорт всего», а уровни совместимости:

| Уровень | Поведение |
|---|---|
| **Lossless** | Смысл, gates, outputs и evidence переносятся без изменения. |
| **Mapped** | Внешний формат поддерживает поведение через эквивалентную конструкцию. |
| **Degraded** | Часть возможностей заменяется; UI показывает точный список потерь. |
| **Unsupported** | Запуск блокируется до решения пользователя; тихого удаления шага нет. |

Каждый импорт/экспорт обязан показать:

- что будет выполнено;
- что потребует approval;
- какие secrets нужны;
- какие features потеряны;
- какие outputs и artifacts вернутся;
- какой runtime и tool version будут использованы.

---

## 8. Tool Catalog и Component Catalog

В Web IDE пользователь открывает каталог security-компонентов и видит не список npm-пакетов, а готовые проверяемые возможности:

- scanner Active Scan;
- Browser Discovery;
- Auth Replay;
- OpenAPI/GQL/gRPC Probe;
- Corpus Fuzzer;
- Secret Scan;
- SARIF Export;
- DefectDojo Sync;
- Quality Gate;
- Evidence Pack.

Для каждого компонента отображаются:

- назначение;
- risk;
- required capability;
- estimated cost;
- target restrictions;
- output/evidence;
- version и provenance;
- compatible external pipelines.

Внутренние и клиентские компоненты должны версионироваться, проходить review и ссылаться на конкретную версию или digest. `latest` для production-пайпа не считается допустимой ссылкой.

---

## 9. Run model

Каждый run — durable объект с честной state machine:

```text
draft
  → approved
  → queued
  → running
  → cancelling
  → succeeded / failed / cancelled / expired
```

Обязательные свойства:

- idempotency;
- retry без дубликатов findings и evidence;
- leases и stale-run recovery;
- cancel/kill;
- concurrency quotas;
- worker isolation;
- correlation id;
- artifact checksums;
- policy snapshot;
- tool/runtime versions;
- complete run timeline.

Valkey может доставлять ephemeral dispatch и live-события. Потеря Valkey не должна уничтожать run или его историю.

---

## 10. Proof-Carrying Security Run

Центральная инновация PrettyK — результатом pipeline становится не только exit code.

Каждый run способен предъявить доказательство:

```text
Actor
Intent
Target and authorized scope
Policy version
Approval history
Tool/runtime versions
Executed steps
Inputs and redactions
Findings and decisions
Artifacts and checksums
Provenance
```

Пользователь может нажать **Reproduce** и получить минимальный повторяемый pipeline для конкретной finding, не собирая историю вручную.

---

## 11. Сценарии GWT

### Native run

- **Given:** пользователь собрал pipeline из approved components.
- **When:** нажал Run.
- **Then:** PrettyK показывает plan, проверяет scope/permissions, запускает изолированные workers и сохраняет evidence.

### External CI

- **Given:** внешний pipeline вызвал PrettyK component.
- **When:** security run завершился.
- **Then:** внешний job получает стабильный status, exit semantics, link на evidence и structured findings.

### Потеря worker

- **Given:** worker исчез во время fuzzing.
- **When:** истёк lease.
- **Then:** run становится retryable или failed по policy; partial artifacts помечаются; ложного success нет.

### Неполный импорт

- **Given:** внешний pipeline содержит функцию, которую PrettyK не может перенести.
- **When:** пользователь импортирует его.
- **Then:** система показывает degraded/unsupported report и не удаляет шаг молча.

### Опасный scope

- **Given:** pipeline пытается активную проверку адреса вне разрешённого scope.
- **When:** происходит preflight.
- **Then:** запуск блокируется fail-closed и создаётся audit event.

### Повторная доставка

- **Given:** callback вернул timeout после фактической доставки результата.
- **When:** система делает retry.
- **Then:** consumer может дедуплицировать callback по idempotency key, а история доставки остаётся видимой.

---

## 12. DoD концепта

- PrettyK имеет собственный security pipeline contract.
- Один pipeline можно запускать native или подключать к внешнему CI.
- Поддерживается каталог versioned security components.
- Import/export сообщает о несовместимостях, а не скрывает их.
- Scope, policy, approval и secrets проходят через preflight.
- Run переживает рестарт Valkey и падение worker.
- Findings, artifacts и provenance связаны с конкретным run.
- Внешний CI получает понятный status и ссылку на evidence.
- Повтор запуска не создаёт неконтролируемые дубликаты.
- `latest`, непроверенные images и непинованные компоненты не проходят production gate.

---

## 13. Очерёдность

1. Security Pipeline IR и tool capability contract.
2. Native run plan, preflight и durable run state.
3. Component Catalog и первый PrettyK CI component.
4. GitHub/GitLab adapters и CLI/API trigger.
5. Worker pool, evidence/provenance и replay.
6. Jenkins/Tekton/Argo/Azure adapters по реальному спросу.

Не начинаем с попытки поддержать все системы на 100 %. Сначала строим правильный собственный смысл, затем расширяем адаптеры.

---

## 14. Out of scope

- Полная замена GitHub/GitLab/Jenkins/Tekton/Argo.
- Собственный generic build/deploy engine.
- Безусловный lossless import любой vendor DSL.
- Kafka/RabbitMQ только ради pipeline-слова.
- Произвольный privileged shell из pipeline без policy и sandbox.
- AI, который самостоятельно расширяет scope, меняет policy или запускает destructive action.

## 15. Индустриальные опоры

- [GitHub — Reuse workflows](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [GitLab — CI/CD Components](https://docs.gitlab.com/ci/components/)
- [Jenkins — Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
- [Tekton — Concepts](https://tekton.dev/docs/concepts/overview/)
- [Argo — DAG Workflows](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)
