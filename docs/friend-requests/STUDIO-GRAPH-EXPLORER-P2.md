# STUDIO-GRAPH-EXPLORER-P2: полировка графа сущностей (полотно вводных + открытые баги)

> **ID:** `STUDIO-GRAPH-EXPLORER-P2`
> **Статус:** `ready` (handoff на Flash)
> **Роль / Исполнитель:** Flash
> **Слой:** Frontend (`cosmo/src/studio/graph/`) ↔ JSON Wired
> **Предшественник:** [`STUDIO-GRAPH-EXPLORER.md`](STUDIO-GRAPH-EXPLORER.md) (LANDED)

---

## 1. Продуктовая суть (зачем это всё)

В режиме **Студии** левая панель (2/3 экрана) — это **живой топологический граф архитектуры проверки** вместо сухого дерева. Сущности манифеста раскладываются по категориям-формам:

- **4 угловые формы (закреплённые):** `Модели страниц` (page-models), `Модели данных` (data-models), `Сценарии` (scenarios), `Коннекторы и интеграции` (connectors).
- **2 центральные плавающие формы:** `Фаззеры` (fuzzers), `Профили авторизации` (auth-profiles).

Клик по ноде открывает справа панель параметров сущности (без перехода в Monaco). Связи (рёбра) — auth-profile → коннекторы. Над графом — декоративный неоновый периметр (волны по краям канваса) + corner chevron-маркеры. Оверлей создания сущности — кнопка `+` (или контекст-меню по канвасу).

---

## 2. Что уже сделано (as-built, по файлам)

### `cosmo/src/studio/graph/`

| Файл | Назначение | Ключевые факты |
|---|---|---|
| `graphTypes.ts` | Типы модели графа | `GraphCategoryId` = 6 категорий; `GraphNode`, `GraphGroup`, `GraphCategory`, `GraphEdge`, `GraphPosition` |
| `graphAdapter.ts` | Детерминированный адаптер `StudioTree → GraphModel` | Раскладывает scenarios/pages/modules/fuzzers/resources по категориям; фолдеры → `GraphGroup` (split по категории); рёбра: auth-profile → коннекторы |
| `graphLayout.ts` | Детерминированный layout | `CORNER_CATEGORY_IDS` = 4 угловые; `isCornerCategory()`; константы геометрии (`GRAPH_NODE_WIDTH=180`, `GRAPH_NODE_HEIGHT=64`, `GRAPH_MIN_ZOOM=0.35`, `GRAPH_WORLD_PADDING=48`); `layoutCategories()`, `graphWorldBounds()`, `layoutGraph()`, `layoutForNewNode()` |
| `useGraphStore.ts` | Zustand store, сессионная персистенция | `STORAGE_KEY='kdt-graph-session-state-v1'`; сохраняет `positions`/`zoom`/`pan` в `localStorage` (debounce 200ms); `initFromModel` не перезатирает уже подвинутые юзером позиции |
| `StudioGraphExplorer.tsx` | Главный canvas-компонент | Рендер категорий/групп/нод/рёбер; drag категорий (только плавающие), pan канваса, zoom-to-cursor (Google Maps формула), контекст-меню, `clampPan`/`clampExit` |
| `GraphCorners.tsx` | Декоративные corner chevron-маркеры | SVG data-URI, только TL + TR, `zIndex:0`, `pointer-events:none` |
| `GraphWaveOverlay.tsx` | Неоновый оверлей волн | Только периметр (0 диагоналей); алгоритмы Mirror (Cyan CW / Violet CCW, burst 2s), Cascade, Creep-Slow-Mo, Heartbeat; corner glow строго ≤ 20px |
| `wavePresets.ts` | Математика периметра | `pointOnPerimeter`, `pointOnEdge`, `cornerPoint`, `cornerDepartingEdges` — все координаты строго на периметре |
| `useGraphIdle.ts` | Детект 20s простоя | Питает `isIdle` для волн |

### Тесты (все зелёные, 73/73 на момент handoff)
- `StudioGraphExplorer.test.tsx` — рендер категорий/групп/нод, рёбер (dedup), клик → открытие параметров, add flow, context menu, zoom-out floor + clamp pan, **"anchors corner categories so they cannot be dragged"**, **"drags floating center categories (fuzzers)"**, "clamps drag to visible viewport".
- `graphLayout.test.ts` — corner-anchored layout, edge-to-edge world на MIN_ZOOM, slot-резервирование, позиция новой ноды.
- `graphAdapter.test.ts` — все 6 категорий даже на пустом explorer, nested groups, dedup рёбер, routing категорий.

### CSS (`cosmo/src/styles.css` ~6180–6457)
- `.kdt-graph-node` (тёмное стекло, неоновый градиент рамки, `border-radius:6px`).
- `.kdt-graph-group` / `.kdt-graph-category` (floating dark-glass, `backdrop-filter: blur`).
- `.kdt-graph-category h3` + `.kdt-graph-category-icon` (16px иконка в хедере).
- `.kdt-graph-category-slots` / `-slot` (dashed grid, `grid-auto-rows:64px`).
- z-index слои: категория 0, группа 1, нода 2.

---

## 3. Открытые вопросы (что чинить — словами Максима)

### 🔴 3.1. Нет картинок в хедерах форм
> «нет до сих пор картинок в хедерах парящих форм».

**Код-указатель:** `StudioGraphExplorer.tsx:22-30` (`CATEGORY_ICON`), `:223` (рендер `<img className="kdt-graph-category-icon">`), CSS `styles.css:6401-6409`.

**Факт:** иконки ИМПОРТИРОВАНЫ и РЕНДЕРЯТСЯ в `<h3>` (PNG 3D из `cosmo/src/assets/studio-icons/*-3d.png`, они же продублированы в `cosmo/public/brand/studio-icons/`). Но визуально их нет. Гипотезы для проверки:
- иконки 16×16 + `opacity:.85` + `drop-shadow` на тёмном фоне — фактически невидимы;
- `.kdt-graph-category-slots` (absolute, `padding-top:58px`) перекрывает область `<h3>`;
- возможен конфликт z-index / `backdrop-filter` стекла.

**Требование:** иконки должны быть **видимы** в хедере каждой формы (и угловых, и плавающих), читаемого размера.

### 🔴 3.2. 4 угловые формы не приклеены к углам и не двигаются как надо
> «4 нужные формы не двигаются как должны, но не приклеены к углам как должны».

**Код-указатель:** `graphLayout.ts:5-14` (`CORNER_CATEGORY_IDS`), `:99-142` (`layoutCategories`), `:145-169` (`graphWorldBounds`), `StudioGraphExplorer.tsx:157-164` (`startCategoryDrag` — `if (isCornerCategory) return`).

**Что задумано:** 4 угловые категории (`page-models`, `data-models`, `scenarios`, `connectors`) должны быть **намертво приклеены к 4 углам канваса** (TL/TR/BL/BR) и НЕ перетаскиваться. 2 центральные (`fuzzers`, `auth-profiles`) — плавающие, перетаскиваются.

**Что по факту:** углы размещаются с отступом `GRAPH_WORLD_PADDING=48` и затем `graphWorldBounds` **пере-центрирует** мир (при `width = viewport / 0.35` `minX` уходит глубоко в минус) — в итоге угловые формы «плавают» в середине полотна, а не сидят в углах видимой области. Плюс у них остался `cursor:grab`, хотя drag заблокирован.

**Требование уточнить у Максима:** точную семантику приклейки углов (жёстко к видимым углам viewport при pan/zoom? или к фиксированным углам world?). Сейчас семантика противоречива — нужен явный вердикт.

### 🟡 3.3. Канвас не совсем ровный
> «Канвас не совсем ровно как я хотел сделан и это я укажу ему отдельно».

**Статус:** ждёт отдельной спецификации от Максима. В этом эпике — заглушка; не трогать layout до уточнения, чтобы не сломать уже сданное (edge-to-edge, zoom-to-cursor, clamp).

---

## 4. Ограничения и каноны (обязательные)

1. **Git:** никаких `git stash` / worktree / авто-коммитов / авто-пушей. Правки — локально в рабочей ветке. Коммит/пуш — только по явной команде Максима. В дереве сейчас большой WIP — **не трогать чужое, не «чистить дерево»**.
2. **Тесты:** гонять **только точечно** по изменяемым файлам (например `npx vitest run src/studio/graph/`). Запрещено гонять весь suite.
3. **Typecheck перед сдачей:** `npm.cmd run typecheck` (из `cosmo/`).
4. **Порты/проверка Vite:** `netstat -ano | findstr :5173` (не `Get-NetTCPConnection`).
5. **Иконки:** dark + light канон — см. `.opencode/rules/explorer-theme-icons.mdc`. Пакеты ассетов не шарить между продуктами.
6. **PrettyK / конструктор:** `CONSTRUCTOR_VISIBLE_LINES = 32` — не ужимать.
7. **Чанки чтения:** `Read` только `limit`+`offset` (500/1000/2000), если файл большой.

---

## 5. DoD (критерии сдачи полировки)

- [ ] Иконки видны в хедере **всех 6 форм** (угловых и плавающих), читаемого размера, в обеих темах (граф по замыслу остаётся тёмным стеклом).
- [ ] 4 угловые формы корректно приклеены к углам (после вердикта Максима из 3.2) и не реагируют на drag (нет `grab`-курсора).
- [ ] 2 плавающие формы перетаскиваются и клампаются в видимый viewport.
- [ ] Канвас — после отдельного уточнения Максима (3.3), без регресса edge-to-edge / zoom-to-cursor / clamp.
- [ ] `npm.cmd run typecheck` чистый; точечные тесты `src/studio/graph/` зелёные.
- [ ] Глазная проверка живой Студии (CDP Chrome `:9222`, см. skill `browser-hands-pure`).

---

## 6. Памятка по связям и телеком

- Граф питается от `buildGraphFromTree(tree)` (дерево из `collectStudioNodes`), состояние — `useGraphStore` (Zustand, localStorage).
- НЕ трогать контракт `GraphModel`/`GraphCategoryId` без необходимости — от него зависят тесты и StudioWorkspace.
- Визуальная верификация — скриншоты через CDP (`browser-hands-pure`), т.к. я (DeepSeek) не читаю картинки напрямую.
