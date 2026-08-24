# FE vnext — архитектура без RJSF

> **CANON SEEKER** — hub topic. Slice: **13 августа 2026**.
> Архитектурные решения для следующей версии фронтенда, рождённые отказом от
> RJSF / JSON Schema. На птичьих правах: тезисы канонизированы, код строится.
> Реестр: [`INDEX.md`](INDEX.md). Связан: [`split-canon.md`](split-canon.md),
> [`prettyk-core.md`](prettyk-core.md), [`manifest-sot.md`](manifest-sot.md).

## 0. Стек — утверждён

| Компонент | Выбор | Обоснование |
|---|---|---|
| UI-библиотека | **antd 5** + ProComponents | ProLayout/ProTable для админки; кастомная тема через ConfigProvider; тем 5 палет кастомно |
| Редактор кода | **Monaco** (не RJSF-виджет) | Кастомный язык PrettyK; автокомплит, signature help, diagnostics; 32 строки |
| Сборка | **Vite** | Уже |
| Роутинг | **Без react-router** | sessionStorage screen + user (канон fe-shell) |
| Валидация конструктора | **Playground :8765** | `validateConstructorBackend()` |
| Валидация полей | **Свой (карманный)** | ~6 полей, 30 строк |
| Состояние формы | **React useState/useReducer** | Без formData-магии |
| Темы | **Свой ThemeProvider** | catalog.ts → tokens.ts; 5 тёмных палитр; тёмный default |

**Не использовать:** RJSF, JSON Schema (ajv) для формы, `formData`-прослойку, MUI, react-router.

**Airgap:** бандл самодостаточен. Никаких CDN, Google Fonts, внешних API. Всё вкомпилено.

**CI / пайплайн:**
- `prettyk-pure` (CANON BASE) — **без спецификации CI**. Поддерживает GitHub Actions, GitLab CI, Jenkins; коробка не привязывается к вендору.
- `cosmo` (INTEGRATION) — **GitLab CI** (на базе DjiGit — РФ-approved форк GitLab; по тексту — «GitLab»). Стек заказчика.
- Обкатка/CI у нас — **GitHub Actions** (репозиторий уже на GitHub). GitLab для интеграционного пайпа заказчика, не для нашего обкаточного CI.

## 1. 14 обязательных архитектурных решений

| # | Решение | Следствие отказа от RJSF |
|---|---|---|
| 1 | Прямой React-рендер: `manifest.json → маппер → React DOM` | Нет JSON Schema как прослойки |
| 2 | `ManifestForm.tsx` — кастомный маппер manifest → UI | Нет RJSF `<Form>` |
| 3 | `<ConstructorWidget />` — самостоятельный, не виджет | Один инстанс Monaco, не пересоздаётся |
| 4 | Валидация конструктора — только через playground | Нет ajv-валидации кода |
| 5 | Валидация manifest-полей — карманная (~30 строк) | Нет 22 файлов `schema/` |
| 6 | Состояние формы — `useState<ManifestData>` | Нет RJSF `formData` |
| 7 | Сохранение — прямой маппинг `state → JSON.stringify` | Нет `coerceFormValue`, `effectiveSchema` |
| 8 | Ролевая модель — React-контекст / HOC | Нет мутации JSON Schema |
| 9 | Секции/табы — свой layout | Нет `ObjectFieldTemplate` |
| 10 | Data-модули — рендер как карточки | Нет `ArrayFieldTemplate` |
| 11 | Шаги сценария — свой список + drag-and-drop | Нет RJSF-array |
| 12 | Импорт/экспорт — без JSON Schema-валидации | Нет `validateManifest()` через ajv |
| 13 | Библиотека компонентов — antd 5 | Утверждено; не MUI |
| 14 | Темы — свой ThemeProvider | Не зависит от RJSF |

## 2. Структура папок (vnext)

Root кода vnext = **`cosmo/`** (workspace из `MANTRA.md`).
Монолит `src/`: коробка + слоты под интеграцию (split-canon). Разницы коробка/интеграция на
уровне папок нет — только файлы интеграции не импортируются в CANON.

```text
cosmo/
  src/
    manifest/           # manifest → UI маппер (решение #2)
      ManifestForm.tsx  # корневая форма
      ManifestSteps.tsx # список шагов сценария (решение #11)
      ManifestMeta.tsx  # мета-поля (id, target, gate...)
      ManifestDataModules.tsx  # data-модули (решение #10)
      ManifestSave.tsx  # сохранение (решение #7)
    validation/         # карманный валидатор (решение #5)
      validateManifestFields.ts  # ~30 строк
    roles/              # ролевая модель (решение #8)
      RoleGuard.tsx     # HOC
      RoleContext.tsx   # контекст
    editor/             # конструктор Monaco (решение #3)
      ConstructorWidget.tsx  # самостоятельный компонент
      ... (из monaco/ перенести)
    theme/              # без изменений (решение #14)
    shell/              # оболочка (Login, Home, History)
    keywords/           # без изменений
    generated/          # без изменений (keywords.json, method_ids.json)
    admin/              # админка (на ProLayout)
    App.tsx             # точка входа
```

## 3. Что вырезается (не переносить из legacy)

- `frontend/src/schema/` — **22 файла**, всё дрова для RJSF
- `frontend/src/form/` — RJSF-виджеты, `uiSchema.ts`, `templates.tsx`
- `@rjsf/core`, `@rjsf/antd`, `@rjsf/validator-ajv*` — npm-зависимости
- `formData`-ориентированный код
- `json-schema`, `ajv`, `json-schema-*` — npm-зависимости

## 4. Что сохраняется (перенести как есть)

- `frontend/src/monaco/` → `editor/`
- `frontend/src/keywords/` → `keywords/`
- `frontend/src/generated/` → `generated/`
- `frontend/src/theme/` → `theme/`
- `frontend/src/shell/LoginPage.tsx`, `HomePage.tsx`, `HistoryPage.tsx`, `auth.ts` → `shell/`
- `frontend/src/api/editorValidate.ts` → `api/`
- `frontend/src/admin/` (кроме интеграционных частей — см. split-canon)

## 5. Не делать преждевременно

- Не экстрактить `@pk/core` / `@pk/ui` / `@pk/editor` как отдельные пакеты. Сначала монолит, потом при необходимости.
- Не переписывать `orchestrator/`.
- Не добавлять react-router.
- Не менять Monaco на CodeMirror.

**Манифест.** JSON Schema больше не генератор формы (форма = прямой маппер, решение #1/#2).
`docs/manifest.json` больше не «SoT как раньше»: форма не производится из JSON Schema, а рендерится
прямым маппером из runtime-контракта. Правка манифеста — **по воле владельца**; любые поля/контракты,
нужные vnext, агент вправе менять. Порядок смены поля: [`development.md`](../development.md).

## 6. Эстетика (единый дизайн-язык)

**Почерк: glass + webm навигация, тёмный solid для рабочих зон.**

| Экран | Стиль | Обоснование |
|---|---|---|
| Login | Максимальный glass + webm background | Витрина; сильный первый экран |
| Header (шапка, везде) | Лёгкий glass (backdrop-filter blur) | Сквозной почерк |
| Home / History | Лёгкий glass карточек, тёмный фон без webm | Навигация, не работа |
| Editor / форма | Твёрдая тёмная поверхность | Здесь работают, не любуются |
| Admin | ProLayout sidebar = glass; content = solid dark | Навигация стеклянная, данные твёрдые |
| Results | Твёрдый тёмный | Читаемость отчётов |

**Admin-темплейт (Ant Design Pro):** `@ant-design/pro-components` (npm, бесплатно) — уже в deps. Даёт **структуру**: `StatisticCard`, `ProTable`, `ProLayout`, дашборд-схемы. CSS натягиваем **свой** поверх — цвета/скругления/фон из ThemeProvider, не из темплейта. **Figma-темплейт** («Ant Design System for Figma / Pro Template») — коммерческий, для дизайн-референса (не код); решение о покупке за владельцем.

**Tailwind:** вокруг Monaco и на форме/карточках/кнопках. Сам Monaco красим через `defineTheme()`.

## 7. Monaco — расширенные возможности (vnext, без RJSF)

Monaco больше не в чужом DOM — свой контейнер, свой z-index, свои обработчики.

| Возможность | vnext |
|---|---|
| Свой layout вокруг Monaco | Любой flex/grid, хоть Tailwind |
| Decorations API 2.0 | Цветные подложки, иконки у строк |
| Overview Ruler | Свой контейнер, свой ресайз |
| Inline ghost text | Серые подсказки прямо в коде |
| Custom gutters | Иконки failsafe, статус шага |
| CodeLens 2.0 | Кнопка «Проверить сценарий» в редакторе |
| Sticky scroll | Заголовок сценария при прокрутке |
| Bracket pair colorization | Под русские скобки |
| Перерендер при табах | **Никогда** — Monaco живёт один раз |

## 8. Satellite monitoring (pure канон)

Самописный `secops-lab-satellite-service` — **неотъемлемая часть поставки pure**.
Оформление **уже OK**. To evolve (P3, nice to have):

- Единые CSS-переменные с Admin/Editor.
- Компактный виджет состояния всех сервисов (Grid, ZAP, Allure, Dojo) одной карточкой.
- Стык с Admin NotifyPanel (health-алерты).

## 9. Allure / Dojo (pure канон)

- **Allure3 — основной** в коробке (тёмная тема из коробки, Preact SPA легче, наш форк `pk-plugin-awesome`, categories/variables/environment).
- **Allure2 — fallback** для integration.
- Перепил Allure3 под свой дизайн (форк `web-awesome`, Preact) — **после** vnext формы/Editor.
- Admin завязана на Allure + Dojo (честный статус, KPI, evidence).

**Airgap risk (allure/Dojo в integration):** не наша проблема. В коробке — точно да; в интеграции — как решит банк. Allure2 в интеграции доступен (уже есть).

## 10. Gap analysis — cutover vnext vs legacy (13 авг 2026, Boss)

> **Статус vnext:** 180 файлов в `src/` из 621 legacy. ROOT, ED, FORM, SHELL, SHELL-1…5, ST-1…10, WS-1…10, INT-1…6 — **сданы**. Playwright e2e полный цикл зелёный (4.0s).

### Что в vnext уже есть (core loop)

| Модуль | Файлы vnext | Legacy | Статус | Эпик |
|---|---|---|---|---|
| `editor/` | Monaco + constructor + setup + semantic tokens + navigation + signature + validation bridge | Monaco via @monaco-rjsf | ✅ | VN-ED-1…4 |
| `keywords/` | catalog, KeywordsContext, keywordsFromManifest | As-is | ✅ | VN-ED-2 |
| `generated/` | Generated keywords/method-ids | Generated | ✅ | VN-ED-2 |
| `manifest/` | ManifestForm (прямой маппер), ManifestSteps, поля, валидация, defaultManifest, types | form/ (25) + schema/ (22) | ✅ | VN-FORM-1…5 |
| `studio/` | Полный цех: дерево, табы, формы модулей, фаззер, Monaco-табы | 161 файл | ✅ | VN-ST-1…10 |
| `checks/` | types, store, hashRoute, closeGuard | 16 | ✅ | VN-WS-1…4 |
| `app/` | SecurityContext, ValidationFlow, GotoPage | 24 | ✅ | VN-WS-5…7 |
| `shell/` | auth (generic operator), LoginPage (glass), HomePage (заглушка), HistoryPage (заглушка) | 3 + App routing | ✅ | VN-SHELL-1…5 |
| `roles/` | RoleContext, RoleGuard (механизм, без банковских ролей) | Role gating | ✅ | VN-FORM-4 |
| `theme/` | ThemeProvider, catalog, tokens (5 тёмных палитр) | ConfigProvider theme | ✅ | VN-ROOT-2 |
| `storage/` | draft (localStorage, дебаунс 500ms) | localStorage draft | ✅ | VN-ST-3 |
| `utils/` | sortStrings, jsonTypes | sorts, types | ✅ | INT |
| `api/` | editorValidate (мост к пингвину :8765) | api/ | ✅ | VN-ED-4 |
| `App.tsx` | Полный хэш-роутер: login → home → history → admin (placeholder) → check (form/studio/results) | App shell + Screen state | ✅ | VN-WS-9 |
| **Итого core** | **~175 файлов** | — | ✅ | — |

### Что в legacy есть, в vnext нет — gaps к закрытию

| Модуль | Legacy файлов | Vnext файлов | Gap | Кто | Эпик |
|---|---|---|---|---|---|
| **`admin/`** | 65 | 3 (`evidence/` only) | **62 файла** — AdminLayout (ProLayout shell), Overview (KPI-карточки), Integrations (health-check), DeployRegistry, ProTable списки, банковские витрины VIS | Bro | VN-ADM-1…6 |
| **`results/`** | 62 | 11 (ядро из 5 файлов + тесты) | **51 файл** — ResultsWorkspace (табы Сводка/Журнал/Бланки), ResultsJournalPanel, blanks, launchUi, post-results хуки, экспорт | Flash | VN-RES-1…5 |
| **`HistoryPage`** | — | Заглушка | Не показывает реальный список чеков из checksStore | Flash | VN-RES-3 |
| **`components/`** | 35 | 0 | Shared-компоненты (KdtPageHeader, KdtStatusBadge, KdtSpinner, etc.) | Later | — |
| **`ui/`** | 12 | 0 | UI-утилиты (SecOpsMark, glass-card, etc.) | Later | — |
| **`assets/`** | Иконки PNG | 0 | Иконки (через theme/tokens или SVG inline) | Later | ADM-BRAND |

### Зависимости, которых нет в vnext package.json

| Dep | Где нужен | Критичность |
|---|---|---|
| `@ant-design/plots` | Admin EvidenceCharts (G2) | **P0** — уже в node_modules, портировано chart-porter'ом |
| `@tanstack/react-virtual` | Виртуальный скролл длинных списков (results journal) | P2 — опционально |
| `cmdk` | Command palette (нигде не используется в core loop) | P3 — можно дропнуть |
| `marked` | Markdown в описаниях бланков | P2 — нужен для blanks |
| `react-error-boundary` | Error boundary в shell | P2 — хочется, но не блокер |

### Что НЕ мигрирует (by design)

- `form/` (25) + `schema/` (22) — заменены на `manifest/` (прямой маппер)
- RJSF / ajv / json-schema / json-schema-merge-allof — выпилены
- `@monaco-rjsf` — заменён на голый `@monaco-editor/react`
- react-router — не было и не будет

### Приоритет закрытия

1. **VN-ADM-1…6 (Bro)** — Admin ProLayout shell + Overview + Integrations + G2-чарты + DeployRegistry. **6 тасков, 62 файла.**
2. **VN-RES-1…5 (Flash)** — ResultsWorkspace + ResultsJournalPanel + blanks + launchUi + History живые данные + экспорт. **5 тасков, 51 файл.**
3. **Later** — `components/` (35), `ui/` (12), `assets/`, missing deps (marked, react-error-boundary).

После VN-ADM и VN-RES — vnext можно резать вместо legacy. Оставшиеся `components/`/`ui/` — шлифовка, не блокер.