# Research — MONITOR-REWIND: отмотка Monitor назад

> **Не CANON.** QUEUE. Slice: 2026-08-15.  
> Запрос Максима (пункт 5 эпопеи Monitor): «уметь отматывать назад».  
> Здесь — карта возможных решений для Keeper/Flash, не реализация.

## Что отматываем

Monitor = два временны́х потока одного прогона:

| Поток | Сейчас | Что нужно для отмотки |
|---|---|---|
| **Лог (diary)** | NDJSON + SSE, `build_journal_from_latest` | archive по `run_id` + seek по смещению/событию |
| **Видео (VNC)** | живой noVNC `:7900`, **без записи** | запись VNC + seekable таймлайн |

Отсюда два разных механизма отмотки.

---

## 1. Отмотка лога — append-only event log (просто)

Лог — это **append-only event stream**. Отмотка = детерминированный fold `reduce(events[:n])`.

Паттерн (event-sourcing visualization / time-travel UI):
- Таймлайн-скраббер: playhead → переиграть события с 0 до курсора.
- Двухпанельность: лог (хронология) + проекция состояния.
- Контролы: play / pause / step-forward / step-backward / jump-to-error.

Ссылки:
- https://docs.replay.io/basics/time-travel/how-does-time-travel-work — «reduce(events[:n])», fork/rewind через truncation.
- https://github.com/kjuhwa/skills-hub/blob/main/skills/design/event-sourcing-visualization-pattern/SKILL.md — паттерн dual-pane + scrubber.
- https://pypi.org/project/intui/ — «pause, step, rewind, resume … every panel shows the run as it was».

**Вывод для лога:** уже почти готово. `diary_bus` хранит NDJSON по байтовому offset; нужно только (а) хранить экспорт по `run_id`, (б) UI-скраббер поверх `read_file_backlog`/archive. Rewind = перечитать с 0 до курсора. Дёшево.

---

## 2. Отмотка видео (VNC) — запись + seekable формат (сложнее)

Ключевая проблема: **FBS (Framebuffer Stream) не умеет scrub/seek**. Это event-поток rect-апдейтов, а не индексированный кадр.

Ссылки:
- https://github.com/amitbet/vnc2video — FBS «не даёт seek»; транскод в video нужен.
- https://github.com/amitbet/vncproxy — proxy: запись FBS + replay server; «seek = индекс + IFrame на известных интервалах» (не реализовано, TODO автора).
- https://www.sandia.gov/minimega/module-35-vnc-playback-2/ — rfbplay транскодит framebuffer → mp4 через ffmpeg.

### Варианты реализации отмотки видео

| Подход | Суть | Seek | Цена |
|---|---|---|---|
| **A. Транскод в WebM/MP4** (ffmpeg) | записать FBS → ffmpeg в webm → `<video>` с нативным seek | ✅ нативный | CPU на транскод, но после — бесплатный seek |
| **B. VNC-proxy + replay server** (`vncproxy`) | `player -fbsFile=…` отдаёт запись клиенту как VNC | ❌ без seek (нужен индекс) | малая, но seek не родной |
| **C. FFmpeg pipe от rfbrecord** | RFB rects → ppm-поток → ffmpeg | ✅ после транскода | средняя |
| **D. noVNC + собственный keyframe-index** | писать FBS + периодические full-frame; seek = jump к ближайшему IFrame | ⚠️ частичный | высокая (писать свой плеер) |

**Рекомендация:** вариант **A** — записывать VNC-сессию в FBS (дешёво в момент прогона), постфактум (или по завершении) транскодить в WebM через ffmpeg (`vnc2video`/`rfbproxy` → ppm → ffmpeg). Seek — нативным `<video>` слайдером. Это совмещается с `MONITOR-MULTI-REPLAY` (запись по `run_id`).

---

## 3. Альтернатива: rrweb (если речь о DOM, не VNC)

Если бы Monitor наблюдал DOM-состояние приложения (а не VNC-пиксели), то rrweb даёт нативную time-travel перемотку без видео:

- `@rrweb/record` + `@rrweb/replay` — событийный поток + детерминированный реплей.
- `replayer.goto(ms)` / `play(ms)` — программный seek.
- `rrweb-player` — готовый UI со скраббером, speed, skip-inactivity.
- `time=offset:5000` / `time=percent:50` — deep-link на конкретный момент.
- Ссылки: https://rrweb.com/docs/guide, https://rrweb.com/product/record-and-replay.

**Но:** наш Monitor — это noVNC поверх Selenium Grid (`:7900`), то есть **пиксели браузера**, а не DOM приложения. rrweb здесь не подходит напрямую — он реплеит DOM, а не VNC. Если в будущем захотим реплеить *сам* процесс воркфлоу (не скринкаст), rrweb — кандидат на отдельный трек.

---

## Итог для беклога

- **Лог-отмотка** — эволюция `diary_bus` + скраббер. Близко, дёшево.
- **Видео-отмотка** — запись VNC (FBS) + ffmpeg-транскод в WebM + нативный `<video>` seek. Отдельный трек, нужен ffmpeg в контуре.
- **rrweb** — не для VNC-пикселей; only если захотим DOM-replay воркфлоу.

---

## 4. UX таймлайна / скраббера — best practice (для 3-го view Monitor)

Запрос: split 50/50 (два статичных блока), под хедером полоска, внизу таймер. Двусторонняя связь: таймер ↔ полоска. Типовое решение — ищем поэстетичнее.

Собранные паттерны (Loom / FullStory / Sentry / Grafana / PostHog / Contentsquare / CapCut):

### Таймлайн = единый источник правды, синхронизированный с превью
- Один канонический `currentTime`/`currentFrame`; превью, таймер и полоска читают его из одного источника. Движение полоски обновляет таймер и превью мгновенно, и наоборот.
- Каноническая единица времени — **frames** (не ms/сек микс), чтобы preview/export/таймер не расходились.
- Ссылки: reactvideoplayer.com (frame-based timing, playhead sync), CapCut-паттерн (single source of truth для currentFrame).

### Контролы
- Play / pause / step-back / step-forward (skip 10s) / speed / fullscreen — как единый набор. Grafana: `0:41 / 0:41` elapsed + timeline + speed.
- Таймер-формат: `текущее / общее` (elapsed/total).

### Таймлайн
- Тонкая полоска по умолчанию, расширяется по hover — не захламлять.
- **Event-маркеры на таймлайне** (ошибки, rage clicks, AI-сигналы): клик прыгает к моменту (Sentry/Flexxi: за 2s до события). Для Monitor это = маркеры STEP/ERROR/HIGH/ZAP прямо на полоске.
- **Толстые/тонкие сегменты** — активность vs неактивность (Contentsquare).
- **Zoom таймлайна** — различать близкие события (Sentry).

### Split 50/50
- Двухпанельность (event-sourcing pattern): хронологический лог слева + проекция/видео справа, общий playhead сверху.
- Классика реплей-плееров: видео (превью) + таймлайн внизу + маркеры. Не «три разных виджета», а один плеер.

### Что взять для Monitor 3-го view
1. Превью (видео/лог) — общий playhead.
2. Тонкая полоска под хедером, расширяется по hover, с маркерами STEP/ERROR/ZAP.
3. Таймер `текущее / общее` внизу, синхронизирован с полоской (одна state-переменная).
4. Event-маркеры — прыжок к STEP/ERROR без слепого скраббинга.

### Источники
- https://www.eleken.co/blog-posts/video-player-ui — auto-hide, thin bar expands on hover, thumbnails while scrubbing, keyboard shortcuts.
- https://www.reactvideoplayer.com/blog/how-to-build-a-video-timeline-in-react — frame-based timing + playhead sync.
- https://support.contentsquare.com/hc/en-us/articles/37271816271121-Session-Replay-player — thick/thin activity segments.
- https://docs.sentry.io/product/explore/session-replay/replay-details/ — event markers + zoom timeline.
- https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/session-replay/view-session-replays/ — elapsed/total + skip controls.
- https://posthog.com/docs/session-replay/how-to-watch-recordings — AI markers, jump to moment.

---

Привязка: эпопея `MONITOR` — см. [`../friend-requests/MONITOR-MULTI-REPLAY.md`](../friend-requests/MONITOR-MULTI-REPLAY.md), [`../friend-requests/MONITOR-SPLIT-VIEW.md`](../friend-requests/MONITOR-SPLIT-VIEW.md) и § Эпик MONITOR в [`../backlog.md`](../backlog.md).