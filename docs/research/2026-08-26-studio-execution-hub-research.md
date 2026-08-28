# Studio Execution Hub — 3-round research

> **Статус:** `research / pre-2FA` — не канон, не backlog
> **Дата:** 26 августа 2026
> **Источник:** [`2026-08-26-studio-execution-hub-concept.md`](./2026-08-26-studio-execution-hub-concept.md)
> **Каноны-якоря:** [`../../sanctuary/pure/monitor-hub.md`](../../sanctuary/pure/monitor-hub.md) · [`../../sanctuary/pure/studio-hub.md`](../../sanctuary/pure/studio-hub.md) · [`../../sanctuary/pure/studio-stack.md`](../../sanctuary/pure/studio-stack.md)
> **Профиль:** `secops-lab-pure`

---

## 0. Executive verdict

Studio Execution Hub — разумная эволюция, если понимать её как **единый операторский контекст**, а не как попытку нарисовать весь runtime внутри Canvas.

Индустриальный паттерн:

```text
one product context
  + shared run identity
  + shared timeline
  + linked evidence
  + explicit mode switching
  + separate data/query surfaces
```

Индустрия обычно объединяет навигацию, correlation и workflow. Она не смешивает в один экран:

- authoring graph;
- live execution stream;
- arbitrary observability queries;
- external backend grep;
- replay of historical evidence.

Поэтому целевой принцип PrettyK:

```text
AUTHORING → EXECUTION → FORENSICS
```

внутри одной Studio-shell, но с чёткими режимами и единой сущностью run.

Главная поправка к raw-концепту:

> Smooth Rewind воспроизводит сохранённые события и evidence. Он не откатывает реальный target, не возвращает живой браузер в прошлое и не повторяет security side effects без отдельной команды нового запуска.

---

## 1. Раунд 1 — Discovery: как это решает индустрия

### 1.1. Общий индустриальный паттерн

У зрелых продуктов встречается не «одна гигантская панель», а связка:

1. **Рабочий контекст** — проект, pipeline, run или incident.
2. **Несколько специализированных режимов** — live view, query/explore, details, replay.
3. **Единая корреляция** — run ID, trace ID, timestamp, commit, finding.
4. **Переход по ссылке/selection** — выбор шага в одном режиме фильтрует остальные.
5. **Read-only execution view** — наблюдение не изменяет authoring source.

Это ровно тот случай, когда «центр вселенной» — хороший UX-принцип, но не повод превратить Canvas в кухонный комбайн.

### 1.2. Референсы

#### Grafana

Grafana разделяет Dashboard и Explore:

- Dashboard — постоянная собранная поверхность наблюдения;
- Explore — свободный query/analyse режим;
- logs и traces доступны через отдельный exploration workflow;
- correlations и links связывают разные источники.

**Что берём:** единый продуктовый контекст, но разные режимы анализа; свободный forensic query не надо запихивать в dashboard или authoring canvas.

#### Datadog CI Visibility

Datadog объединяет pipeline results, performance, trends и reliability в одной CI/CD experience. При этом данные представлены через специализированные explorer/dashboard/notebook поверхности и связаны с commit, pipeline и trace.

**Что берём:** execution hub должен связывать run с причиной и следствием: wired/commit → execution → trace/evidence → finding. Не обязательно показывать всё одновременно.

#### Playwright Trace Viewer

Это наиболее близкий референс для PrettyK View 1 и базового Rewind. Trace Viewer показывает:

- action timeline;
- before/action/after snapshots;
- locator и source location;
- action log;
- errors;
- browser/test console;
- network request/response details;
- metadata;
- attachments;
- filmstrip/screenshots.

Выбор действия фильтрует связанные logs и network data, а переход по timeline показывает состояние до и после действия.

**Что берём:** не надо изобретать собственный «видеоплеер». Сначала нужна связанная timeline-модель evidence: action → snapshot → network → console → alert → attachment.

#### Sentry Session Replay

Sentry связывает replay с errors, traces, network requests, console output и timeline. Replay даёт видео-подобное ощущение, но ценность создаётся не картинкой, а синхронизацией разных сигналов и поиском момента проблемы. Отдельно предусмотрен контроль доступа к replay.

**Что берём:** finding/trace/evidence должны быть selection- и time-correlated; доступ к replay нельзя считать автоматически публичным только потому, что это UI.

#### rrweb

rrweb — готовый TypeScript toolkit для DOM snapshot, DOM mutation recording и replay; поверх него есть player с pause, fast-forward и seek.

**Что берём:** готовый DOM replay существует.

**Что не обещаем:** rrweb воспроизводит web DOM/session events. Он не воспроизводит автоматически:

- состояние Selenium/Playwright процесса;
- scanner traffic;
- server-side backend state;
- fuzzer scheduler;
- доказательную причинность finding.

Использовать rrweb можно только после проверки, что его модель действительно нужна поверх уже доступных Playwright snapshots/traces. На первой итерации добавлять его преждевременно.

### 1.3. Что уже частично закрыто PrettyK

| Нужная возможность | Что уже есть | Честная граница |
|---|---|---|
| Live execution | Live `:8767`, SSE, diary | это не полноценный run control plane |
| Run space | Space, `runs_index.ndjson`, instance | meta-ledger пока file-oriented |
| Access binding | HMAC bind token, ACL draft | ACL не является завершённым enterprise IAM |
| Browser execution | Playwright/Selenium, BrowserPanel | replay-контракт не равен live browser state |
| Editor/authoring | Studio, Canvas, Monaco, Explorer | authoring не должен блокироваться данными War Zone |
| Evidence | logs, screenshots, video, scanner, Allure, Dojo | нужна единая correlation-модель |
| Structured replay basis | step/evidence data частично есть | immutable replay envelope пока не зафиксирован |
| Forensics | logs и scanner data | SSH/Splunk/AI grep пока connector/PoC, не as-built foundation |

### 1.4. Раунд 1 — вывод

Идея unified execution hub проходит sanity check, если формулировать её так:

> Studio сохраняет единый операторский контекст от сборки до утверждения результата; execution и forensics становятся режимами той же run-сессии, а не вторым несвязанным приложением.

Она не проходит в формулировке:

> Canvas должен одновременно быть редактором, монитором, IDE логов, trace viewer, видеоплеером и command center.

---

## 2. Раунд 2 — Architecture: View, data flows и replay

### 2.1. Общий поток данных

```text
Wired / validated plan
          |
       Run start
          |
   execution runtime
   /       |        \
Playwright scanner      Fuzzer
   |        |         |
   +--------+---------+
            |
       event/evidence envelope
            |
       Live Server :8767
            |
      Studio execution adapter
            |
  shared run store / timeline state
       /          |           \
 View 1       View 2        View 3
 Native      War Room     Forensics
```

Каноническая осторожность: текущий Live SSE — существующий источник, но отдельный «Internal WS Bridge» ещё не следует считать as-built. Для design нужно сначала проверить, достаточно ли прямого SSE через разрешённый proxy и локального Studio store. WebSocket-мост не добавляется просто потому, что он звучит солидно.

### 2.2. Единый event/evidence envelope

Каждое наблюдаемое событие должно иметь минимальный контекст:

```text
run identity
attempt identity
step identity
event timestamp / sequence
source: playwright | scanner | fuzzer | live | connector
severity / status
evidence references
finding reference, if any
```

Это не означает, что всё хранится в одном огромном JSON. Требование — единая корреляция и immutable references.

Источники:

#### Live Server

- run status;
- step progression;
- structured logs;
- diary/SSE events;
- artifact/evidence availability;
- monitor instance metadata.

#### Playwright/Selenium

- action start/end;
- locator/source context;
- screenshots;
- DOM snapshots, если включены;
- browser console;
- network requests/responses;
- trace attachments.

#### scanner

- proxy/scanner events;
- alert/finding metadata;
- request/response correlation;
- scan phase and severity.

#### Fuzzer

- case/payload identity;
- request result;
- status/latency/size;
- anomaly or finding signal;
- bounded counters and rate data.

#### Backend trace connector

Минимальная полезная версия — correlation header в исходящем запросе и отображение этого ID в evidence. Но одного отправленного заголовка недостаточно: target backend должен логировать или прокидывать его дальше.

SSH/Splunk grep — отдельная integration boundary. Если connector недоступен, View 3 показывает `not configured` или `unavailable`, а не пустой «успешный» результат.

AI-assisted search — enhancement поверх уже существующего query/evidence access. AI не должен быть источником истины и не должен самовольно выполнять shell/SSH действия.

### 2.3. View 1 — Monitor Native

Это первая и самая безопасная поверхность.

```text
run header
  status / elapsed / target / owner

step timeline/tree
structured log stream
alert/finding feed
evidence attachments
```

Поведение:

- live updates приходят из того же run stream;
- selection шага фильтрует log/evidence;
- finding открывает evidence, но не меняет исходный wired;
- execution view read-only по отношению к authoring;
- доступен переход в Forensics с сохранённым selection.

### 2.4. View 2 — War Room

War Room — presentation/coordination view, а не второй источник данных.

```text
25%  compact run monitor
25%  telemetry summary
50%  event choreography / War Zone
```

Что допустимо:

- текущая фаза;
- request/finding/evidence pulses;
- bounded counters;
- selected network/alert transitions;
- visually obvious causal chain.

Что опасно:

- particle storm на каждую строку лога;
- бесконечная лента, которая съедает память;
- декоративные связи, выдаваемые за причинность;
- изменение execution state из визуализации;
- копирование всей entity graph в War Zone.

### 2.5. View 3 — Deep Forensics

View 3 — query and correlation workspace:

```text
timeline selection
  → structured logs
  → backend trace correlation
  → scanner source details
  → external connector result
  → optional AI query assistance
```

Базовый trace и grep можно рассматривать отдельно от полноценного SSH/Splunk connector. Внешний connector должен иметь:

- явную конфигурацию;
- scoped credentials;
- timeout;
- result provenance;
- redaction;
- audit trail;
- honest unavailable/error state.

### 2.6. Smooth Rewind — правильная модель

Необходимо разделить три действия:

1. **Seek** — перейти к исторической точке timeline.
2. **Replay** — воспроизвести сохранённые UI/evidence transitions.
3. **Rerun** — запустить новую security execution с side effects.

Raw-концепт местами смешивает 2 и 3. Это нужно запретить.

Целевой replay:

```text
immutable evidence timeline
  → selected time/step
  → reconstruct view model
  → animate presentation
  → pause on finding in replay mode
```

«Пауза на каждом finding» по умолчанию относится к **replay**, а не к живому runner'у. Остановка живого security run на каждом alert — отдельная policy с рисками таймаутов, cleanup и stateful targets.

Первая версия может использовать:

- action timeline;
- screenshots/filmstrip;
- DOM snapshot where available;
- network/scanner evidence references;
- structured logs;
- finding markers;
- deterministic step transitions.

Она не должна обещать восстановление полного DOM/browser/backend state, если соответствующий evidence не был записан.

### 2.7. DOM/CSS/SVG против WebGL

#### DOM/CSS

Подходит для:

- panels;
- timeline;
- logs;
- cards;
- status transitions;
- finding pause;
- accessibility and keyboard navigation;
- View 1 and View 3.

#### SVG

Подходит для первой War Zone:

- ограниченное число actors/nodes;
- arrows and causal links;
- pulse/highlight;
- inspectable DOM;
- alignment with existing Studio visual language.

Но War Zone не должна переиспользовать `studio/graph/` entity graph: это другой смысл и другой контракт.

#### Canvas/WebGL

Оправдан только если измерения покажут, что SVG/DOM не выдерживает:

- большое число одновременно видимых events;
- высокий particle count;
- сложную continuous animation;
- длительный replay без деградации.

WebGL не нужен для View 1, View 3 или базового Rewind. Нельзя начинать с нового visual engine без performance PoC.

### 2.8. Метрики плавности

Для PoC нужны объективные показатели, а не «вроде не дёргается»:

- frame rate / long-frame ratio;
- dropped frames during live ingestion;
- event-to-paint latency;
- seek-to-first-frame latency;
- replay time drift against the event timeline;
- memory growth during long replay;
- input latency при pause/seek/filter;
- number of buffered events and backpressure behavior.

Рабочие design targets, не канон:

- 60 fps — ideal для лёгкой сцены;
- отсутствие длительного падения ниже 30 fps — minimum sanity threshold для анимационной сцены;
- p95 event-to-paint до 250 ms для live operator feedback;
- seek должен давать понятный первый кадр, а не ждать загрузки всего run.

Точные thresholds должны быть подтверждены на реальном прогоне с scanner + Fuzzer, а не на пустом mock.

### 2.9. Раунд 2 — вывод

Архитектурно это не «перенести Monitor HTML в Canvas». Это:

```text
one run identity
  + one evidence/timeline contract
  + multiple read-only projections
  + one replay model
```

Существующий SSE — хороший фундамент. Самая важная новая часть — не WebGL, а честный immutable evidence/timeline contract.

---

## 3. Раунд 3 — Product & UX

### 3.1. Первая итерация

В первый release execution hub разумно включить:

1. **View 1 Monitor Native** внутри Studio.
2. Run header с понятным статусом, owner, target и elapsed time.
3. Structured step/log/evidence feed.
4. Finding markers.
5. Базовый timeline seek.
6. Replay сохранённых step/evidence states.
7. Pause-on-finding во время replay.
8. Return to authoring без потери run context.

Не включать в первую итерацию:

- полноценный animated War Zone;
- WebGL;
- SSH/Splunk federation;
- AI, который выполняет forensic commands;
- live pause на каждом finding;
- обещание восстановления любого browser/backend state.

### 3.2. Mode switching

Рекомендуемая shell-навигация:

```text
[ Authoring ] [ Execution ] [ Forensics ]
```

Правила:

- переключение режима не создаёт новый run;
- selection шага и finding сохраняется;
- View 1/2/3 используют одну timeline selection;
- Forensics не обнуляет live monitor;
- возвращение в Authoring не превращает run в editable execution state;
- новая правка после запуска получает новый draft/revision context.

### 3.3. Canvas overload

Нельзя помещать все три View внутрь authoring canvas одновременно.

Правильнее:

```text
Studio shell
  ├─ Authoring surface: Canvas/Explorer/Monaco
  └─ Execution surface: View 1/2/3
```

Canvas может иметь компактный execution status и ссылку на run, но не обязан становиться dashboard.

War Room может визуально наследовать язык Canvas, но остаётся отдельной surface. BrowserPanel также остаётся отдельным browser observation surface.

### 3.4. Операторский flow

```text
1. Собрал
   Operator создаёт/редактирует wired в Authoring.

2. Проверил
   Validate/dry-run подтверждает, что план допустим.

3. Запустил
   Studio создаёт run context и переходит в Execution.

4. Смотрю
   View 1 показывает live steps, logs, alerts и evidence.

5. Разбираю
   Selection шага открывает network/scanner/console/evidence.

6. Перемотал
   Replay перемещает оператора по записанной timeline; side effects не повторяются.

7. Утвердил
   Operator смотрит findings/evidence и запускает существующий approval/admission flow.
```

### 3.5. Ошибочные состояния должны быть частью UX

Execution Hub обязан честно показывать:

- Live disconnected;
- evidence pending;
- trace not configured;
- external connector unavailable;
- partial evidence;
- replay unavailable for selected step;
- run still active;
- run failed before evidence was written;
- access denied.

Пустая панель без объяснения — это не forensic capability, а новый вид тумана.

### 3.6. Раунд 3 — вывод

Первая ценность — убрать переход «Studio → отдельный Monitor» и дать оператору связанную timeline/evidence-поверхность. War Room и Deep Forensics должны вырасти из этого общего контракта, а не быть тремя независимыми эпиками с тремя разными состояниями.

---

## 4. Final synthesis

### Что принимаем как сильную гипотезу

- Studio может быть execution hub без отмены authoring-роли.
- Monitor `:8767` остаётся источником live execution data и внешним/headless surface.
- View 1 — ближайшая эволюция.
- View 2 — отдельная визуальная projection над теми же событиями.
- View 3 — correlation/query surface с честной connector boundary.
- Smooth Rewind — evidence replay, не MP4-player и не rerun.
- Playwright Trace Viewer — главный reference для первой timeline/evidence model.
- DOM/CSS/SVG достаточны для первой версии; WebGL только после измеренного performance gate.

### Что переводим в evolve/POSSIBLE, а не обещаем сейчас

- полное восстановление browser state;
- воспроизведение backend state;
- SSH/Splunk production connector;
- AI-powered remote grep;
- live execution pause на каждом finding;
- WebGL particle command center;
- новый internal WS bridge без доказанной необходимости.

### Предварительная архитектурная формула

```text
Studio shell
  → run identity
  → Live SSE / evidence sources
  → normalized timeline
  → read-only projections
      → Monitor Native
      → War Room
      → Deep Forensics
  → evidence replay
  → existing approval/admission gate
```

### Recommended partitioning for later implementation

1. **Execution context** — Studio enters/leaves run mode without breaking authoring.
2. **Live evidence projection** — View 1 consumes the existing monitor stream.
3. **Timeline/evidence contract** — immutable, correlated, replayable references.
4. **Basic replay** — seek, play/pause, finding markers, partial-evidence honesty.
5. **War Room projection** — only after real-run performance PoC.
6. **Forensics foundation** — trace header/correlation and local evidence search.
7. **External connectors and AI assistance** — separate, scoped and audited.

Это research-вывод. Он не канонизирован и не является разрешением на массовую реализацию.

---

## 5. Sources

- [Grafana Explore](https://grafana.com/docs/grafana/latest/explore/)
- [Grafana dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/)
- [Datadog Continuous Integration Visibility](https://docs.datadoghq.com/continuous_integration/)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Sentry Session Replay](https://docs.sentry.io/product/session-replay/)
- [rrweb](https://github.com/rrweb-io/rrweb)
- [OpenTelemetry observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)

---

## 6. Owner correction — Signature Rewind

### 6.1. Уточнение намерения

Smooth Rewind не обязан быть маленьким convenience feature. Максимально детальный, синхронный и визуально узнаваемый replay может стать **signature capability PrettyK**.

Пользователь должен иметь возможность медленно вести один timeline slider назад и вперёд и видеть одну и ту же историческую точку одновременно в нескольких tracks:

```text
time t
 ├─ fuzzer payload / dictionary entry
 ├─ laser / request path in War Zone
 ├─ telemetry samples
 ├─ browser video or snapshots
 ├─ structured logs
 ├─ scanner event/finding
 ├─ backend trace correlation
 └─ Buddy explanation / bookmark
```

Это не декоративная анимация поверх приблизительных цифр. Каждый laser должен быть projection реального события атаки: payload/case → request → proxy/target → response/finding/evidence.

### 6.2. Master timebase

У всех tracks должна быть одна master timeline. Нельзя позволить каждому источнику жить на собственных часах.

Минимальная семантика:

```text
run_id
event_id
step_id / case_id
source
t_start
t_end, when applicable
logical_sequence
causal_parent / related events
evidence references
```

Рекомендуется хранить две координаты:

- **monotonic run time** — главная координата replay;
- **wall-clock timestamp** — внешний operational timestamp.

Wall clock может прыгать из-за NTP, timezone и разных машин. Replay должен опираться на monotonic run time и deterministic tie-breaker, например sequence + source + event ID.

События, пришедшие поздно из SSE/scanner/backend connector, не должны менять уже просмотренную историю молча. Их состояние должно быть одним из:

```text
provisional → finalized
late-arrival / reconciled
unavailable
```

### 6.3. Tracks, а не один гигантский state

Rewind следует мыслить как набор синхронных tracks:

1. **Attack track** — реальные dictionary/case/payload events.
2. **Network track** — request/response, latency, status, route.
3. **scanner track** — proxy/scanner alerts and findings.
4. **Browser track** — screenshots, DOM snapshots, Playwright trace/video references.
5. **Telemetry track** — throughput, alerts/sec, timings, worker/resource signals.
6. **Log track** — structured records with time and step correlation.
7. **Backend track** — correlation header and returned external trace/log evidence.
8. **Narrative track** — bookmarks, phases, findings and Buddy explanations.

Один slider меняет координату времени всех tracks. Selecting an item не должен запускать отдельный replay clock.

### 6.4. Fuzzer lasers — реальные данные

Laser entity нельзя создавать «на глаз» или случайным генератором частиц. Он должен иметь provenance:

```text
dictionary_id
dictionary_entry_id
case_id / payload_hash
request_id
target / route
sent_at / completed_at
response status
latency
finding or anomaly reference
```

Raw payload может быть скрыт policy/redaction, но provenance должен оставаться видимым оператору с правом доступа:

```text
SQLi-core / entry-1842 / hash:… / POST /login / 401 / 183ms
```

Так War Zone показывает реальную структуру атаки, а не абстрактные «красные лучи». Одновременно сохраняются security и audit boundaries: реальные payloads, credentials и sensitive responses нельзя бездумно выводить в общий экран или AI prompt.

### 6.5. Deterministic laser projection

Для каждого payload event visual projection вычисляется из timeline:

```text
payload event
  → path segment(s)
  → duration / latency
  → status transition
  → alert/finding marker
```

Визуальная randomisation, если она нужна для живости, должна быть seeded от `event_id` или `payload_hash`. При повторном проходе назад и вперёд тот же event обязан выглядеть одинаково.

Это даёт важное свойство:

> Slider меняет положение во времени, а не запускает заново генератор анимации.

Для состояния в точке `t` projection должна уметь ответить:

- какой payload активен;
- где находится его луч;
- какой участок запроса уже пройден;
- какой ответ получен;
- появился ли finding;
- какие evidence доступны.

### 6.6. Keyframes и точный scrub

Полный пересчёт всего run от нулевого состояния при каждом пикселе slider будет дорогим. Типовой подход — immutable event log плюс keyframes/checkpoints:

```text
nearest keyframe ≤ t
  → apply events until t
  → render every track at t
```

Keyframe — не MP4 keyframe. Это сериализуемое состояние replay projection:

- active phases;
- current actors/paths;
- telemetry accumulator;
- selected findings;
- visible evidence references.

Keyframes ускоряют seek, но не становятся новым источником истины. Истина — immutable timeline events and evidence.

### 6.7. Video is one track, not the clock

Видео имеет encoded frame/keyframe limitations и может не совпадать с event precision. Поэтому:

- master timeline не должна подчиняться MP4;
- video получает `offset`, duration и availability metadata;
- при seek показывается ближайший доступный frame, а точные details берутся из snapshots/events;
- для максимально точного режима предпочтительнее screenshots/DOM snapshots/Playwright trace data;
- video остаётся синхронной визуальной дорожкой, но не единственным evidence source.

Так мы честно получаем «двигаю медленно — всё идёт вместе», не обещая невозможную точность там, где сам codec её не хранит.

### 6.8. Live tail и historical scrub

Нужно различать два режима:

```text
LIVE TAIL
  timeline follows current run
  new events arrive

SCRUB / REPLAY
  operator owns slider
  incoming events buffer or appear as a tail marker
  no event is lost
```

Возврат к live должен быть явным: `Follow live`. Если run ещё идёт, пользователь может просматривать завершённый prefix, но UI обязан показать, что хвост продолжается.

### 6.9. Buddy as a timeline companion

Buddy должен быть не плавающим чатиком, который комментирует каждую искру, а **timeline-aware operator tool**.

Полезные действия:

- «Покажи, почему этот луч закончился на 401».
- «Перейди к первому finding этого словаря».
- «Сравни два payload events на одном endpoint».
- «Покажи все случаи с latency выше выбранного».
- «Что произошло между request и backend trace?».
- «Собери evidence chain для этого finding».

Ответ Buddy обязан содержать:

- временную точку;
- использованные evidence;
- ссылки на события/артефакты;
- уровень уверенности;
- distinction fact vs hypothesis.

Buddy не должен в первой версии:

- сам выполнять SSH/Splunk commands;
- менять run;
- запускать rerun;
- генерировать неподтверждённую causal link;
- показывать raw secret/payload без policy.

Для AirGap используется локальный Qwen-путь; cloud Gemini остаётся optional non-AirGap advisor по существующей AI policy.

### 6.10. Signature UX

Signature moment может выглядеть так:

```text
operator drags slider slowly
  → payload entry lights up
  → real request laser leaves fuzzer
  → telemetry pulse rises
  → browser/network state changes
  → scanner alert appears
  → finding marker locks the timeline
  → evidence cards open in causal order
  → Buddy explains only from linked evidence
```

Здесь War Zone не пытается быть главным источником информации. Она визуально делает видимой causal chain, а View 1/3 дают проверяемые details.

### 6.11. Updated implementation order

После owner correction порядок меняется: basic rewind больше не должен быть «простым ползунком поверх View 1». Сначала нужен фундамент signature:

1. Timeline/event semantics и master timebase.
2. Real fuzzer dictionary/case provenance.
3. Multi-track synchronization для logs, telemetry, scanner и evidence.
4. Deterministic replay projection с seek/keyframes.
5. View 1 synchronized scrubber.
6. War Zone lasers as real payload projections, initially SVG/DOM.
7. Video/trace/snapshot synchronization.
8. Finding pause/bookmarks and approval context.
9. Buddy timeline companion.
10. Deep external forensics connectors.

WebGL по-прежнему не является первым шагом. Signature может быть глубокой и впечатляющей на SVG/DOM, если event model и synchronization сделаны правильно.

### 6.12. Updated verdict

Принцип проходит sanity check и достоин отдельного major concept:

> **PrettyK Signature Rewind** — детерминированное, многодорожечное, evidence-backed воспроизведение security run, где один временной курсор синхронно перемещает реальные payload events, attack paths, telemetry, browser/network evidence, logs, findings и operator narrative.

Это не игрушка и не украшение. Rewind video/logs/evidence сам по себе уже существенная investigative capability; реальные словари атак и Buddy превращают её в узнаваемый продуктовый signature.

Ограничение остаётся только одно: никакой визуальный эффект не должен притворяться evidence, которого run не записал.
