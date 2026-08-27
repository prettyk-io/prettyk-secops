# BrowserStage — список поломок (27 авг 2026)

Выявлено при визуальной инспекции EditorWorkbench → Browser Stage.

## Проёб Keeper Dev (27 авг, ~17:00)

Карточки Wave 3 F-1..F-4 были нарезаны братьям, **хотя Keeper Dev уже сам починил эти же баги в BrowserStage.tsx и EditorWorkbench.tsx** до отправки копипаст. Boss закрыл бэкенд-часть (B-1..B-3 — реально новые). Flash обнаружил, что F-1, F-3, F-4 уже в коде, и доделал только prefix-gate в BrowserPanel.tsx + 4 type-ошибки в execution/-файлах.

**Причина:** не сверил состояние кода после собственных правок перед нарезкой бэклога. Делаю вывод: после любой собственной правки → `git diff --stat` + перечитать затронутые файлы перед тем как нарезать карточки на ту же тему.

## Файлы-участники
- `frontend/src/terminal/BrowserStage.tsx` — основной UI браузерной панели
- `frontend/src/workbench/EditorWorkbench.tsx` (стр. 1205–1240) — рендер и пропсы
- `orchestrator/browser/browser_service.py` — CDP-функции (navigate/screenshot/highlight/eval/observe)
- `orchestrator/tools/data_playground.py` (стр. 859–863) — маршруты API

## Поломки (4 шт.)

### 1. Схлопывание геометрии вьюпорта (критично)
- **Симптом:** Внутри вкладки Browser правой панели компонент занимает ~40% ширины и ~90px высоты при доступной высоте 800–900px.
- **Причина:** BrowserStage получает `style={{ width: 42% }}` от `widthPercent`; отсутствуют `h-full flex-1 min-h-0`; родитель `.overflow-y-auto p-3` в EditorWorkbench ломает flex-растяжение.
- **Файл:** BrowserStage.tsx (корневой div) + EditorWorkbench.tsx (стр. 1169, 1206)

### 2. Битый скриншот (Double Data URI)
- **Симптом:** Вместо скриншота страницы — браузерный глиф «битая картинка» + alt «Live viewport». Наложение бэджа «● Recording clicks».
- **Причина:** Бэкенд `browser_screenshot()` возвращает строку с префиксом `data:image/png;base64,...`. Фронтенд `BrowserStage.tsx` (стр. 144) делает повторную конкатенацию: `src={`data:image/png;base64,${screenshot}`}`, получается двойной префикс.
- **Файл:** browser_service.py (стр. 103) + BrowserStage.tsx (стр. 144)

### 3. Мёртвая адресная строка
- **Симптом:** Адрес выглядит как часть UI, но не кликабелен, не фокусируется, Enter не работает.
- **Причина:** Рендерится как статичный `<span className="truncate">{displayUrl}</span>` (стр. 119).
- **Нужно:** `<input>` со стейтом `navUrl`, `onKeyDown` Enter → `POST /api/browser/navigate`, кнопка «Go» / Enter.

### 4. Мёртвые кнопки ← и →
- **Симптом:** Кнопки навигации (back/forward) визуально есть, но ни на что не реагируют.
- **Причина:** EditorWorkbench (стр. 1207) не передаёт пропсы `onNavigateBack`, `onNavigateForward`, `onReload` в `<BrowserStage />`. В бэкенде нет эндпоинтов `/api/browser/back` и `/api/browser/forward`.
- **Нужно:** Добавить `browser_back()` / `browser_forward()` в browser_service.py + маршруты в data_playground.py. Фронтенд — прокинуть хэндлеры из EditorWorkbench в BrowserStage.

## Порядок правок
1. **Backend (Boss):** browser_service.py → `browser_back()` / `browser_forward()`; убрать префикс в `browser_screenshot()`; data_playground.py → маршруты `/api/browser/back` и `/api/browser/forward`.
2. **Frontend (Flash):** BrowserStage.tsx → живой `<input>` адрес с навигацией; убрать двойной префикс скриншота; `h-full w-full flex-1` геометрия. EditorWorkbench.tsx → прокинуть хэндлеры навигации в `<BrowserStage />`; таб-контейнер с `h-full` без `overflow-y-auto` для browser-вкладки.