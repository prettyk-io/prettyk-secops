# Admin Design Showcase — План насыщения Design Playground

> **Gemini + Keeper · 24 августа 2026 · Build Mode**
> Соседние документы: [`2026-08-23-admin-poc-plan.md`](2026-08-23-admin-poc-plan.md) · [`sanctuary/DESIGN-WORKBENCH.md`](../sanctuary/DESIGN-WORKBENCH.md)
> Статус: план утверждён Максимом. Готов к исполнению.

---

## 1. Контекст

После бетонирования стека (23 авг 2026) PrettyK имеет два дизайн-языка:

```text
🎨 Studio / Canvas / War Room     →  shadcn/ui + Tailwind v4
⚙️ Admin (Control + SecOps + Dash) →  React Admin + Material UI (MUI)
```

Текущий Design Playground (#/design) — shadcn/ui. Admin-панели — MUI. Нельзя смешивать в одном SPA: глобальные стили конфликтуют.

## 2. Решение: Admin Showcase как отдельный SPA с редиректом

```text
Design Playground (#/design)
  [Theme Studio] [Component Catalog] [SecOps Patterns] [Tailwind Workshop] [🎛 Admin Showcase →]
                                                                              ↑ редирект на #/design-admin

Admin Showcase (#/design-admin) — новый SPA на MUI, ленивая загрузка
  [Data Gallery] [Form Patterns] [Navigation] [Themes] [Live Previews]
```

**Почему отдельный SPA:** MUI и Tailwind глобально конфликтуют. Ленивая загрузка — MUI грузится только при переходе.

**Связка:** в Design Playground добавляется таб «Admin Showcase» → `window.location.hash = '#/design-admin'`. Без загрузки MUI в shadcn-SPA.

---

## 3. Источники топовых компонентов

- **[Preline UI](https://preline.co/blocks/)** — 972 Tailwind-блока, крупнейшая библиотека в индустрии. Визуальный референс.
- **[MUI Templates](https://mui.com/material-ui/getting-started/templates/)** — 8 бесплатных (Dashboard, CRUD, Sign-in, Checkout). Прямые MUI-референсы.
- **[AdminKit](https://adminkit.io/)** — 500+ Bootstrap-элементов за $59. Клиенты: Microsoft, McAfee.
- **[React Admin Demos](https://marmelab.com/react-admin/Demos.html)** — 8 приложений с открытым кодом (E-commerce, CRM, Help Desk, Kanban, Team Wiki).
- **[React Admin Enterprise Demo](https://marmelab.com/ra-enterprise-demo/)** — Tabbed DataGrid, Accordion Form, Editable DataGrid, Live List.
- **[shadcn/ui Blocks](https://ui.shadcn.com/blocks)** — Dashboard-01, Sidebar-03/07, Login-03/04. Референс для Studio-части.
- **[Flowbite Blocks](https://flowbite.com/blocks/)** — Tailwind-компоненты. Дополнительный референс.

---

## 4. Состав Admin Showcase

### Таб 1: Data Gallery (15 компонентов)

Референсы: Preline Data Display + MUI Charts + React Admin Demos.
Реализация: MUI `<Card>`, MUI X Charts / Recharts, MUI X DataGrid, `<Timeline>`.

| # | Компонент | Референс | MUI-реализация |
|---|---|---|---|
| 1 | KPI Cards (17 var) — иконки, тренды, спарклайны | Preline KPI Cards | `<Card>` + `<Typography>` + `<TrendingUp>` |
| 2 | Bar Charts (9 var) | Preline Bar Charts | MUI X Charts `<BarChart>` |
| 3 | Pie & Radial Charts (6 var) | Preline Pie Charts | Recharts `<PieChart>` |
| 4 | Chart Compositions (10 var) — грид из графиков | Preline Chart Compositions | CSS Grid + MUI X Charts |
| 5 | Progress Cards (15 var) — бары, кольца, стеки | Preline Progress Cards | `<LinearProgress>` + `<CircularProgress>` |
| 6 | Activity Feeds (6 var) — лента событий | Preline Activity Feeds | `<List>` + `<ListItem>` + `<Chip>` |
| 7 | Timeline (6 var) — хронология прогонов | Preline Timelines | `<Timeline>` (MUI Lab) |
| 8 | User & Contact Tables (10 var) | Preline User Tables | MUI X `<DataGrid>` |
| 9 | Order & Billing Tables (7 var) | Preline Order Tables | MUI X `<DataGrid>` |
| 10 | Description Lists (9 var) — key-value | Preline Description Lists | `<Grid>` + `<Typography>` |
| 11 | List Groups (12 var) | Preline List Groups | `<List>` + `<ListItemButton>` |
| 12 | Tabbed DataGrid — табы по статусам | RA E-commerce Orders | `<Tabs>` + MUI X `<DataGrid>` |
| 13 | Grid List — карточки вместо строк | RA E-commerce Products | `<ImageList>` + `<Card>` |
| 14 | Filter Sidebar + таблица | RA E-commerce Products | `<Drawer>` + MUI X `<DataGrid>` |
| 15 | Editable DataGrid — inline-редактирование | RA Enterprise Stores | MUI X `<DataGrid>` + `editMode="row"` |

### Таб 2: Form Patterns (12 компонентов)

Референсы: Preline Forms + RA Help Desk + RA Enterprise.

| # | Компонент | Референс | MUI-реализация |
|---|---|---|---|
| 1 | Create & Edit Forms (10 var) — поля, валидация | Preline Create & Edit | `<TextField>` + `<FormControl>` + `<Button>` |
| 2 | Form Pages & Settings (11 var) | Preline Form Pages | `<Grid>` + `<TextField>` + `<Switch>` |
| 3 | Option Pickers (13 var) — radio, checkbox, switch | Preline Option Pickers | `<RadioGroup>` + `<Checkbox>` + `<Switch>` |
| 4 | Selectable Cards & Lists (14 var) | Preline Selectable Cards | `<CardActionArea>` + `<Radio>` |
| 5 | Filter Bars (12 var) | Preline Filter Bars | `<Toolbar>` + `<TextField>` + `<Select>` |
| 6 | Select Menus (13 var) — autocomplete, multi | Preline Select Menus | `<Autocomplete>` + `<Select>` |
| 7 | Multi-step Wizard | RA Help Desk | `<Stepper>` + `<Step>` + `<StepContent>` |
| 8 | Accordion Form — сворачивающиеся секции | RA Enterprise | `<Accordion>` + `<AccordionSummary>` |
| 9 | Dialog / Sheet Form — создание в модалке | shadcn/ui + Preline | `<Dialog>` + `<TextField>` |
| 10 | Slider + Range — TTL, пороги | Retention UI (ADM-3) | `<Slider>` + `<Input>` |
| 11 | Alert / Notification Banners (severity) | MUI Templates | `<Alert severity="...">` |
| 12 | Button Gallery — primary, danger, outline, ghost, icon | MUI Components | `<Button variant="...">` |

### Таб 3: Navigation (6 компонентов)

Референсы: Preline Navigation & Layout + shadcn/ui Sidebar.

| # | Компонент | Референс | MUI-реализация |
|---|---|---|---|
| 1 | Dashboard Headers (7 var) | Preline Dashboard Headers | `<AppBar>` + `<Toolbar>` |
| 2 | Workspace Headers (12 var) — Space Switcher | Preline Workspace Headers | `<AppBar>` + `<Select>` + `<Breadcrumbs>` |
| 3 | Application Navbars (6 var) | Preline App Navbars | `<AppBar>` + `<Tabs>` |
| 4 | Sidebar Variants (3 var) — collapsed, expanded, icons | Preline + shadcn sidebar-07 | `<Drawer variant="permanent">` |
| 5 | Command Palette (6 var) — Cmd+K | Preline Command Palette | `<Dialog>` + `<TextField>` + `<List>` |
| 6 | Breadcrumbs (из MUI) | MUI Templates | `<Breadcrumbs>` + `<Link>` |

### Таб 4: Theme Gallery (4 MUI-темы с живым переключением)

| # | Тема | Палитра | Для какой панели |
|---|---|---|---|
| 1 | Telemetry Dark | Slate/Zinc + Cyan (#38bdf8) | Control Panel |
| 2 | Defense Purple | Deep Navy + Purple (#7c4dff) + Amber | SecOps Control |
| 3 | Dashboard Teal | Dark Slate + Teal (#2ee6a8) + Emerald | Dashboard |
| 4 | Light Contrast | White/Light Grey + Indigo accent | Дневной режим |

### Таб 5: Live Previews

Прямые ссылки на живые панели:

```text
[ Open Control Panel → ]    — #/control
[ Open SecOps Control → ]   — #/admin
[ Open Dashboard → ]        — #/dashboard
```

---

## 5. Донасыщение Studio Playground (shadcn/ui)

Из [shadcn/ui Blocks](https://ui.shadcn.com/blocks):

| # | Блок | Источник |
|---|---|---|
| 1 | Dashboard Block | dashboard-01: sidebar + charts + data table |
| 2 | Collapsible Sidebar | sidebar-07: сворачивающийся сайдбар |
| 3 | Sidebar with Submenus | sidebar-03: вложенное меню |
| 4 | Login Page Variant A | login-03: muted background |
| 5 | Login Page Variant B | login-04: form + image |
| 6 | Settings Page | shadcn settings block |

---

## 6. Реализация

### Файлы Admin Showcase (новый SPA)

| Файл | Содержание |
|---|---|
| `cosmo/src/design-admin/AdminShowcase.tsx` | Точка входа: MUI ThemeProvider, 5 табов, ленивая загрузка |
| `cosmo/src/design-admin/tabs/DataGallery.tsx` | 15 компонентов Data Display |
| `cosmo/src/design-admin/tabs/FormPatterns.tsx` | 12 форм и контролов |
| `cosmo/src/design-admin/tabs/Navigation.tsx` | 6 навигационных компонентов |
| `cosmo/src/design-admin/tabs/ThemeGallery.tsx` | 4 MUI-темы с живым переключением |
| `cosmo/src/design-admin/tabs/LivePreviews.tsx` | Ссылки на панели |

### Донасыщение Studio Playground (shadcn)

| Файл | Содержание |
|---|---|
| `cosmo/src/design-playground/sections/DashboardBlock.tsx` | shadcn dashboard-01 |
| `cosmo/src/design-playground/sections/SidebarVariants.tsx` | sidebar-03 + sidebar-07 |
| `cosmo/src/design-playground/sections/LoginPages.tsx` | login-03 + login-04 |
| `cosmo/src/design-playground/sections/SettingsBlock.tsx` | Settings page |

### Связка

| Файл | Изменение |
|---|---|
| `cosmo/src/design-playground/DesignPlayground.tsx` | +1 таб «Admin Showcase» → редирект на #/design-admin |
| `cosmo/src/checks/hashRoute.ts` | + роут #/design-admin |

---

## 7. Нарезка бэклога

| ID | Суть | Est | Кто |
|---|---|---|---|
| **DP-ADM-1** | Admin Showcase SPA: скелет (MUI ThemeProvider, 5 табов, React.lazy) | 2h | Boss |
| **DP-ADM-2** | Data Gallery: 15 компонентов (KPI, Charts, DataGrid, Timeline, Lists) | 4h | Boss |
| **DP-ADM-3** | Form Patterns: 12 компонентов (Forms, Selects, Wizard, Accordion, Alerts) | 4h | Boss |
| **DP-ADM-4** | Navigation: 6 компонентов (Headers, Sidebars, Command Palette) | 2h | Boss |
| **DP-ADM-5** | Theme Gallery: 4 MUI-темы с live-переключением | 2h | Keeper |
| **DP-ADM-6** | Live Previews: ссылки на #/control, #/admin, #/dashboard | 0.5h | Keeper |
| **DP-ADM-7** | Связка: таб «Admin Showcase» в Design Playground → редирект | 0.5h | Keeper |
| **DP-ADM-8** | Studio Playground: shadcn Dashboard Block + Sidebar Variants | 2h | Boss |
| **DP-ADM-9** | Studio Playground: Login Pages (2 var) + Settings Page | 1h | Boss |
| **DP-ADM-10** | Интеграция: tsc --noEmit, vitest, проверка конфликтов MUI/Tailwind | 1h | Keeper |
| | **ИТОГО** | **19h** | |

---

## 8. Распределение

| Кто | Карточки | Часы |
|---|---|---|
| Boss | DP-ADM-1,2,3,4,8,9 | 15h |
| Keeper | DP-ADM-5,6,7,10 | 4h |