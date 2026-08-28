# PrettyK Authoring Workbench: Editor ↔ Studio

> **Статус:** `research / evolve` — концептуальный документ, не CANON и не backlog.
>
> **Дата:** 25 августа 2026 года  
> **Владелец направления:** Максим  
> **Автор концепта:** Keeper  
> **Связанные материалы:** [`2026-08-25-editor-command-center-concept.md`](2026-08-25-editor-command-center-concept.md), [`STUDIO-EDITOR-SPLIT-ARCHITECTURE.md`](../friend-requests/STUDIO-EDITOR-SPLIT-ARCHITECTURE.md), [`STUDIO-CORE-REDESIGN.md`](../friend-requests/STUDIO-CORE-REDESIGN.md)

---

## 0. Короткий ответ

Да: **Editor и Studio должны работать в одной живой рабочей сессии и редактировать одни и те же сущности.**

Но это не две независимые сессии и не два редактора, которые случайно показывают один JSON. Это две проекции одного `CheckWorkspace`:

```text
                         CheckWorkspace
                    /        |          \
                   /         |           \
              Studio      Editor      Browser Stage
            (визуально)   (DSL-код)    (живая сессия)
                   \         |           /
                    \        |          /
                       один Wired / draft
```

**Studio** — визуальный Action Hub: создать, импортировать, настроить и связать сущности.  
**Editor** — конкурентное рабочее место написания и отладки сценария: DSL, навигация, запуск, diff и связь с браузером.  
**Browser Stage** — не всплывающий довесок, а рабочая поверхность той же сессии, где действие можно записать в сценарий.

Ценность PrettyK — не в том, что внутри стоит scanner. scanner — один из адаптеров runtime. Ценность — в том, что оператор быстро получает работающий, понятный и воспроизводимый web-автотест, не прыгая между пятью разными инструментами.

---

## 1. Продуктовый тезис

> **PrettyK — это рабочее место для создания web-автотестов: от намерения и живого браузера до исполняемого сценария, результата и доказательства.**

Editor может и должен стать конкурентным продуктом. Не за счёт копирования VS Code, Playwright Inspector или Burp, а за счёт сквозного удобства:

- открыть приложение в Browser Stage;
- сделать действие руками или выбрать его через discovery;
- получить понятный шаг PrettyK DSL;
- увидеть, к какой сущности и странице он относится;
- изменить шаг кодом или визуально;
- запустить один шаг, сценарий или всю проверку;
- увидеть ошибку рядом с причиной;
- сравнить текущую работу с последней зафиксированной версией;
- вернуться к конкретному run, evidence или finding.

Это не «security-dashboard с Monaco». Это **authoring product для web-автотестов**, которому security-адаптеры дают дополнительную мощность.

### 1.1. Роль scanner

scanner не должен определять интерфейс Editor. В продуктовом слое пользователь думает о:

- проверке;
- сценарии;
- браузерном действии;
- API-запросе;
- целевом окружении;
- результате и доказательстве.

На runtime-слое PrettyK может подключать Playwright, scanner, фуззер, Grid и другие адаптеры. Адаптер не становится центром authoring-модели только потому, что он технически мощный.

---

## 2. Что такое Studio и что такое Editor

### 2.1. Studio — Visual Action Hub

Studio отвечает на вопрос:

> «Какие сущности есть в проверке и как я их создаю и настраиваю?»

В Studio оператор работает с:

- проверкой и её метаданными;
- страницами и сценариями;
- ресурсами и тестовыми данными;
- профилями авторизации;
- API-модулями;
- коннекторами;
- настройками окружения;
- импортом из HAR, OpenAPI и других поддержанных источников;
- визуальными параметрами запуска.

Studio не обязана показывать весь DSL. Её сила — быстро собрать рабочий контекст, создать сущность, проверить конфигурацию и дать оператору ясную точку входа.

### 2.2. Editor — DSL Authoring Workbench

Editor отвечает на вопрос:

> «Что именно должен сделать сценарий, в каком порядке и как я это проверю?»

В Editor оператор получает:

- чистый PrettyK DSL;
- дерево сущностей и файлов;
- вкладки сценариев, страниц и ресурсов;
- подсказки, диагностику и навигацию по DSL;
- связь строки с execution step;
- Browser Stage;
- запуск текущего шага, продолжение с позиции и запуск сценария;
- inline-состояния выполнения;
- diff между текущим черновиком и версиями;
- историю сохранённых изменений;
- переходы к run, finding и evidence.

Editor — не «режим WireK». `Wired` остаётся внутренним исполняемым контрактом. Пользователь работает с PrettyK и сущностями, а перевод в Wired происходит под капотом.

### 2.3. Две поверхности, одна задача

Studio и Editor не конкурируют друг с другом внутри продукта. Они конкурируют **вместе** с неудобными цепочками из разрозненных инструментов.

```text
                 неудобная цепочка
  браузер → DevTools → ручной код → отдельный runner → отдельные логи

                 PrettyK Authoring Workbench
  Browser Stage ↔ Studio ↔ Editor ↔ Run ↔ Evidence
```

---

## 3. Единая модель `CheckWorkspace`

### 3.1. Каноническая граница

У рабочей области проверки должен быть один владелец данных:

```text
CheckWorkspace
├── check identity and metadata
├── Wired document / execution model
├── scenarios
├── pages and discovered locators
├── resources and resource contents
├── auth profiles and connectors
├── current draft revision
├── committed revisions
├── active browser session reference
└── run references and evidence links
```

`EditorWorkbench` — shell и координатор рабочей области. Он не должен самостоятельно создавать вторую модель сценария, живущую отдельно от `formData` / Wired.

Каноническая логика, уже накопленная в `StudioWorkspace`, должна быть переиспользована. В текущем коде именно `StudioWorkspace` умеет:

- принимать `formData`;
- эмитить `onFormDataChange`;
- работать с реальными вкладками и деревом;
- синхронизировать Monaco-модели с данными проверки;
- писать изменения через существующий persistence flow.

Новый Workbench должен стать оболочкой над этим контрактом, а не новым источником истины.

### 3.2. Чего не должно быть

Запрещённая схема:

```text
Studio → formData → Wired
Editor → локальный code → отдельный ScenarioDeckStore
Browser → ещё одна копия шагов
```

Такая схема быстро создаёт расхождение:

- Studio показывает один сценарий;
- Editor — его старый снимок;
- Browser записывает третий вариант;
- при сохранении последняя вкладка молча перетирает предыдущие изменения.

Это не конкурентный продукт, а маленький вежливый конфликт за право быть правдой.

Правильная схема:

```text
Studio ───────┐
Editor ───────┼──> Workspace mutation → draft revision → persistence
Browser Stage ┘
```

### 3.3. `StudioV2` и локальные модели

Локальная модель вроде `ScenarioDeckStore` может оставаться UI-моделью для графа, пилюль и debugger-состояний. Она не должна становиться второй канонической копией проверки.

Правило простое:

- UI-модель может ускорять рендеринг;
- UI-модель может временно держать selection, expanded state и telemetry;
- бизнес-изменение обязано пройти обратно в `CheckWorkspace`;
- после reload источник восстанавливается из сохранённой рабочей области, а не из случайного локального снимка.

---

## 4. Studio и Editor в одной сессии

### 4.1. Ответ на вопрос о «конкурентной сессии»

Если под «конкурентной» имеется в виду **одновременная работа обеих поверхностей**, то да: Studio и Editor должны быть частями одной активной сессии.

Точнее, это не две конкурентные сессии, а:

> **одна `WorkspaceSession` с несколькими взаимосвязанными поверхностями.**

Переключатель `[ Studio | Editor ]` меняет не источник данных, а активную проекцию рабочей области.

```text
WorkspaceSession: ws-42
├── activeCheck: check-17
├── baseRevision: rev-12
├── workingRevision: draft-19
├── surface: studio | editor | browser | results
├── openDocuments: [...]
├── activeDocument: scenario-login
├── dirty: true | false
└── browserRuntimeRef: browser-session-8
```

### 4.2. Пример сквозного изменения

1. В Studio оператор создаёт сценарий `Login flow`.
2. В Editor этот сценарий появляется в Explorer и открывается вкладкой.
3. В Browser Stage оператор открывает страницу логина.
4. Клик по `Email` записывается в draft сценария.
5. В Editor появляется новый DSL-шаг.
6. В Studio дерево и карточка сценария сразу видят обновлённый состав.
7. Оператор меняет selector или assertion в Editor.
8. Browser Stage использует уже обновлённый draft при повторном запуске.
9. После проверки оператор фиксирует рабочий набор как новую версию.

Нигде не требуется экспортировать JSON из одной части приложения и импортировать его в другую.

### 4.3. Несколько вкладок или несколько клиентов

В одной вкладке браузера изменения должны применяться сразу.

Для нескольких вкладок или пользователей нужен optimistic concurrency control:

- каждая рабочая копия знает `baseRevision`;
- mutation отправляет `baseRevision` или `expectedVersion`;
- сервер принимает изменение только при совпадении базы;
- при конфликте UI показывает diff и предлагает merge / reload / сохранить как новую ветку;
- молчаливое перетирание чужой работы запрещено.

На первой реализации достаточно одного writer на workspace и честного сообщения о конфликте. Полноценное collaborative editing не нужно притворно обещать заранее.

---

## 5. Сущности и их жизненный цикл

### 5.1. Бизнес-сущности

| Сущность | Смысл | Кто редактирует |
|---|---|---|
| `Check` | Проверка как продуктовый объект | Studio, Editor, History |
| `Scenario` | Исполняемая последовательность действий и проверок | Editor, Studio |
| `Page` | Страница, модель страницы и discovered locators | Studio, Editor, Browser Stage |
| `Resource` | Данные, словари, JSON, HAR, proto, properties | Studio, Editor |
| `AuthProfile` | Профиль входа и авторизационный контекст | Studio, Editor через ссылки |
| `Connector` | Подключение к внешней системе | Studio |
| `ApiModule` | Описанный API-источник или цепочка | Studio, Editor через вызов |
| `BrowserSession` | Живая браузерная сессия runtime | Browser Stage, Run |
| `Run` | Конкретное исполнение версии или draft | Editor, Monitor, Results |
| `Evidence` | Доказательство результата с provenance | Run, Results, Editor |

`Wired` — не отдельная пользовательская сущность, а сериализуемый machine-контракт этих данных для runtime.

### 5.2. Рабочая сессия и сохранённые данные

Нужно различать четыре уровня:

| Уровень | Что хранит | Где истина |
|---|---|---|
| UI layout | ширины панелей, активную вкладку, плотность | localStorage допустим |
| Workspace session | открытые документы, surface, cursor, browser reference | серверная сессия + безопасный локальный cache |
| Draft | текущие изменения проверки | сервер / CheckWorkspace |
| Commit | неизменяемую зафиксированную версию | серверная история проверки |

Текущий `frontend/src/workbench/workspaceStore.ts` правильно подходит для layout-state. Его `localStorage` не должен расширяться до хранения истины сценариев, runs, secrets или findings.

---

## 6. Модель сохранения: не Git, но знакомая семантика

### 6.1. Да, нам нужна модель «коммита»

Пользователю полезна знакомая и честная модель:

```text
HEAD / последняя версия
          ↓
      working tree
          ↓
      изменения draft
          ↓
   «Зафиксировать версию»
          ↓
     новый commit
```

Это **не означает, что мы превращаем PrettyK в Git-репозиторий**. Мы берём понятную семантику checkpoint, history и diff, но сохраняем доменную модель продукта.

### 6.2. Autosave и commit — разные вещи

Нельзя заставлять оператора нажимать commit после каждого символа. Поэтому нужны два уровня:

#### Сохранение черновика

- происходит автоматически с debounce и по явной команде «Сохранить черновик»;
- не теряет работу при обновлении страницы или закрытии окна;
- помечает workspace как `draft` / `dirty`;
- не создаёт новую публичную версию для каждого Backspace;
- проходит обычную валидацию контракта;
- не содержит plaintext-секретов в локальном UI-кеше.

#### Фиксация версии

- явное действие оператора: «Зафиксировать версию» / `Create checkpoint`;
- создаёт immutable revision;
- получает сообщение, автора, время и provenance;
- становится базой для следующего diff;
- может быть использована для reproducible run;
- не переписывает старую историю.

В интерфейсе можно оставить слово **Commit**, если рядом ясно написано, что это commit версии проверки, а не Git commit исходного репозитория.

### 6.3. Предлагаемые состояния

```text
new
  → draft
  → validated
  → committed
  → running
  → completed | failed
```

Состояние `dirty` — это не статус проверки, а признак расхождения `working tree` с последним commit.

Пример шапки Editor:

```text
CHECK  Login regression
TARGET https://demo.local
BASE   commit c-17 · «Добавлен вход пользователя»
STATE  Draft · 4 изменения не зафиксированы
        [Validate] [Save draft] [Commit] [Run]
```

### 6.4. Минимальная сущность commit

Концептуально commit должен содержать:

```text
Commit
├── commit_id
├── check_id
├── parent_commit_id
├── author_id
├── message
├── created_at
├── source: studio | editor | browser | import | api
├── wired_snapshot_ref
├── changed_entity_ids
├── content_hash
├── schema_version
└── provenance
```

Секреты не должны попадать в commit в открытом виде. В commit сохраняются ссылки на secret references и redacted diff, а не значения токенов и паролей.

### 6.5. Откат

Откат не удаляет историю и не переписывает прошлый commit. Он создаёт новый draft или новый commit с содержимым выбранной версии:

```text
c-17 → c-18 → c-19
              ↑
        restore c-17
              ↓
             draft
              ↓
             c-20
```

Так сохраняется честная история: видно, что оператор вернулся назад и почему.

---

## 7. Diff как главная функция удобства

### 7.1. Два diff одновременно

PrettyK нужен не только текстовый diff JSON. Нужны два представления одного изменения:

1. **Text diff** — знакомый diff DSL и ресурсов.
2. **Semantic diff** — человеческое описание изменения сущностей и поведения.

Пример:

```text
SCENARIO Login flow
  + добавлен шаг Click «Войти»
  ~ изменён locator поля Email
  ~ assertion: статус 200 → статус 302

RESOURCE users.json
  + добавлена строка test-user
```

В Editor текстовый diff открывается рядом с Monaco. В Studio тот же diff может быть карточками изменений. Это один diff engine, а не два разных отчёта.

### 7.2. Что сравниваем

Diff должен уметь сравнивать:

- working draft с последним commit;
- два commit;
- commit с импортированным источником;
- две версии сценария;
- две версии ресурса;
- run input с фактически исполненным snapshot;
- две версии результата и findings.

Для сценария полезно показывать цепочку:

```text
entity diff
  → DSL diff
  → execution diff
  → run result diff
```

### 7.3. Почему нельзя сравнивать только Wired

Wired удобен runtime, но плох как единственное пользовательское представление изменений. Простое сравнение большого JSON даст шум:

- переместились поля;
- изменился порядок массивов;
- добавились служебные значения;
- внутренние идентификаторы создали ложный diff;
- пользователь не понимает, что реально поменялось.

Поэтому нужен semantic diff поверх доменных сущностей. Wired diff может оставаться диагностическим и использоваться для отладки контракта.

### 7.4. Diff и approval

Любое предложение AI, импорт, discovery merge или массовое изменение должно приходить как diff:

```text
suggestion → diff → review → apply to draft → validate → commit
```

AI, Browser Recorder и импорт не получают права тихо менять scope, policy или чувствительные параметры.

---

## 8. Browser Stage в этой модели

### 8.1. Browser Stage — часть workspace, не shutter

Браузер должен быть постоянной рабочей поверхностью Editor, а не временным нижним drawer или случайной картинкой справа.

Режимы компоновки:

```text
Author:  Editor 60–65% │ Browser Stage 35–40%
Record:  Browser 55–60% │ Editor 40–45%
Debug:   Editor 50%     │ Browser 50%
Focus:   Editor 100%    │ Browser hidden, session alive
```

Нижняя панель остаётся для Problems, Output, Timeline, Evidence и Run Console. Она не должна быть единственным местом жизни браузера.

### 8.2. Одна браузерная сессия

Главное правило:

> **Editor Browser Stage и runner attach-ятся к одной `BrowserSession`, а не запускают два независимых браузера.**

Возможные режимы Playwright Browser Core:

- `launch()` для автономного запуска;
- `connectOverCDP()` для живой операторской Chrome-сессии;
- отдельные `BrowserContext` для ролей и изоляции, если это требуется сценарием.

Browser Stage показывает и изменяет тот же runtime-контекст, к которому потом может подключиться run/debugger. Если запуск требует чистого контекста, это должно быть явным действием, а не скрытым клонированием.

### 8.3. Запись действий

Запись не должна выдавать бездумный поток CSS-селекторов. Она должна:

1. получить действие через Discovery Engine;
2. построить role-first locator candidate;
3. показать оператору предварительный DSL-шаг;
4. дать возможность отредактировать смысл и locator;
5. добавить изменение в draft;
6. показать diff.

Пример:

```text
Browser click
  → proposed: Click role=button name="Sign in"
  → preview: Click "Войти"
  → apply to draft
  → diff: + 1 step
```

Запись действия — предложение, а не мгновенная подмена всего сценария.

---

## 9. Архитектурный поток изменений

### 9.1. Общий mutation pipeline

```text
User action
    ↓
Surface adapter
(Studio / Editor / Browser)
    ↓
Domain mutation
(add step, update locator, rename resource)
    ↓
Workspace reducer / command
    ↓
Draft validation
    ↓
Semantic diff + dirty state
    ↓
Draft persistence
    ↓
optional explicit commit
    ↓
run from immutable snapshot
```

Поверхность UI не должна сама собирать полный JSON «как получится». Команды должны быть доменными и понятными:

```text
addScenario
updateScenarioStep
updatePageLocator
renameResource
attachAuthProfile
changeTargetScope
```

Текущий callback `onFormDataChange` можно сохранить как переходный boundary. Но внутри новой рабочей модели изменения должны постепенно становиться семантическими mutations, а не бесконтрольными полными заменами документа.

### 9.2. Persistence boundary

Целевая схема:

```text
PostgreSQL — истина CheckWorkspace, drafts, commits, runs, metadata
Valkey      — cache, locks, pub/sub telemetry
Object store / box storage — snapshots, artifacts, evidence
localStorage — только layout и безопасные UI preferences
```

В текущем frontend CheckStore и `/api/checks` остаются переходным persistence flow. Это не повод делать localStorage источником истины. Переход на продуктовую серверную модель должен сохранить те же контракты workspace и revision.

### 9.3. Run всегда привязан к версии

Run нельзя запускать «из воздуха». Он должен знать, из какого состояния был создан:

```text
Run
├── run_id
├── check_id
├── source_revision: commit_id | draft_revision_id
├── target_snapshot
├── policy_version
├── runtime/tool versions
├── actor
├── artifacts
└── evidence links
```

Если оператор запускает грязный draft, UI честно показывает: `Run from draft`. Для воспроизводимого запуска нужен commit или immutable draft snapshot.

---

## 10. Глобальный UI нового Editor

### 10.1. Шапка

Шапка должна объединить старую хорошую Studio/Editor-связку с новым Workbench:

```text
PrettyK  /  Check: Login regression

[ Studio | Editor ]   [Validate] [Save draft] [Commit] [Run ▾]

Draft · 4 changes     Target: demo.local     Browser: attached
```

Переключатель `[ Studio | Editor ]` — глобальный режим рабочей области, а не локальная декоративная кнопка внутри одной из панелей.

### 10.2. Explorer

Explorer общий для обеих поверхностей:

```text
Check
├── Scenarios
│   ├── Login flow
│   └── Checkout flow
├── Pages
├── Resources
├── Auth profiles
├── API modules
└── Connectors
```

В Studio клик открывает visual card или form. В Editor тот же объект открывается как DSL-документ, resource editor или read-only metadata view — в зависимости от типа сущности.

### 10.3. Где живёт создание

Создание сложных сущностей остаётся в Studio и через Explorer/command palette. Editor не должен превращаться в форму из двадцати кнопок.

Но Editor может создать простой авторский объект прямо по естественному действию:

- новый сценарий;
- новый шаг;
- новый assertion;
- новая переменная;
- запись Browser action.

Это не противоречит Studio Action Hub. Разница в том, что Studio создаёт и настраивает сущности как визуальные объекты, а Editor создаёт авторские элементы потока.

---

## 11. Что уже есть и какой разрыв закрываем

### Уже есть

- `StudioWorkspace` с живой связкой `formData` → `onFormDataChange`;
- глобальный `studioMode: 'front' | 'editor'` в старом `App`;
- реальное дерево и вкладки Studio;
- Monaco-модели и PrettyK language plumbing;
- отдельный `EditorWorkbench` shell;
- layout store Workbench с localStorage только для UI-состояния;
- Playwright Browser Core с launch и CDP attach-контрактами;
- check registry и remote persistence flow;
- draft/dirty guard в старом жизненном цикле проверки.

### Разрыв

Сейчас новый standalone `EditorWorkbench`:

- обходит старый header и его `[ Studio | Editor ]`;
- читает `check.wired` в локальный snapshot;
- извлекает шаги в локальный `code`;
- ещё не отдаёт Monaco-изменения обратно в канонический workspace;
- не получает от `AppShell` полноценные save/run/form-data callbacks;
- не имеет revision/commit/diff boundary.

### Направление закрытия

Сначала нужно объединить рабочую область и persistence boundary. Потом на неё насаживаются Browser Stage, recorder и премиальные IDE-возможности.

Не наоборот. Красивый Workbench, который не сохраняет изменения в тот же Wired, — это хороший макет и плохой продукт.

---

## 12. Фазы развития

### Фаза A — один workspace

- вынести `CheckWorkspace`-состояние на уровень shell;
- передать в Workbench `formData`, resources и callbacks;
- вернуть глобальный `[ Studio | Editor ]`;
- оставить `StudioWorkspace` канонической реализацией редактирования;
- убрать локальную авторскую копию `code` из роли источника истины;
- обеспечить round-trip: Editor → Wired → Studio → Editor.

### Фаза B — draft persistence

- добавить понятный dirty state;
- разделить layout cache и business draft;
- сохранять draft на сервере;
- восстанавливать открытый workspace после reload;
- добавить conflict check по revision/version;
- запретить plaintext secrets в draft cache.

### Фаза C — commit и semantic diff

- immutable revision/checkpoint;
- сообщение и автор commit;
- diff draft ↔ HEAD;
- text diff + semantic diff;
- restore как новая ветка истории;
- run от immutable snapshot.

### Фаза D — Browser Stage

- единая browser session reference;
- persistent stage с режимами Author/Record/Debug/Focus;
- action recording через discovery proposal;
- code ↔ browser highlighting;
- шаг → browser action → run → evidence.

### Фаза E — конкурентный Editor

- PrettyK language intelligence;
- быстрый запуск шага и сценария;
- debugger/replay;
- pipeline preview;
- evidence-linked editor;
- command palette;
- AI только в виде suggestion → diff → approval.

---

## 13. Будущий Electron-клиент

Electron здесь **не является текущей архитектурной целью**. Максим имел в виду будущий desktop-клиент коробки — когда web-продукт и его контракты уже стабилизированы.

Правильная позиция:

> Сначала строим сильный web Editor и коробочные сервисные контракты. Потом Electron становится клиентом к той же рабочей области, а не отдельной веткой продукта.

### 13.1. Что Electron может дать потом

- единый desktop launcher коробки;
- локальный lifecycle Docker/Playwright/Chromium-сервисов;
- native file dialogs и безопасный доступ к локальным ресурсам;
- более естественный embedded Browser Stage через `WebContentsView`;
- offline/airgap UX без ручного открытия нескольких URL;
- системные уведомления и управление процессами коробки.

### 13.2. Что Electron не должен менять

Electron не должен создавать отдельную доменную модель:

- те же `CheckWorkspace`;
- те же draft и commit semantics;
- тот же Wired machine-contract;
- тот же BrowserSession attach boundary;
- тот же diff и provenance;
- тот же UI-level security policy.

Нельзя сначала сделать Electron-специфический редактор, а потом пытаться совместить его с web-версией. Это был бы новый обезьянник, только с tray icon.

### 13.3. Приоритет

Electron — отдельный поздний слой упаковки. Он не должен блокировать:

- Studio ↔ Editor integration;
- draft persistence;
- commit/diff;
- Browser Stage;
- общий authoring UX.

---

## 14. Жёсткие продуктовые правила

1. **Studio и Editor — две проекции одной CheckWorkspace.**
2. **Никаких двух независимых источников истины для сценария.**
3. **Wired — внутренний machine-contract, не пользовательский режим.**
4. **LocalStorage хранит layout, но не проверку, secrets, runs или findings.**
5. **Autosave draft не равен commit.**
6. **Commit — доменный checkpoint PrettyK, не Git commit репозитория.**
7. **Каждый commit immutable и имеет provenance.**
8. **Каждый run привязан к revision или immutable draft snapshot.**
9. **Diff показывает и текст, и смысл изменения.**
10. **Browser Stage и runner используют одну browser session, если оператор явно не запросил чистый контекст.**
11. **Discovery и AI предлагают изменения через diff, а не молча переписывают документ.**
12. **Сначала сохраняем рабочую интеграцию `StudioWorkspace`, потом переносим её внутрь нового shell.**
13. **Electron — будущий клиент коробки, не причина сейчас переписывать web-архитектуру.**

---

## 15. Итог

Мы планируем именно это: **одна рабочая сессия, один draft, одна история версий, две сильные поверхности authoring.**

Studio даёт скорость сборки и понимание сущностей. Editor даёт конкурентное преимущество в написании, отладке и сопровождении web-автотестов. Browser Stage соединяет намерение с реальным приложением. Commit и diff превращают хаотичное «ну я тут покликал» в понятную историю изменений.

Следующий архитектурный шаг — не добавлять ещё один красивый экран, а вернуть новому Workbench живую связь с уже существующим canonical `formData` / Wired-потоком. После этого Editor можно наращивать всерьёз: как продукт, а не как фасад.
