# Flash — MEGA-нарезка: PK-DSL Sugar UI + COSMO Visualization

> **Правила:** тесты точечные (`npx vitest run src/...`). Коммиты/пуши — только по приказу. Не стешить чужой WIP.

---

## Блок 1: PK-DSL — Monaco Language Intelligence

### DSL-F1 — Monaco автодополнение коротких глаголов (1h)
Файл: `frontend/src/editor/MonacoLanguageProvider.ts`
Короткие алиасы в автодополнении:
`Клик` ↔ `Нажать`, `Вставить` ↔ `ВставитьЗначение`, `Ждать` ↔ `ЖдатьЭлемент`, `Скрин` ↔ `Скриншот`, `Текст` ↔ `ПолучитьТекст`, `Значение` ↔ `ПолучитьЗначение`, `Атрибут` ↔ `ПолучитьАтрибут`, `Дописать` ↔ `ДописатьТекст`, `Очистить` ↔ `ОчиститьЗначение`, `Выбрать` ↔ `ВыбратьПоТексту`.
Оба варианта видны при вводе, оба ведут к одному wire.
Приёмка: `test_monaco_sugar.test.ts` → 5+ тестов.

### DSL-F2 — Smart Locator Hover в Monaco (1.5h)
Файл: `frontend/src/editor/MonacoHoverProvider.ts`
Наведение на селектор → подсветка элемента в BrowserStage.
Интеграция с `BrowserStage.tsx` через `postMessage` / shared state.
Приёмка: hover на `Клик Войти` → `<button>Войти</button>` подсвечен в BrowserStage.

### DSL-F3 — LED Gutter + Step Play `[▶]` (1.5h)
Файлы: `frontend/src/editor/MonacoGutter.tsx`, `frontend/src/editor/StepPlayButton.tsx`
Gutter decoration: 🟢 (passed), 🔴 (failed), 🟡 (failsafe), ⚪ (not run).
Клик `[▶]` на строке → выполнить один шаг.
LED обновляется по факту из execution trace.
Приёмка: `test_monaco_gutter.test.ts` → 5+ тестов.

### DSL-F4 — Sugar Diagnostics (1h)
Файл: `frontend/src/editor/MonacoDiagnostics.ts`
Ошибки парсинга sugar → понятное сообщение:
- `Клик ".NET Core"` → «Неоднозначный селектор. Используйте `Клик text ".NET Core"` или `Клик css ".NET"`»
- `Вставить $var "значение"` → «Порядок аргументов: Вставить <селектор> <значение>»
Приёмка: `test_sugar_diagnostics.test.ts` → 5+ тестов.

---

## Блок 2: COSMO-UI — Лесенка Cosmoport & App Graph

### COS-F1 — CosmoLadderFields: app → build → deploy → URL (2h)
Файлы: `frontend/src/form/CosmoLadderFields.tsx`
Три каскадных `<Select>`:
1. Выбор приложения (из API `GET /api/cosmo/ladder`)
2. Выбор сборки (builds[])
3. Выбор деплоя → URL автозаполнен
Интеграция с формой запуска: подстановка `project_id`, `base_url_override`.
Приёмка: выбор «Платёжный хаб» → сборки → деплои → URL заполнен. 5+ тестов.

### COS-F2 — App Graph Explorer: иерархия Domain → Level 0/1/2/3 (2h)
Файлы: `frontend/src/explorer/AppGraphExplorer.tsx`
Дерево: Domain → Groups (L2/L3) → Apps (L1) → Libraries (L0).
Каждый узел: иконка, статус последнего Run, индикаторы.
Раскрытие/сворачивание, поиск, контекстное меню (Run/Edit/View findings).
Приёмка: домен «Цифровой рубль» → группа «Платежи» → приложения. 8+ тестов.

### COS-F3 — CosmoDashboard: верхнеуровневый дашборд домена (1.5h)
Файлы: `frontend/src/dashboard/CosmoDashboard.tsx`
Карточки: Apps всего, Runs сегодня, Findings открытые, Admission-статус.
График: Runs за неделю (passed/failed/blocked).
Приёмка: 4 карточки + график. 3+ теста.

---

## Блок 3: COSMO-PIPELINE-VISUAL — Визуализация Pipeline

### COS-F4 — PipelineBrick Catalog UI (1.5h)
Файлы: `frontend/src/pipelines/BrickCatalog.tsx`
Список доступных Bricks из `GET /api/bricks`.
Фильтр по типу: SAST / SCA / Build / Deploy / DAST / Gate.
Карточка Brick: name, type, executor, image, inputs/outputs, depends_on.
Drag-and-drop в Pipeline Editor.
Приёмка: 8+ тестов.

### COS-F5 — Pipeline DAG Visualization (2h)
Файлы: `frontend/src/pipelines/PipelineDAG.tsx`
Визуализация DAG: узлы (Batches) + рёбра (depends_on).
Статус каждого Batch: pending/running/passed/failed/blocked.
Gates между Batches с индикаторами.
Цветовая схема: passed=зелёный, failed=красный, blocked=оранжевый, running=синий.
Приёмка: 6+ тестов (визуализация + статусы).

### COS-F6 — Run Control Panel: запуск и мониторинг (2h)
Файлы: `frontend/src/runs/RunControlPanel.tsx`
Кнопки: Start / Cancel / Rerun.
Прогресс-бар: Batches + Gates.
Live-лог: streaming из `GET /api/runs/{id}/log?stream=true`.
Вкладки: Overview / Batches / Gates / Findings / Evidence.
Приёмка: 8+ тестов.

---

## Блок 4: COSMO-GATE-UI — Security Gates UI

### COS-F7 — Gate Configuration Panel (1.5h)
Файлы: `frontend/src/gates/GateConfigPanel.tsx`
Редактор Gate-политики: `rules[]` = `{finding_type, action, max_count}`.
Predefined profiles: «Стандарт ЦБ», «Pre-release», «Emergency».
Визуальное перетаскивание Gate между Batches.
Приёмка: 5+ тестов.

### COS-F8 — Admission Gate Panel (1h)
Файлы: `frontend/src/gates/AdmissionPanel.tsx`
Сводка: все Gates + их решения.
Ручное решение: Pass / Block / Request re-run.
Подпись: комментарий + timestamp.
ГОСТ-Акт: кнопка «Сформировать Акт».
Приёмка: 4+ теста.

---

## Блок 5: COSMO-REPORT-UI — ГОСТ-Акт

### COS-F9 — GOST Act Preview (1h)
Файлы: `frontend/src/reports/GOSTActPreview.tsx`
Предпросмотр HTML-Акта в iframe.
Данные из `GET /api/runs/{id}/act`.
Кнопка «Печать» / «Сохранить PDF».
Приёмка: 3+ теста.

---

## Блок 6: PW-AIRGAP-UI — Browser Stage & noVNC

### PW-F1 — BrowserStage: noVNC iframe + resize (1h)
Файлы: `frontend/src/terminal/BrowserStage.tsx`
Встраивание noVNC через `<iframe>`.
Кнопка «На весь экран» / «Авторский 58/42».
Обработка resize.
Убрать скриншот-поллинг и `clickCoordinate.ts`.
Приёмка: 3+ теста.

### PW-F2 — Studio Record UX: живой клик → DSL-предложение (1.5h)
Файлы: `frontend/src/studio/RecordOverlay.tsx`
Оверлей поверх noVNC: цветная рамка при наведении.
Клик → карточка с proposal (Accept/Reject).
Ambiguous-селектор → выбор из нескольких.
Приёмка: 5+ тестов.

### PW-F3 — Runtime Switcher (dev only) (0.5h)
Файлы: `frontend/src/settings/RuntimeSwitcher.tsx`
Переключатель: Playwright / Selenium.
Виден только в dev-режиме (флаг `?dev=true`).
Влияет на `PK_BROWSER_RUNTIME` в запросе Run.

---

## Итого Flash

| Блок | Задач | Часы |
|---|---|---|
| PK-DSL Sugar UI | F1–F4 | 5h |
| COSMO-UI | COS-F1–F3 | 5.5h |
| COSMO-PIPELINE-VISUAL | COS-F4–F6 | 5.5h |
| COSMO-GATE-UI | COS-F7–F8 | 2.5h |
| COSMO-REPORT-UI | COS-F9 | 1h |
| PW-AIRGAP-UI | PW-F1–F3 | 3h |
| **ИТОГО** | **16 задач** | **22.5h** |

Приоритет: DSL-F1 → DSL-F3 → COS-F1 → COS-F2 → COS-F4 → COS-F5 → COS-F6 → COS-F7 → COS-F8 → PW-F1 → PW-F2 → COS-F3 → COS-F9 → DSL-F2 → DSL-F4 → PW-F3.