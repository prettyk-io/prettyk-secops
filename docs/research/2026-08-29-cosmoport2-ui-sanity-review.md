# Cosmoport 2.0 — UI Sanity Review

> **Статус:** `research / evolve / full-sanity-review / owner-confirmation-needed`
>
> **Это не CANON, не backlog и не приказ на реализацию.** Документ фиксирует
> состояние поверхности Cosmoport2, санитарную оценку и вопросы для согласования.
>
> **Дата:** 29 августа 2026 года
>
> **Источники:** сохранённые HTML-снимки из Downloads, исходники
> `D:\cosmoport2\frontend`, уже проведённые RBAC/HAR-исследования.

---

## 0. Короткий вердикт

Первое впечатление Максима подтверждается кодом: Cosmoport2 получил широкую
витрину функций, но главный рабочий путь — приложение → Git → пайплайн → сборка
→ прогон → findings/evidence → gate → релиз → трансфер — почти не доведён до
операционной целостности.

Проблема не в том, что функций много сама по себе. Проблема в другом:

1. навигация обещает больше, чем реально реализовано;
2. mock/fallback-данные выглядят как настоящие данные;
3. критические security-операции симулируются на клиенте;
4. контракты между экраном, API и доменом не собраны в один поток;
5. Web IDE существует как отдельная демонстрация, но не как понятная часть
   жизненного цикла приложения и пайплайна;
6. поверх рабочего ядра навешаны самостоятельные эпики, которые не являются
   частью операторского портала и не имеют места в основном сценарии.

Оценку «50 % уничтожить» пока не фиксируем как число: точный процент требует
   инвентаризации всех маршрутов и связей с backend. Но диагноз
   **«ширина поверхности существенно опережает глубину ядра»** подтверждён.

---

## 1. Что именно было просмотрено

### 1.1. Снимки из Downloads

| Артефакт | Что доказывает |
|---|---|
| `C:\Users\mails\Downloads\Cosmoport 2.0.html` | Сохранённый DOM Control Station с URL `http://localhost:5174/`; в нём уже отрисованы sidebar, dashboard и переключатель Web IDE/Control Station. |
| `C:\Users\mails\Downloads\RBAC_WHATAFAC.html` | Сохранённый DOM экрана `RBAC & Team Scope Management`; экран визуально выглядит как консоль доступа, но его содержимое нужно сверять с реализацией. |
| `C:\Users\mails\Downloads\vm cosmoport.zip` | Отдельный архив для последующего разбора; в этот цикл не извлекался и не используется как доказательство без просмотра содержимого. |

В HTML-снимках присутствует один и тот же dev-shell Vite и отрендеренный
`#root`. Снимок — доказательство того, что UI был виден в браузере, но не
доказательство того, что операции сохранились или дошли до backend.

### 1.2. Исходники

Ключевые места:

- `D:\cosmoport2\frontend\src\App.tsx` — переключение двух поверхностей;
- `...\cosmo\station\ControlStationShell.tsx` — sidebar и dispatch views;
- `...\cosmo\station\api.ts` — REST-клиент и fallback-поведение;
- `...\cosmo\station\views\Applications.tsx` и `AppCreationWizard.tsx` —
  приложения, группы, домены;
- `...\cosmo\station\views\PipelineStudio.tsx` — планы, bricks и DAG;
- `...\cosmo\station\views\Releases.tsx` и `ReleaseTransferWizard.tsx` —
  релизы и трансфер по зонам;
- `...\cosmo\ide\WebIDEShell.tsx` — Web IDE;
- `...\cosmo\shared\DeepLinker.tsx` — связка двух поверхностей;
- `...\cosmo\station\views\RbacConsole.tsx` — текущий экран RBAC;
- `...\cosmo\station\views\Evidence.tsx`, `RunComparison.tsx`,
  `SbomExplorer.tsx`, `GostConstructor.tsx` — дополнительные поверхности.

---

## 2. Главный сценарий, который должен существовать

Минимальный сценарий Cosmoport2 должен быть сквозным и проверяемым:

```text
Домен/КИТС
  → приложение и его Git binding
  → pipeline definition / plan
  → build из конкретного commit
  → run и batches
  → результаты, findings, evidence
  → automatic/manual gate
  → release manifest из проверенного build
  → ЗР → ЗТ → ЗПЭ
  → audit / GOST Act / rollback или остановка
```

Инженерский цикл должен замыкаться:

```text
finding / failed gate
  → repository + file + line
  → Web IDE
  → change
  → commit
  → run именно соответствующего pipeline/app
  → новый evidence и новый gate decision
```

Сейчас большая часть стрелок либо существует только в тексте и кнопках, либо
подменена локальным state/mock/fallback.

---

## 3. Карта поверхности и первый признак раздувания

### 3.1. Sidebar

`ControlStationShell.tsx` объявляет **35 пунктов** в `NAV_ITEMS`:

- Обзор: 5;
- Архитектура: 5;
- CI/CD: 5;
- Безопасность: 6;
- Релизы: 4;
- Инфраструктура: 4;
- Управление: 6.

Отдельный `switch` реально подключает только часть пунктов. Для следующих
пунктов отдельного view нет, и они сваливаются в `default`, то есть снова
показывают `Overview`:

```text
sla
posture
services
brokers
capsules
templates
secrets
findings
compliance
manifests
environments
storage
agents
about
```

Это не просто недоделанная навигация. Это нарушение доверия к интерфейсу:
пользователь выбирает «Сервисы», а получает обзор системы.

### 3.2. Принцип очистки

Пока маршрут не имеет собственного domain-backed view и понятного действия,
его нельзя выдавать за готовый раздел. Варианты только три:

1. подключить реальную поверхность к основному сценарию;
2. временно скрыть её из primary navigation;
3. перенести в `graveyard / possible`, если она не нужна для ближайшего ядра.

---

## 4. Surface A: Control Station

### 4.1. Что оставить

Идея Control Station — правильная:

- плотная операторская поверхность;
- домен и окружение в контексте;
- приложения, пайплайны, прогоны, gates, evidence и релизы;
- переход к коду по конкретному repository/file/line;
- отдельный audit trail.

Это соответствует решению о двух поверхностях: Station для контроля, IDE для
изменения сценария и конфигурации.

### 4.2. Что сломано системно

`ControlStationShell.tsx` хранит `domain` и `env` как локальные preferences и
передаёт их только части дочерних экранов. Сам факт наличия select в header не
гарантирует, что каждый запрос использует выбранный контекст.

В сохранённом HTML зафиксирована ошибка:

```text
X-Cosmo-Domain header or domain_id query parameter required
```

`apiFetch()` в `api.ts` добавляет `Content-Type`, но не формирует обязательный
`X-Cosmo-Domain` и не имеет единого механизма domain context. В результате UI
может показывать «Все домены», а backend вправе отклонить запрос; либо один
экран работает, а другой получает другой контекст.

**Класс проблемы:** contract drift, не косметический UI-баг.

### 4.3. Домены и приложения

`Applications.tsx` даёт полезный каркас:

- список приложений;
- группы;
- домены;
- Git binding;
- создание и удаление.

Но он ещё не является полноценным менеджментом приложений:

- нет редактирования приложения;
- нет lifecycle/status management;
- нет команды и её ролей;
- нет истории build/release/deploy;
- нет привязанного pipeline как рабочего объекта;
- удаление — destructive delete, а не явно оформленный archive;
- нет проверки доступности выбранного forge/repository;
- нет ясного application detail screen.

`AppCreationWizard.tsx` объявляет **16 видов** приложений. Это выглядит как
самостоятельный каталог типов, но не показано, что каждый тип имеет отдельную
семантику, backend-валидацию и жизненный цикл.

Критический drift:

- wizard сообщает: «После создания будет автоматически скомпилирован дефолтный
  Plan»;
- `handleCreateApp()` вызывает только `api.createApp()` и `fetchData()`;
- вызова компиляции плана нет;
- `slug` принимается в форме, но в payload `createApp()` не передаётся.

Это пример интерфейса, который обещает действие, не выполняя его.

### 4.4. Настройки карточки и жизненный цикл: не вырезать вместе с mock

Исходный Cosmoport подтверждает, что **настройки конкретной карточки
приложения/репозитория являются частью рабочего ядра**. В
`Настройки_Карточки_1_уровень.html` зафиксированы:

- статус приложения;
- запуск unit-тестов, многопоточная сборка, безопасная передача секретов и
  автоматический запуск сборки;
- передача исходного кода и бинарных файлов;
- timeout развёртывания;
- custom pipeline сборки и custom pipeline развёртывания;
- lifecycle-конфигурация с включением/обязательностью шага и условием
  продолжения;
- шаги сборки, тестирования, документации, SAST/SCA/DAST и развёртывания;
- отдельные действия `Сохранить` для секций настроек.

В extracted structure это явно разделено на `Общие`, `Конфигурация жизненного
цикла` и `Мониторинг`; lifecycle содержит 14 наблюдаемых шагов, включая
`Сборка`, `Юнит-тестирование`, `SonarQube`, `Trivy`, `OWASP ZAP` и
`Развёртывание ПО`, а допустимые условия продолжения — `Продолжить` и
`Завершить при ошибке`. Reverse-engineering также фиксирует project settings
API (`GET/POST /api/settings`) и capability names вроде
`edit_project_settings`, `edit_custom_pipelines` и
`source_and_binary_transfer`.

Это не означает, что текущий `AppSettings.tsx` можно оставить. Он смешивает
наблюдаемую потребность с локальными 14 checkbox-ами, JIRA/ABAC/Vault и
несвязанным demo-state. Правильное решение:

- **KEEP / CORE:** настройки карточки приложения как domain-backed часть
  application detail;
- **REWORK:** lifecycle settings должны сохраняться через authoritative API и
  влиять на pipeline/build/deployment execution;
- **REMOVE:** `AppSettings.tsx` в текущем виде, его локальный state и
  неподтверждённые поля;
- **REMOVE FROM CONTRACT:** `HashiCorp Vault Path`, `VAULT/TOKEN` и прочая
  vendor-specific secret configuration;
- **VERIFY BEFORE KEEPING:** JIRA, ABAC и мониторинг. Они наблюдаются в
  исходном портале, но их точное место в минимальном Cosmoport2 operator flow
  должно быть отдельно согласовано, а не автоматически переноситься целиком.

Таким образом, формула не «удалить LC», а «вернуть настоящий LC карточки и
удалить его ложную локальную имитацию».

### 4.5. Что нужно достроить в приложениях

Минимальный application management:

1. карточка приложения с identity, domain, kind, level и owner/team;
2. один понятный Git binding с проверкой repository/branch;
3. lifecycle status и archive вместо безусловного удаления;
4. pipeline binding и default plan;
5. ссылки на build/run/release history;
6. права в контексте domain/team;
7. переход в IDE с реальным repository и default file;
8. backend-backed create/update/archive contract.

До появления этой основы 16 типов следует сократить до реально поддержанных
видов, а не расширять каталог.

---

## 5. Pipeline management

### 5.1. Что сейчас называется pipeline

`PipelineStudio.tsx` фактически работает с:

- `PipelinePlan`;
- каталогом `PipelineBrick`;
- выбором bricks;
- компиляцией плана;
- отображением последовательности bricks.

Это полезный кусок, но это ещё не полноценный pipeline management.

В primary flow отсутствуют или не связаны:

- pipeline entity и его identity;
- источник конфигурации в Git;
- branch/commit;
- trigger policy;
- runtime/runner;
- build record;
- artifacts;
- run history, связанная с pipeline;
- release input;
- ownership и access policy.

### 5.2. Бутафорские места

`PipelineStudio.tsx` содержит несколько misleading behaviours:

- «Live SSE» — локальный `setInterval`, а не серверный stream;
- статусы bricks генерируются циклом `pending → running → passed → failed`;
- drag-and-drop меняет только `dagOrder` в React state;
- порядок не сохраняется в API;
- cycle detection использует `selectedPlan.brick_ids`, а не изменённый
  `dagOrder`;
- кнопка «Запустить Run» только переводит пользователя на экран runs;
- экран не создаёт run из выбранного plan.

Получается хороший демонстратор DAG, но не control plane pipeline execution.

### 5.3. Решение

Сохранить:

- детерминированный plan;
- dependency validation;
- визуализацию DAG;
- compiled hash.

Перестроить:

- pipeline → plan → build → run как одну цепочку объектов;
- server-side status stream;
- сохранение DAG/configuration;
- связь каждого run с app, commit, plan, artifacts и evidence.

---

## 6. Git, builds и releases

### 6.1. Web IDE — зачем она нужна

В архитектурной задумке Web IDE должна быть второй поверхностью для:

- file tree;
- `.wire` и pipeline configuration;
- diff;
- commit;
- запуска соответствующего pipeline;
- перехода обратно к run/gate.

Это правильная роль. Но нынешняя реализация больше похожа на отдельный mock
editor, чем на IDE, встроенную в Cosmoport lifecycle.

### 6.2. Фактические проблемы Web IDE

`WebIDEShell.tsx`:

- имеет fallback tree с фиктивными файлами, если API не отвечает;
- при ошибке загрузки файла вставляет синтетический комментарий вместо честного
  состояния «файл недоступен»;
- не даёт нормального repo/branch picker;
- не показывает application/pipeline context как authority;
- имеет один активный файл, но не организует полноценные tabs/workspace;
- «Terminal & Pipeline Logs» — обычный div со строками, а не интерактивный
  terminal;
- `handleRunStep()` вызывает `api.saveRepoFile()`, после чего пишет
  `[SUCCESS] Step completed`; отдельного endpoint выполнения шага нет;
- `Commit & Run` отправляет hardcoded `plan_id: 'plan-steel'`;
- domain для `Commit & Run` выводится из первой части имени repository;
- нет доказательства, что выбранный файл и commit попали в запущенный plan.

### 6.3. Deep-linking не замыкает переход

`App.tsx` передаёт в Station:

```tsx
onNavigateToIDE={setIDEContext}
```

Но `setIDEContext()` в `DeepLinker.tsx` обновляет только IDE context и не
переключает `surface` на `ide`.

Обратный переход устроен аналогично: `setStationContext()` обновляет station
context, но сам по себе не переводит surface обратно в station.

Заявленный сценарий «finding/gate → строка в IDE» поэтому не гарантирован.

### 6.4. Releases: каркас есть, authority нет

`Releases.tsx` визуально содержит полезные элементы:

- release list;
- manifest nodes/edges;
- зоны `ЗР`, `ЗТ`, `ЗПЭ`;
- import/export;
- transfer wizard.

Но значительная часть этого каркаса не подтверждена backend:

- `DEFAULT_RELEASES` — локальные демонстрационные релизы;
- `getReleases()` при ошибке превращается в `[]`;
- `createRelease()` при ошибке всё равно добавляет объект локально;
- release signature при создании — `sha256:` от timestamp, а не подпись;
- commit node создаётся как `head-main`, а не как неизменяемый проверенный
  commit;
- выбранный состав релиза не доказывает происхождение из build artifacts.

`ReleaseTransferWizard.tsx` содержит ещё более серьёзные нарушения:

- `pendingBatches = Math.floor(Math.random() * 3)`;
- preflight получает gates без надёжной привязки к release/plan;
- `release.history.length > 0` принимается за наличие текущей подписи ИБ;
- кнопка продолжения не блокируется при проваленном preflight;
- из `ЗР` разрешён прямой выбор `ЗПЭ`, хотя канонический путь —
  `ЗР → ЗТ → ЗПЭ`;
- `authToken` проверяется на непустоту, но не отправляется в API;
- signature генерируется на клиенте из имени, release, zone и timestamp;
- при preview для `ЗПЭ` мутируется `release.manifest.edges` через `push()`;
- ГОСТ-Акт формируется клиентским HTML из текущего state, а не из evidence
  ledger и серверного audit record.

Это нельзя считать 2FA, approval или production transfer. Это UI-представление
будущего процесса.

### 6.5. Отсутствующие рабочие таблицы: Builds и Deployments

В текущей поверхности нет отдельных операторских таблиц для двух ключевых
сущностей. `RunControl` показывает общие прогоны и batches, а `Releases` —
релизный каркас; это не заменяет историю сборок и историю размещений.

Минимальная таблица **Builds** должна позволять открыть конкретную сборку и
увидеть:

```text
application · repository · branch · immutable commit
pipeline/plan · status · runner · artifacts
started_at · finished_at · actor
```

Минимальная таблица **Deployments** должна позволять проследить, что именно и
куда было размещено:

```text
release · exact build/artifact · source zone · target environment/zone
status · operator · started_at · finished_at · evidence · rollback
```

Без этих двух представлений оператор не может ответить на базовые вопросы:
«какой commit собран», «какие артефакты получены», «какая сборка пошла в
окружение», «кто и когда её разместил» и «на основании какого evidence это
разрешили».

---

## 7. RBAC_WHATAFAC: что это и зачем оно было сделано

### 7.1. Почему RBAC здесь вообще оказался

`RBAC_WHATAFAC.html` показывает экран:

```text
RBAC & Team Scope Management
12 ролей ЦБ · 5 активных пользователей
```

Боты попытались визуализировать модель:

```text
subject/user → role → team scope → permission → audit event
```

Но это не задача операторского портала. Cosmoport2 должен быть рабочей
поверхностью для управления приложениями, сборками, прогонами, gates, релизами
и деплоями. Администрирование ролей и публикация внутренней ролевой модели —
отдельный административный слой. Оператору не нужно знать, из каких ролей и
матриц состоит авторизация портала.

### 7.2. Что фактически реализовано

`RbacConsole.tsx` — локальный mock:

- 12 ролей объявлены константой `CBR_ROLES`;
- 6 пользователей объявлены в `mockMembers`;
- scopes — константа из 7 строк;
- permissions — константа из 7 строк;
- matrix генерируется через несколько `if`;
- add user меняет только `useState`;
- scope toggle меняет только `useState`;
- нет API-клиента;
- нет загрузки из PostgreSQL/backend;
- нет сохранения;
- нет audit event;
- нет server-side authorization;
- нет effective permission calculation;
- нет deny/inheritance/SoD;
- нет zone/team/application/repository scope;
- нет provenance к исходной ЦБ-матрице.

### 7.3. Почему экран нужно убрать, а не допиливать

Обычный placeholder честно говорит «не готово». Этот экран выглядит как готовая
security console и поэтому создаёт ложное ощущение, что управление ролями входит
в задачу портала.

Дополнительные признаки самовольной модели:

- экран заявляет 12 «ролей ЦБ», хотя рабочая модель проекта ещё проходит
  reconciliation и опирается на 5 базовых ролей со scoped bundles;
- права для большинства ролей принудительно `false`, без объяснения причины;
- `CI Bot` и внешний аудитор представлены обычными строками рядом с людьми;
- пример scopes (`cbr`, `payments`, `cards`) не согласован с полным именованием
  scopes в коде (`cbr-digit-rub`, `payments`, `cards`, `auth` и т. д.);
- imported `Edit`, `Switch` и часть задуманных affordances не превращаются в
  рабочий lifecycle доступа.

### 7.4. Санитарное решение по RBAC-экрану

**Не патчить текущий экран по месту и не оставлять его в Cosmoport2.**

Решение:

- **REMOVE FROM PORTAL:** весь экран `RBAC / Доступ`, список ролей,
  пользователи, scopes, permissions matrix и role-management affordances;
- **KEEP UNDER THE HOOD:** backend authorization по principal/capability/scope,
  без публикации ролевой модели в операторском UI;
- **OPTIONAL SEPARATE ADMIN PLANE:** отдельная административная консоль может
  появиться только как самостоятельный продуктовый scope, не как раздел
  Cosmoport2;
- **BLOCKER:** нельзя показывать mock RBAC, «12 ролей ЦБ» или любую другую
  внутреннюю матрицу как часть рабочего портала.

---

## 8. Поверхности, не входящие в операторский портал

Ниже не список будущих обещаний. Это санитарное решение по scope: данные,
необходимые для основного процесса, остаются внутри его сущностей; отдельные
экраны без операционной задачи из портала убираются.

### 8.0. `SLA`, `RBAC`, `SBOM`, `Vault` и прочая административная ширина

- **SLA** — убрать. В текущем продукте нет принятого SLA-процесса, ради которого
  оператору нужен отдельный dashboard.
- **RBAC / Team Scope Management** — убрать из Cosmoport2. Это админская
  поверхность, а не управление жизненным циклом приложения.
- **SBOM Explorer** — убрать как отдельный раздел. SBOM, если понадобится,
  является артефактом build/release/evidence и открывается из соответствующей
  сущности.
- **HashiCorp Vault Path** — удалить из UI, API-моделей и application settings.
  Конкретный секретный провайдер не утверждён и не должен протекать в продуктовый
  интерфейс. В операторском UI не должно быть поля с путём к Vault.
- **JIRA и ABAC** — observed fields исходного портала, но не автоматически
  обязательные элементы минимального flow; их нужно либо встроить в
  application settings с подтверждённым контрактом, либо не переносить.
- **Остальные настройки карточки** — не удалять: lifecycle, build/deploy
  behavior и application status относятся к domain-backed application detail.

### 8.1. `RunComparison`

`RunComparison.tsx` генерирует findings и batches локальными функциями
`generateFindings()` и `generateBatches()`. API используется только для списка
runs; фактический diff не строится из run artifacts/evidence.

**Решение:** убрать из primary UI. Возвращать только при наличии настоящего run
comparison contract и подтверждённой операторской задачи.

### 8.2. `Evidence`

`Evidence.tsx` получает runs, затем формирует `mockEntries` прямо в компоненте.
Кнопки экспорта показывают toast, но не обязательно создают соответствующий
SARIF/ГОСТ-артефакт.

**Решение:** evidence остаётся частью основного потока, но текущий mock не
выдавать за ledger. Экран можно вернуть только после backend-backed evidence
contract; отдельной декоративной поверхности для mock entries быть не должно.

### 8.3. `SbomExplorer`

`SbomExplorer.tsx` обещает «10 000+ packages», но генерирует 250 пакетов.
Версии и CVE случайные (`Math.random()`), backend source отсутствует.

**Решение:** убрать из портала. SBOM может жить как build/release artifact и
открываться из конкретного объекта, если появится реальный источник данных.

### 8.4. `GostConstructor`

Экран полезен как будущая форма документа, но:

- подпись — клиентская строка от имени и timestamp;
- контент живёт в React state;
- HTML генерируется в браузере;
- нет связи с release/evidence/gate decision;
- нет server-side signature или immutable record.

**Решение:** убрать из операторского портала. Документ может формироваться
сервером из evidence ledger, gate decision и audit record; ручной клиентский
конструктор не является частью основного control plane.

### 8.5. `EmergencyDeck`, `Analytics`, posture и прочие dashboards

Эти поверхности увеличивают ширину продукта и размывают цель. В Cosmoport2 их
не должно быть, пока отдельно не доказаны конкретный операторский use case,
data contract и место в основном процессе.

---

## 9. KEEP / REWORK / DELETE / MISSING / OPEN

### 9.1. KEEP

- разделение Control Station и Web IDE;
- domain/application/pipeline/build/run/gate/release/deployment vocabulary;
- идея evidence ledger;
- zones `ЗР → ЗТ → ЗПЭ`;
- compiled hash и dependency graph;
- переход findings/gates к конкретной строке кода;
- плотная операторская таблица для реально существующих сущностей;
- настоящий Git binding как часть application identity;
- отдельные таблицы Build и Deployment с provenance и статусами.

### 9.2. REWORK

- sidebar и route registry;
- application management;
- pipeline/plan/build/run relationship;
- Git repository/branch/commit context;
- Web IDE workspace and action boundaries;
- domain context propagation in every API call;
- releases and manifest provenance;
- transfer wizard and 2FA;

- evidence and report export.

### 9.3. DELETE / GRAVEYARD CANDIDATES

- RBAC matrix, role/user management and team-scope console;
- SLA dashboard and remediation widgets;
- SBOM explorer as a standalone screen;
- vendor-specific Vault settings and `HashiCorp Vault Path`;
- GOST constructor and client-generated compliance documents;
- random preflight batch status;
- fake Live SSE in Pipeline Studio;
- static run comparison findings/batches;
- client-generated fake signatures;
- empty routes which show Overview under another label;
- any surface that has no place in the application → build → run → release →
  deployment path.

### 9.4. MISSING

- one authoritative application detail model;
- pipeline entity and source configuration;
- first-class build record;
- first-class deployment record and deployment history;
- immutable commit/artifact provenance;
- real run execution contract;
- findings/evidence API and content references;
- backend gate decision authority;
- sequential release transfer authority;

- authenticated principal and capability enforcement;
- SoD and approval chain;
- real workspace context for Web IDE;
- honest error state instead of silent fallback to demos.

### 9.5. OPEN QUESTIONS

1. Является ли pipeline отдельной сущностью, или plan — его единственный
   исполняемый snapshot?
2. Что именно считается build: CI job, immutable artifact set или оба объекта?
3. Что именно считается deployment: запуск, факт размещения, promotion или
   отдельная запись поверх release?
4. Где живёт repo authority: Gitea/Forge adapter или Cosmo database?
5. Какие операции разрешены в каждой зоне и кто подписывает переход?
6. Должен ли Web IDE быть встроен в Cosmoport или ссылаться на PrettyK Editor
   как на отдельную поверхность?
7. Какие элементы из старого Cosmoport1 являются observed evidence, а какие не
   переносятся в новую модель?

---

## 10. Рекомендуемый порядок окультуривания

Порядок не про «сделать ещё больше экранов». Он про возврат доверия к одному
рабочему пути.

### Шаг 1. Спрятать ложную ширину

- убрать из primary sidebar маршруты без отдельного view;
- убрать RBAC, SLA, standalone SBOM, Vault settings и прочую административную
  ширину;
- отключить random SBOM и fake comparison;
- все fallback states явно маркировать как offline/demo или показывать ошибку;
- не добавлять новые визуальные эпики.

### Шаг 2. Зафиксировать доменный контракт

- domain context обязателен и передаётся единообразно;
- application, pipeline, plan, build, run, release и deployment имеют разные
  identity;
- каждый запрос получает authenticated principal и scope;
- frontend не считается authority.

### Шаг 3. Достроить application management

- application detail;
- Git binding;
- owner/team;
- pipeline binding;
- lifecycle;
- build/run/release history.

### Шаг 4. Замкнуть pipeline → build → run

- source commit;
- immutable plan snapshot;
- real execution status;
- artifacts;
- batches;
- findings/evidence;
- run detail.

### Шаг 5. Замкнуть gate → release → transfer

- policy and decision from backend;
- manual approval with real principal;
- SoD;
- manifest from exact build;
- sequential zone transition;
- signed evidence and audit record.

### Шаг 6. Только после этого возвращать вторичные surfaces

Analytics, standalone SBOM, comparison, emergency и GOST authoring не являются
частью утверждённого scope Cosmoport2. Если когда-нибудь появится отдельная
потребность, это будет новый owner decision и отдельная поверхность, а не
автоматическое возвращение вычищенного мусора в операторский портал.

---

## 11. Циклы ревью

### Cycle 1 — фактографический проход

Проверено:

- HTML действительно содержит отрисованный Cosmoport2 Control Station;
- sidebar содержит 35 пунктов;
- часть пунктов не имеет собственного view;
- application/pipeline/release/IDE/RBAC исходники содержат mock, fallback или
  client-only state;
- RBAC screen не делает backend запросов;
- `RBAC_WHATAFAC` не может считаться работающим контролем доступа.

Точечная сверка исходников подтвердила, что обработчик создания приложения живёт
в `Applications.tsx`, а не в wizard: он передаёт в `api.createApp()` identity,
domain, kind, level, group и Git binding, но не `slug`; отдельного вызова
компиляции Plan в этом пути нет.

### Cycle 2 — sanity gate

Проверки:

- не смешивать observed UI facts с продуктовыми рекомендациями;
- не считать число «50 %» измеренным фактом;
- не объявлять каждый extra screen бесполезным без data contract review;
- не называть клиентскую строку подписью;
- не называть локальный `setInterval` SSE;
- не называть route, который показывает Overview, реализованным разделом.

Результат: формулировки выше разделяют факты, severity и recommendation. Число
«50 %» оставлено только как исходное впечатление владельца, а не как измерение.

### Cycle 3 — scope gate перед инженерией

До любого патча требуется согласовать:

1. минимальный primary flow;
2. список поверхностей, которые скрываем;
3. authoritative application/pipeline/build/run/release model;
4. подтверждение, что RBAC остаётся backend/admin-plane concern и не входит в
   UI Cosmoport2;
5. domain context contract;
6. границы Web IDE;
7. что окончательно не возвращается в операторский портал.

Без этого новые патчи будут только полировать тот же обезьянник золотой краской.

Результат: scope gate пройден как review-ограничение. Документ фиксирует
необходимое сужение операторского портала, но не инициирует инженерные патчи и
не меняет backend/admin-plane authorization.

---

## 12. Итог для согласования

Cosmoport2 не нужно «допилить ещё двадцать экранов». Его нужно сначала
разгрузить и собрать вокруг одного доказуемого потока.

Рабочая формула на следующий раунд:

```text
меньше surface area
  + один authoritative domain context
  + приложение с Git binding
  + Build и Deployment как первоклассные объекты
  + pipeline → build → run
  + findings/evidence → gate
  + release из exact artifact
  + строгий transfer ЗР → ЗТ → ЗПЭ
  + Web IDE как исправление, а не отдельная игрушка
```

До отдельного owner-confirmation документ остаётся `evolve`. Код Cosmoport2 и
sealed-каноны по результатам этого review не изменяются.

---

## 13. Полный sanity verdict: режем до истоков

Этот раздел является итогом полного прохода по маршрутам, view-компонентам,
API-клиенту и исходному Cosmoport2 concept/backlog. Он **заменяет более ранние
мягкие формулировки** вроде «возможно, вернуть позже» и «оставить потребность
в access review console».

### 13.1. Что мы на самом деле хотели

Cosmoport2 нужен как минимальный операторский control plane для одного
доказуемого жизненного цикла:

```text
Application
  → Git binding
  → Application / lifecycle settings
  → Pipeline
  → Build
  → Run
  → Findings / Evidence
  → Gate decision
  → Release
  → Deployment / Transfer
```

Оператору нужны ответы на конкретные вопросы:

1. какое приложение и какой repository обслуживаются;
2. какой pipeline и какой immutable commit были запущены;
3. какая Build получилась и какие artifacts она создала;
4. какой Run выполнился и что показали проверки;
5. почему Gate разрешил или остановил движение;
6. какой Release создан из exact Build;
7. куда этот Release был размещён, кем, когда и с каким результатом.

Любая поверхность, которая не помогает ответить на один из этих вопросов,
не является частью минимального operator portal.

### 13.2. Финальная классификация 35 пунктов sidebar

| Route | Verdict | Что с ним делать |
|---|---|---|
| `domains` | KEEP, trim | Landing/overview по текущему domain context; без отдельной domain-admin выставки |
| `applications` | KEEP, rework | Главный реестр приложений; app detail, Git, pipeline/build/run/release/deployment history |
| `sla` | REMOVE | Убрать route, widget, API fallback и все SLA-метрики |
| `posture` | REMOVE | Убрать executive score/compliance dashboard |
| `analytics` | REMOVE | Убрать trend dashboard из operator portal |
| `topology` | EMBED or REMOVE | Только read-only часть application detail; отдельный graph editor не нужен |
| `services` | REMOVE | Пустой fallback на Overview |
| `brokers` | REMOVE | Внутренняя execution-инфраструктура, не UI portal |
| `capsules` | REMOVE | Нет подтверждённой операторской задачи |
| `templates` | REMOVE | Не самостоятельная сущность основного потока |
| `pipelines` | KEEP, rework | Реальная pipeline definition и plan; без fake Live SSE и fake reorder |
| `runs` | KEEP, rework | Run history + master/detail; сюда входят batches, logs, findings, evidence |
| `compare` | REMOVE | Нынешний экран генерирует статический diff из mock data |
| `catalog` | EMBED or REMOVE | Brick definitions — внутренность pipeline editor, не отдельный CRUD-раздел |
| `secrets` | REMOVE | Секреты не являются операторской страницей |
| `gates` | KEEP, rework | Decision inspector и реальные approve/block actions |
| `gate-policy-builder` | EMBED or REMOVE | Политика — часть настройки pipeline/gate, не отдельный большой эпик |
| `evidence` | EMBED | Evidence открывается из Run/Gate/Release; standalone screen только при реальном ledger API |
| `findings` | EMBED | Findings открываются из Run/Gate, не отдельная пустая навигация |
| `compliance` | REMOVE | Нет принятого compliance-продукта в scope |
| `emergency` | REMOVE | Mock emergency admin и mock rollback не являются portal-функцией |
| `releases` | KEEP, rework | Release из exact Build и последовательный transfer |
| `manifests` | EMBED | Manifest — часть Release detail |
| `environments` | EMBED | Environment/zone — контекст Deployment/Transfer, не отдельный каталог |
| `promotion` | REMOVE | Дубликат Release Transfer, плюс полностью локальный kanban mock |
| `storage` | REMOVE | Инфраструктурная деталь, не operator workflow |
| `agents` | REMOVE | Внутренняя runtime-инфраструктура |
| `sbom` | REMOVE | Только artifact/evidence при наличии реального источника |
| `log-viewer` | EMBED | Реальные логи открываются у конкретного Run/Batch; глобальный synthetic viewer убрать |
| `audit` | EMBED or separate admin plane | В операторском UI только история конкретного объекта; общий audit — не core portal |
| `rbac` | REMOVE | Админская плоскость; роли и матрица не показываются оператору |
| `gost` | REMOVE | Нет ручного client-side compliance constructor |
| `settings-dev` | REWORK / RENAME | Текущий route и `AppSettings.tsx` удалить как mock; заменить настоящими настройками карточки приложения и lifecycle |
| `settings` | EMBED or REMOVE | Не оставлять пустой route; настройки должны быть вкладкой application detail, а не маскировкой Overview |
| `about` | REMOVE | Не рабочая функция |

Итого в primary navigation остаются только: **Overview, Applications,
Pipelines, Runs, Gates, Releases**. `Builds` и `Deployments` должны быть
добавлены как реальные рабочие представления, а не заменяться batches или
канбаном: либо отдельными разделами, либо вкладками application/release detail.

### 13.3. Что удалить из кода, а не только из sidebar

Sanity относится к реализации, поэтому удаление маршрутов недостаточно.
Следующий мусор должен быть вычищен из Cosmoport2 как source surface:

- `RbacConsole.tsx`: роли, mock users, scopes, permission matrix и add-user UI;
- `SlaRemediationWidget.tsx`, `getSlaMetrics()` и SLA-поля в posture DTO;
- `SbomExplorer.tsx` и генерация случайных packages/CVE;
- `PromotionBoard.tsx` и его случайные/локальные release cards;
- `EmergencyDeck.tsx` и локальный mock rollback;
- `LogViewer.tsx` с 5000 синтетических строк;
- `RunComparison.tsx` с `generateFindings()`/`generateBatches()`;
- `GostConstructor.tsx` с клиентским HTML и псевдоподписью;
- `ExecutivePostureWidget.tsx`, synthetic compliance score и client-side reports;
- `Analytics.tsx` и все поверхностные trend/SLA widgets;
- `AppSettings.tsx` целиком как текущую mock-реализацию; при этом не удалять
  саму domain-backed настройку карточки и lifecycle;
- `HashiCorp Vault Path`, `vault_path`, `VAULT/TOKEN`, `Vault Policy` и
  vendor-specific secret paths из UI/API-контрактов;
- `AlertHUD.tsx` в текущем виде: simulated transfer/vulnerability alerts и
  random timestamps; уведомления возможны только из настоящего event stream;
- пустые маршруты, которые попадают в `default` и возвращают Overview;
- client-generated signatures, random preflight state и offline success
  fallbacks, которые делают вид, что операция состоялась.

### 13.4. Что не удаляем, но перестаём считать отдельными продуктами

- **RBAC:** остаётся только внутренней backend authorization concern, если она
  нужна для защиты API. Никаких ролей в sidebar и никакой матрицы в portal UI.
- **SBOM:** остаётся возможным artifact конкретного Build/Release, но не
  explorer и не отдельный раздел.
- **Logs:** остаются частью Run/Batch detail, если приходят от реального runner.
- **Findings/Evidence:** остаются результатом Run и основанием Gate, а не
  локальными демонстрационными таблицами.
- **Zone/environment:** остаются атрибутами Release/Deployment.
- **Audit:** остаётся серверной историей действий по объекту; админский полный
  журнал — за пределами минимального operator portal.

### 13.5. Обязательное ядро, которого сейчас нет

Нельзя продолжать строить вторичные screens, пока не появились:

1. `Build` с application, repository, branch, immutable commit, pipeline/plan,
   status, artifacts и timestamps;
2. `Deployment` с exact build/artifact, release, source/target environment,
   status, operator, evidence, rollback и timestamps;
3. application detail, связывающий эти объекты;
4. pipeline definition, привязанный к application и source configuration;
5. реальный Run execution и event/log stream;
6. findings/evidence из фактического результата Run;
7. Gate decision, который ссылается на конкретный Run/evidence;
8. Release, который создаётся из конкретного Build;
9. Transfer, который не может перескочить через обязательную зону;
10. честные ошибки вместо fallback на demos.

### 13.6. Кандидат на пересмотр sealed-документов

Полный проход обнаружил, что пересматривать нужно не только frontend:

- в `CONCEPT.md` убрать `Admin`, `Catalog`, `Members`, `Integrations` и
  ошибочную трактовку `LC` как отдельной широкой админской эпики; сохранить
  настройки lifecycle внутри карточки приложения;
- в `backlog.md` снять карточки и DoD, которые строят эти поверхности;
- из модели сущностей вывести Build и Deployment как явно обязательные объекты
  либо зафиксировать их как часть Run/Release с полноценной историей;
- убрать vendor-specific `OpenBao/HashiCorp Vault` из пользовательского
  контракта и оставить только внутренний механизм, если он вообще понадобится;
- зафиксировать, что RBAC/roles/team scopes — отдельная admin-plane/backend
  concern, не экран Cosmoport2.

Это **кандидат на новый 2FA-ритуал для изменения sealed Cosmoport2 canon**.
Никакие sealed-файлы этим review автоматически не изменяются.