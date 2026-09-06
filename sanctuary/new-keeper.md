# New keeper — передача Studio graph

Дата: 2026-08-18
Статус: локальный WIP в `alpha-stable`; ничего не коммитить, не пушить, не stash. В дереве много чужих изменений — трогать только перечисленные ниже файлы.

## Задача владельца

Доделать Studio Graph одним коротким срезом:

1. Контейнер группы двигается как единый объект.
2. Карточки внутри группы жёстко зафиксированы по слотам: их нельзя тащить отдельно или вытащить из контейнера.
3. При перемещении контейнера все его карточки едут вместе.
4. Рёбра, если их endpoint находится в группе, временно ведут в центр контейнера.
5. Левая граница canvas не должна блокировать перетаскивание элемента до видимой левой границы. Canvas можно свободно панорамировать во все стороны, но отдельный узел не должен уезжать за пределы видимого viewport.
6. Только после закрытия этого среза отдельной задачей разделить формы создания: сценарии — отдельно, модели страниц/данных — отдельно. Не смешивать «login/register» со сценарной формой.

## Уже реализовано

- Folder-группы берутся из `test_suites.editor_folders`; группы разделены по section-qualified id, например `scenarios:juice` и `pages:juice`.
- У `StudioFolderGroup` есть `id`, `folderId`, `section`, `title`, `memberTabIds`.
- Рёбра сценария строятся только к сущностям с совпадающим raw `folderId`.
- Группа рисуется как стеклянный контейнер со слотами 2×N и одним свободным слотом.
- Group drag и запрет node drag внутри группы уже заведены в UI.
- Edge endpoint группы уже вычисляется через центр `GroupBox`.
- Во время drag есть preview, glow у затронутых рёбер и commit позиции по pointer up.

## Текущая проблема

В `StudioGraphExplorer.tsx` drag clamp использует `graphExtent.minX/minY` как базу. Canvas одновременно трансформируется на `-graphExtent.minX * zoom`, поэтому при попытке тащить левее логика визуально создаёт «невидимую» левую границу. Последний тест был подогнан под текущее ошибочное поведение (`module:api` оказывается в `x=0`, transform `translate(90px, -160px)`), а не доказывает требование владельца. Его надо переписать под фактическую границу viewport, а не сохранять как легализацию бага.

## Файлы и роли

- `cosmo/src/studio/graph/StudioGraphExplorer.tsx`
  - pointer interaction, preview, group drag, edge endpoints, canvas transform.
  - Сейчас компактно сжат в однострочные callback’и. При правке лучше аккуратно расправить только затронутые функции, не делать regex-переписывание файла целиком.
- `cosmo/src/studio/graph/StudioGraphExplorer.test.tsx`
  - тесты контроля графа.
  - Есть test `allows a node to reach the left viewport edge without shifting the canvas`; он сейчас закрепляет неверный результат и должен быть исправлен.
  - Есть test `keeps a grouped card fixed while moving its container and members together`.
- `cosmo/src/studio/graph/useGraphStore.ts`
  - `setNodePositions` атомарно обновляет несколько узлов для group drag.
- `cosmo/src/studio/graph/graphAdapter.ts`
  - строит группы и folderId-рёбра.
- `cosmo/src/studio/collectStudioNodes.ts`
  - нормализует `editor_folders` в `StudioFolderGroup` и ставит `groupId` на nodes.
- `cosmo/src/styles.css`
  - `.pk-graph-group` уже `pointer-events: auto`, `cursor: grab`, `touch-action: none`.
- `cosmo/src/studio/StudioActionForm.tsx`
  - общий creation form; пока не менять, пока graph-slice не принят.
- `cosmo/src/studio/StudioActionHub.tsx`
  - `create-page` = «Модели страниц», `create-scenario` = «Сценарии проверки»; разделение форм делать отдельным проходом.

## Рекомендуемая реализация clamp

Не использовать изменяющийся `graphExtent.minX` как «левую границу» отдельного узла. Для узла clamp должен быть только относительно current viewport в мировых координатах:

- `viewportLeft = (0 - pan.x) / zoom`
- `viewportTop = (0 - pan.y) / zoom`
- `viewportRight = (viewport.width - pan.x) / zoom`
- `viewportBottom = (viewport.height - pan.y) / zoom`
- node center clamp: `[viewportLeft + NODE_W / 2, viewportRight - NODE_W / 2]` и аналогично Y.

Для group drag использовать `GroupBox`: `[viewportLeft - box.left, viewportRight - (box.left + box.width)]` и аналогично Y. Это не ограничивает pan, только удерживает объект в видимой области. После group drag все `memberIds` сдвигаются одинаково через `setNodePositions`.

Важно: прежде проверь на живом UI, что event pointer capture не теряется; `blur`, `pointercancel`, `lostpointercapture` уже отменяют preview. Не возвращай скроллбары.

## Проверка

После единого батча:

```powershell
cd cosmo
npx vitest run src/studio/graph/StudioGraphExplorer.test.tsx src/studio/graph/graphAdapter.test.ts src/studio/graph/graphLayout.test.ts
npm run typecheck
```

Полный suite не запускать. После кода открыть живой Editor и руками проверить: group drag, запрет drag дочерней карточки, endpoint линии в центр, узел в левый край viewport, свободный pan.

## Правила работы

- Не использовать subagents и worktree.
- Не commit/push/stash.
- Не трогать `docs/wired.json`.
- Не менять канон-документы в `sanctuary/pure/` без 2FA.
- Не поднимать/не перезапускать стенд из-за shell abort. Для UI-проверки сначала проверить текущий Vite через `netstat -ano | findstr :5173`; при browser action прочитать skill `browser-hands-pure`.
- Для кода: MAP → BATCH → VERIFY. Не делать широкие PowerShell regex-замены по TS/JSX.

## Что сказать владельцу после среза

Коротко: какие 4 графовых поведения закрыты, какие точечные тесты прошли, и что следующий изолированный срез — отдельные формы сценариев и моделей страниц/данных.
