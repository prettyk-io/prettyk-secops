# Wire DSL ↔ Canvas: Контракт асимметричной синхронизации и проекции AST

> **Статус:** `crystal / implemented` — канонический архитектурный контракт и факт реализации `PK-WIRE-SYNC` (28 авг 2026).  
> **Дата обновления:** 28 августа 2026.  
> **Профиль:** `secops-lab-pure`.  
> **Исполнители:** Boss (B1, B2) + Flash (F1) + Luna (L1, L2). **Результат:** 5/5 карточек сданы, 93 FE + 54 PY теста, `tsc 0`.  
> **Назначение:** Полное устранение рассинхронизации Monaco ↔ Canvas, ликвидация «0 шагов», безопасное отображение восстановительных конструкций (`>@`, `>?`, `try/catch/finally`, `<!>`) без раздувания базовых карточек, побайтовое сохранение структуры при round-trip, сквозной контур BrowserStage → Observe Click → Canvas → Monaco.  
> **Связанные спецификации:** [`2026-08-27-pretty-browser-contract-methodid-gates.md`](./2026-08-27-pretty-browser-contract-methodid-gates.md), [`2026-08-28-browser-viewport-streaming.md`](./2026-08-28-browser-viewport-streaming.md), `docs/friend-requests/PRETTYK-DSL-SUGAR.md`.

---

## 1. Фундаментальный принцип: Асимметричное авторство (The Asymmetric Ownership)

Попытка превратить визуальный Canvas в полнофункциональный блочный IDE (с визуальным редактором `try/catch/finally`, ветвлений, вложенных циклов и произвольных retry-графов) неизбежно ведёт к переусложнению UI и разрушению AST при обратной сериализации.

### Разделение сфер ответственности:
1. **Monaco (Pretty DSL) — Единственный источник сложного control-flow (Authoritative AST Engine):**
   - Вся сложная логика, ветвления (`Если`), циклы (`Цикл`, `ДляКаждого`), блоки обработки ошибок (`Попробовать / Перехватить / ВКонце`), сценарии восстановления (`>@ { recover }`) и макро-модификаторы (`<!>`, `>?`) пишутся и правятся в коде DSL.
2. **Canvas (ScenarioDeckStore) — Проекция линейного потока действий (Spatial Action Projection):**
   - Canvas предназначен для быстрой визуальной сборки обычных шагов (`Open`, `Click`, `Type`, `Wait`, `Select`, `Assert`).
   - Базовая карточка шага **не содержит визуального мусора** (чекбоксов retry, полей fallback, флагов soft-skip) для 95% обычных шагов.
3. **Модель подхвата (Read-Only Feature Overlay):**
   - При наличии в DSL специальных конструкций Canvas **подхватывает их как визуальные read-only оверлеи/бейджи** (`[RECOVER]`, `[SOFT]`, контейнеры `[TRY-BLOCK]`).
   - Редактирование обычных полей (селектор, payload) внутри/снаружи блока на Canvas меняет **только целевой узел**, сохраняя всю окружающую AST-структуру, маркеры и отступы побайтно (Surgical AST Patching).

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        PRETTYK CHECK WORKSPACE                         │
└────────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   [ Monaco Editor (DSL) ]                   [ Canvas Scenario Flow ]
   - Полный AST / Control Flow               - Линейные Action-карточки
   - try / catch / finally                   - Базовые поля: action/loc/val
   - >@ { recover } + retry                  - Read-Only оверлеи [RECOVER]
   - >? (soft), <!> (failsafe)               - Read-Only оверлеи [SOFT]
   - Автор сложных конструкций               - Редактор обычных действий
              │                                         │
              └───────────────► [ AST Bridge ] ◄────────┘
                        - Single Source of Truth
                        - Surgical AST Node Patching
                        - Hash & Revision Guard
```

---

## 2. Канонический реестр семантики синтаксиса и маркеров

| Конструкция | Где авторить | Семантика в Runtime (`LanguageEngine`) | Отображение на Canvas | Редактируемость на Canvas |
|---|---|---|---|---|
| **Обычный шаг** (`Клик .btn`) | Canvas / Monaco | Выполнить действие браузера | Стандартная карточка (Action, Strategy, Value, Payload) | **Полная (Edit)** |
| **`>@ { recover }`** | **Monaco DSL** | Primary fail → выполнить `recover` ×1 → повторить `primary` ×1 → fail при повторной ошибке | Карточка с бейджем `[RECOVER]` + вложенный Read-Only превью-список шагов recovery + сноска «retry primary ×1» | **Read-Only** (правка только в Monaco) |
| **`>?`** | **Monaco DSL** | Failsafe / Soft-skip: ошибка шага даёт статус `SKIPPED / SOFT`, сценарий продолжается | Аккуратный бейдж `[SOFT]` на карточке | **Read-Only** (наличие определяется DSL) |
| **`-> $var`** | Canvas / Monaco | Data Capture: сохранить результат шага (текст/атрибут/JSON) в переменную рантайма | Чип/поле `→ $var` в нижней части карточки | **Полная (Edit)** |
| **`># hint`** | Canvas / Monaco | Self-Healing / Operator Anchor: семантический якорь элемента для AI/эвристики | Вспомогательная подпись / Tooltip шага | **Полная (Edit)** |
| **`<!>`** | **Monaco DSL** | Scenario-level failsafe: сценарий не падает целиком при ошибках некритичных шагов | Бейдж `[SCENARIO FAILSAFE]` в шапке Deck Header | **Read-Only** (в шапке колоды) |
| **`Попробовать...` (`try/catch`)** | **Monaco DSL** | `TryNode` AST: изолированная область перехвата исключений | Контейнерный узел-рамка `[TRY-BLOCK]` с вложенными карточками | Шаги внутри редактируемы; **структура блока Read-Only** |
| **`Пусть / Секрет`** | Canvas / Monaco | Декларация переменных и секретов (`DataStream`) | Секция `Переменные` над шагами сценария | **Полная (Edit)** |

---

## 3. Детальная спецификация `>@ { recover }`

Конструкция `>@` — это не отладочный флаг и не общий retry, а детерминированная стейт-машина локального самолечения шага.

### 3.1. Стейт-машина исполнения в `LanguageEngine` (Канон):

```text
               [ Вызов Primary Action ]
                          │
            ┌─────────────┴─────────────┐
        (Успех)                      (Ошибка)
            │                           │
            ▼                           ▼
        [ DONE ]           [ Вызов Recover Body (1 раз) ]
                                        │
                          ┌─────────────┴─────────────┐
                      (Успех)                      (Ошибка)
                          │                           │
                          ▼                           ▼
            [ Повтор Primary Action (1 раз) ]     [ FAIL STEP ]
                          │                       (Прерывание)
            ┌─────────────┴─────────────┐
        (Успех)                      (Ошибка)
            │                           │
            ▼                           ▼
        [ DONE ]                  [ FAIL STEP ]
                                  (Прерывание)
```

### 3.2. Жесткие инварианты `>@`:
1. **Взаимоисключение с `>?`:** Шаг не может одновременно иметь `>?` (soft-skip) и `>@` (recover+retry). Это синтаксическая ошибка `WiredError`.
2. **Только MethodId-листья в теле:** Внутри `{ recover }` разрешены только элементарные действия (`webdriver|click`, `webdriver|send_keys` и т.д.). Вызовы Page Action (`page.action`) и вложенные `>@` / `>?` запрещены.
3. **Фиксированный Retry ×1:** Количество повторов primary строго равно 1 (не настраивается и не циклится).

### 3.3. Визуализация в карточке Canvas:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 04  CLICK  css .payment-form-submit                          [RECOVER] │
│                                                                        │
│ ┌─ 🔒 Восстановление (Fallback) ─────────────────────────────────────┐ │
│ │  1. CLICK css .confirm-submit-modal                                │ │
│ │  2. WAIT 500ms                                                     │ │
│ │                                                                    │ │
│ │  Поведение: При ошибке → выполнить шаги выше → повторить шаг 04 ×1 │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                         [ ↗ Редактировать в DSL: L14 ] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Архитектура синхронизации: Surgical AST Patching

Чтобы избежать потери комментариев, кастомного форматирования и сложных блоков при сохранении из Canvas, применяется метод хирургического патчинга узлов AST.

### 4.1. Модель документа (`WireDocument`)

```typescript
export type WireNodeKind = 
  | 'action'
  | 'declaration'
  | 'control_block'
  | 'comment'
  | 'empty_line';

export interface WireSourceSpan {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface AdvancedStepAnnotation {
  soft?: boolean;                         // >?
  recover?: {                             // >@ { body }
    rawBody: string;
    steps: ScenarioStepModel[];
    retryPrimary: 1;
  };
  saveAs?: string;                        // -> $var
  hint?: string;                          // ># hint
}

export interface WireNode {
  id: string;                             // Детерминированный стабильный ID
  kind: WireNodeKind;
  raw: string;                            // Исходный текст узла
  span: WireSourceSpan;
  // Распарсенные данные (только для action/declaration)
  stepModel?: ScenarioStepModel;
  annotation?: AdvancedStepAnnotation;
  childNodes?: WireNode[];                // Для try/catch/finally и control-flow
}

export interface WireDocument {
  revision: number;
  contentHash: string;
  scenarioFailsafe: boolean;              // <!>
  meta: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  nodes: WireNode[];
}
```

### 4.2. Алгоритм двустороннего моста:

```text
[ Пользователь правит Monaco ]
       │
       ▼
1. Полный AST Parse (language_parse / sugarParser)
2. Построение WireDocument со SourceSpans
3. Генерация ScenarioDeckData[] (только проекция!)
4. ScenarioDeckStore.setDecks() с сохранением фокуса и UI-состояний (LED, collapse)

--------------------------------------------------------------------------------

[ Пользователь правит карточку на Canvas ] (изменил селектор или payload)
       │
       ▼
1. Поиск WireNode по step.id в текущем WireDocument
2. Форматирование ТОЛЬКО измененного узла:
   - Если был `>@ { ... }` → обновляется только primary-часть: `new_primary >@ { recover }`
   - Если был `>?` → обновляется primary-часть с сохранением суффикса `>?`
   - Если был `-> $var` → обновляется с сохранением пайпа
3. Подстановка новой строки в исходный текст по span [startOffset..endOffset]
4. Вычисление нового contentHash и отправка в Monaco / formData draft
```

---

## 5. UI-политика базового Canvas: Нулевой шум

1. **Никаких пустых отладочных полей:** Карточка по умолчанию содержит только Action, Strategy Selector, Selector Value и Payload. Чекбокс `Continue on error` и блок `Fallback` не отображаются, если в DSL их нет.
2. **Ликвидация зомби-колод:** Дефолтный `cdp-poc` удаляется. Если `steps.length === 0` и текст пуст — отображается честный Empty State с кнопкой «Добавить первый шаг» или запуском Discovery через headed BrowserStage.
3. **Изоляция Demo Store:** Искусственные мок-шаги из `ScenarioFlow` полностью изолируются от реального контекста `EditorWorkbench`.
4. **Сквозная навигация в код (Deep Linking):** Клик по карточке на Canvas подсвечивает соответствующую строку в Monaco Editor (`revealLineInCenter`).

---

## 6. Фактическая нарезка и реализация: Boss, Flash, Luna

Реализация выполнена строго по пропорции ответственности: Boss (архитектура/AST), Flash (UI карточек), Luna (BrowserStage stream, Coordinate Click, EditorWorkbench Live Bridge).

### 6.1. Boss — Heavy Execution (31 тест)
- **`WIRE-SYNC-B1` (`frontend/src/editor/wireDocumentParser.ts` · 20 тестов):**
  - Полноценный `WireDocument` со `SourceSpans` для каждого узла.
  - Извлечение метаданных (`@ Title`, `@ Description`), маркера `<!>`, деклараций (`Пусть`, `Секрет`).
  - Парсинг листьев `>@ { recover }` как детерминированной стейт-машины, `>?`, `-> $var`, `># hint`.
  - Ликвидация ложного «0 шагов» при открытом сценарии.
- **`WIRE-SYNC-B2` (`frontend/src/editor/wireDocumentSerializer.ts` · 11 тестов):**
  - Хирургическая замена узлов AST по `span` без перегенерации остального документа.
  - 100% побайтовое сохранение `>@ { recover }`, `>?`, комментариев, пустых строк и отступов при правке селектора/payload на Canvas.

### 6.2. Flash — Rapid UI (46 тестов)
- **`WIRE-SYNC-F1` (`frontend/src/studio/ScenarioStepCard.tsx`, `frontend/src/studio/ScenarioDeckNode.tsx` · 46 тестов):**
  - Чистые карточки с нулевым визуальным шумом (без лишних чекбоксов для 95% обычных шагов).
  - Оранжевый сворачиваемый `[RECOVER]`-аккордеон с превью шагов восстановления.
  - Жёлтый бейдж `[SOFT]`, красный `[SCENARIO FAILSAFE]` в заголовке колоды.
  - Контейнерная рамка `[TRY-BLOCK]` для блоков обработки ошибок.
  - Deep-link кнопка «↗ Редактировать в DSL: Lxx» с прыжком в строку Monaco.

### 6.3. Luna — Heavy Execution & Browser Contour (16 тестов)
- **`WIRE-SYNC-L1` (`frontend/src/terminal/BrowserStage.tsx`, `orchestrator/browser/browser_service.py` · 4 теста):**
  - Полная ликвидация скриншот-поллинга из авторского контура.
  - Непрерывный JPEG-стрим (CDP `Page.startScreencast` 12fps + fallback noVNC `:7902`).
  - Клик по живому изображению вьюпорта → `computeViewportCoordsFromEvent` → `observeClick` → реальный DOM-клик в контейнере → перехват события через `__pk_cdp_click__` → AX enrichment → генерация кандидата DSL.
- **`WIRE-SYNC-L2` (`frontend/src/workbench/EditorWorkbench.tsx` · 12 тестов):**
  - Двусторонний живой мост Monaco ↔ Canvas: Monaco → Canvas с дебаунсом 150мс и хэш-стражем; Canvas → Monaco через surgical AST patch по SourceSpan.
  - Полная ликвидация зомби-колоды `cdp-poc` и изоляция Demo Store.
  - Сохранение фокуса курсора Monaco при двусторонней синхронизации.

### 6.4. Итог реализации PK-WIRE-SYNC

| Исполнитель | Карточки | Затронутые файлы | Тесты | Статус |
|---|---|---|---|---|
| **Boss** | WIRE-SYNC-B1, WIRE-SYNC-B2 | `wireDocumentParser.ts`, `wireDocumentSerializer.ts` | 31 | ✅ CLOSED |
| **Flash** | WIRE-SYNC-F1 | `ScenarioStepCard.tsx`, `ScenarioDeckNode.tsx` | 46 | ✅ CLOSED |
| **Luna** | WIRE-SYNC-L1, WIRE-SYNC-L2 | `BrowserStage.tsx`, `EditorWorkbench.tsx`, `browser_service.py` | 16 | ✅ CLOSED |
| **ИТОГО** | **5 карточек** | **Сквозной контур: BrowserStage → Canvas → Monaco** | **93 FE + 54 PY · tsc 0** | **🟢 CLOSED** |

---

## 7. Приёмочные сценарии GWT (DoD)

### GWT-1: Отображение существующего DSL-сценария на Canvas
- **Given:** В Monaco открыт сценарий:
  ```text
  @ Title: Оплата заказа
  Открыть /checkout
  Вставить #card "4111222233334444"
  Нажать css .pay-btn >@ {
    Нажать css .confirm-modal-btn
    Ждать 500
  }
  Клик .promo-banner-close >?
  ```
- **When:** Оператор переключается на вкладку «Студия / Canvas».
- **Then:**
  - Canvas отображает колоду с заголовком «Оплата заказа».
  - Шаг 01 (`Открыть`) и Шаг 02 (`Вставить`) отображаются как стандартные карточки.
  - Шаг 03 (`Нажать .pay-btn`) отображает бейдж `[RECOVER]` и read-only вложенный список (шаги `confirm-modal-btn` и `Ждать 500`).
  - Шаг 04 (`Клик .promo-banner-close`) отображает бейдж `[SOFT]`.
  - Количество шагов сценария честно равно 4.

### GWT-2: Правка селектора на Canvas без поломки `>@`
- **Given:** На Canvas открыт шаг с `>@`:
  `Нажать css .pay-btn >@ { Нажать css .confirm-modal-btn }`.
- **When:** Оператор меняет селектор на карточке с `css .pay-btn` на `#submit-pay`.
- **Then:**
  - В Monaco текст сценария становится:
    `Нажать #submit-pay >@ { Нажать css .confirm-modal-btn }`.
  - Блок recover `{ Нажать css .confirm-modal-btn }` сохранён без искажений и потерь.

### GWT-3: Защита от дублирования и гонок
- **Given:** Открыт сценарий на Canvas.
- **When:** Оператор быстро вводит символы в Monaco.
- **Then:** Canvas обновляется с дебаунсом 150мс; фокус курсора в Monaco не теряется; обратная отправка события из Canvas в Monaco блокируется хэш-стражем.
