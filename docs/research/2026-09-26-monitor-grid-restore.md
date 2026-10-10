# MONITOR на Selenium Grid — как было и как вернуть (research)

> **Дата:** 2026-09-26 · **Автор:** Keeper (Strategy) · **Статус:** research → карточка `RUNTIME-UN-CUTOVER-GRID-WEBM`
> **Запрос Максима:** монитор прекрасно работал на Grid: во время прогона был кликабелен, после формирования записи — перематывался с логами. Вернуть. Обстоятельно изучить.

## Короткий вывод

Речь не про «откат файлов» и не про новый переезд. Речь про **возврат боевого рантайма на Selenium Grid**: Grid выпилили cutover-коммитом, из-за чего живой монитор потерял свою живую, кликабельную поверхность (noVNC), а видео стало производиться другим путём. Сам код монитора во многом **уже содержит** и noVNC-iframe, и replay через `/api/recording` с Range — их «обездвижил» именно выпил Grid.

## Что было в Grid-эру (проверено по коду/коммитам)

Период: до выпила Grid. Anchor-коммиты: `b58a01c` (22.08, initial), `52534f5`/`28974af` (24.08), `a0b862f` (26.08).

1. **Живой вид — noVNC-iframe `:7900`** (`orchestrator/static/live/index.html`):
   - `<iframe id="vnc" src="http://127.0.0.1:7900/?autoconnect=1&resize=scale">` — живой экран Grid chrome-node;
   - `DEFAULT_NOVNC = "http://127.0.0.1:7900/?autoconnect=1&resize=scale"`, `vncFrame`, `.vnc-cell`, режимы `focus/split`;
   - кнопка `#debugPauseBtn` с title **«Пауза сценария (можно кликать в noVNC)»** — прямая фиксация: во время прогона браузер был **кликабелен**.
2. **Перемотка после финала — `<video id="replayVideo">`**:
   - источник = `GET /api/recording?run_id=<run_id>` (Range 206 → нативный seek);
   - `enterReplayMode()` показывает видео вместо noVNC, `playhead.currentTime → replayVideoEl.currentTime`;
   - `scheduleRecordingRetry()` (до `RECORDING_RETRY_MAX=20`) — поллит, пока файл записи не появится.
3. **Логи в перемотке** — `GET /api/journal?run_id=…&preset=signal` + SSE `/api/diary?channel=all`; playhead синхронизирует видео и журнал.
4. **Запись** — Selenium Grid sidecar `chrome-video` (`selenium/video:ffmpeg-7.1`), том `../reports/video:/videos`, `SE_VIDEO_FILE_NAME=auto`; клиент (`webdriver_adapter.py`): `se:recordVideo=True`, `se:videoName = "{run_id}_{slug}_{stamp}.mp4"`.
5. **Поиск файла** — `run_recording.find_video_for_run` искал по **префиксу `{run_id}_`**, расширения `.mp4/.webm/.mkv`; отдавал через Range.

Состав Grid в `services/docker-compose.yml` (до выпила): `selenium-hub` (`:4444`), `selenium-chrome` (noVNC `:7900`, `SE_NODE_SESSION_TIMEOUT=600`), `selenium-firefox` (noVNC `:7901`), `chrome-video` (ffmpeg sidecar → `../reports/video`).

## Что и когда сломали

- **`3dfc2f1` (28.08) MEGA-WAVE** — из `services/docker-compose.yml` выпали `selenium-hub/chrome/firefox/chrome-video` (grid-сервисы). Оттуда же растёт комментарий «PW-C1 cutover».
- **Cutover сделал Playwright дефолтным рантаймом**: `resolve_browser_runtime()` → `'playwright'` при пустом env («после cutover»), `PK_BROWSER_RUNTIME=selenium` — только явный legacy-флаг.
- Следствие: реальные прогоны (114a) идут через Playwright (`playwright-authoring`, CDP) → запись `ffmpeg x11grab :99` в MP4; Grid/noVNC `:7900` не подняты → живой кликабельный вид и Grid-запись фактически недоступны.

## Что сохранилось (не надо строить заново)

- **Selenium-образы на диске**: `selenium/hub`, `selenium/node-chrome`, `selenium/node-firefox`, `selenium/video:ffmpeg-7.1` — pull не нужен, только вернуть в compose.
- **Монитор уже содержит**: noVNC-iframe `:7900`, `.vnc-cell`, `enterLiveRunMode`, `enterReplayMode`, `replayVideo` + `/api/recording` Range, retry-поллинг, journal-rewind, playhead. Всё это осталось (часть — в незакоммиченной волне, часть в HEAD).
- **`webdriver_adapter`** сохранил Grid-путь и видео-капабилити (`se:recordVideo`, `se:videoName`, `PK_SELENIUM_VIDEO`).
- **`run_recording`** сохранил поиск/раздачу с Range (умеет mp4/webm/mkv).

## Формат записи — уточнение (изучал)

- Grid sidecar `selenium/video:ffmpeg-7.1` исторически **писал MP4**, имя `{run_id}_{slug}_{stamp}.mp4`.
- В `webm` как формате **перемотки** фигурируют research-доки, а не Grid-sidecar:
  - `docs/research/2026-08-15-monitor-rewind.md`: «VNC→ffmpeg→**WebM** + нативный `<video>` seek»;
  - `docs/friend-requests/MONITOR-PLAYHEAD.md`: «если VNC-сессия записана: транскод в **WebM**»;
  - `docs/friend-requests/MONITOR-MULTI-REPLAY.md`: «Записи видео VNC **нет**» (webm был планом).
- То есть: **mp4 = Grid-sidecar как было; webm = целевой формат rewind из research**. Интент Максима — webm. Механизм (sidecar в webm ИЛИ транскод webm) — за исполнителем; delivered-артефакт монитора должен быть webm.

## План возврата (что должен сделать worker)

1. **compose**: вернуть `selenium-hub`, `selenium-chrome` (noVNC `:7900`), `selenium-firefox` (`:7901`), `chrome-video` (том `../reports/video`). `playwright-authoring` оставить.
2. **Рантайм**: дефолт `resolve_browser_runtime()` → `selenium` (снять cutover-дефолт); Playwright — за `PK_BROWSER_RUNTIME=playwright`.
3. **Живой вид**: во время прогона монитор показывает noVNC-iframe `:7900` (кликабельно), как раньше; `novnc_url` приходит из meta.
4. **Rewind**: после финала — запись этого run (webm) через `/api/recording?run_id=` с Range + журнал через `/api/journal?run_id=` под общим playhead (как было).
5. **Ничего нового не удалять**: Playwright-адаптер, live-first, run-scope, per-run producer — оставить (парковать), не выкидывать.

## Риски / границы

- Grid chrome-video для **headless** может писать пустой/чёрный кадр (в `webdriver_adapter` есть предупреждение) — профиль 114a `chrome-headless`; для осмысленного видео нужен headed/noVNC-совместимый профиль.
- noVNC-iframe зависит от доступности `:7900` (обычный веб без авторизации) — сетевой контур стенда.
- Формат: образ `selenium/video` по умолчанию `SE_CODEC=libx264` + `SE_VIDEO_FILE_NAME=video.mp4` (mp4), но и кодек, и имя задаются env → **webm достижим конфигом** (`SE_VIDEO_FILE_NAME={run_id}.webm` + `SE_CODEC=libvpx`/`libvpx-vp9`), транскод не обязателен (проверено `docker image inspect selenium/video:ffmpeg-7.1-20250717`).

## Топология compose (важно для исполнения)

- **Grid жил в `services/docker-compose.yml`** (файл «долгоживущих сервисов»). Точный старый блок (восстановить 1:1, образы уже на диске):
  - `selenium-hub` — `selenium/hub:4.34.0-20250717`, `:4444`, `SE_SESSION_TIMEOUT=600`, `SE_REJECT_UNSUPPORTED_CAPS=false`;
  - `chrome` — `selenium/node-chrome:4.34.0-20250717`, noVNC `7900:7900`, `shm_size 2gb`, `SE_VNC_NO_PASSWORD=1`, `SE_SCREEN_WIDTH/HEIGHT=1920/1080`, `host.docker.internal`;
  - `firefox` — `selenium/node-firefox:4.34.0-20250717`, noVNC `7901:7900`, те же env;
  - `chrome-video` — `selenium/video:ffmpeg-7.1-20250717`, `DISPLAY_CONTAINER_NAME=selenium-chrome`, `SE_VIDEO_FILE_NAME=auto`, том `../reports/video:/videos`, depends_on chrome.
  Источник блока: `git show 52534f5:services/docker-compose.yml` (строки 33–103).
- **`lab_up.ps1` сейчас стартует `docker-compose.base.yml`**, а не `services/docker-compose.yml`; базовый файл («системный контур») Grid не содержит. Значит восстановление Grid требует решить, в какой файл его вернуть и как он поднимается (lab_up / session-template / отдельный `-f`). Это и есть основная неочевидная часть работы.

## Рассинхрон дефолта рантайма (FE vs BE)

- **BE**: `controller.resolve_browser_runtime()` → `'playwright'` при пустом env (cutover-дефолт).
- **FE**: `frontend/src/settings/RuntimeSwitcher.tsx` → дефолт в `loadRuntime()` = **`'selenium'`** (и переключатель виден только при `?dev=true`, меняет `pk_browser_runtime` в запросе Run).
- Итог: «визуальный» дефолт FE — Selenium, фактический BE-дефолт — Playwright; расхождение и объясняет, почему прогон 114a ушёл Playwright'ом. При возврате: привести дефолт BE к `selenium` (и согласовать с FE).

