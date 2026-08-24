# Design Playground — эргономичная мастерская дизайнера

> **Feature Request.** 22 августа 2026. Profile: `prettyk-pure`.
> **Для:** Веры (UI/UX дизайнер) и Максима (владелец продукта).
> **Стек:** shadcn/ui + Radix + Tailwind v4 + React 18. Роут `#/design-playground`.

## 0. Тезис

Одностраничное SPA-приложение внутри `cosmo/` на существующем стеке `studio-stack`.
Каталог всех UI-примитивов, компонентных семейств и типографики платформы в одном месте.
Вера тыкает переключатели — видит не один Toggle, а всю матрицу 3×4 состояний.
Максим видит всё семейство целиком — "вот какие у нас кнопки".

Никаких внешних зависимостей. Все компоненты — копипаста из open-source маркетплейсов (MIT).

---

## 1. Секции (шесть)

### 1.1 Component Gallery — Базовая галерея shadcn/ui

Каждый компонент отрендерен в **матрице состояний**: все variant × все size × default/disabled.
Рядом с каждым — ссылка на исходный shadcn-доку.

| Компонент | Variants | Sizes | Source |
|---|---|---|---|
| **Button** | default, destructive, outline, secondary, ghost, link | sm, default, lg, icon | shadcn/ui |
| **Input** | default, file, disabled, with-icon, with-clear | — | shadcn/ui |
| **Badge** | default, secondary, destructive, outline | — | shadcn/ui |
| **Checkbox** | default, checked, disabled, with-label | — | shadcn/ui |
| **Radio Group** | default, horizontal, with-cards | — | shadcn/ui |
| **Switch** | default, checked, disabled, with-label-left, with-label-right | — | shadcn/ui |
| **Toggle** | default, outline, with-icon | sm, default, lg | shadcn/ui |
| **Toggle Group** | single-select, multi-select, with-icons | sm, default, lg | Radix ToggleGroup |
| **Select** | default, with-icons, with-descriptions, search-filtered | — | Radix Select |
| **Slider** | default, range, with-marks | — | Radix Slider |
| **Tabs** | default, pills, underlined | — | Radix Tabs |
| **Dialog** | default, with-form, destructive-confirm | sm, default, lg, fullscreen | Radix Dialog |
| **Card** | default, hoverable, with-image, with-header-footer | — | shadcn/ui |
| **Accordion** | single, multiple | — | Radix Accordion |
| **Separator** | horizontal, vertical, with-label | — | Radix Separator |
| **Textarea** | default, disabled, with-counter | — | shadcn/ui |
| **Tooltip** | top, right, bottom, left, with-shortcut | — | Radix Tooltip |

### 1.2 Pattern Families — Семейства компонентов (из маркетплейсов)

Каждое семейство — карточка с живым превью + ссылкой на источник.
Компоненты **не** копипастим в репо — показываем скрин/описание + URL.

| Семейство | Компоненты внутри | Откуда | Ссылка |
|---|---|---|---|
| **Segmented Control** | Pill-сегменты, анимированный indicator, иконки | Origin UI | https://originui.com/segmented-control |
| **Radio Cards** | Карточка = radio: image + title + description, selected-подсветка | 21st.dev | https://21st.dev/s/radio-cards |
| **Checkbox Cards** | Мультивыбор с чекмарками, card-layout | 21st.dev | https://21st.dev/s/checkbox-cards |
| **Hero Input** | Input + иконка + clear-button + error-state + helper-text | Origin UI | https://originui.com/input |
| **Color Picker** | Hex-пикер, swatch-grid, eyedropper-кнопка | 21st.dev | https://21st.dev/s/color-picker |
| **File Upload** | Drag-drop зона, preview, progress-bar | shadcn/ui | https://ui.shadcn.com/docs/components/input |
| **Date Picker** | Calendar popover, date-range, time-select | shadcn/ui | https://ui.shadcn.com/docs/components/date-picker |
| **Command Palette** | `Cmd+K` search, grouped-items, keyboard-nav | shadcn/ui | https://ui.shadcn.com/docs/components/command |
| **Hover Card** | popover на hover, image-preview, user-card | shadcn/ui | https://ui.shadcn.com/docs/components/hover-card |
| **Sheet** | Slide-over panel, left/right/top/bottom | shadcn/ui | https://ui.shadcn.com/docs/components/sheet |
| **Breadcrumb** | Chevron-separated, collapsible-ellipsis | shadcn/ui | https://ui.shadcn.com/docs/components/breadcrumb |
| **Pagination** | page-numbers, ellipsis, prev/next | shadcn/ui | https://ui.shadcn.com/docs/components/pagination |
| **Skeleton** | card, list, table, text-line loaders | shadcn/ui | https://ui.shadcn.com/docs/components/skeleton |
| **Avatar** | image, fallback-initials, status-dot | shadcn/ui | https://ui.shadcn.com/docs/components/avatar |
| **Progress** | linear, circular, indeterminate, with-label | shadcn/ui | https://ui.shadcn.com/docs/components/progress |

### 1.3 Typography — Шрифты и живой превью

Четыре канонических шрифта из `sanctuary/pure/brand-fonts.md`:

| Шрифт | Категория | Превью |
|---|---|---|
| Golos UI | UI/интерфейс | Живое текстовое поле |
| Golos Text | Отчёты/длинный текст | Живое текстовое поле |
| JetBrains Mono | Code/logs/Monaco | Живое текстовое поле |
| PT Astra Sans | Бланки/акты | Живое текстовое поле |

Для каждого шрифта — ползунки:
- Размер (10px → 48px, step 1px)
- Жирность (300, 400, 500, 600, 700 — если доступна в TTF)
- Стиль (normal, italic)
- Tracking/letter-spacing (-0.05em → 0.2em)

Плюс **одно общее поле ввода текста** — меняешь шрифт/размер/жирность, видишь результат мгновенно.

Типографическая шкала (таблица): 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72px.

Фоллбек-стеки (визуализация): Golos UI → Golos Text → Segoe UI → system-ui.

### 1.4 Palette Explorer — Цвета и токены

Все brand-цвета из `cosmo/src/theme/tokens.ts` (DARK_PACK, LIGHT_PACK, NEON_PACK).
Каждый цвет — swatch-карточка с hex-значением и CSS-переменной.

Переключатель «Dark / Light / Neon» — все swatch'и пересчитываются в реальном времени.

Дополнительно:
- Градиенты бренда (cyan `#38bdf8` → violet `#9333ea`) — stripe-превью
- Semantic-цвета: success (#3fb27f), warning (#d8a13a), error (#f85149), info (#9333ea)
- Chrome-токены: tabInk, railBg, treeSelectedBg, monacoSurface

### 1.5 Spacing & Tokens — Сетка и радиусы

- **Spacing scale:** 0, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96px
  Каждое значение — горизонтальный bar с подписью
- **Border-radius scale:** 0, 2, 4, 6, 8, 12, 16, 24, 9999px (pill)
  Каждое — квадрат с border-radius в пропорции к размеру
- **Shadow tokens:** `--pk-shadow-*` визуализированы как карточки на тёмном фоне
- **Z-index scale:** зарезервированные уровни (dropdown, modal, tooltip, overlay)

### 1.6 Техническая информация (футер)

- Стек: React 18.3.1, Vite 8.1.5, TypeScript 6.0.3
- UI: shadcn/ui + Radix + Tailwind v4
- Шрифты: self-hosted TTF, SIL OFL 1.1
- Лицензии: все компоненты MIT
- Дата сборки / git hash

---

## 1.7 Designer Ergonomics & Advanced Utilities (Экспертное дополнение)

Чтобы майстерская была максимальной эргономичной для Веры и разработчиков Studio:

1. **Global Stress-State Overrides (Панель стресс-состояний):**
   - Переключатель сверху: `Normal` | `Hover (forced)` | `Focus-visible` | `Disabled` | `Loading`.
   - Позволяет в 1 клик проверить подсвечивание и accessibility-контуры всех компонентов сразу.

2. **Contrast & WCAG Accessibility Checker (в Palette Explorer):**
   - Автоматический расчет контраста (WCAG AA 4.5:1 / AAA 7.0:1) между цветом текста и фоном контейнера.
   - Бейджи `PASS AA`, `PASS AAA` или `FAIL` прямо на каждой карточке цвета.

3. **Copy-to-Clipboard JSX / Tailwind Snippets:**
   - Каждая карточка компонента имеет кнопку «Copy JSX» (копирует каноничный импорт и JSX пропсы) и «Copy Tailwind» (копирует итоговые классы).

4. **Density & UI Context Switcher (Компактность):**
   - Переключатель плотности: `Compact (Studio density)` vs `Comfortable (Hub density)` vs `Spacious`.
   - Живое превью компонентов внутри микро-контекстов Studio (Header Pane, Action Hub Node, Evidence Rail).

5. **Font Pair & Hierarchy Sandbox:**
   - Возможность скомпоновать реальный заголовок + подзаголовок + кодовый сниппет (`Golos UI` + `Golos Text` + `JetBrains Mono`) и проверить ритм вертикального шага (line-height).

---

## 2. Архитектура

### 2.1 Структура файлов

```
cosmo/src/design-playground/
  DesignPlayground.tsx         # Корневой компонент, Tabs-контейнер
  sections/
    ComponentGallery.tsx       # §1.1 — матрица shadcn-компонентов
    PatternFamilies.tsx        # §1.2 — карточки семейств + ссылки
    Typography.tsx             # §1.3 — шрифты + живое превью
    PaletteExplorer.tsx        # §1.4 — swatch-сетка + dark/light toggle
    SpacingTokens.tsx          # §1.5 — сетка + радиусы + тени
  data/
    components.ts              # Реестр компонентов (§1.1): name, variants, sizes
    patterns.ts                # Реестр семейств (§1.2): name, source, url
    typography.ts              # Данные шрифтов: family, weights, fallback
    palette.ts                 # Токены из theme/tokens.ts (DARK/LIGHT/NEON)
```

### 2.2 Роутинг

В `App.tsx` hash-роутер: `#/design-playground` → `DesignPlayground`.

### 2.3 Доступ к данным

- Palette: читаем напрямую из `cosmo/src/theme/tokens.ts` (DARK_PACK / LIGHT_PACK / NEON_PACK / FONT_STACK / MONO_STACK)
- Typography: `sanctuary/pure/brand-fonts.md` → хардкодим 4 шрифта
- Никакого бэкенда. Никаких API-запросов.

### 2.4 Тема

Использует существующий `ThemeProvider` из `cosmo/src/theme/ThemeProvider.tsx`.
Тёмная тема по умолчанию. Переключатель dark/light в Palette Explorer переключает глобально.

---

## 3. Компонентная матрица — полный план

### Base shadcn (рендерим живьём, копипаста)

| # | Компонент | Variants | Sizes | States |
|---|---|---|---|---|
| 1 | Button | 6 | 4 | default, disabled, loading |
| 2 | Input | 5 | — | default, disabled, with-icon, error |
| 3 | Badge | 4 | — | default |
| 4 | Checkbox | 3 | — | unchecked, checked, disabled |
| 5 | Radio Group | 3 | — | vertical, horizontal, cards |
| 6 | Switch | 5 | — | off, on, disabled-both |
| 7 | Toggle | 3 | 3 | off, on, disabled |
| 8 | Toggle Group | 3 | 3 | single, multi |
| 9 | Select | 4 | — | closed, open, with-icons |
| 10 | Slider | 3 | — | 0, 50, 100, range |
| 11 | Tabs | 3 | — | tab1-active, tab2-active |
| 12 | Dialog | 4 | 4 | trigger → open |
| 13 | Card | 4 | — | static |
| 14 | Accordion | 2 | — | item1-open, item2-open |
| 15 | Separator | 3 | — | static |
| 16 | Textarea | 3 | — | default, disabled |
| 17 | Tooltip | 5 | — | hover-trigger |

### Pattern Families (карточки + ссылки, не копипастим)

| # | Семейство | Компонентов | Источник |
|---|---|---|---|
| 18 | Segmented Control | 1 | Origin UI |
| 19 | Radio Cards | 1 | 21st.dev |
| 20 | Checkbox Cards | 1 | 21st.dev |
| 21 | Hero Input | 1 | Origin UI |
| 22 | Color Picker | 1 | 21st.dev |
| 23 | File Upload | 1 | shadcn/ui |
| 24 | Date Picker | 2 | shadcn/ui |
| 25 | Command Palette | 1 | shadcn/ui |
| 26 | Hover Card | 1 | shadcn/ui |
| 27 | Sheet | 1 | shadcn/ui |
| 28 | Breadcrumb | 1 | shadcn/ui |
| 29 | Pagination | 1 | shadcn/ui |
| 30 | Skeleton | 1 | shadcn/ui |
| 31 | Avatar | 1 | shadcn/ui |
| 32 | Progress | 1 | shadcn/ui |

---

## 4. Типографика — план

### 4.1 Шрифты (4 канонических)

Из `brand-fonts.md`:
```
Golos UI       → UI-контролы, кнопки, меню
Golos Text     → body-текст, отчёты
JetBrains Mono → Monaco, DSL, логи
PT Astra Sans  → бланки, акты, гос-документы
```

### 4.2 Контролы на каждый шрифт

| Контрол | Тип | Значения |
|---|---|---|
| Font family | Dropdown | 4 шрифта |
| Size | Slider | 10–72px |
| Weight | Toggle Group | 300, 400, 500, 600, 700 |
| Style | Toggle | Normal, Italic |
| Letter spacing | Slider | -0.05em → 0.2em |

### 4.3 Общее поле ввода

Текстовое поле «Быстрая коричневая лиса прыгает через ленивого пса» — превью для всех шрифтов одновременно ИЛИ для выбранного (чекбокс «только выбранный»).

### 4.4 Типографическая шкала

Таблица: size | preview (рендерится этим размером) | use-case.

### 4.5 Fallback-стеки

Визуализация: строка-превью каскада `Golos UI → Golos Text → Segoe UI → system-ui`.

---

## 5. Технические контракты

### Что используем (уже в проекте)
- `react` 18.3.1
- `vite` 8.1.5
- `tailwindcss` v4 + `@tailwindcss/vite`
- `shadcn/ui` + Radix
- `ThemeProvider` из `cosmo/src/theme/`
- `FONT_STACK`, `MONO_STACK`, `DARK_PACK`, `LIGHT_PACK`, `NEON_PACK` из `cosmo/src/theme/tokens.ts`

### Что НЕ используем
- Никаких новых npm-зависимостей
- Никакого бэкенда / API
- Никаких внешних сервисов
- Никакой Figma-интеграции (пока)

### Airgap
- Все шрифты self-hosted (уже лежат в `cosmo/public/fonts/`)
- Все компоненты копипастятся в репо (MIT)
- 0 внешних CDN

---

## 6. Порядок реализации

| Фаза | Что | Оценка |
|---|---|---|
| **P0** | `DesignPlayground.tsx` + Tabs-оболочка + роут `#/design-playground` | 30 мин |
| **P1** | Component Gallery (§1.1) — матрица 17 shadcn-компонентов с переключением variant/size | 2 часа |
| **P2** | Typography (§1.3) — 4 шрифта + контролы + живое превью + шкала | 1 час |
| **P3** | Palette Explorer (§1.4) — swatch-сетка + dark/light toggle + WCAG контраст | 45 мин |
| **P4** | Pattern Families (§1.2) — карточки 15 семейств + ссылки | 30 мин |
| **P5** | Spacing Tokens (§1.5) — сетка + радиусы + тени | 30 мин |
| **P6** | Advanced Ergonomics (§1.7) — Snippets, Density toggle, WCAG, Stress-states | 45 мин |
| **P7** | Футер + техническая инфа + финальная проверка | 10 мин |
| **Итого** | | **~5.5 часов** |

---

## 7. Что НЕ входит (out of scope)

- Не вставляем iframe'ы с live-примерами
- Не делаем «live code editor» внутри Playground
- Не интегрируем Figma
- Не подключаем платные маркетплейсы
- Не делаем Storybook-подобный docs-generation
- Не переписываем существующие компоненты

---

## 8. DoD

- `#/design-playground` открывается в Editor
- Все 17 базовых компонентов отрендерены в галерее с переключателями variant/size
- 15 Pattern Families показаны карточками со ссылками на источники
- 4 шрифта визуализированы, живое превью работает
- Palette Explorer показывает DARK/LIGHT/NEON swatch'и
- Spacing + радиусы визуализированы
- `tsc --noEmit` — 0 ошибок
- Все импорты — из существующих node_modules (0 новых зависимостей)