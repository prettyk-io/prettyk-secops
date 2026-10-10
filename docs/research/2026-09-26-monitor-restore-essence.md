# MONITOR restore — essence, verified failure chain, execution plan

> **Дата:** 2026-09-26 · **Автор:** Keeper (Strategy) · **Статус:** diagnostic research → backlog packets
>
> **Запрос Максима:** «Изучи его ессенцию, что и как стыковалось… Восстанавливаем это. Все силы бросаем на это».

## Короткий вывод

Это не один «необновлённый Monitor» и не одна неисправность. По имеющимся фактам одновременно расходятся три звена:

1. В переданной ссылке `run-118ec442680d` — **не реальный запуск 114a**. В run-ledger это завершённый `validate-only-ok` без `check_id`; локальный реестр ошибочно прикрепил его к 114a. У него нет journal-export и видео, поэтому empty-state закономерен именно для этого ID.
2. Deep-link с `run_id` сразу включает архивный режим: он загружает `/api/journal?run_id=…`, игнорирует live SSE; пока run выполняется и архив ещё не создан, страница показывает «экспорт не найден». Перезапуск сервиса не меняет этот кодовый путь.
3. 114a использует `chrome-headless`, но нынешняя запись Playwright-видео включается только для headed runtime. Для такого реального запуска видео-артефакт не создаётся — после прогона показывать нечего.

При этом базовая «эссенция» уже реализована частями: ID запуска, append-only diary, SSE, per-run NDJSON-архив, API выдачи видео с byte-range и Monitor playback/playhead. Надо состыковать существующие части по одному доказанному `run_id`, а не заменять Monitor новой системой.

## Историческая рабочая схема

Из `sanctuary/acceptance/2026-08-15-monitor-acceptance.md`, `docs/research/2026-08-15-monitor-rewind.md`, `docs/friend-requests/MONITOR-MULTI-REPLAY.md`, `docs/friend-requests/MONITOR-RETENTION.md`, `sanctuary/pure/monitor-hub.md`:

```text
Editor starts one run
  → one canonical run_id + check ownership
  → run-scoped events enter append-only diary and are streamed while running
  → same run_id gets a durable journal export on finalization
  → recording is attached to that same run_id; live view → recorded video on completion
  → Monitor keeps the identity and synchronizes journal/video/playhead
```

История/meta остаётся доступной; run artifacts (journal/video) живут по retention policy (обычно 7 дней). `run_id` — идентичность исполнения; `check_id` — проверка-владелец. Ни «последний активный check в открытой вкладке», ни общий `latest` не должны подменять эту пару.

Важная оговорка: acceptance от 15 августа — протокол проверки с незаполненными пунктами, а не свидетельство, что весь cycle был принят целиком. Позднее отдельные куски (run-link selection, ACL, status stamp, archive replay) были приняты, но именно live deep-link уже 25 сентября вырезан как READY-карточка и до исполнения не дошёл.

## Срез подтверждённых фактов

### Переданный ID

- `reports/live/runs_index.ndjson`: `run-118ec442680d` имеет `app_code=validate-only-ok`, `check_id=null`, завершён `success` в `2026-09-26T04:59:45Z`.
- `reports/live/checks_registry.json`: тот же ID оказался в `114a` как `failed`, `live_session=validate-only-ok / validate ok`, без времени старта. Это не согласуется с canonical run-ledger; каким именно writer был создан этот локальный check-run ref, пока не подтверждено event-level следом.
- Для `run-118ec442680d` нет per-run export и нет видео. Поэтому конкретная ссылка, присланная Максимом, ведёт не на исполняемый Juice Shop run.
- В той же файловой выборке реальный run `run-ec972a651caf` принадлежит `114a`, имеет diary-события и per-run export. Он завершился `failed` через ~26 секунд на недоступной/disabled кнопке регистрации; это отдельная проблема сценария, но доказательство того, что настоящий runner уже пишет события и финальный export.

### Live → archive переход

- Legacy Monitor при `?run_id=` задаёт `replayMode=true`; на старте вызывает архивную загрузку по run ID.
- В archive mode event handler игнорирует новые live events; загрузчик журнала сообщает «экспорт не найден», если export ещё отсутствует.
- Backend уже имеет SSE endpoint с run-фильтром и отдельно поддерживает архивный journal endpoint. Но фильтр SSE пока пропускает legacy-события без `run_id`, а export builder тоже включает unscoped-события в run snapshot. Значит кирпичи есть, однако строгая изоляция по run ещё не доказана; сломан также выбор источника/переход состояний для deep-link.
- Карточка `MONITOR-LIVE-DEEPLINK` по backlog всё ещё READY. Ранее принятые ACL и fresh-stamp не закрывают live/replay pipeline.

### Recording

- В сохранённой конфигурации 114a — `chrome-headless`.
- Текущий runtime подключает Playwright `record_video_dir` только для headed execution. API выдачи MP4 и HTTP Range имеется, но сам файл для headless-запуска не появляется.
- Для headless Monitor ещё и прячет VNC/video view; без произведённого MP4 у оператора не остаётся изображения запуска.
- `reports/video` в проверенном срезе не содержит артефакта `run-118ec442680d`; явного recording readiness UI недостаточно без реального producer.

### Environment

- `netstat -ano | findstr` подтверждает LISTENING для Editor `:5173`, playground `:8765`, Live Monitor `:8767`. Это исключает «Monitor просто не поднят», но не доказывает, что процесс перезагружен после изменения кода.
- В этом исследовании не открывался браузер и не вызывались API, которые при GET запускают retention sweep. Факты выше получены чтением кода и текущего файлового snapshot.

## Root-cause map / ownership

| Пункт | Дефект поведения | Владелец |
|---|---|---|
| A | Live metadata без явного `check_id` может быть приписана открытому check. Это совпадает с наблюдаемой записью `validate-only-ok` внутри 114a, но точный writer этой записи ещё требует подтверждения; при любом источнике unscoped run не должен выбираться для check-link. | Luna — frontend run binding/link selection |
| B | Run producer должен обеспечить один канонический ID для записи событий, финального export и video; текущий headless execution не создаёт recording. | Boss — runtime/artifact producer |
| C | Monitor deep-link трактуется как только архив; во время running он не подписывается на run-specific stream и не переключается на архив по завершении. | Luna — Monitor consumer/UI |
| D | Итоговая E2E-приёмка Editor → live events → finalized journal + recording ещё не проходила после этих изменений. | Keeper + Максим — release gate |

Пункты A/B затрагивают общую run identity, но зоны исполнения разделимы: Boss владеет backend/runtime producer, Luna — frontend association и Monitor consumer. Оба используют уже существующие пользовательские endpoints; API-контракт расширять лишь при обнаруженном доказанном пробеле, а не заранее.

**Уровень уверенности:** wrong-ID diagnosis, archive-only deep-link path и headless-without-recording path подтверждены кодом/данными. Точный момент, когда `run-118ec442680d` попал в локальный список 114a, не восстановлен; fallback на текущий active check — конкретный кандидат, который обязан проверить исполнитель. Не подтверждались глазами текущая вкладка/сетевой waterfall и версия кода в уже запущенном процессе.

## План / порядок

1. **Boss и Luna могут работать параллельно по разным поверхностям.** Boss приводит события/export/video producer к одному реальному run ID, включая headless recording 114a. Luna прекращает связывать непомеченный Live run с «текущим открытым check» и делает deep-link live-first с переходом в replay.
2. Тесты каждого владельца включают свои негативные случаи: чужой/неизвестный/unscoped run; export отсутствует пока run жив; recording отсутствует/ещё готовится; ни одна ветка не выдаёт артефакт другого run.
3. После обоих результатов Keeper выполняет E2E на свежем запуске 114a, Максим подтверждает глазами: ссылка содержит новый run ID, шаги идут во время запуска, после финала остаются в журнале, recording воспроизводится/перематывается.
4. Не делать рестарт «на удачу» и не считать его исправлением. После фикса — штатно перезапустить нужные процессы и повторить E2E на свежем run; зафиксировать URL и увиденный результат.

## Риски / границы

- `run-118ec442680d` должен остаться честно неизвестным/неархивированным run, а не получить чужие события по fallback.
- Старые/unscoped diary events нельзя присоединять к текущему run без provenance.
- Headless video увеличит CPU/disk; existing retention (7 дней) должен применяться и к нему.
- Полный Juice Shop run сейчас имеет независимый ранний fail на регистрации (`run-ec972a651caf`); он не должен блокировать короткий deterministic monitor smoke, но финальная приёмка должна показать реальные события, не только stub.

## Источники внутри репозитория

- `docs/backlog.md`: `MONITOR-LIVE-DEEPLINK` (READY), `MONITOR-DEEPLINK-FRESH`, `MONITOR-ACL-IDENTITY`, `MONITOR-FRESH-STAMP`, `REGISTRY-RUN-STATUS-HYGIENE`.
- `orchestrator/static/live/index.html`: replay-mode boot, journal load, SSE filter, recording retry, meta status polling.
- `orchestrator/utils/live_server.py`: run-scoped journal, active diary SSE, meta run-source, recording status/range, run-ended export.
- `orchestrator/utils/diary_bus.py`, `orchestrator/utils/run_journal.py`, `orchestrator/utils/run_recording.py`, `orchestrator/utils/monitor_retention.py`.
- `orchestrator/core/controller.py`: browser runtime recording setup and teardown/export.
- `frontend/src/checks/checkRunFromLive.ts`, `frontend/src/results/monitorLink.ts`.
- `docs/research/2026-08-28-salvage-old-live-assessment.md`: persistence ownership and run identity cautions.