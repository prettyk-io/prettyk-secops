# MONITOR-SPLIT-VIEW: 3-й view Monitor — split 50/50 (playhead общий, см. MONITOR-PLAYHEAD)

`lane: evolve`

## Тезис

В Monitor (Live `:8767`) добавить третий режим отображения — **split 50/50**: два статичных блока рядом (видео/VNC слева + лог справа), `grid-template-columns: 1fr 1fr`. **Playhead, таймер, скраббинг логов и видео — общие для всех трёх view**, вынесены в отдельный контракт [`MONITOR-PLAYHEAD.md`](MONITOR-PLAYHEAD.md). Здесь — только layout 3-го view.

## As-built якорь

### Что уже есть
- `orchestrator/static/live/index.html` — два режима: `focus` (рабочая сцена) и `observer` (наблюдатель), переключатель `.live-view-switcher` (строки 598–616), `data-live-view-button`.
- CSS grid уже умеет перестраиваться под `data-live-view` (`.stage[data-live-view="focus"]` / `observer`).

### Целевой контракт 3-го view
1. **Split 50/50** — два статичных блока: видео (VNC) слева + лог справа, `grid-template-columns: 1fr 1fr`. Без переключения между панелями — обе видны одновременно.
2. **Общий playhead** — timeline-полоска под хедером **во всю ширину** + таймер внизу + скраббинг логов и видео — единый для `focus`/`observer`/`split`, определяется в [`MONITOR-PLAYHEAD.md`](MONITOR-PLAYHEAD.md). Этот view только меняет layout, не дублирует плеер.
3. Режимы: `split` добавляется как третий пресет в `.live-view-switcher`. Иконка: два прямоугольника 50/50 (split-screen).
4. **Ленивое видео**: если видео скрыто (пользователь смотрит только лог) — не грузить и не мотать видео вхолостую. При возврате в focus/observer — состояние `playhead.currentTime` сохранено, видео подхватывается с того же места. Если в split видео видно — скраббинг работает как везде.

## К какому FRIEND дозреет

К FRIEND «Runtime-shell / Live» — split-view — один из трёх режимов Monitor. Playhead — отдельный FRIEND `MONITOR-PLAYER`.

## Честная «не обещаем»

- Split 50/50 — это layout-режим, не новый data-слой. Скраббинг, таймер, ползунок — в [`MONITOR-PLAYHEAD.md`](MONITOR-PLAYHEAD.md).
- Без playhead'а это просто два статичных окна рядом; полезность раскрывается только с MONITOR-PLAYHEAD.
- Маркеры событий — часть playhead'а, не split-view.
- **Ползунок во всю ширину** — это перестройка grid-пропорций 1 и 2 view (обязательно, must), не только 3-го.