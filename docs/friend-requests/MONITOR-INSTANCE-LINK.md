# MONITOR-INSTANCE-LINK: «Перейти к результатам проверки» из Monitor

`lane: evolve`

## Тезис

В Monitor добавить **отдельную** кнопку «Перейти к результатам проверки» (стрелка →), которая ведёт на конкретный instance проверки (check_id), в котором был запущен Monitor. Замыкает цикл: оператор запустил проверку в Editor → увидел live-сигнал в Monitor → одним кликом уходит в результаты той же проверки.

## Почему evolve (не ready) — открытый UX-вопрос

Два узла, которые не решаются «сделать как сказано», а требуют продумать UX:

1. **Кнопка ≠ таб переключателя.** Не заменять play, не раздвигать существующие view-кнопки, чтобы «втиснуть» монитор. Кнопка перехода к результатам просится отдельным элементом, но непонятно куда её корячить рядом с view-switcher — нужно чистое место/приоритет, не наслоение на существующие контролы.
2. **Индикатор «запустилось».** Сейчас в Editor после нажатия запуска всплывает сообщение «run запущен», но Live Monitor не показывает, что прогон стартовал. Хочется явный указатель: **инициализировать Monitor-кнопку/значок изначально неактивным, а когда для данного instance наступает live — засветить с пульсацией.** Это связка «Editor launch → Live pulsing indicator», не просто статичная ссылка.

## As-built якорь

### Текущее состояние Monitor (что есть)
- Файл: `orchestrator/static/live/index.html`.
- Хедер уже содержит deep-links `Allure` / `WireK` (`.live-deep-links`, строки 590–597):
  ```html
  <nav class="live-deep-links" aria-label="Смежные пульты">
    <a id="linkAllure" …>Allure</a>
    <a id="linkWireK" …>WireK</a>
  </nav>
  ```
- Backend: `orchestrator/utils/live_server.py`:
  - `GET /api/meta` → `diary_bus.get_meta()` (строка 254). Meta содержит `session_name`, `check_id`, `last_export_run_id`, `status`.
  - `GET /api/runs/index` (строка 975) → `list_run_index` — append-only ledger с `run_id`, `check_id`, `ci_verdict`, `owner_user_id`.
- `index.html` держит `refreshMeta()` (строка 1219) и `applyMeta(meta)` (строка 1205), `renderStatus()` (строка 1176) — статус `offline / online / прогон / пауза`. Пульсация уже есть у `.status-dot` (`status-pulse`, строка 222).

### Ключевой факт: где живёт «результаты конкретной проверки»
- Фронт-результаты конкретного instance — это `cosmo` маршрут `#/check/:checkId` (CheckInstance / ResultsWorkspace), см. `src/checks/checksStore.ts` (`getActiveCheckId`, `getCheck`).
- Значит кнопка ведёт на Vite Editor: `http://localhost:5173/#/check/<check_id>` (или prod-аналог).

## Что сделать (набросок, не финал)
1. `applyMeta()` читает `meta.check_id`; строит ссылку `/#/check/<check_id>`.
2. **Отдельная кнопка** «Перейти к результатам проверки →» — своё место в хедере, не внутри view-switcher.
3. **Пульсация при live:** кнопка/значок изначально неактивны (серый); когда `meta.status == running` (live для этого instance) — засвечиваются с пульсацией (переиспользовать `status-pulse`). Это решает «live Monitor не показал, что запустилось».
4. Без `check_id` — кнопка скрыта.

## К какому FRIEND дозреет

К FRIEND «Runtime-shell / Live» — deep-link Monitor→Results + live-индикатор — столп навигации между контурами. Возможно, отдельный тонкий FRIEND `MONITOR-NAV`.

## Честная «не обещаем»

- Точное место кнопки и механика пульсации — предмет UX-обсуждения с Максимом, не «делаем как сказано».
- `check_id` в Live meta — passthrough из results hooks; до первого прогона его может не быть.
- URL Vite Editor (`localhost:5173`) — лабораторный; prod-хост решается отдельно (VPS Editor).
- Cross-origin Live (8767) → Editor (5173) — просто `<a href>`.