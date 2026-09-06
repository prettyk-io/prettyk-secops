# SC-REVIVE + SC-WAR-REVIVE — Копипаста для Keeper

> **14 задач, 17 часов.** Воскрешение уничтоженных компонентов StudioV2 и War Room.
> Фундамент ЖИВ: `scenarioStepModel.ts`, `ScenarioDeckStore.ts`, `StudioV2.tsx` (shell), `CanvasV2.tsx` (entity).
> Всё на стеке: React 18 + Tailwind v4 + shadcn/ui + React Flow + Zustand.
> **Импорты: `@/components/ui/button`, `@/components/ui/input`, `@xyflow/react`, `lucide-react`.**

---

## RV-4: StepPillRow.tsx — строка шага с пилюлями (3h)

Создать `D:\prettyk-dev\cosmo\src\studio\StepPillRow.tsx`.

Контракт: компонент `StepPillRow` принимает `{ step: ScenarioStepModel, index: number, onChange: (patch: Partial<ScenarioStepModel>) => void, onDelete: () => void, onMoveUp: () => void, onMoveDown: () => void, onDebug: () => void }`.

Рисует одну строку шага внутри deck-ноды:
- **LED** — круг 6px, 6 цветов/анимаций: `queued` (#475569 none), `running` (#38bdf8 pulse), `success` (#22c55e static), `warning` (#f59e0b breath), `failure` (#ef4444 static), `predicted` (#a855f7 pulse). См. ключи в `scenarioStepModel.ts` → `StepLedState`.
- **Номер шага** — моноширинный, цвет #475569
- **Action pill** — `<select>` c `ACTION_KINDS` (18 вариантов), цветной border/текст через `actionColor()`, лейбл через `actionLabel()`
- **Strategy pill** (если `requiresStrategy(action)`) — `<select>` c `STRATEGY_KINDS` (6 вариантов) + `<input>` для `strategyValue`
- **Payload pill** (если `requiresPayload(action)`) — `<input>`, placeholder зависит от action (Open→"https://...", Wait→"1000", Let→"$var = value", иначе "$value"). Цвет текста — зелёный #10b981 если начинается с `$`
- **Кнопки** (видимы на hover группы): вверх ▲, вниз ▼, ▶ (Play, циан #38bdf8), ✕ (удалить, красный #ef4444)
- **Debug result** — галочка (зелёная) или крест (красный) если `debugResult` не null
- **onClick по строке** → вызывает `useBrowserStore().requestHighlight(step.strategyValue, step.strategy)` если есть strategy. Сам `useBrowserStore` — dead, не импортировать. Сделать `handleRowClick` заглушкой с console.log.

Стили: Tailwind где можно, остальное inline `style={{}}`. Цвет фона при hover: `hover:bg-white/5`. **НЕ импортировать antd.**

---

## RV-5: ScenarioDeckNode.tsx — капсульная нода (2h)

Создать `D:\prettyk-dev\cosmo\src\studio\ScenarioDeckNode.tsx`.

Кастомная React Flow нода (`NodeProps`), data = `{ deckId, title, description, stepCount }`.

Рисует:
- **Handle top** (target, циан 8px)
- **Шапка**: иконка-молния (градиент cyan→violet), название (жирный 14px), описание (10px #64748b), счётчик шагов (бейдж #1e293b bg)
- Клик по шапке → `toggleCollapsed(deckId)`
- Если НЕ collapsed: список `StepPillRow` для каждого шага из store + кнопка «+ Добавить шаг» (ghost, 7px высота, #64748b)
- Если collapsed: только шапка
- Empty state: «Нет шагов. Добавьте первый шаг ниже.»
- **Handle bottom** (source, циан 8px)

Импортирует: `StepPillRow`, `useScenarioDeckStore`, `StepPillRow`-тип из `scenarioStepModel`.

---

## RV-3: ScenarioFlow.tsx — canvas с deck-нодами (3h)

Создать `D:\prettyk-dev\cosmo\src\studio\ScenarioFlow.tsx`.

- Импортирует `ScenarioDeckNode` как custom `nodeTypes = { scenarioDeck: ScenarioDeckNode }`
- Хук `useEffect` при mount: вызывает `initDemoStore()` — читает `useScenarioDeckStore.getState()`, если `decks.length === 0`, создаёт 1 demo-deck с 9 шагами (Open→juice-shop, Click→close-dialog, Type→Email, Type→#password, Click→button Log in, Wait→2000, Spider, FuzzWave→xss_corpus, ActiveScan)
- Функция `buildDeckNodes(): Node[]` — читает `useScenarioDeckStore.getState().decks` и мапит в React Flow ноды с позицией `{x:60, y:20+i*620}`
- Рендерит `<ReactFlow>` с этими нодами, 0 edges, `fitView`, тёмный фон #09090b, Background, Controls, MiniMap
- Кнопка «WAR ROOM» в правом нижнем углу (абсолютный position, z-20) — градиент cyan→violet, белый текст. При клике вызывает `useScenarioDeckStore.getState().setWarRoom(true)`. Оборачивать в `useScenarioDeckStore` через отдельный хук если поле `warRoom` есть в сторе.

**Проверить:** есть ли `warRoom`/`setWarRoom` в `ScenarioDeckStore.ts`. Если нет — не добавлять, кнопку War Room не рендерить.

---

## WRV-1: useWarRoomTelemetry.ts — SSE мост (2h)

Создать `D:\prettyk-dev\cosmo\src\studio\useWarRoomTelemetry.ts`.

Хук `useWarRoomTelemetry(deckId: string)`:
- При mount: создаёт `EventSource` на `${LIVE_BASE}/api/diary?channel=telemetry` (см. `src/api/apiBase.ts` → `LIVE_BASE`)
- Парсит JSON из SSE-сообщений
- Если `event.kind === 'step.started'` → `setStepLed(deckId, event.step_id, 'running')`
- Если `event.kind === 'step.completed'` → `setStepLed(deckId, event.step_id, 'success')`
- Если `event.kind === 'step.predicted'` → `setStepLed(deckId, event.step_id, 'predicted')`
- Если `event.kind === 'fuzz.strike'` → `requestCameraFocus()` (заглушка: console.log)
- Если `event.kind === 'anomaly.detect'` → `requestCameraFocus()` (заглушка)
- Если `event.kind === 'run.ended'` → не трогает store
- При unmount: закрывает EventSource
- Импортирует `useScenarioDeckStore`

**Зависимость:** `LIVE_BASE` из `../../api/apiBase`. Проверить что там — вероятно `http://127.0.0.1:8767`.

---

## WRV-2: FuzzerStrikeOverlay.tsx — Canvas 2D визуализация (3h)

Создать `D:\prettyk-dev\cosmo\src\studio\FuzzerStrikeOverlay.tsx`.

Компонент `FuzzerStrikeOverlay` — абсолютно спозиционированный `<canvas>` (100% width/height, pointer-events:none, z-30) поверх React Flow.

При mount:
- Получает bounding rect контейнера React Flow
- Анимация: requestAnimationFrame → очистка canvas → отрисовка
- **CHARGE фаза** (первые 300ms при активации): 4 луча с углов экрана → центр. Цвет Cyan #38bdf8. Прозрачность 0→0.6→0. `ctx.strokeStyle`, `ctx.lineWidth = 2`, `ctx.lineTo`.
- **STRIKE фаза** (300–800ms): веер 30 лучей из центра в сторону цели (право-вниз). Цвет чередуется: Cyan #38bdf8, Violet #a855f7, Amber #f59e0b. `ctx.globalAlpha`.
- **SHOCKWAVE** (при вызове `triggerShockwave(x, y, color)`): радиальное кольцо радиус 0→80px, opacity 1→0, цвет Magenta #D946EF или Amber #F59E0B. duration 400ms.

Состояние управляется через `useState<{ active: boolean, shockwave: {x:number,y:number,color:string} | null }>`.

Экспортировать `FuzzerStrikeOverlay` и `triggerShockwave`.

---

## WRV-3: SynthesisBar + Camera Director (3h)

Добавить в `ScenarioFlow.tsx`:

**SynthesisBar** (компонент внутри ScenarioFlow, строка над React Flow):
- Если `warRoom === true` в store: показать бар
- Иконка scanner (циан) + «WAR ROOM» жирный шрифт
- Кнопка ✕ закрытия справа
- При `runPhase === 'passed'`: ShieldCheck (зелёный) + «VERDICT: PASSED» + кнопка «Результаты →»
- При `runPhase === 'failed'`: ShieldAlert (красный) + «VERDICT: FAILED»
- При других фазах: спиннер «Выполнение...»

**Camera Director:**
- Хук `useReactFlow()` — `fitView` + `setCenter`
- `useEffect` с интервалом 300ms: проверяет `useScenarioDeckStore.getState().consumeCameraFocus()`, если есть фокус → `fitView({duration:500, padding:0.2})`

**Story store расширение** (добавить в ScenarioDeckStore.ts если нет):
```ts
warRoom: boolean;
setWarRoom: (active: boolean) => void;
runPhase: 'idle' | 'warming' | 'executing' | 'synthesizing' | 'passed' | 'failed';
cameraFocus: string | null;
requestCameraFocus: (nodeId?: string) => void;
consumeCameraFocus: () => string | null;
```

Если этих полей нет в store — добавить с дефолтами (`warRoom: false`, `runPhase: 'idle'`, `cameraFocus: null`).

---

**После всех задач:** `cd D:\prettyk-dev\cosmo && npx tsc --noEmit` — должен быть чистым.