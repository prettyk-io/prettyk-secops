# SCENARIO-CANVAS-STEP-DECK: Капсульные ноды сценариев и Pill-Based конструктор шагов на @xyflow/react

> `lane: evolve` · 22 авг 2026. Profile: `prettyk-pure`.
>
> **Автор: Gemini — Visual Scenario Architecture & Interactive Step Deck**
> **Стейкхолдеры: Максим (Owner), Keeper (PO), Boss (Heavy Executor), Flash (Speed).**

---

## 1. Тезис: Проблема нодового спагетти и решение

При классическом графовом подходе каждый микро-шаг сценария (клик, ввод, ожидание, проверка) рисуется отдельной нодой со стрелочками. При реальном сценарии из 30–50 шагов канвас мгновенно превращается в непроходимый лабиринт («спагетти»), где невозможно ориентироваться.

**Решение PrettyK:**
Сценарий на холсте `@xyflow/react` представляется как **составная капсульная нода (Collapsible Step Deck)** с интерактивным строчным мини-конструктором на базе пилюль (**Pill-Based Step Builder**).

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ⚡ Сценарий: Login & Auth Flow                        [12 шагов] [−]   │
├────────────────────────────────────────────────────────────────────────┤
│ ⠿ 1. [ Open   ]  http://juice-shop:3000/#/login                   ▶ ⟳  │
│ ⠿ 2. [ Click  ]  css  button[aria-label="Close"]                   ▶ ⟳  │
│ ⠿ 3. [ Type   ]  label "Email"       ➔  $user_email                ▶ ⟳  │
│ ⠿ 4. [ Type   ]  css   #password     ➔  $password_ref (Secret)     ▶ ⟳  │
│ ⠿ 5. [ Click  ]  role  "button" "Log in"                           ▶ ⟳  │
│ ⠿ 6. [ Assert ]  text  "Welcome"     (Visible)                    ▶ ⟳  │
├────────────────────────────────────────────────────────────────────────┤
│ + Добавить шаг   │  ▶ Запустить сценарий   │  Код (Monaco DSL) ↗       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Анатомия Pill-Based строки шага

Каждая строчка внутри ноды сценария — это не статичный текст, а **активный конструктор из трёх типизированных пилюль**:

### 2.1. Пилюля «Действие» (Action Method Pill)
Выпадающий список с мгновенным автодополнением, разбит по семантическим группам и цветам:
- 🌐 **Web / Browser (Cyan `#38BDF8`):** `Click`, `Type`, `Open`, `Wait`, `Hover`, `Select`, `PressKey`
- 🛡️ **Security / DAST (Violet `#A855F7`):** `Spider`, `ActiveScan`, `Check`, `ZapReport`
- 💥 **Fuzzing / Intruder (Amber `#F59E0B`):** `FuzzWave`, `Mutate`, `Intruder`
- 🔑 **Data / Variables (Emerald `#10B981`):** `Let` (`Пусть`), `Secret` (`Секрет`), `GenerateEmail`, `GeneratePhone`
- 📄 **Page Models:** методы обнаруженных моделей страниц (например, `login_page.Войти`)

### 2.2. Пилюля «Стратегия / Локатор» (Target Strategy Pill)
При выборе `Click` или `Type` вторая пилюля автоматически адаптируется под контекст:
- `role` — выбор по ARIA-роли и имени (`getByRole`)
- `label` — выбор по подписи поля (`getByLabel`)
- `css` — произвольный CSS-селектор
- `test_id` — атрибут `data-testid`
- `text` — точный или частичный текст на странице
- `xpath` — fallback XPath-выражение

### 2.3. Пилюля «Значение / Переменная» (Payload / Var Pill)
- Текстовый инпут со встроенным распознаванием переменных.
- При вводе символа `$` автоматически открывается дропдаун переменных манифеста (`$user_email`, `$auth_token`, `$random_id`, `$password_ref`).
- Секретные переменные отображаются с иконкой замка и маскируются в UI.

### 2.4. Хвост строки шага (Action Tail)
- `⠿` — Drag-ручка для перетаскивания шага вверх/вниз внутри колоды.
- `▶` — **Step Debugger**: точечный запуск одного шага через Playwright с мгновенной подсветкой результата (зеленый/красный).
- `<!>` — Тоггл отказоустойчивости (`continue_on_error`).
- `⋮` — Контекстное меню (дублировать, удалить, скопировать как DSL).

---

## 3. Двусторонний 1-to-1 маппинг (Wired ↔ UI ↔ DSL)

Конструктор не создаёт промежуточных сложных абстракций — действует прямое отображение:

| Визуальная строка в ноде | PrettyK DSL (Monaco) | Wired JSON (Machine SoT) |
|---|---|---|
| `[Type] [label "Email"] [$user_email]` | `Type label "Email" $user_email` | `webdriver\|input\|label\|Email\|{{user_email}}` |
| `[Click] [role "button" "Войти"]` | `Click role "button" "Войти"` | `webdriver\|click\|role\|button\|Войти` |
| `[Secret] [$pwd] ["secret123"]` | `Secret $pwd = "secret123"` | `data\|secret\|pwd\|secret123` |
| `[Open] [https://target.local]` | `Open https://target.local` | `webdriver\|open\|https://target.local` |

Оператор меняет пилюлю на канвасе → мгновенно обновляется `wired.json`. Переключается в текстовый Monaco Editor — там тот же читаемый код. Полная синхронность без рассинхрона контрактов.

---

## 4. Супер-фичи для продуктивности

1. **Канвасный Drag-and-Drop между сценариями:**
   - Шаг можно вытащить из одной ноды сценария и перебросить в другую прямо на графе.
2. **Точечный запуск шага (`▶ Step-by-Step Debug`):**
   - Нажатие `▶` рядом со строчкой дёргает `orchestrator/actions/actions.py` на открытой Playwright-странице.
   - Результат шага (успех/таймаут/ошибка) за 100мс подсвечивает фон строки без перезапуска всего сценария.
3. **Macro Phases / Micro Steps Collapse:**
   - Переключение между режимом детальных микро-шагов и высокоуровневыми фазами (например: *«1. Инициализация» → «2. Авторизация» → «3. Оформление»*).
4. **Связи с моделями страниц:**
   - Если шаг вызывает метод страницы (`login_page.Войти`), от ноды сценария к ноде страницы протягивается пунктирное ребро связи.

---

## 5. As-Built фундамент в кодовой базе

- **`@xyflow/react` v12.11.3** — уже подключён в `cosmo/package.json`.
- **`cosmo/src/studio/graph/ScenarioCanvas.tsx`** — базовый каркас React Flow.
- **`cosmo/src/wired/types.ts`** — строгие интерфейсы `EditorScenario` и `ScenarioStep`.
- **`orchestrator/actions/actions.py`** — 12 атомарных действий Playwright (готовая база для `▶ Step Debugger`).
- **`orchestrator/utils/locator_candidate_extractor.py`** — role-first ранжирование стратегий для выпадающего списка.

---

## 6. План реализации (Roadmap)

### Этап 1: Custom Node `ScenarioDeckNode` в React Flow (Flash, 4 часа)
- Компонент `ScenarioDeckNode.tsx` с кастомными портами (`Handle` top/bottom).
- Сворачивание/разворачивание шагов, счетчик шагов в шапке, темная палитра `#1E293B`.

### Этап 2: Pill-Based Step Row & Selectors (Flash, 4 часа)
- Компонент `StepPillRow.tsx` с тремя дропдаунами (Action, Strategy, Value).
- Подключение автокомплита переменных `$var`.

### Этап 3: Two-Way Wired Synchronizer (Boss, 3 часа)
- Синхронизация изменений пилюль с `Wired.scenarios[i].steps[j].constructor`.
- Валидация типов параметров на лету.

### Этап 4: Step-by-Step Playwright Trigger (Boss, 3 часа)
- Эндпоинт `/api/run/step` в `live_server.py` для отладочного исполнения одиночного шага.
- Отображение статуса прямо в строке шага на канвасе.

---

*22 августа 2026. Обитель. Friend-request.*
