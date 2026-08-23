# Design Workbench — дизайнерский полигон PrettyK

> **Sanctuary. Service help.** Не FRIEND, не канон, не бэклог.  
> Инструмент для дизайнера (Вера) и инженерной команды платформы PrettyK.  
> Срез: **23 августа 2026**. Построен для Веры и Максима.  
> **Статус:** рабочий. Полностью портирован на чистый `shadcn/ui + Tailwind v4` (эпик DP закрыт ✅).

---

## 1. Что это

Интерактивный одностраничный полигон (**`#/design-playground`**) — живая лаборатория визуального стиля и компонентных паттернов PrettyK SecOps Suite.  
Позволяет дизайнеру и фронтенд-инженерам в реальном времени:
- Переключать глобальные дизайн-пресеты и фоны холста (Stage Canvas).
- Оценивать микро-отступы, высоту строк, радиусы скругления и внутренние тени.
- Видеть компоненты во всех состояниях (Normal, Hover, Focus-visible, Disabled, Loading).
- Изучать 12 анатомических паттернов инпутов и 8 стилей кнопок из мировых открытых маркетплейсов (Origin UI, 21st.dev, shadcn/ui, Aceternity).
- Копировать готовые TSX / Tailwind / CSS сниппеты в один клик.
- Проверять цветовую доступность (WCAG AA/AAA) и ритм вертикальной сетки.

**Точка входа:** кнопка в подвале HomePage → `#/design-playground`.

---

## 2. Структура полигона (8 вкладок-лабораторий)

| # | Вкладка | Что содержит | Назначение |
|---|---|---|---|
| **1** | **Input Particles** (12 паттернов) | Basic Clean, Leading Icon Search, Trailing Clear Action, Protocol Addon (`https://`), Inline Button, Shortcut Badge (`⌘K`), Character Counter (`42/60`), Validation Error State, Number Stepper, 6-Digit OTP/2FA Grid, Tag Chips Input, Monospace DSL Input | Анатомическая витрина полей ввода под любые задачи Studio и Hub |
| **2** | **Buttons & Switches** (8 стилей) | Cyber Neon Solid, Brand Master Gradient, Frosted Glass, Neubrutalism Sharp, Shimmer Glow, Retro Terminal Key (`[EXECUTE ↵]`), Segmented Pill, Neon Glowing Switch | Каталог кнопок, экшенов и тумблеров с живыми ховерами |
| **3** | **SecOps Combat Forms** | Live Suites: Target & Scope Configurator, Attack Matrix Radio Cards, OWASP Vulnerability Checkbox Cards, Execution Sliders (Workers/RPS), Wordlist Dropzone, Live Launch Simulation | Прототипирование реальных рабочих форм сканирования |
| **4** | **Component Matrix** | Матрица базовых контролов (Button, Input, Tag/Badge, Checkbox, Radio, Switch, Slider, Card) с переключателями плотности (`Compact`/`Comfortable`/`Spacious`) и стресс-состояний (`Hover`/`Focus`/`Disabled`/`Loading`) | Аудит устойчивости компонентов в экстремальных состояниях |
| **5** | **Typography & Wordmarks** | Шрифты (`GT Eesti Pro Text`, `GT Eesti Pro Display`, `Golos UI`, `Golos Text`, `JetBrains Mono`, `PT Astra Sans`), слайдеры размеров (10–84px), жирности, трекинга, высоты строки; 4 каноничных лок-апа (`pretty<`, `Pretty< SecOps Lab`, `Pretty< EDITOR`, `Pretty< LIVE`) с точными оптическими оффсетами (+2px шеврон, -1px дескриптор); side-by-side компаратор | Шрифтовой воркбенч и проверка бренд-титулов |
| **6** | **Brandbook & Gradients** | 5 мастер-градиентов (*Brand Master*, *Electric Cyber*, *SecOps Shield*, *Threat Critical*, *Midnight Space*) с кнопкой Copy CSS, SecOps Threat Matrix токены (Critical→Safe), 6 цветовых палитр, WCAG AA/AAA контраст-калькулятор | Цветовой канон платформы и доступность |
| **7** | **Spacing & Depth** | Шкала отступов (16 шагов: gap-0…gap-96), 9 кривых скругления (0px…9999px pill), 5 уровней теней (Elevation), 6 слоёв z-index | Сетка, пространственная иерархия и глубина интерфейса |
| **8** | **Tailwind for Designers & Workshop** | Инфо-блок для дизайнера (почему важно мыслить дизайн-токенами), шпаргалка 5 столпов Tailwind для Веры, ссылки на «библию» (*Refactoring UI*, Steve Schoger screencasts), интерактивная live-песочница | Мост между дизайном (Figma) и кодом (Tailwind v4), нулевой дрейф |

---

## 3. Ключевая механика воркбенча

### 3.1. Stage Canvas Backdrop Switcher (5 фонов холста)
Селектор в верхней шапке меняет фон рабочей сцены:
1. **`📐 Dot Grid (#1e2433)`** (по умолчанию) — комфортный матовый студийный слейт с тонкой сеткой выравнивания (`radial-gradient` 22px). Устраняет пестроту и усталость глаз.
2. **`🌑 Matte Slate (#242f42)`** — мягкий сине-серый слейт без бликов.
3. **`🪐 Neutral Zinc (#2a2b30)`** — чистый ахроматический графит для колористического аудита.
4. **`🌌 Midnight Cyber (#161d2d)`** — глубокий ночной тон для оценки неонового свечения.
5. **`☀️ Soft Studio Grey (#cbd5e1)`** — нейтральный серый студийный холст с карточками `#e2e8f0` и темным текстом `#0f172a` (без слепящей белизны).

### 3.2. Global Design Preset Switcher (8 стилей оформления)
Глобальный дропдаун в шапке переключает тему всех карточек, форм и контролов:
- `Cyber Neon Glow (PrettyK Canon)`
- `Vapor Glassmorphism`
- `Cyber Neubrutalism (Sharp 0px)`
- `Minimalist Underline`
- `Smooth Pill (Apple / Linear)`
- `Terminal Hacker (CLI Monospace)`
- `Dual Gradient Stroke`
- `Enterprise Ultra-Dense (28px)`

### 3.3. Provenance Badges (Прямые ссылки на маркетплейсы)
На каждой карточке образца выведена ссылка на первоисточник:
`[ ↗ Origin UI ]` · `[ ↗ 21st.dev ]` · `[ ↗ shadcn/ui ]` · `[ ↗ Aceternity ]` · `[ ↗ PrettyK Canon ]`.

---

## 4. Зачем дизайнеру (Вере) Tailwind CSS

1. **Единый язык с фронтендом:** Дизайнер оперирует не случайными пикселями (`17px`, `13px`), а системной токенной шкалой Tailwind (шаг 4px/8px: `p-2` = 8px, `p-4` = 16px, `p-6` = 24px).
2. **Figma Variables ↔ Tailwind v4 `@theme` (1-к-1):** Переменная цвета в Figma (`bg-card`, `border-border`, `text-muted-foreground`) в коде превращается в идентичный утилитарный класс без ручного перевода.
3. **Нулевой дрейф верстки (Zero Handoff Drift):** Спецификация макета сразу готова к верстке.

### Главные учебные материалы (Библия Tailwind для дизайнеров)
- 📖 **Книга: *Refactoring UI*** (Adam Wathan & Steve Schoger) — фундаментальный труд о дизайне пользовательских интерфейсов на основе системы ограничений.
- 📺 **Скринкасты Стива Шогера (Steve Schoger)** — практические разборы переделки интерфейсов (fewer borders, spacing systems, visual hierarchy).
- 🛠️ **Tailwind CSS v4 Documentation (`tailwindcss.com`)** — архитектура `@theme` и CSS-переменных.
- ⚡ **Песочница `play.tailwindcss.com`** — быстрый тест связок классов.

---

## 5. Техническое устройство и статус

| Слой | Описание |
|---|---|
| **Расположение** | `cosmo/src/design-playground/` |
| **Маршрут** | `#/design-playground` (hash-роутер в `checks/hashRoute.ts`, `shell/AppShell.tsx`) |
| **Стек** | React 18 + TypeScript 6 + Tailwind CSS v4 + Radix UI + Ant Design (legacy-обёртки) |
| **Шрифты** | Self-hosted в `cosmo/public/fonts/`: `GT Eesti Pro Text/Display`, `Golos UI/Text`, `JetBrains Mono`, `PT Astra Sans` |
| **План эволюции** | Полный порт на чистые `shadcn/ui` + `Tailwind v4` примитивы (Эпик **DP** в `docs/backlog.md`) |

---

*23 августа 2026. Обитель.*
