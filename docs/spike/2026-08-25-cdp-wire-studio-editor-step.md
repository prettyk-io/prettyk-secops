# PoC: Live CDP → Wire → Studio Step + Editor Step Drawn

> **Статус:** `spike / evolve` — PoC-пакет, не production и не CANON.
> **Дата:** 25 августа 2026 года
> **Владелец:** Максим
> **Keeper verdict:** `PROMOTE` только по критериям ниже.
> **Связанные документы:**
> [Editor Studio vision](../research/2026-08-25-editor-studio-design-vision.md),
> [Editor command center](../research/2026-08-25-editor-command-center-concept.md)

## 0. Verbatim запроса

> «Давай упакуем норм PoC о чем ранее общались. Генерацию CDP > wire > Studio Step + Editor Step Drawn. Huge feature bro»

## 1. Что именно доказываем

### Гипотеза

**Одно реальное действие оператора в живом браузере можно один раз захватить
через CDP, превратить в проверяемое wire-действие, а затем показать как один и
тот же шаг в Studio и Editor — без рассинхронизации, ручного переписывания
локатора и тихой порчи существующего сценария.**

`Editor Step Drawn` в этом PoC означает не декоративную анимацию. Это:

1. одна новая каноническая DSL-строка в Editor;
2. видимая подсветка/маркер происхождения этой строки;
3. связь строки с тем же шагом, который показан в Studio;
4. возможность принять или отклонить предложение до изменения workspace.

## 2. Почему это правильный PoC для огромной фичи

Полный feature включает recorder, discovery, AX/DOM, locator scoring, wire
compiler, Studio projection, Editor projection, persistence, diff, replay,
evidence и security. Пытаться запихнуть всё в один spike — плохая идея.

Этот PoC проверяет самый рискованный контракт:

```text
live browser event
  → normalized discovery observation
  → reviewable proposal
  → canonical action/wire step
  → Studio StepPill
  → Editor DSL line + drawn provenance
```

Если эта цепочка не держится, остальная «большая фича» — просто красивые
разрозненные панели.

## 3. Минимальный сценарий

Один локальный/тестовый login-like экран с textbox и button. Только
авторизованный операторский браузер Chrome CDP `:9222`.

### Happy path: click

```gherkin
Given: открыт разрешённый тестовый экран в Browser Stage
  And: Browser Stage подключён к живому CDP Chrome
  And: выбран существующий сценарий с текущим draft
When: оператор инспектирует кнопку и нажимает её в Record/Discovery режиме
Then: система получает реальное событие и DOM/AX evidence
  And: строит role-first locator candidate с tier и confidence
  And: показывает proposal/diff, не меняя workspace
When: оператор принимает proposal
Then: создан ровно один canonical action step
  And: wire проходит валидацию
  And: Studio показывает один новый StepPill
  And: Editor показывает одну DSL-строку этого же шага
  And: строка имеет drawn/provenance marker
  And: Studio и Editor ссылаются на один step identity
```

### Дополнительный happy path: type

После успешного click-flow разрешается второй action: ввод в textbox.

```gherkin
Given: textbox имеет однозначный role/accessible name
When: оператор вводит безопасное тестовое значение
Then: proposal показывает Type-step и redacted/placeholder value
When: оператор принимает proposal
Then: Studio и Editor добавляют один и тот же Type-step
  And: plaintext secret/value не появляется в wire, DOM proposal, логах или UI
```

Если click-flow не доказан, type-flow не считается частью PoC.

## 4. Отрицательные сценарии

### Reject

```gherkin
Given: proposal показан оператору
When: оператор нажимает Reject
Then: Studio, Editor, wire и draft остаются без нового шага
  And: proposal закрыт
  And: rejection виден в локальном trace/audit PoC
```

### Ambiguous locator

```gherkin
Given: на странице два элемента с одинаковым слабым locator candidate
When: оператор кликает один из них
Then: система помечает candidate как ambiguous/review-needed
  And: не применяет шаг автоматически
  And: показывает альтернативы и причину неопределённости
```

### CDP unavailable

```gherkin
Given: CDP endpoint недоступен или page закрыта
When: оператор включает discovery
Then: UI показывает честный disconnected/error state
  And: не создаёт mock event и не добавляет шаг
```

### Replay / duplicate event

```gherkin
Given: один и тот же browser event доставлен повторно
When: система обрабатывает replay
Then: второй независимый шаг не появляется без нового operator acceptance
  And: existing manual step не перезаписан
```

### Existing manual edit

```gherkin
Given: существующий locator был вручную исправлен оператором
When: discovery повторно видит тот же элемент
Then: ручная правка сохраняется
  And: система показывает candidate как observation/upgrade suggestion
  And: тихой замены manual locator нет
```

## 5. PoC boundary

### Входит

- один host Chrome CDP `:9222`;
- один разрешённый тестовый экран;
- attach/status к живой странице;
- один реальный click event;
- DOM/AX snapshot и locator candidates;
- role-first proposal с tier, confidence и source evidence;
- proposal diff с Accept/Reject;
- canonical action step → wire representation;
- один Studio StepPill;
- одна Editor DSL line с визуальным drawn/provenance marker;
- round-trip identity между Browser event, wire, Studio и Editor;
- duplicate, ambiguous, reject, CDP-down и redaction checks.

### Не входит

- полноценный crawler и обход всего сайта;
- автоматическое принятие шагов без оператора;
- все action types и все locator strategies;
- multi-user collaboration;
- production database/persistence и retention policy;
- полный semantic diff engine;
- scanner, Dojo, Allure, findings и evidence pack integration;
- mobile/browser matrix;
- автономный AI-оператор;
- полная запись network/console как отдельный продуктовый поток;
- deployment или изменение production stand.

## 6. Existing foundation, against which PoC is measured

В репозитории уже есть куски фундамента, но не доказана вся цепочка:

- Playwright runtime умеет `connectOverCDP` и отдельные contexts;
- browser service умеет status/navigate/screenshot/highlight;
- Discovery IR отделён от executable Wired;
- candidate builder ранжирует T0–T3 кандидаты;
- compiler умеет выбрать locator и incremental merge;
- `DiscoveryOverlay` сейчас является mock-only UI proposal;
- `ScenarioDeckStore` и `scenarioStepModel` уже умеют Studio step/DSL;
- Browser Stage/Workbench уже имеют визуальные точки интеграции.

Именно поэтому PoC не должен притворяться, что mock overlay уже является live
recorder. Главный gate — заменить mock source одним реальным CDP event и
сохранить единую step identity до обеих проекций.

## 7. Что считается одним canonical step

Один action не должен отдельно «родиться» в Studio и Editor.

```text
Browser observation
  ├── source event id
  ├── page/url context
  ├── element fingerprint
  ├── candidate set
  └── evidence refs
          ↓ accept
Canonical step
  ├── stable step identity
  ├── action + strategy + value reference
  ├── source/provenance
  └── wire representation
       ├── Studio projection
       └── Editor projection
```

`step identity`, `source event` и provenance должны быть видимы в диагностике
PoC, даже если финальный UI показывает только короткую форму.

## 8. Визуальное и UX-видение Gemini (Режиссура, эргономика, капканы)

### 8.1. В чём реальный прорыв (UX-магия)

Обычные рекордеры (включая сырой Playwright Codegen) срут нестабильными CSS/XPath-селекторами вида `div > div:nth-child(3) > button.btn-primary`. Оператор тратит часы на ручную переделку.

**Наш стандарт в Workbench:**
1. **Смысловой захват (Role-First T0–T4):** Наведение на элемент инспектирует семантику доступности (`getByRole("button", name="Войти")`, T0), а не хрупкую геометрию DOM.
2. **Честный Proposal (не молчаливый спам):** Ненавязчивый бейдж предложения с хоткеем `Enter`. Никаких несогласованных изменений в сценарии.
3. **Синхронный щелчок в двух мирах (Studio + Editor):**
   В ту же миллисекунду после `Accept`:
   - В **Studio** на колоде сценария появляется неоновая пилюля шага с каноническим цветом действия (`Click` — циановый, `Type` — синий, `Wait` — фиолетовый).
   - В **Editor** в Monaco сама собой печатается / *рисуется* идеальная DSL-строка (`Click role="button" name="Войти"`), а на gutter кратковременно зажигается пульс происхождения (`✨ Discovered`).

### 8.2. Режиссура момента (Workbench 60/40)

```text
┌──────────────────────────────────────┬───────────────────────────────┐
│ BROWSER STAGE (60%)                  │ MONACO DSL / STUDIO (40%)     │
│                                      │                               │
│  [ target: juice-shop.local ]        │ 1  Open "/"                   │
│                                      │ 2  Wait 500                   │
│  ┌────────────────────────┐          │ 3  Click role="button" "Dismiss"
│  │ Login Form             │          │                               │
│  │ [ Email________ ]      │          │ 4  ✨ Type role="textbox" ... │ ← ТОЛЬКО ЧТО
│  │ [ Password_____ ]      │          │    (циановый пульс подсветки) │   НАРИСОВАЛОСЬ
│  │ [ 👉 Войти (T0) ] ──────┼──────────┤                               │
│  └────────────────────────┘          │ [ Diff Proposal: Accept ⏎ ]   │
└──────────────────────────────────────┴───────────────────────────────┘
```

1. Оператор переключает Browser Stage в режим **Record / Discovery**.
2. Вьюпорт плавно занимает 60% ширины, оставляя справа сфокусированные 40% Monaco/Studio.
3. Оператор просто проходит путь пользователя в браузере.
4. Справа сценарий **пишет сам себя** строгим, чистым DSL.

### 8.3. Три критических инженерно-визуальных капкана

1. **Капкан Latency (>150 мс убивает магию):**
   Если между физическим кликом и показом proposal проходит заметная задержка, ощущение «живого продолжения руки» разрушается. Boss и runtime обязаны отдавать быстрый срез AX/DOM без тяжёлых блокирующих вычислений.
2. **Капкан войны оверлеев (DOM-инъекции vs вёрстка сайта):**
   Прямая инъекция чужих `<div>` в DOM целевой страницы ломает SPA, `position: fixed` и перехватывает клики. Оверлей подсветки должен жить **поверх** вьюпорта в React-слое (по координатам `bounding rect`) либо через нативный CDP `Overlay.highlightNode`.
3. **Капкан декоративной иллюзии (текст vs единое AST):**
   «Editor Step Drawn» не может быть просто вставкой текста в Monaco. Шаг обязан родиться в едином `CheckWorkspace` / `wired.json` и синхронно обновить draft, Studio Node и Monaco DSL.

### 8.4. Планка для исполнителей

- **Boss (DeepSeek):** фокус на чистом CDP-мосте, мгновенном съёме AX/DOM ноды по клику и генерации T0/T1 кандидата в wire-модель без монструозных графов.
- **Flash (DeepSeek):** фокус на оверлее без лагов поверх Browser Stage, хоткее `Enter` на баннере и отрисовке шага в Monaco с мягким неоновым highlight'ом.

## 9. PROMOTE / KILL

### `PROMOTE`

PoC можно переводить в Plan, если одновременно выполнено всё:

1. Browser event пришёл от живого CDP, а не из mock fixture.
2. Один click породил один proposal и после accept один canonical step.
3. Wire валиден и содержит исполняемое action/locator представление.
4. Studio StepPill и Editor DSL line имеют одну step identity.
5. Editor marker показывает реальное происхождение, а не просто подсветку цвета.
6. Reject не меняет draft/wire/Studio/Editor.
7. Ambiguous candidate блокирует auto-apply.
8. Повтор события не создаёт duplicate без нового accept.
9. Existing manual locator не затирается discovery merge.
10. Secret/test value redacted во всех видимых и сохраняемых артефактах.
11. CDP-down даёт честный error state и не производит fake step.
12. Тесты покрывают happy path и все negative сценарии выше.

### `KILL`

Убиваем текущий подход, если обнаружено хотя бы одно:

- Browser Stage только рисует mock overlays;
- Studio и Editor имеют две независимые копии шага;
- generated wire не валиден или не может быть исполнен;
- accept молча заменяет полный wire/draft;
- manual locator теряется;
- ambiguous locator автоматически применяется;
- duplicate event порождает дубли;
- Editor Step Drawn — только декоративная анимация без provenance;
- plaintext value/secret попадает в UI, wire, log или evidence;
- disconnected CDP маскируется зелёным «успехом».

`KILL` означает снести конкретную реализацию PoC и сохранить гипотезу для
перепроектирования. Это не означает убить всю идею live authoring.

## 10. Следующий Plan после PROMOTE

Если PoC получил `PROMOTE`, его режем в отдельный production Plan:

1. Live recorder contract для click/type/navigate/input events.
2. Normalized discovery event и evidence contract.
3. Locator candidate scoring, ambiguity и manual trust.
4. Action-to-wire compiler с incremental merge.
5. Studio projection и canonical step store.
6. Editor line mapping, drawn provenance и navigation.
7. Accept/reject/diff/replay/idempotency.
8. Persistence, versioning, audit, redaction.
9. Browser contexts и operator/run/debug separation.
10. Security/adversarial tests и production observability.

## 11. Handoff

- **Boss:** живой CDP event contract, discovery/IR→wire, canonical step identity,
  compiler и negative/security behavior.
- **Flash:** Browser Stage interaction, proposal/diff, Studio StepPill и Editor
  drawn/provenance projection.
- **Buddy:** только после отдельной команды — runtime/stand support, process,
  secrets, health and pilot operations. Не поднимать production ради PoC.
- **Keeper:** проверяет только наблюдаемое поведение по этому документу.

PoC-код не становится production автоматически. После `PROMOTE` обязателен новый
Plan с production DoD.

## 12. Sources / foundation

- [Playwright connect over CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Playwright locators](https://playwright.dev/docs/locators)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Editor Studio design vision](../research/2026-08-25-editor-studio-design-vision.md)
- [PrettyK discovery IR](../../orchestrator/models/discovery.py)
- [PrettyK discovery compiler](../../orchestrator/utils/discovery_compiler.py)
