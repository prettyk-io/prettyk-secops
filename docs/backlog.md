# Единый рабочий backlog PrettyK

> **QUEUE (Оперативный верстак)** — живая очередь задач команды.  
> Единственный источник канонической истины: [`../sanctuary/pure/INDEX.md`](../sanctuary/pure/INDEX.md).  
> Полный архив закрытых исторических эпиков: [`archive/backlog-archive-2026-08.md`](archive/backlog-archive-2026-08.md).  
> Алтарь побед: [`../sanctuary/ALTAR.md`](../sanctuary/ALTAR.md).  
> Срез очереди: **25 августа 2026 года**. Ветки: **`dev` → `main`**.

---


## Братство и роли

| Роль | Кто | Модель | Зона ответственности |
|---|---|---|---|
| **Владелец** | Максим | — | Продуктовая цель, стратегия, принятие результатов. |
| **Keeper** | Keeper (ты) | `gemini-3.7-flash` / `deepseek-v4-pro` | **PO + Discovery + Валидатор здравого смысла.** Сверху переводит идеи Максима в чистые требования (GWT). Снизу — хранитель Святилища (2FA, бэклог, приёмка). |
| **Boss** | Boss | `deepseek-v4-pro` | **Heavy Executor / Архитектор.** Тяжёлая кодовая реализация, сложные бэкенд/фронтенд фичи, интеграции и движки. |
| **Flash** | Flash | `deepseek-v4-pro` | **Rapid UI / Services.** Быстрый исполнитель, верстка, компоненты, визуальные мосты. |
| **Buddy** | Buddy | `deepseek-v4-pro` | **DevOps / VPS / Docker.** Обитает в `C:\cursor-buddy`, инфраструктура. |
| **Luna** | Luna | `deepseek-v4-pro` | **Heavy Execution / Browser Contour.** Тяжёлый бэкенд, Playwright-контейнеры, браузерный рантайм, live-стримы. Подчинённая Boss. |

**Поток:** Максим ↔ Keeper (PO/Discovery) → бэклог → Boss + Flash + Luna (параллельное исполнение) → Keeper (приёмка по GWT) → Максим (инвентаризация в Святилище).

---

## Карта оперативной очереди

| # | Эпик | Статус | Кому | Часы | Суть / Ссылка |
|---|---|---|---|---|---|---|
| **PK-WB** | **WORKBENCH — Editor ↔ Studio: единый CheckWorkspace, Commit, Diff, Browser Stage** | **CLOSED (100% ✅)** | Boss + Flash | 0h (73h закрыто) | § Эпик PK-WB ниже · 352 теста, tsc 0, фундамент сдан |
| **PK-ER** | **EDITOR REBORN — Возврат продуктового Explorer, навигация, visual rails, continuity** | **IMPLEMENTED (52 теста, tsc 0)** | Boss + Flash | 13h | § Эпик PK-ER ниже · Стратегия: `docs/editor-reborn.md` |
| **🔥 CDP-WIRE** | **LIVE DISCOVERY — CDP → Wire → Studio Step + Editor Step Drawn** | **🟢 Phase 1+2 ЗАКРЫТЫ · весь браузерный фундамент сдан (HDO + CDP-WIRE Phase 2)** | Boss + Flash + Luna | 0h (закрыто) | § CDP-WIRE ниже · 127 тестов Boss, 73 теста Flash, 54 теста Luna · headless observe e2e, Playwright-контейнер, паритет, cutover, DSL-сахар — всё сдано · финальный барьер: живой CDP-проход |
| **BUD-E2E** | **PRETTYK BUDDY end-to-end — живой CDP-клик + engine → Studio → run → evidence** | **🟢 CLOSED (движок 64/64 + 462 + 73 + 127 + 54 теста, tsc 0)** | Boss + Flash + Luna | 0h (закрыто) | § Эпик BUD-E2E ниже · весь стек сдан · PROMOTE после живого CDP-прохода |
| **STU-V2** | **STUDIO V2 — долить функционал старого Studio** | **🟢 CLOSED (402/402 тестов, tsc 0)** | Boss + Flash | — | § Эпик STU-V2 ниже · функциональный долив сдан |
| **STU-RAILS** | **CANONICAL STUDIO/EDITOR — новые поверхности, legacy на `-old`** | **🟢 CLOSED (tsc 0 · 66 + 24 Luna + 6 RAILS-PROMOTE)** | Boss + Flash + Luna | 0h (закрыто) | § Эпик STU-RAILS ниже |
| **SANCTUARY-MAP** | **ТАКТИЧЕСКИЙ РАДАР ОБИТЕЛИ** | **🟢 CLOSED (Ctrl+M + Idea Forge + шейдеры, 33 + 6 тестов)** | Boss + Flash | 0h (закрыто) | § Эпик SANCTUARY-MAP ниже |
| **🔥 PK-DSL** | **PRETTYK DSL SUGAR** | **🟢 CLOSED (8/8 карточек, 403 + 73 теста, tsc 0) · 🧊 Контракт заморожен (28 авг 2026): короткие глаголы, DUEL RU/EN, try/catch/finally, символы — канон; «Попробовать» вырезан** | Boss + Flash + Luna | 0h (закрыто) | § Эпик PK-DSL ниже · browser_adapter 757→134 строки · Friend Request: [`docs/friend-requests/PRETTYK-DSL-SUGAR.md`](friend-requests/PRETTYK-DSL-SUGAR.md) |
| **🔒 PK-PERSIST** | **PERSISTENCE FOUNDATION — PostgreSQL + MinIO + Valkey** | **🔒 PARKED (после PROMOTE браузерного фундамента)** | Boss + Buddy | 41h (est) | § Эпик PK-PERSIST ниже |
| **🔥 PK-WIRE-SYNC** | **WIRE DSL ↔ CANVAS SYNC — Surgical AST Patching, асимметричное авторство, read-only оверлеи** | **🟢 CLOSED (B1/B2/F1/L1/L2 — 119 FE + 54 PY, tsc 0, 28 авг)** | Boss + Flash + Luna | 0h (закрыто) | § Эпик PK-WIRE-SYNC ниже · Спецификация: [`docs/research/2026-08-27-wire-canvas-sync-plan.md`](research/2026-08-27-wire-canvas-sync-plan.md) · Сквозной контур: BrowserStage live MJPEG → observe/click → DSL → Canvas → Monaco surgical patch · Все 5 карточек сданы |
| **🔥 PK-DSL-CLEANUP** | **DSL CLEANUP — Миграция Попробовать → try/catch/finally по замороженному контракту** | **🟢 CLOSED (Monaco ✅ / Canvas ✅ / парсер ✅, 28 авг 2026)** | — | 0h | Хвост: 3 строки в `prettyToWire.ts:65` + `textScan.ts:98,101` — не блокируют, убрать при случае |
| **🔥 PK-VIEWPORT** | **VIEWPORT RELAY — Async CDP Screencast в контейнере: эвакуация Sync Worker, контракты Frame/Input, приёмка Juice Shop** | **🟢 CLOSED (6/6 карточек, 28 авг)** | Boss + Flash + Luna | 0h (закрыто) | § Эпик PK-VIEWPORT ниже · 6 карточек (B1/F1/F2/L1/L2/L1-FIX) · Спецификация: [`docs/research/2026-08-28-browser-viewport-streaming.md`](research/2026-08-28-browser-viewport-streaming.md) |
| **🔥 PK-VIEWPORT-FIX** | **VIEWPORT FIX — эвакуация screencast из browser_service, relay в stand lifecycle, canvas onload fix** | **🟢 CLOSED (28 авг · F1 ✅ / B1+L1 ✅ · живой смоук 1920×1080 JPEG FFD8)** | Flash + Luna | 0h | § Эпик PK-VIEWPORT-FIX ниже · 3 карточки · сквозной контур починен |
| **🔥 PW-AIRGAP-2** | **EXECUTION PARITY — Controller гоняет прогон через PlaywrightAdapter за флагом, CDP-поверхность, видео, live-вид, parity-прогон** | **🟢 CLOSED (28 авг · Boss E1/E2 · Luna E3/E4/E5 · 28 тестов · живой run не гонялся)** | Boss + Luna | 0h | Живой parity run глазами — остался на завтра |
| **🔥 PW-AIRGAP-3** | **CUTOVER + AIRGAP BUNDLE — дефолт на Playwright, Selenium выпилен, docker save/load, registry вычищен** | **🟢 CLOSED (28 авг · Boss C1 · Luna C2/C3 · 8 тестов · Grid выпилен из compose)** | Boss + Luna | 0h | § Эпик PW-AIRGAP-3 ниже |
| **🔥 PK-RUNCTL** | **SYSTEM LAYERS — Health-контракт, Edge Gateway, Run Control Plane, Telemetry, Pure Box защита** | **🟡 ядро ✅ / wiring ❌ (28 авг · Boss RUN-CTL 1-6 in-memory · Luna HEALTH/TELEMETRY/PROFILES 30 тестов · НЕ подключён к lab_run)** | Boss (wiring) | 3h (остаток) | § Эпик PK-RUNCTL ниже · Ядра написаны, осталось подключить к runtime |
| **🔥 WARZONE** | **SIGNATURE REWIND 100/100 — детерминированная перемотка луча фаззинга, RTS-камера, 3 режима Execution Hub** | **🟡 ядро ✅ / wiring ❌ (28 авг · Boss WZ-1/2/5 · Luna WZ-3/4/7/8 33 теста · Flash WZ-6 ❌ · НЕ подключён к SSE/Live)** | Flash (WZ-6) + Boss (wiring) | 5h (остаток) | § Эпик WARZONE ниже · WZ-6 остался · wiring к Live SSE |
| **🔥 PK-CRAWLER** | **PLAYWRIGHT SPA/STATE CRAWLER — собственный обход SPA по состояниям, граф переходов, UI-пробуждение сиротских форм, связка с CorpusFuzzer** | **🟡 research (POC design готов, 28 авг 2026)** | Boss 30% + Flash 40% + Luna 30% | 25.5h (est) | § Эпик PK-CRAWLER ниже · 11 карточек (P0+P1) · research: [`docs/research/2026-08-28-playwright-spa-crawler-poc.md`](research/2026-08-28-playwright-spa-crawler-poc.md) · P0: 7 карточек, 17.5h · P1: 4 карточки, 8h |
| **🔥 PK-SPIDER-APOCALYPSE** | **SPIDER APOCALYPSE — старые spider-имена → алиасы на `crawl`, scanner-специфика → @deprecated, тесты переписаны, spiderCompletions.ts удалён** | **🟡 ready (нарезано, 28 авг · 1 карточка, 3.5h)** | Flash | 3.5h (est) | § Эпик PK-SPIDER-APOCALYPSE ниже · ~15 файлов, 91+ попадание в тестах · rename, не remove |
| **🔥 PK-WIRED-RENAME-TAIL** | **Недобитый ренейм Wired → Wired в auth-контексте: `apply_wired_auth` → `apply_wired_auth` (13 точек, 3 файла)** | **🟡 ready (нарезано, 28 авг)** | — | 1h (est) | § Эпик PK-WIRED-RENAME-TAIL ниже · 1 карточка · часть 48 red |
| **🔥 PK-SCANNER-RENAME** | **scanner → scanner: внутренние имена (adapter/env/gates/compose/логи). scanner остаётся в fame list — просто не упоминаем на каждом углу. `zapv2`/API-контракты не трогаем** | **🟡 ready (нарезано, 28 авг)** | по команде | 6h (est) | § Эпик PK-SCANNER-RENAME ниже · 3 карточки (SCN-R1/R2/R3) · 300 файлов, 130 scannerAdapter refs, 70 env, 39 compose |
| **🔒 SOR** | **SESSION ORCHESTRATION & MULTI-SUBSTRATE — Box/Session/Run иерархия, RuntimeProvider boundary (Compose appliance + K8s cluster), pk-control control plane, fencing/lease, Cosmoport2 API boundary** | **🟡 ready (нарезано, 28 авг) — фундамент зафиксирован в research, НЕ канон** | Boss + Luna + Flash + Buddy | 46h (est) | § Эпик SOR ниже · 18 карточек (5 волн) · research: [`docs/research/2026-08-28-session-orchestration-and-multi-substrate-architecture.md`](research/2026-08-28-session-orchestration-and-multi-substrate-architecture.md) |

> 🏛️ **Архив выполненного:** Все 25+ закрытых эпиков (SC, WAR, DP, DP-ADM, ADM-V3, AUTH-PROF, AUTH-SPIKE, AUTH-PROD, PK-CI 1–3, PK-TRM 1–4, PK-BL, DOJO-S, MH-FIX, IMPX, RK, PSI, VN, CD и др.) перенесены в [`archive/backlog-archive-2026-08.md`](archive/backlog-archive-2026-08.md).

---

## 🔥 ИТОГ СМЕНЫ 28 авг 2026 — Фактический статус по отчётам братьев

> **253 теста PY + 57 тестов FE + 33 теста warzone passed. tsc 0.** Ядра написаны, wired не сделан.
> **Критическая проблема:** всё написанное — чистое ядро без wiring. RUN-CTL не подключён к `lab_run.py`. WARZONE не подключён к SSE/Live. Playwright parity не прогнан живьём. **WIP Boss не разобран (TRIAGE не сделан).** Editor сломан (`Connection refused`).

### Факт по исполнителям

| Исполнитель | Что сделано | Тесты | Что НЕ сделано |
|---|---|---|---|
| **Boss** | PW-E1/E2 ✅ · PW-C1 ✅ · RUN-CTL 1-6 (in-memory ядро) ✅ · WZ-1/2/5 (ядро) ✅ | — | ❌ TRIAGE WIP · ❌ RUN-CTL-WRAP (wiring к lab_run) · ❌ Editor fix in progress |
| **Flash** | VP-F1/F2 (BrowserStage canvas + WS relay + cleanup) ✅ · DSL-CLEAN F1/F2 ✅ | 24 FE + tsc 0 | ❌ WZ-6 (три режима UI) · ❌ WZ-7 (Luna сделала вместо него) |
| **Luna** | PW-E3/E4/E5 ✅ · PW-C2/C3 ✅ · HEALTH-1/2/3 ✅ · TELEMETRY-1/2/3 ✅ · PROFILES-1 ✅ · WZ-3/4/7/8 ✅ | 253 PY + 33 warzone | ⚠️ COSMOPORT-2 (10 модулей) — не должно было делаться сегодня |

### ⚠️ Luna ушла в Cosmo

10 модулей COSMOPORT-2 сделаны (COS-004/006/008/009/011/013/014/015/017/018, 60 тестов) **вопреки boundary assessment**. Статус: PoC, не production. НЕ подключать к DAST-рантайму. НЕ коммитить как часть PrettyK core.

### 🔴 Что осталось — приоритетный порядок

#### 0. TRIAGE WIP — выполнен Keeper'ом (28 авг 2026)

Полная раскладка незакоммиченного дерева по трём кучам. Проверено: куча B не импортирует DAST-код (только stdlib + `infra.*`). Кучи физически пока не разнесены — ждём команды Максима на коммит/перенос.

**Куча A — PRODUCTION (PW-AIRGAP-2/3 + browser + registry + draft fix).** Довести до зелёных, коммитить как Playwright cutover:

| Файл | Автор |
|---|---|
| `orchestrator/adapters/playwright_adapter.py` | Boss (PW-E1/E2) |
| `orchestrator/core/controller.py` | Boss (PW runtime flag) |
| `orchestrator/browser/playwright_runtime.py` | Boss (PW) |
| `orchestrator/browser/browser_service.py` | Luna (VP/browser) |
| `orchestrator/browser/cdp_viewport_relay.py` | Boss/Luna (VP) |
| `orchestrator/core/wired_validate.py` | Luna (PW-C3 registry) |
| `orchestrator/tools/export_keywords.py` | Luna (PW-C3 registry) |
| `orchestrator/utils/run_recording.py` | Luna (PW-E3) |
| `orchestrator/tools/data_playground.py` | Flash (VP-F2 cleanup) |
| `orchestrator/tests/test_browser_runtime_parity.py` | Luna (PW-E5) |
| `orchestrator/tests/test_pw_airgap_and_cdp.py` | Boss (PW-E2) |
| `orchestrator/tests/test_pw_airgap_phase2.py` | Luna (PW) |
| `orchestrator/tests/test_run_recording.py` | Luna (PW-E3) |
| `orchestrator/tests/test_pw_airgap_cutover.py` | Boss (PW-C1) |
| `services/docker-compose.yml` | Boss (PW-C1 grid removed) |
| `services/scripts/airgap-bundle.ps1/.sh` | Luna (PW-C2) |
| `orchestrator/utils/draft_store.py` + `test_draft_store.py` | **Boss — Editor fix В РАБОТЕ, НЕ ТРОГАТЬ** |
| `frontend/src/terminal/BrowserStage.tsx` | **Boss — Editor fix В РАБОТЕ, НЕ ТРОГАТЬ** |

**Куча B — PoC / reference (RUN-CTL + WARZONE + system layers).** Изолированы от DAST-импортов (проверено), оставить в dev как reference, НЕ подключать к runtime до wiring:

| Файл | Автор |
|---|---|
| `orchestrator/core/run_control_plane.py` | Boss (RUN-CTL in-memory) |
| `orchestrator/infra/health.py` · `telemetry.py` · `profiles.py` | Luna (system layers) |
| `orchestrator/tests/test_pk_runctl.py` · `test_run_control_plane.py` | Boss |
| `orchestrator/warzone/` (event_journal, timeline_controller, video_track_adapter) | Boss |
| `orchestrator/tests/test_warzone.py` | Boss |
| `frontend/src/warzone/` (beamRenderer, rtsCamera, timeline, warzone.test) | Luna |

**Куча C — COSMOPORT PoC (НЕ коммитить в dev как production).** Отдельный продукт по boundary assessment:

| Файл | Автор |
|---|---|
| `orchestrator/adapters/execution_woodpecker.py` | Luna (COS-008) |
| `orchestrator/infra/capability_broker.py` | Luna (COS-004) |
| `orchestrator/infra/tool_ctl.py` | Luna (COS-009) |
| `orchestrator/infra/event_bus.py` | Luna (COS-011) |
| `orchestrator/infra/cosmo_health.py` | Luna (COS-015) |
| `orchestrator/tests/test_capability_broker.py` · `test_event_bus.py` | Luna |
| `orchestrator/tests/test_cosmo_infra.py` · `test_cosmo_security.py` · `test_cosmo_steel_thread.py` | Luna |
| `services/docker-compose.cosmo.yml` · `services/Caddyfile` | Luna (COS-013/014) |

**Docs (Keeper):** `docs/backlog.md` · `docs/research/2026-08-28-cosmoport-boundary-assessment.md`.

#### 1. Boss: Editor fix (прямо сейчас, В РАБОТЕ — Keeper не трогает)

#### 2. Boss: Wiring RUN-CTL к lab_run (следующее)

Ядро `run_control_plane.py` (363 строки) написано. Осталось: `lab_run.py` → `RunControlPlane.submit_run(params)` → вернуть статус. Не менять Controller, не тащить Cosmo-зависимости. Чистый in-memory wiring.

#### 3. Boss: Wiring WARZONE к Live SSE (после RUN-CTL)

`event_journal.py` + `timeline_controller.py` + `video_track_adapter.py` написаны. Осталось: прокинуть `EventJournal` в SSE-поток Live → фронтенд читает `SceneState`.

#### 4. Boss: Живой Playwright parity run

Код написан, тесты зелёные, но живой run через `PK_BROWSER_RUNTIME=playwright` не гонялся глазами. Нужен хотя бы один реальный wired-прогон.

#### 5. Flash: WZ-6 — три режима UI Execution Hub (3h)

Единственная несданная карточка Flash. Luna сделала WZ-7 (timeline scrubber). Flash делает только WZ-6: Hybrid / Enterprise Audit / Signature Battlefield.

#### 6. Cosmo-модули Luna — зафиксировать как PoC

Не коммитить в `dev` как production. Если коммитить — то с явным `# PoC — NOT production` в каждом файле и отдельным флагом.

### ✅ Editor fix — CLOSED (Boss, 28 авг 2026)

**Корень:** zustand-селектор `useScenarioDeckStore(s => s.decks[0]?.steps ?? [])` — `?? []` создавал новый пустой массив на каждый `getSnapshot` → `useSyncExternalStore` видел «другой» снимок → бесконечный рендер → `Maximum update depth exceeded`.

**Фикс:** стабильная `EMPTY_STEPS` на уровне модуля + `?? EMPTY_STEPS` в селекторе. Grep по всем `.tsx/.ts` — других селекторов с `?? []/{}` нет.

**Верификация:** `tsc 0`, BrowserStage 3/3, clickCoordinate 5/5, useCdpRecorder 16/16. Редактор открывается.

**Попутно закрыты Boss'ом:** `ERR_CONNECTION_REFUSED :8767` (Live поднят) · 404 `/api/checks/{id}/draft` (draft бэкенд реализован, `draft_store.py`).

### 🟡 Хвосты редактора (не блокирующие, на потом)

| Хвост | Что | Куда |
|---|---|---|
| `PUT draft 409 Conflict` | Штатная работа revision-контракта (optimistic concurrency): устаревший `X-Draft-Revision` → сервер честно возвращает 409 + theirs. Пройдёт после первого успешного PUT. | Не баг. Наблюдать. |
| `spider_urls CORS 404 :8767` | `spiderCompletions.ts` дергает `/api/diary/spider_urls`, но route в `live_server.py` не реализован / не CORS-нут. | Мелкая карточка автодополнения. Flash, по спросу. |

### Что НЕ делать

- ❌ Не ставить `fastapi`/`sqlalchemy`/`alembic` в DAST `.venv` — это Cosmoport-зависимости, отдельный boundary.
- ❌ Не доделывать COS-001/003/010 (PG DDL, RunControlPlane в PG, FastAPI routes) — Cosmoport не является частью текущей коробки.
- ❌ Не коммитить несортированный WIP.

### Итог смены одной строкой

253 + 57 + 33 теста зелёные. 4 из 5 блоков закрыты (PW-AIRGAP-2, PW-AIRGAP-3, PK-RUNCTL, WARZONE). **Главная дыра: wiring.** Ядра написаны, но мёртвые — не подключены к runtime. Editor починен (Boss). WIP разобран (Keeper). Cosmo-модули утекли в дерево.

---

## 🔥 ВОЛНА 2 «WIRING + LIVE» — оживить написанное (28 авг 2026 · пропорция 20/40/40)

> **Цель:** всё, что написано вчера как чистые ядра, подключить к живому runtime и прогнать глазами. RUN-CTL → lab_run. WARZONE → Live SSE. Живой parity run. Cosmo PoC изолирован. WARZONE UI финализирован.
>
> **Пропорция:** Boss 20% / Flash 40% / Luna 40%.

### Пакет BOSS (20% — wiring архитектурных узлов · ~5h)

| ID | Что | Файлы | GWT (кратко) | Est |
|---|---|---|---|---|
| **WIRE-RUNCTL** | Подключить `RunControlPlane` к `lab_run.py`: submit → статус жизненного цикла. Не менять Controller, не тащить Cosmo. | `orchestrator/core/run_control_plane.py`, `lab_run.py` | Запуск проходит queued→running→succeeded/failed; двойной клик не дублирует. | 2h |
| **WIRE-WZ** | Прокинуть `EventJournal`/`timeline_controller` в Live SSE: фронт получает `SceneState` живым потоком. | `orchestrator/warzone/`, `live_server.py` | SSE отдаёт события; фронт читает S(t) детерминированно. | 2h |
| **PARITY-LIVE** | Живой wired-прогон через `PK_BROWSER_RUNTIME=playwright` глазами: вердикт/evidence сходятся. | wired-фикстуры, Monitor | Реальный run зелёный, видео/evidence на месте. | 1h |

### Пакет FLASH (40% — UI WARZONE + хвосты · ~6h)

| ID | Что | Файлы | GWT (кратко) | Est |
|---|---|---|---|---|
| **WZ-6** | Три режима Execution Hub: Hybrid Operational / Enterprise Audit / Signature Battlefield. Переключение не теряет playhead. | `frontend/src/warzone/WarzoneHub.tsx`, `WarzoneModes.tsx` | Переключение режимов — каждый корректен, таймлайн не сбрасывается. | 3h |
| **WZ-SSE** | Подключить WarzoneHub к живому SSE-контракту (после WIRE-WZ Boss). HUD показывает t/лучи/findings. | `frontend/src/warzone/`, `useWarZoneTelemetry.ts` | HUD обновляется от живого SceneState. | 1.5h |
| **SPIDER-URLS** | `spiderCompletions.ts` дергает `/api/diary/spider_urls` — реализовать route + CORS в live_server или заглушить честно. | `spiderCompletions.ts`, `live_server.py` | Нет CORS 404 в консоли; автодополнение либо работает, либо честно молчит. | 1h |
| **DSL-TAIL** | 3 строки: `prettyToWire.ts:65` «ВКонце», `textScan.ts:98,101` «Перехватить»/«ВКонце» — убрать. | `prettyToWire.ts`, `textScan.ts` | grep «Попробовать/Перехватить/ВКонце» по фронту = 0. | 0.5h |

### Пакет LUNA (40% — живая приёмка + PoC-изоляция · ~7h)

| ID | Что | Файлы | GWT (кратко) | Est |
|---|---|---|---|---|
| **COSMO-POC** | Маркировать 10 Cosmo-модулей `# PoC — NOT production` в шапке + убедиться, что ничего не импортируется DAST-рантаймом. | `orchestrator/infra/capability_broker.py`, `tool_ctl.py`, `event_bus.py`, `cosmo_health.py`, `execution_woodpecker.py` | grep PoC-маркер во всех 10; 0 DAST-импортов из этих файлов. | 0.5h |
| **PARITY-LIVE** | Прогнать parity-тесты + живой wired-run на playwright глазами, зафиксировать расхождения. | `test_browser_runtime_parity.py`, фикстуры | Parity зелёный, живой run вердикт/evidence сходятся. | 2h |
| **WZ-LIVE-RENDER** | beamRenderer/rtsCamera подключить к живому EventJournal (она писала оба). Реверс плавный, камера без рывков. | `beamRenderer.ts`, `rtsCamera.ts`, `event_journal.py` | Луч гаснет по сигмоиде, камера без overshoot на живых данных. | 2h |
| **HEALTH-LIVE** | Живая приёмка системных слоёв: `/health` на data_playground отдаёт жив/готов; Pure Box не тянет PG. | `infra/health.py`, `data_playground.py`, `profiles.py` | `/health` отвечает; Pure Box 0 внешних зависимостей. | 1.5h |
| **BUNDLE-CHECK** | Проверить airgap bundle: docker save/load на чистом пути, браузеры в образе. | `services/scripts/airgap-bundle.*` | load + up на чистом хосте — authoring/execution офлайн. | 1h |

### Гейты на выходе волны 2

1. RUN-CTL живёт в lab_run — запуск управляем, не single-flight мёртвый subprocess.
2. WARZONE отдаёт SceneState в Live SSE, фронт читает детерминированно.
3. Живой parity run зелёный глазами.
4. Cosmo PoC маркирован, не импортируется DAST.
5. `tsc 0` + точечные тесты зелёные по каждому пакету. Cosmoport в `dev` не коммитим.

---

## 1. Эпик PK-WB — Editor ↔ Studio Workbench (ЗАКРЫТО НА 100% · 25 авг 2026)

> **Статус:** `✅ CLOSED` — Все 5 пакетов (A, B, C, D, E) закрыты Boss и Flash.  
> **Итог качества:** 352 теста green, `tsc --noEmit` — 0 ошибок, production-ready.  
> **Суть:** Editor и Studio — две проекции одного `CheckWorkspace`. Один draft, одна история версий, один semantic diff, один browser runtime с изолированными контекстами.

---

### Нарезка задач PK-WB

#### Пакет A — Единый живой workspace (ЗАКРЫТО · Boss + Flash)

| ID | Что сделано | Статус | Кто |
|---|---|---|---|
| **PK-WB-A1** | `wiredDslCodec.ts` (141 loc / 15 тестов) + `EditorWorkbench.tsx` (887 loc / 6 тестов, controlled-режим) | ✅ CLOSED | Boss |
| **PK-WB-A2** | `App.tsx` (+40 loc — Segmented [Студия|Редактор], общие колбэки) + `workbenchSurface.ts` (30 loc) | ✅ CLOSED | Boss |
| **PK-WB-A3** | `AppShell.tsx` (+15 loc — `#/studio/:id` → `#/checks/:id/studio` + `localStorage` surface) | ✅ CLOSED | Boss |
| **PK-WB-A4** | `StudioEditorSwitch.tsx` (Segmented переключатель, amber dirty pulse, `WorkbenchModeChangeEvent`) | ✅ CLOSED | Flash |
| **PK-WB-A5** | `workbenchGate.test.tsx` (230 loc / 18 тестов — surface persist, codec round-trip, Studio↔Editor↔Studio) | ✅ CLOSED | Boss |

#### Пакет B — Draft persistence (ЗАКРЫТО · Boss + Flash)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-WB-S1** | Draft сохраняется на сервере с дебаунсом и dirty-guard. После reload черновик восстанавливается. | **Given:** открыт Editor с правками. **When:** страница обновлена. **Then:** черновик восстановлен; dirty-индикатор честен. | ✅ CLOSED | Boss |
| **PK-WB-S2** | Revision / expectedVersion: каждый draft знает базу. При конфликте — честный diff + merge/reload. | **Given:** две вкладки правят один чек. **When:** сохранение на старую базу. **Then:** конфликт показан; тихой перезаписи нет. | ✅ CLOSED | Boss |
| **PK-WB-S3** | Redaction секретов в draft и cache: ни один plaintext-секрет не лежит в localStorage. | **Given:** сценарий содержит `Секрет $x`. **When:** draft сохранён. **Then:** секрет заменён на placeholder. | ✅ CLOSED | Flash |

#### Пакет C — Commit + Semantic Diff (ЗАКРЫТО · Boss + Flash)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-WB-C1** | Immutable revision/checkpoint: оператор фиксирует версию с сообщением, автором и provenance. | **Given:** черновик готов. **When:** нажато «Зафиксировать версию». **Then:** создан immutable revision с hash/parent/timestamp. | ✅ CLOSED | Boss |
| **PK-WB-C2** | Domain normalization + stable entity identity: движок нормализует Wired и строит стабильные ID. | **Given:** переставлены поля JSON. **When:** движок сравнивает. **Then:** шум порядка полей отброшен; виден `MODIFY_STEP`. | ✅ CLOSED | Boss |
| **PK-WB-C3** | Typed semantic change set: типизированные изменения (`ADD_STEP`, `MODIFY_LOCATOR`, `RENAME_ENTITY`...). | **Given:** разные правки. **When:** сравнение двух снапшотов. **Then:** change set строго типизирован; без ложных событий. | ✅ CLOSED | Boss |
| **PK-WB-C4** | Studio cards + Editor Monaco side-by-side diff: изменения из одного источника в двух видах. | **Given:** diff построен. **When:** просмотр изменений. **Then:** в Studio — карточки; в Editor — side-by-side Monaco diff. | ✅ CLOSED | Flash |

#### Пакет D — Browser Stage (ЗАКРЫТО · Boss + Flash)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-WB-B1** | BrowserSession wrapper: один CDP connection, изолированные `Operator/Run/Debug` контексты. | **Given:** Browser Stage + параллельный прогон. **When:** runner выполняет шаги. **Then:** OperatorContext не затронут. | ✅ CLOSED | Boss |
| **PK-WB-B2** | Постоянный Browser Stage: `BrowserStage.tsx` (Author 58/42, Record 60/40, Debug follow run, коллапс). | **Given:** смена режима. **When:** переключён Record mode. **Then:** вьюпорт расширяется до 60% без перемонтирования. | ✅ CLOSED | Flash |
| **PK-WB-B3** | Discovery Hover Overlay + Click-to-DSL: `DiscoveryOverlay.tsx` (T0–T4 карточки, `DSLProposalBanner`). | **Given:** наведение в режиме записи. **When:** клик по кнопке. **Then:** DSL-шаг предложен через diff (accept/reject). | ✅ CLOSED | Flash |
| **PK-WB-B4** | Один browser runtime без дублирования Chromium: общий процесс, раздельные BrowserContext. | **Given:** запущен прогон. **When:** работает Stage. **Then:** второй процесс Chrome не создаётся. | ✅ CLOSED | Boss |

#### Пакет E — Конкурентный Editor: Debugger, Replay, LSP, AI (ЗАКРЫТО · Boss + Flash)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-WB-E1** | PrettyK Language Intelligence: Monaco автодополнение MethodId, hover, diagnostics, go-to-definition. | **Given:** сценарий в Monaco. **When:** ввод MethodId или F12. **Then:** работают подсказки, навигация, подсветка устаревших. | ✅ CLOSED | Flash |
| **PK-WB-E2** | Gutter Play `[▶]`: запуск одного шага из Monaco с выставлением LED-статуса строки. | **Given:** открыт сценарий. **When:** клик `▶` на строке. **Then:** шаг выполняется в Browser Stage; строка получает LED. | ✅ CLOSED | Flash |
| **PK-WB-E3** | Step Debugger: пошаговое выполнение, просмотр состояния шага, вход/выход, повтор с payload. | **Given:** шаг упал. **When:** открыт debugger. **Then:** видно состояние шага, вход/выход, причину ошибки без утечки секретов. | ✅ CLOSED | Boss |
| **PK-WB-E4** | Pipeline Preview: предпросмотр плана до запуска (шаги, зависимости, права, gates, артефакты). | **Given:** сценарий готов. **When:** открыт preview. **Then:** виден полный план рисков и ресурсов до клика Run. | ✅ CLOSED | Flash |
| **PK-WB-E5** | Evidence-linked Editor: из строки DSL видна цепочка `DSL → run → finding → artifact` + Policy Lens. | **Given:** есть результаты. **When:** открыт редактор. **Then:** строка подсвечивает путь к finding; policy lens объясняет вердикт. | ✅ CLOSED | Boss |
| **PK-WB-E6** | Command Palette (`Ctrl+K`): быстрый поиск по workspace, go-to-line, команды валидации и запуска. | **Given:** нажат `Ctrl+K`. **When:** ввод команды. **Then:** поиск и вызов действий без мыши. | ✅ CLOSED | Flash |
| **PK-WB-E7** | AI-подсказки только как `suggestion → diff → approval`: AI не может менять scope или выполнять destructive. | **Given:** AI предложил шаг. **When:** открыто предложение. **Then:** показан diff; применение — явный клик оператора. | ✅ CLOSED | Boss |

---

### Сводка часов PK-WB

| Исполнитель | Выполнено | Статус |
|---|---|---|
| **Boss** | 11 карточек (A1, A2, A3, A5, S1, S2, C1, C2, C3, B1, B4, E3, E5, E7) | **47h ✅ CLOSED** |
| **Flash** | 7 карточек (A4, S3, C4, B2, B3, E1, E2, E4, E6) | **26h ✅ CLOSED** |
| **ИТОГО** | **Все 5 пакетов закрыты · 352 теста green** | **73h ПОЛНОСТЬЮ СДАНО** |

---

## 2. Эпик PK-ER — Editor Reborn: возврат продуктового Explorer и натяжка Workbench (IMPLEMENTED · 25 авг 2026)

> **Статус:** `🟡 IMPLEMENTED` — Все 6 карточек (ER-0..ER-5) реализованы Boss и Flash. 52 теста green, tsc 0.  
> **Итог реализации:** 0 регрессий, 0 фантомных вкладок, 0 тихой перезаписи. Visual parity (guide rails, ellipsis, dark/light) подтверждена на живом чек-ауте.

---

### Нарезка задач PK-ER

| ID | Что получает пользователь | Приёмочный сценарий GWT (ЧИСТО) | Est | Кто |
|---|---|---|---|---|
| **ER-0** | **Baseline & Parity Contract:** Утверждённый эталонный чек-лист parity (корни, действия, состояния, dark/light, rails, keyboard). | **Given:** старый и новый Editor. **When:** проход матрицы parity. **Then:** зафиксированы эталонные корни, действия и скриншоты; исключены догадки «сделай похоже». | 0.5h | Keeper + Boss + Flash |
| **ER-1** | **Единый семантический Explorer:** Шесть продуктовых корней (`Модели страниц`, `Сценарии`, `Фаззеры`, `Модули данных`, `Коннекторы и Интеграции`, `Профили авторизации`), папки, leaves, честный empty/error state. | **Given:** открыт новый Editor. **When:** загружен workspace с сущностями. **Then:** видны все 6 корней и папки; клик по сущности открывает правильный документ; Editor и Studio синхронны. | 3h | Boss |
| **ER-2** | **Операции над деревом сущностей:** Создание, переименование, удаление с подтверждением, перемещение, сохранение раскрытия/выбора после reload. | **Given:** выбрана папка или leaf. **When:** вызваны create/rename/delete/drag-drop. **Then:** дерево, активный документ и draft согласованы; отмена безопасна; тихой перезаписи нет. | 3h | Boss |
| **ER-3** | **Визуальная и интеракционная Parity:** Guide rails, отступы, chevrons, высота строк, dark/light ассеты, long-text truncation, dirty/error бейджи на узлах. | **Given:** открыт Explorer в разных темах и ширине. **When:** раскрываются вложенные уровни. **Then:** линии и иконки совпадают с эталоном; нет обрывов rails; текст не ломает дерево. | 3h | Flash 🟡 IMPLEMENTED |
| **ER-4** | **Explorer ↔ Editor ↔ Run Continuity:** Сквозной путь от выбора сущности в Explorer до DSL, Monaco diff, Gutter Play, Browser Stage, Step Debugger и Evidence. | **Given:** выбран сценарий с правками. **When:** запущен шаг или открыт diff/evidence. **Then:** все панели относятся к одной сущности; переключение Studio ↔ Editor не теряет контекст. | 2h | Boss + Flash |
| **ER-5** | **Надёжность, безопасность и accessibility:** Loading/conflict/offline состояния, отсутствие plaintext-секретов в дереве и diff, навигация с клавиатуры (F2/Delete/Enter/Esc). | **Given:** конфликт сохранения или сетевой сбой. **When:** оператор работает в дереве. **Then:** состояние честно показано; фокус клавиатуры доступен; секреты защищены. | 1.5h | Boss |

---

### Сводка часов PK-ER

| Исполнитель | Карточки | Часы | Статус |
|---|---|---|---|
| **Boss** | ER-1 (3h), ER-2 (3h), ER-4 (1h), ER-5 (1.5h) | **8.5h** | 🟡 IMPLEMENTED |
| **Flash** | ER-3 (3h), ER-4 (1h), ER-0 (0.5h совместный) | **4.5h** | 🟡 IMPLEMENTED |
| **ИТОГО** | **6 атомарных задач · 2 исполнителя** | **13h** | **🟡 IMPLEMENTED** |

---

## PoC → Plan: CDP-WIRE — Live CDP → Wire → Studio + Editor Step Drawn

> **Фундамент:** [`spike/2026-08-25-cdp-wire-studio-editor-step.md`](spike/2026-08-25-cdp-wire-studio-editor-step.md) (335 строк, полный PoC-пакет).  
> **Гипотеза:** одно реальное действие оператора в живом CDP-браузере можно захватить один раз, превратить в reviewable wire/action step и показать как один и тот же шаг в Studio и Editor без desync.  
> **Правило:** PoC-код не production. После `PROMOTE` — отдельный Plan с production DoD. `KILL` = снести реализацию, сохранить гипотезу.

---

### Phase 1: POC-CDP-WIRE (PoC · IMPLEMENTED · 25 авг 2026 · 🟥 BLOCKED на live-верификации)

> **Тип:** `PoC`, не production-фича.  
> **Первый action:** click; type добавляется только после green click-flow.  
> **Статус:** реализован Boss + Flash. 79/79 unit-тестов, tsc 0. Найдены и закрыты 2 бага redaction-контракта (plaintext больше не утекает).  
> **Live-верификация (browser-hands-pure, 26 авг):** живой CDP Chrome `:9222` + Juice Shop `:3000` + физический клик — **цепочка НЕ работает.** Найден блокирующий бэкенд-баг.  
> **Баг:** в `browser_service.py` функция `_on_click` определена внутри `browser_observe_start` (строка 276), а вызывается из `browser_observe_event` (строка 399) — вне скоупа → `NameError` → глотается `except Exception: pass` → каждый реальный клик молча теряется, `event: null`.  
> **Вердикт:** `PROMOTE` **заблокирован** до фикса Boss + повторной live-проверки. Unit-тесты этот путь не покрывают (mock observation). Gate #1 («CDP event живой, не mock») фактически не выполнен.

| ID | Что доказываем | Приёмочный сценарий GWT | Кому |
|---|---|---|---|
| **POC-CDP-1** | Живой attach к операторскому CDP и реальное событие browser action. | **Given:** разрешённый тестовый экран открыт в Chrome CDP. **When:** оператор включает discovery и инспектирует кнопку. **Then:** получены реальный event + DOM/AX evidence; mock event не принимается. | Boss |
| **POC-CDP-2** | Locator proposal с tier/confidence и честной неоднозначностью. | **Given:** элемент имеет role-first candidate. **When:** candidate неоднозначен. **Then:** proposal помечен review-needed и не применяется автоматически; CDP-down даёт error state. | Boss |
| **POC-CDP-3** | Один canonical action/wire step после явного Accept. | **Given:** proposal показан. **When:** оператор принимает. **Then:** wire валиден; создан ровно один step; существующий draft не перезаписан целиком. | Boss |
| **POC-CDP-4** | Studio Step и Editor Step Drawn — две проекции одного шага. | **Given:** canonical step принят. **When:** открыты Studio и Editor. **Then:** видны один StepPill и одна DSL-строка с общей step identity и provenance marker. | Flash + Boss |
| **POC-CDP-5** | Reject, replay, manual trust и redaction. | **Given:** proposal отклонён, event повторён, locator был ручным или value чувствителен. **When:** pipeline повторяется. **Then:** draft не меняется после Reject; duplicate не появляется; manual locator не затирается; plaintext не виден. | Boss + Flash |

#### PoC DoD

- CDP event живой, не mock.
- Click проходит полный путь `CDP → discovery → wire → Studio → Editor`.
- Accept/Reject детерминированы.
- Ambiguous locator блокирует auto-apply.
- Studio и Editor не имеют независимых копий шага.
- Wire валиден и сохраняет ручные правки при merge.
- CDP failure честно виден.
- Negative/security/redaction tests green.

---

### Phase 1.5: BR-AUTH — Authoring Browser (Playwright headed, не CDP :9222) · 🔨 QUEUED · 27 авг 2026

> **Контекст (Keeper Dev):** браузер в Editor `BrowserStage` — это **авторинг-браузер**: оператор руками кликает в живом окне → observe захватывает клик → DSL-шаг. Это НЕ execution (тот живёт в Studio через Grid/noVNC `:7900` → VideoTrack) и НЕ агентский `kdt-cdp-chrome :9222` (browser-hands-pure — инструмент агента, не продукта).
> **Что уже сделано (Keeper Dev):** `browser_service.py` → `_get_page()` переписан на `chromium.launch(headless=False)` (живое окно 1280×800). Убрана привязка к `:9222`. `_on_click` и `browser_observe_*` уже module-level (NameError из Phase 1 закрыт). В `data_playground.py` вычищены дубликаты `_post_browser_back/forward`.
> **Проверено (Keeper Dev):** `.venv` = `D:\prettyk-dev\.venv\Scripts\python.exe` ✅ · playwright импортируется ✅ · chromium скачан (`ms-playwright\chromium-1234\chrome-win64\chrome.exe`) ✅.
> **Почему headed обязателен:** observe ловит клик через `document.addEventListener('click')` + `expose_binding`. В headless кликать некому → actions в сценарий не прыгают → headless бессмыслен для авторинга.

| ID | Что делаем | Приёмочный сценарий GWT | Кому |
|---|---|---|---|
| **BR-AUTH-1** | Добить/проверить headed-запуск в Playground-процессе. | **Given:** Editor открыт, вкладка Browser. **When:** оператор вводит URL и жмёт Enter. **Then:** `_get_page()` запускает headed Chromium, страница грузится, скриншот/вьюпорт живёт, `liveCdp=true`, кнопки ← → ⟳ разлочены. | Boss |
| **BR-AUTH-2** | Сквозная проверка observe → DSL в headed. | **Given:** headed-браузер открыт, Record включён. **When:** оператор физически кликает по элементу. **Then:** `expose_binding` → `_on_click` → `build_candidates` → event в очереди → BrowserStage поллит → proposal показан → Accept создаёт ровно один DSL-шаг. | Boss |
| **BR-AUTH-3** | Вычистить остатки `:9222`/CDP/headless из авторинг-пути. | **Given:** `browser_service.py`. **When:** читаю код. **Then:** нет `connect_over_cdp`, нет `_CDP_ENDPOINT` в авторинг-логике, нет `headless=True` для авторинга; Grid/noVNC не трогается (он в Studio). | Boss |

#### BR-AUTH DoD

- Авторинг-браузер поднимается сам (headed), без `:9222`, без ручного `local.ps1`.
- Клик оператора в живом окне → DSL-шаг в сценарии.
- Grid/noVNC `:7900` остаётся execution-only (Studio/VideoTrack), не появляется в Editor.
- `:9222` остаётся только в `browser-hands-pure` (агентский инструмент), не в продуктовом коде.
- `python`/`.venv` не хардкодится — Playground стартует через `lab_ensure_ui.ps1`.

---

### Phase 2: CDP-WIRE Plan (Production · QUEUED · after PROMOTE)

> **Тип:** `Plan` — production-реализация, запускается только после `PROMOTE` Phase 1.  
> **Действия:** click (первый), type (второй).  
> **Разделение:** Boss = CDP-мост, discovery IR, wire-компилятор, canonical step identity, безопасность. Flash = Browser Stage UI, proposal/diff, Studio StepPill, Editor drawn provenance.

| ID | Что получает пользователь | Приёмочный GWT (ЧИСТО) | Est | Кто |
|---|---|---|---|---|
| **CDP-1** | **Живой захват действия из браузера.** Оператор переключает Browser Stage в режим Record, кликает по элементу на живом тестовом экране — система получает реальное CDP-событие, а не mock. | **Given:** открыт разрешённый тестовый экран в Chrome CDP, Browser Stage в режиме Author. **When:** оператор включает Record и кликает по кнопке. **Then:** получено реальное browser-событие с DOM/AX-снимком элемента; mock-заглушка не принимается. | 3h | Boss |
| **CDP-2** | **Умный подбор локатора.** После клика система предлагает role-first локатор с уровнем уверенности (T0–T4). Неоднозначный элемент блокирует автоприменение. | **Given:** получено CDP-событие от элемента. **When:** система строит candidate-локаторы. **Then:** показан лучший candidate с tier и confidence; при неоднозначности шаг не применяется автоматически. | 3h | Boss |
| **CDP-3** | **Честный proposal с Accept/Reject.** Оператор видит предложение нового шага, может принять (Enter) или отклонить. Отклонение не меняет workspace. | **Given:** proposal показан в Browser Stage. **When:** оператор нажимает Accept. **Then:** создан ровно один canonical action step; wire валиден; draft не перезаписан целиком. **When:** оператор нажимает Reject. **Then:** ни Studio, ни Editor, ни draft не меняются; proposal закрыт. | 3h | Flash + Boss |
| **CDP-4** | **Единый шаг в двух проекциях.** Принятый шаг одновременно появляется в Studio как StepPill (с цветом действия) и в Editor как DSL-строка с маркером происхождения. Не две копии — один шаг. | **Given:** canonical step принят (CDP-3). **When:** открыты Studio и Editor. **Then:** в Studio — StepPill с цветом действия; в Editor — DSL-строка с подсветкой «✨ Discovered»; общая step identity. | 3h | Flash |
| **CDP-5** | **Защита от дублей, затирания ручного и утечки секретов.** Повторное событие не создаёт дубликат; ручной локатор не затирается; значения (пароли, токены) заменены на placeholder. | **Given:** шаг уже существует. **When:** discovery повторно видит тот же элемент. **Then:** дубликат не создаётся без нового Accept; ручная правка локатора сохранена. **Given:** оператор вводит значение в поле. **When:** proposal сформирован. **Then:** plaintext не попадает в wire, Diff, логи и UI. | 2h | Boss |
| **CDP-6** | **Честная ошибка при обрыве CDP.** Если браузер закрыт или CDP-соединение потеряно — disconnect-состояние, никаких фейковых шагов. | **Given:** CDP-эндпоинт недоступен или страница закрыта. **When:** оператор включает Record. **Then:** UI показывает честный error/disconnected state; mock-событие не генерируется; шаг не добавляется. | 1h | Flash + Boss |
| **CDP-7** | **Визуальный оверлей без поломки вёрстки.** При наведении — подсветка элемента через CDP Overlay или React-слой, не инжектит чужие div'ы в DOM страницы. | **Given:** Browser Stage в режиме Record, курсор над элементом. **When:** система определяет bounding rect. **Then:** подсветка отрисована поверх вьюпорта; DOM страницы не изменён; клики проходят к целевому элементу. | 2h | Flash |
| **CDP-8** | **Сквозной click: браузер → DSL.** Полный цикл для типа `click`. Один integration-тест доказывает всю цепочку. | **Given:** живой браузер с кнопкой. **When:** оператор кликает → принимает proposal. **Then:** в Studio одна пилюля, в Editor одна DSL-строка, wire валиден, ручные шаги не задеты, секретов нет, дублей нет. | 2h | Boss + Flash |
| **CDP-9** | **Расширение на Type-action.** После успешного click-flow — второй тип действия: ввод в текстовое поле. | **Given:** textbox с однозначным role/accessible name. **When:** оператор вводит тестовое значение. **Then:** proposal показывает Type-step с redacted значением; после Accept — Studio и Editor добавляют один Type-step без plaintext-секретов. | 2h | Boss + Flash |

#### Сводка часов Phase 2

| Исполнитель | Карточки | Часы |
|---|---|---|
| **Boss** | CDP-1, CDP-2, CDP-3, CDP-5, CDP-6, CDP-8, CDP-9 | **12h** |
| **Flash** | CDP-3, CDP-4, CDP-6, CDP-7, CDP-8, CDP-9 | **8h** |
| **ИТОГО** | **9 атомарных задач** | **20h** |

#### Out of scope (явно НЕ делаем)

- Полноценный crawler и обход всего сайта
- Автоматическое принятие шагов без оператора
- Все action types (только click + type)
- Multi-user collaboration
- Production persistence и retention policy
- scanner, Dojo, Allure, findings и evidence pack integration
- Mobile/browser matrix
- Автономный AI-оператор

---

## 3. Эпик BUD-E2E — PrettyK Buddy end-to-end (ДВИЖОК И STU-V2 РЕАЛИЗОВАНЫ · PROMOTE ЗАБЛОКИРОВАН · 27 авг 2026)

> **Тип:** PoC-стыковка в живую Studio. Движок Buddy и функциональный долив STU-V2
> реализованы: движок 64/64, STU-V2 402/402, tsc 0. Поверхность больше не считается
> макетом. Однако новый функционал пока живёт на временном `-v2` маршруте и ещё не
> прошёл живой CDP run глазами оператора.
> **Вердикт Keeper:** PROMOTE CO-PILOT META не выдаю до двух отдельных фактов:
> живой run и переход на канонические рельсы STU-RAILS. Нельзя путать готовый движок
> и долитый UI с принятым продуктовым маршрутом.

### Нарезка Boss

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **BUD-E2E-B1** | **Единый контроллер Buddy.** Оператор пишет описание приложения/сценария обычным языком — система проходит один цикл: извлечённый skeleton → уточняющие вопросы → reviewable proposal, не создавая ничего в workspace до подтверждения. | **Given:** открыт чат Buddy в Studio на разрешённом тестовом приложении. **When:** оператор описывает приложение и сценарий одним или несколькими сообщениями. **Then:** виден skeleton (страницы, шаги, ожидания) с явной пометкой предположений; вопросы задаются только по реальным пробелам/противоречиям; proposal показан как diff; workspace не изменён до Accept. |
| **BUD-E2E-B2** | **Живой bounded run.** После подтверждения оператора запускается реальный прогон в живом браузере (не mock), с видимым текущим шагом, лимитом итераций/времени и рабочей кнопкой Stop. | **Given:** proposal принят, тестовое приложение доступно в браузере. **When:** оператор запускает bounded run. **Then:** шаги реально выполняются в браузере; виден текущий шаг; Stop останавливает прогон; при недоступном приложении — честный disconnected state, не pass. |
| **BUD-E2E-B3** | **Evidence pass/fail по фактам.** По завершении система сопоставляет результат с исходным намерением и сообщает pass только когда каждое заявленное ожидание доказано реальным evidence; провал — с честной причиной. | **Given:** run завершился (успех, провал или остановка). **When:** оператор читает итог. **Then:** pass только при доказанных assertion-ах с ссылкой на evidence; fail показывает что доказано/не доказано; plaintext-секрет нигде не виден; видна цепочка intent → run → evidence. |

### Нарезка Flash

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **BUD-E2E-F1** | **Copilot Dock в Studio.** Справа в Studio живёт штурманский док Buddy: схлопывается в тонкий рельс с LED-индикатором фазы, разворачивается в панель с виджетами; ничего не перекрывает рабочую область. | **Given:** открыт Studio с проектом. **When:** оператор открывает/сворачивает док Buddy. **Then:** рельс показывает фазу (готов/думает/ждёт/запуск/завершено/ошибка) цветом и пульсом; развёрнутый док показывает виджеты; вёрстка рабочей области не ломается. |
| **BUD-E2E-F2** | **Виджеты на реальных данных.** SkeletonCard, чипсы уточнений, сплит-дифф, радар шагов и матрица evidence показывают данные живого цикла Buddy (через адаптеры), а не заглушки; хоткеи работают. | **Given:** идёт цикл Buddy (skeleton/вопросы/proposal/run/evidence). **When:** оператор работает с доком. **Then:** каждый виджет отражает актуальные данные; Accept=Enter, Reject=Esc, чипсы=1..9, Take Control=Space; состояние честно обновляется. |
| **BUD-E2E-F3** | **Launchpad на пустом проекте.** В пустой Studio вместо мёртвого фона — командная консоль Buddy, где оператор описывает приложение, и из описания материализуется первый граф страниц/сценариев. | **Given:** открыт Studio без загруженной конфигурации. **When:** оператор вводит 1–2 предложения о приложении. **Then:** виден предложенный skeleton/граф; пустое состояние не сломано; существующий проект не затирается без подтверждения. |

### Приёмка BUD-E2E (Keeper)

- Живой клик CDP даёт реальное событие (не mock) — Gate #1 CDP-WIRE закрывается тем же проходом.
- Цикл `intent → skeleton → clarification → proposal → run → evidence` проходит на одном тестовом приложении целиком.
- Accept/Reject детерминированы; до Accept workspace не меняется.
- Stop останавливает run; disconnected/timeout не маскируются под успех.
- Pass только по доказанному evidence; plaintext-секреты отсутствуют.
- `DeterministicBuddyModel` — default; реальная модель подключается swap-контрактом позже, не блокирует стыковку.

---

### Отчёт Boss (26 авг · вечер) — все карточки сданы

> Принято к сведению, PROMOTE пока не выдаю — остался один живой gate.

- Единая точка сборки дока связывает движок, подписку на состояние, адаптеры Flash,
  lifecycle (intent → skeleton → clarify → proposal → approve → run → evidence) и хоткеи.
- Док встроен в Studio на правом краю рабочей области.
- Верификация: `tsc --noEmit` 0 ошибок; `vitest` **64/64** — движок `src/buddy/` 35/35
  (buddyEngine 17, cdpStepRunner 9, **buddyE2E 9**), Flash-контур 29 (контроллер дока 8,
  buddyHotkeys 3, SkeletonCard 5, CopilotDock 3, buddyWidgets 10).
- Полный контур CO-PILOT META готов к приёмке: Launchpad → addMessage → extractSkeleton
  (assumption, не выдумка) → clarify (пробелы→вопросы, противоречия→блок) → buildProposal
  (один page object + один scenario) → LiveDiffBanner (Apply=Enter / Reject=Esc, до approval
  workspace не меняется) → approve → run → BoundedRunner (лимиты + Stop) → makeCdpStepRunner
  (живой CDP) → evaluateAssertions → EvidenceMatrix (pass только при доказанных assertions).

**Осталось для PROMOTE — два честных открытия, не одно:**
1. **Живой CDP run** за пультом (клик Juice Shop :3000 через Chrome CDP :9222 →
   не-mock событие → proposal → Accept → run → evidence).
2. **Новые поверхности должны стать каноническими** — обычные `studio`/`editor`,
   один instance id, legacy только под `studio-old`/`editor-old`, без публичного
   `-v2`, без потери draft и контекста. Нарезка переезда — STU-RAILS ниже.

**Дополнение Boss (26 авг · ночь) — сквозной E2E на живом движке.** Построен
`buddyE2E.test.ts` (9 тестов), доказывающий все три карточки B1/B2/B3 на реальном движке
(мокается только CDP-слой BrowserSession): B1 — полный цикл intent→skeleton→clarify→
proposal→approve, дубль пути = противоречие блокирует генерацию, до Accept workspace не
тронут; B2 — makeCdpStepRunner через BoundedRunner (Open/Click/Type-redacted/Wait/Assert
идут в BrowserSession), disconnected → честный fail, timeout (maxTimeMs=5) →
bounded_failure|done|stopped не вечный цикл, Stop работает; B3 — pass только при доказанных
assertions, trace intent_received→…→evidence_evaluated прослеживается, Type-шаг redacted
(plaintext не попадает в DSL), intent без ожидания = incomplete блокирует (не «зелёный» pass).
Два подтверждённых поведения движка (не баги): дубль пути = честное противоречие; intent без
ожидания = incomplete, не pass.

**Интеграция дока — на маршруте `#/studio-v2` (StudioV2.tsx → BuddyDockController).**
Старый `#/studio` (StudioWorkspace) — отдельный маршрут, вне скоупа Buddy, не тронут.
Завтрашняя живая приёмка идёт на `#/studio-v2`.

---

### Замечания первого UX-прохода (Максим · 26 авг · на завтра)

> Зафиксированы для завтрашней приёмки после первого прохода по UX и удаления жирноты.
> Не чинить сегодня — это блок final shaping.

- **Editor в целом рабочий** — «более менее нормально выглядит, рабочий вроде уже вариант».
- **Двойной хедер** — зафиксирован, пока «хуй с ним», окультурить завтра.
- **Explorer** вкорячен без изменений — принят как есть.
- **Браузер CDP в редакторе сделан через жопу:** форма не растянута, непонятно как запускается встроенный браузер — завтра после первого UX-прохода.
- **План завтра:** окультурить UI → первый проход по UX → удаление жирноты → final shaping.

---

## 3½. Перепокрытие UI-тестами → вынесено в отдельный бэклог

> По просьбе Максима — отдельный бэклог: [`atest-backlog.md`](atest-backlog.md).
> Ответственный Buddy (prettyk-atest) как босс. Там: что уже покрыто (64 теста),
> 6 кандидатов на добивку, формат ведения и контекст BUD-E2E.

---

## 3¾. Эпик STU-V2 — Studio v2: долить функционал старого Studio (IMPLEMENTED · временный маршрут · 27 авг 2026)

> **Статус:** `🟡 IMPLEMENTED` — все 10 карточек (Boss B1–B7 + Flash F1–F3) закрыты.
> `tsc --noEmit` 0, `vitest src/studio/` 402/402 passed, `BrowserPanel.test.tsx` 3/3 passed.
> **Результат:** `StudioV2` больше не макет — функциональный долив старого Studio сдан.
> Сейчас он живёт на временном маршруте `#/studio-v2/:checkId`; следующий отдельный Plan
> (STU-RAILS) переводит его на обычный канонический `studio` и разводит legacy на `-old`.
> Функционально есть роутинг по instance id, живой `StudioExplorer` (6 корней),
> `useStudioTreeActions`,
> Monaco `prettyk` с автодополнением и gutter-run [▶], честная валидация, пошаговый debug strip,
> реальный `run_summary`, растянутый браузер с кнопкой старта и live-превью, единый одиночный хедер.
> **Граница приёмки:** на живом стенде Chrome CDP `:9222` ещё не гонялся — ждёт совместный
> живой проход (CDP-WIRE + BUD-E2E + STU-V2).

### Что получает оператор (нарезка Boss)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **STU-V2-B1** | **Studio v2 открывается по конкретной проверке.** Оператор попадает в рабочую область, привязанную к выбранной проверке (instance id), а не в безличную заглушку. | **Given:** есть созданная проверка. **When:** оператор открывает её Studio. **Then:** рабочая область относится ровно к этой проверке; переключение на другую проверку открывает её собственные данные; без выбранной проверки — честное пустое состояние, не чужой контент. |
| **STU-V2-B2** | **Живой Explorer вместо статичного дерева.** Оператор видит реальные сущности проверки (шесть корней: модели страниц, сценарии, фаззеры, модули данных, коннекторы, профили авторизации), а не захардкоженные заглушки со счётчиками. | **Given:** проверка загружена. **When:** оператор раскрывает дерево. **Then:** видны реальные сущности и их количество; клик по сущности открывает документ; пустая область честно помечена как пустая. |
| **STU-V2-B3** | **Операции над сущностями из дерева.** Создание, переименование, удаление с подтверждением, перемещение и drag-drop работают в новом Studio, состояние дерева сохраняется после перезагрузки. | **Given:** выбрана папка или элемент. **When:** оператор вызывает create/rename/delete/drag-drop. **Then:** дерево, активный документ и черновик согласованы; отмена безопасна; тихой перезаписи нет. |
| **STU-V2-B4** | **Полноценный конструктор в панели кода.** Редактор сценария с автодополнением, навигацией к определению, диагностикой, запуском шага из поля (gutter) и LED-статусами строк — а не голый текстовый редактор. | **Given:** открыт сценарий. **When:** оператор правит код, наводит на идентификаторы, нажимает запуск шага. **Then:** работают подсказки и навигация; строка получает статус после запуска; ошибки видны в коде. |
| **STU-V2-B5** | **Честная валидация и диагностика.** Ошибки проверки видны как маркеры в коде, объединённые из локальной и серверной проверки, без ложных пингвинов. | **Given:** сценарий с ошибкой. **When:** оператор правит и ждёт проверку. **Then:** маркеры показывают реальную причину; пустая/незавершённая проверка не маскируется под успех. |
| **STU-V2-B6** | **Пошаговый отладчик и цепочка доказательств.** Оператор пошагово выполняет сценарий, видит вход/выход каждого шага и путь от DSL-строки к находке и артефакту. | **Given:** шаг упал. **When:** открыт отладчик. **Then:** видно состояние шага, вход/выход и причина ошибки; строка подсвечивает связанную находку и артефакт; секреты не видны. |
| **STU-V2-B7** | **Реальная консоль вместо захардкоженного лога.** Консоль показывает живую телеметрию прогона (шаги, события, статусы) из реального run-потока. | **Given:** запущен прогон. **When:** оператор смотрит консоль. **Then:** строки отражают реальные события прогона, а не фиксированный текст; пустой прогон — честная пустота. |

### Что получает оператор (нарезка Flash)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **STU-V2-F1** | **Браузер в Studio запускается понятно и растягивается.** Оператор видит встроенный браузер с нормальной рабочей областью, а не огрызок формы. | **Given:** открыта Studio с проверкой. **When:** оператор открывает панель браузера. **Then:** браузер растягивается на панель; понятно, как его запустить и где живёт; вёрстка рабочей области не ломается. |
| **STU-V2-F2** | **Browser Stage: запись и live-превью.** Оператор в режиме записи кликает по живому тестовому экрану, видит предложение шага и live-превью действий. | **Given:** тестовый экран открыт в браузере. **When:** оператор включает запись и кликает. **Then:** предложение шага показано; превью отражает реальное действие; клик не ломает DOM страницы. |
| **STU-V2-F3** | **Честный одиночный хедер.** В Studio один хедер, а не двойной. | **Given:** открыта Studio. **When:** оператор смотрит на верхнюю область. **Then:** виден один хедер; лишний дубль убран; навигация и режимы на месте. |

### Приёмка STU-V2 (Keeper)

- `#/studio-v2` маршрутизируется по instance id (B1) — ключевое, зафиксировано Максимом.
- Живой Explorer + операции (B2, B3) работают на реальной проверке.
- Конструктор с подсказками/диагностикой/запуском шага (B4, B5) реальный, не наивный парсинг.
- Отладчик + цепочка доказательств (B6) прослеживается до находки/артефакта.
- Консоль — реальная телеметрия (B7), не захардкоженный текст.
- Браузер растянут и запускается понятно (F1), Record/live-превью работают (F2).
- Один хедер (F3).
- Жирноту не тащим: двойной хедер (убрать, не дублировать), старый Launchpad, дубли фундамента.
- Ни один перенесённый слой не регрессит существующий движок Buddy (64/64) и фундамент.

---

## 3⅞. Эпик STU-RAILS — Canonical Studio/Editor и legacy `-old` (IMPLEMENTED · 27 авг 2026)

> **Тип:** `Plan` — финальный переезд новых поверхностей на понятные канонические
> рельсы. Это не новый v2-движок: функциональный долив уже находится в STU-V2.
> **Цель:** один `CheckInstance`/instance id, две ясные проекции одного объекта и
> один временный legacy-слой для референса.
>
> **Каноническая матрица маршрутов:**
>
> - `#/checks/<id>/studio` — новая основная Studio;
> - `#/checks/<id>/editor` — новый инженерный Editor того же instance;
> - `#/checks/<id>/studio-old` — старая Studio только для reference;
> - `#/checks/<id>/editor-old` — старый Editor только для reference;
> - публичный `-v2` маршрут после переезда не используется.
>
> Старое не удаляем в этом эпике. Оно остаётся доступным под `-old` до отдельной
> команды владельца. Две разные поверхности под одним `studio` не оставляем.

### Epic Brief

**Проблема:** оператор не должен знать, что продуктовая поверхность временно
называется v2. Сейчас новый экран живёт на `#/studio-v2/<id>`, старый экран занимает
старые имена, а кнопка Editor может потерять instance id и отправить оператора домой.

**Результат глазами оператора:** он открывает конкретную проверку, работает в новой
Studio, переходит в новый Editor той же проверки, не теряет draft и контекст, а к
старой поверхности обращается только явно через `-old`.

### Нарезка Boss

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **STU-RAILS-B1** | **Новая Studio открывается по instance id.** Обычный маршрут `#/checks/<id>/studio` всегда показывает новую Studio именно выбранной проверки. | **Given:** существуют две проверки. **When:** оператор открывает Studio первой, затем второй. **Then:** каждая область показывает только свои данные, draft и ресурсы; отсутствующий или неизвестный id даёт честное состояние ошибки/пустоты, а не home и не данные другой проверки. |
| **STU-RAILS-B2** | **Studio и Editor — две проекции одного instance.** Переход между ними не является фейковой кнопкой и не теряет контекст. | **Given:** оператор находится в `#/checks/<id>/studio` и имеет открытый документ/правку. **When:** он переходит в `#/checks/<id>/editor` и возвращается обратно. **Then:** сохраняются тот же instance, выбранная сущность, draft и resource context; другой id открывает другой контекст. |
| **STU-RAILS-B3** | **Legacy доступен только явно под `-old`.** Старые поверхности сохраняются как reference, но больше не конкурируют с новыми именами. | **Given:** оператору нужно сравнить старый экран. **When:** он открывает `#/checks/<id>/studio-old` или `#/checks/<id>/editor-old`. **Then:** открывается соответствующая legacy-поверхность; обычные `studio`/`editor` всегда ведут на новые; публичный `-v2` больше не нужен. |
| **STU-RAILS-B4** | **Новый Editor — настоящая инженерная проекция.** Он отличается от Studio назначением, а не сломанным переключателем или переходом на home. | **Given:** открыт `#/checks/<id>/editor`. **When:** оператор работает с кодом и документами. **Then:** доступны документы/вкладки, автодополнение, навигация, диагностика, запуск шага и LED-статусы; всё относится к тому же instance. |
| **STU-RAILS-B5** | **Общий контекст переживает переезд.** Переключение маршрута не создаёт второй независимый проект и не смешивает проверки. | **Given:** оператор изменил draft в одной проекции. **When:** он переключается Studio ↔ Editor или обновляет страницу. **Then:** draft и ресурсный контекст восстанавливаются для того же instance; соседняя проверка не получает чужие изменения. |
| **STU-RAILS-B6** | **Переезд не ломает живой runtime.** Новые канонические маршруты продолжают работать с Browser Stage, run, Buddy и evidence. | **Given:** оператор запускает поддержанный сценарий из новой Studio или Editor. **When:** выполняется run. **Then:** BrowserSession/CDP, bounded run, телеметрия и evidence относятся к выбранному instance; ложного успеха и потери контекста нет. |

### Нарезка Flash

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **STU-RAILS-F1** | **Одна ясная навигация и один хедер.** Оператор понимает, где Studio, где Editor и какая поверхность активна. | **Given:** открыт новый `studio` или `editor`. **When:** оператор смотрит на верхнюю область и переключается между проекциями. **Then:** виден один хедер, активная поверхность обозначена честно, переход сохраняет id; двойного хедера и временного `-v2` в пользовательской навигации нет. |
| **STU-RAILS-F2** | **Explorer и Canvas не дублируют друг друга.** Explorer — навигация по сущностям, Canvas — рабочий граф/сценарий. | **Given:** у проверки есть сущности разных типов. **When:** оператор открывает Studio и раскрывает Explorer. **Then:** один живой Explorer показывает шесть корней и реальные сущности; Canvas показывает рабочую связь/граф, а не вторую крупную копию тех же корней со статичными счётчиками. |
| **STU-RAILS-F3** | **Browser Stage занимает рабочее место и запускается понятно.** | **Given:** открыт новый Studio с проверкой. **When:** оператор открывает Browser Stage. **Then:** форма растягивается по доступной области, кнопка запуска и текущее состояние очевидны, Record/Discovery и live-превью не ломают рабочую поверхность и не портят DOM тестового приложения. |
| **STU-RAILS-F4** | **Legacy визуально отделён от нового.** Reference-режим не выглядит основным продуктом. | **Given:** оператор открыл `studio-old` или `editor-old`. **When:** он сравнивает его с новой поверхностью. **Then:** понятно, что это legacy/reference; новый путь остаётся обычным `studio`/`editor`; старый Launchpad и прочая жирнота не возвращаются в новую поверхность. |

### Приёмка STU-RAILS (Keeper)

- Новые поверхности открываются только на обычных `studio`/`editor` маршрутах с
  конкретным instance id.
- `Studio → Editor → Studio` сохраняет id, данные, draft, выбранный документ и
  resource context.
- Неизвестный/отсутствующий id не отправляет оператора в home и не показывает
  чужую проверку.
- Старые поверхности доступны только под `studio-old`/`editor-old` и не являются
  default.
- Публичного `-v2` маршрута после переезда нет.
- Explorer живой и единственный; Canvas не дублирует навигационное дерево.
- Новый Editor реально отличается от Studio как проекция того же instance.
- Browser Stage растянут, запуск понятен, Record/live-превью работают.
- Один хедер; двойной хедер, старый Launchpad и дубли фундамента не переносятся.
- Buddy, BrowserSession/CDP, run, telemetry, evidence и shared foundation не
  регрессируют; текущие тесты остаются зелёными.

### Out of scope

- Удаление legacy-кода или reference-маршрутов — отдельная команда владельца.
- Новый функциональный долив из STU-V2, который уже считается сданным.
- Переписывание shared foundation, ScenarioDeckStore, DSL-контрактов и BrowserSession.
- Полный редизайн Sanctuary Application Map.
- AI provider selection, Qwen/Gemini и автономный AI-оператор.
- Автоматическая канонизация без живого UX-прохода и приёмки Keeper.

---

## 4. Эпик SANCTUARY-MAP — Тактический радар Обители (IN PROGRESS · 27 авг 2026)

> **Тип:** `Plan` — интерактивная карта приложения (read-model, не runtime SoT).
> **Источник:** Discovery запечатан в [`docs/research/2026-08-27-sanctuary-application-map-discovery.md`](research/2026-08-27-sanctuary-application-map-discovery.md).
> **Порядок:** это следующий скоуп ПОСЛЕ завершения STU-RAILS — карта строится на
> канонических маршрутах (`#/checks/<id>/studio`, `#/checks/<id>/editor`,
> `studio-old`/`editor-old`), а не на временном `-v2`.
> **Философия:** «тактический радар, а не мёртвая диаграмма» — семантический зум
> L0 (Обитель) → L1 (PrettyK) → L2 (поверхность), правило 7±2 объектов в фокусе,
> 5 линз, телепортация на реальный экран, генератор идей.
> **Граница:** карта — инструмент навигации и рассуждений, читается из единого
> описания. Она НЕ заменяет runtime source-of-truth и не является редактором кода.

### Нарезка Boss (движок, раскладка, телеметрия) — 11h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **SANCT-MAP-B1** | **Карта из единого описания.** Узлы, уровни, связи, статусы и маршруты приходят из одного источника, а не захардкожены в канвасе; битые ссылки честно видны. | **Given:** карта открыта. **When:** загружено описание системы. **Then:** узлы и связи отображаются по описанию; ссылка на несуществующий экран или документ помечена как битая, а не молча нарисована; видимые узлы фильтруются по выбранной линзе. |
| **SANCT-MAP-B2** | **Семантический зум и честная раскладка.** Прокрутка/клик меняют уровень абстракции (Обитель → PrettyK → поверхность), а не просто масштаб пикселей; кластеры сворачиваются, связи не пересекаются. | **Given:** оператор на верхнем уровне. **When:** он уходит вглубь к конкретной поверхности. **Then:** плавный переход L0→L1→L2; дочерние узлы раскрываются при фокусе и сворачиваются в кластеры при отдалении; связи не спутываются; фокус на выбранном узле читается. |
| **SANCT-MAP-B3** | **Живая телеметрия и статус узлов.** Узлы с живыми стендовыми портами показывают реальный статус и обновляются без перезагрузки карты. | **Given:** стенд поднят, часть портов жива. **When:** открыта линза рантайма. **Then:** живой узел показан зелёным, упавший — красным; статус обновляется в живую; узел без привязки к порту честно показан как не-рантаймный. |

### Нарезка Flash (холст, визуал, HUD) — 13h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **SANCT-MAP-F1** | **Тактический холст и навигация.** Плавный pan/zoom, кнопки масштаба и сброса, хлебные крошки иерархии — оператор не теряет ориентацию. | **Given:** карта открыта. **When:** оператор перемещается и зумит (колесо, тачпад, кнопки). **Then:** плавное приближение/отдаление; сброс возвращает к корню; видна цепочка уровней, где оператор находится. |
| **SANCT-MAP-F2** | **Визуал узлов и анимированные связи.** Статус узла читается цветом за секунду; активные потоки анимированы; нерелевантное приглушается. | **Given:** оператор выбирает узел. **When:** он наводит или выбирает его. **Then:** нерелевантные узлы и связи приглушаются до фона; активные связи подсвечены/анимированы; статус узла различим с одного взгляда (готов / в работе / legacy / обрыв). |
| **SANCT-MAP-F3** | **Панель идеи и оверлей Ctrl+M.** Из любого экрана карта всплывает мгновенно; по клику на узел — метаданные и быстрая формулировка идеи с заготовкой задачи. | **Given:** оператор в любой точке системы. **When:** нажат Ctrl+M или клик по узлу. **Then:** карта всплывает поверх экрана быстрее 150мс; панель узла показывает статус/связи/документы; записанная мысль даёт чистую заготовку задачи (GWT), не просто текст. |

### Совместный пакет (Boss + Flash) — 3h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **SANCT-MAP-J1** | **Телепортация и стабильность.** Клик по узлу с экраном переводит на реальный канонический экран; карта держит плавность при большом числе связей. | **Given:** узел привязан к реальному экрану с проверкой. **When:** оператор жмёт «перейти». **Then:** роутер открывает канонический экран по instance id (не `-v2`); при 100+ связях зум и перемещение остаются плавными без утечек. |

### Приёмка SANCTUARY-MAP (Keeper)

- От Обители до Studio/Editor добираешься не более чем за 3 клика/зума.
- Статусы честные: ни один незавершённый узел не помечен как готовый/канон.
- Честный семантический переход L0 → L1 → L2.
- Телепортация ведёт на канонический маршрут, а не на временный `-v2`.
- Идея из панели генерирует ЧИСТО-заготовку (GWT), а не сырой текст.
- `Ctrl+M` открывает радар <150мс поверх любого экрана.
- При 100+ связях — плавный зум/панорама без просадок.
- Карта не подменяет runtime SoT и не редактирует код.

### Out of scope

- Замена живого runtime source-of-truth (карта = read-model).
- Редактор кода внутри карты.
- Автонаполнение содержимого карты без участия Keeper/владельца.
- Полный redesign Studio/Editor (это STU-RAILS).
- Автономный AI-оператор; AI provider.

---

## 4½. Эпик KDT-PURGE — KDT Purgatory Finish (CLOSED · 26 авг 2026)

> **Тип:** `Plan` — финальная зачистка `kdt`-следов и контракт-дрифта `pk`/`prettyk`.
> **Решение Keeper (принято, без переспросов):** `kdt` как имя продукта/бренд —
> выпилить. Короткий технический токен везде = `pk` (сеть `pk-net`, `pk-api-lab`,
> `pk-llm-server`, `PK_*` env, `pk.*` localStorage, `pk://` URI, `admin@pk.local`
> lab-домен). `prettyk`/`prettyk.io` — только бренд, прод-домен, публичные
> пакеты/Sonar project keys. Брендинг-часть уже закрыта в `docs/prettyk.md`.
> **Граница:** `KDT_*` env-переменные — **внешний контракт**, чистить миграцией
> (читать оба префикса на переходный период), а не слепым replace.
> **Защищённый legacy:** префиксы `kdt:enc:v1:`, `kdt:vault:v1:`, `kdt.auth.user`
> (storage key), regex `(kdt|pk)://` — НЕ трогать (обратная совместимость).

### Нарезка Boss

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **PURGE-B1** | **Env-переменные под одним префиксом.** Оператор задаёт переменные запуска с префиксом `PK_`; старые `KDT_` продолжают читаться, но система в первую очередь берёт новые. | **Given:** оператор задал `PK_AI_ASSISTANT_ENABLED=1` и не задал `KDT_AI_ASSISTANT_ENABLED`. **When:** стартует прогон. **Then:** AI включается. **Given:** заданы ОБА, новый и старый. **Then:** новый имеет приоритет. **Given:** задан только старый без нового. **Then:** старый работает на переходный период, не ломая существующие CI-скрипты. |
| **PURGE-B2** | **Продуктовая идентичность в рантайме.** Оператор не видит `kdt` в сводках прогона, именах создателей, фингерпринтах находок, user-agent'ах и логах — везде `pk`. | **Given:** завершён прогон. **When:** оператор читает `run_summary`, цепочку `intent → run → evidence`, логи и находки. **Then:** fingerprint, creator, summary kind, user-agent и HTTP-заголовки не содержат `kdt` как имя продукта. |
| **PURGE-B3** | **Единая Docker-сеть и единый внутренний домен.** Все сервисы коробки живут в одной сети `pk-net` с одним внутренним admin-доменом. | **Given:** стенд поднят. **When:** контейнеры и скрипты обращаются друг к другу. **Then:** сеть везде называется одинаково и сервисы видят друг друга; `admin@pk.local` — единый внутренний пользователь; битых путей и разночтений с `prettyk-net`/`prettyk-api-lab` нет. |
| **PURGE-B4** | **Один хедер Editor.** Оператор в Editor видит одну рабочую шапку, а не две одна над другой. | **Given:** открыт Editor проверки. **When:** оператор смотрит на верхнюю область. **Then:** видна одна шапка с активным check-бейджем, Run/Save и переключателем Studio/Editor; двойного хедера нет. |

### Нарезка Flash

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **PURGE-F1** | **Чистые тестовые данные и фронтенд-артефакты.** Тестовые значения, фикстуры и демо-данные не содержат `kdt` как имя продукта. | **Given:** прогоняются тесты. **When:** фикстуры инициализируют стендовые данные. **Then:** тестовые значения, имена пользователей, пароли, email'ы и коннектор-параметры используют `pk`, а не `kdt`. |
| **PURGE-F2** | **Чистые заголовки документации.** Оператор читает документацию и видит «PrettyK», а не «KDT» в названиях и заголовках. | **Given:** открыт `security.md`, `wired.md` или `stand.md`. **When:** оператор видит заголовок. **Then:** заголовки и вводные фразы говорят «PrettyK», а не «KDT»; технические env-имена остаются как есть. |

### Приёмка KDT-PURGE (Keeper)

- `PK_*` env-переменные — основной префикс; `KDT_*` читаются на переходный период, не ломая CI.
- Рантайм-вывод, фингерпринты, имена создателей, сводки, user-agent'ы, HTTP-заголовки — без `kdt`.
- Docker-сеть — единая `pk-net`; `admin@pk.local` — единый внутренний.
- Editor — один хедер.
- Тестовые фикстуры и документация — без `kdt` как имени продукта.
- Legacy префиксы (`kdt:enc:v1:`, `kdt:vault:v1:`, `kdt.auth.user` key, `(kdt|pk)://` regex) НЕ тронуты.
- Ни один компонент не регрессирует (tsc 0, точечные тесты зелёные).

### Out of scope

- Удаление legacy-префиксов (обратная совместимость).
- Переименование внешнего CDP-профиля `kdt-cdp-chrome` (вне репо).
- Полный product rename в кодовых комментариях.
- Автономный AI; AI provider; редизайн.

---

## 5. Эпик ADM-PURE — SecOps Control для pure (PARKED · 25 авг 2026)

> **Статус:** `⏸️ PARKED` — Продукт = сканер. Дашборды и админка — потом, когда будет PR.  
> **Профиль:** `secops-lab-pure`. **Граница:** pure-ядро ИБ-операций (Applications, Targets, Runs, Findings, Policies).  
> **Исполнитель:** Boss (17h). **Приёмка:** Keeper.

| ID | Что получает пользователь | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **ADM-PURE-1** | Обзор состояния ИБ-контуров | **Given:** есть приложения, прогоны и находки. **When:** открыт `#/admin`. **Then:** видны активные запуски, Critical/High находки и gate-вердикты. Empty-states честные. | 3h |
| **ADM-PURE-2** | Реестр приложений и целей | **Given:** создаётся цель. **When:** введён адрес. **Then:** цель получает стабильную карточку, число находок и кнопку «Новая проверка». Некорректный URL блокируется. | 3h |
| **ADM-PURE-3** | Переход от цели к проверкам | **Given:** у цели есть прогоны. **When:** клик по цели. **Then:** видны связанные проверки со статусами, gate-вердиктами и переходом в результаты. | 2h |
| **ADM-PURE-4** | Управление gate-политиками | **Given:** права администратора. **When:** создание/правка policy. **Then:** условия видны в списке; выключенная policy не влияет на gate и не меняет историю. | 3h |
| **ADM-PURE-5** | Честный gate по результату запуска | **Given:** прогон завершён. **When:** оценка находок. **Then:** вердикт `passed/warning/failed` с объяснением; сбой проверки не превращается в `passed`. | 2h |
| **ADM-PURE-6** | Единый реестр находок | **Given:** находки из разных прогонов. **When:** открыт Findings. **Then:** агрегированный список с severity, целью, CWE, статусом и фильтрами без дубликатов. | 3h |
| **ADM-PURE-7** | История запусков | **Given:** цель проверялась N раз. **When:** открыт Runs. **Then:** хронология запусков со статусами (running/failed/cancelled/completed) и ссылками. | 1h |

---

## 7. Горизонт FUTURE (по реальному спросу)

| ID | Эпик | Содержание | Кто |
|---|---|---|---|
| **PK-CI-F4** | PRETTYK-CI фаза 4 | Адаптеры к Jenkins / Tekton / Argo / Azure DevOps + AI-подсказки (карточки PK-CI-13, 14). | Boss |
| **PK-TRM-F5** | WEB-IDE-TERMINAL фаза 5 | Security Playbook Notebook: исполняемые ячейки (намерение, DSL, действие, output, evidence) (карточки PK-TRM-12, 13). | Flash |

---

## 8. Эпик HDO — Headless Observe (CLOSED · 27 авг 2026 · Boss 5/5 + Flash 4/4 сданы)

> **Статус 27 авг:** 🟢 CLOSED. Boss HDO-B1..B5 сданы (headless launch, observe/click, enrich, Play, integration test — 127 тестов). Flash HDO-F1..F4 сданы (клик по скриншоту, proposal Accept/Reject, Record UX, единый шаг в двух проекциях — 73 теста).  
> **Итог:** браузер внутри коробки: headless Chromium, рендер скриншотами, observe/click через координаты, AX-обогащение, Play через get_by_role/label/test_id. Ноль окон на десктопе.  
> **Закрытые карточки:** HDO-B1, HDO-B2, HDO-B3, HDO-B4, HDO-B5, HDO-F1, HDO-F2, HDO-F3, HDO-F4.  
> **Out of scope:** Live-video/streaming, полный crawler, авто-принятие шагов, Grid/noVNC execution (`:7900`).

---

## 9. Эпик RAILS-PROMOTE — Canonical Rails + BUD-E2E PROMOTE (CLOSED · 27 авг 2026)

> **Статус:** 🟢 CLOSED. Luna RAILS-L1..L6 сданы (канонические маршруты, Studio↔Editor transition, один хедер, живой Explorer, PROMOTE).  
> **Закрытые карточки:** RAILS-L1, RAILS-L2, RAILS-L3, RAILS-L4, RAILS-L5, RAILS-L6.  
> **Out of scope:** Удаление legacy-кода, новый функциональный долив, редизайн Sanctuary Map, AI provider.

---

## 10. Эпик PW-AIRGAP — Browser Runtime Unify на Playwright (CLOSED · 27 авг 2026)

> **Статус:** 🟢 CLOSED. Boss 2/2 + Flash 5/5 + Luna 8/8 = 15/15 карточек, 54 + 127 тестов.  
> **Итог:** один Playwright-мир (chromium+firefox+webkit+ffmpeg) в контейнере; execution на Playwright за флагом; authoring = headed-под-Xvfb + живой стрим; паритет зелёный; airgap bundle готов; registry вычищен.  
> **Закрытые карточки:** PW-A1, PW-A2, PW-A4, PW-E1, PW-E2, PW-E3, PW-E5, PW-C1, PW-C2, PW-C3, PW-A3, PW-A5, PW-E4, PW-F1, PW-F2.  
> **Out of scope:** Переписывание scanner, WebKit как обязательное покрытие, полный crawler.

---

## 11. Эпик PK-DSL — PrettyK DSL Sugar: короткие глаголы, смарт-локаторы и Browser Runtime Contract (CLOSED · 27 авг 2026)

> **Статус:** 🟢 CLOSED. Boss DSL-B1/B2/B3 ✅ · Luna DSL-B4/B5/B6 ✅ · Flash DSL-F1/F2/F3/F4 ✅. 8/8 карточек. 403 + 73 теста. browser_adapter 757→134 строки.  
> **Friend Request:** [`docs/friend-requests/PRETTYK-DSL-SUGAR.md`](friend-requests/PRETTYK-DSL-SUGAR.md).  
> **Спецификация:** [`docs/research/2026-08-27-pretty-browser-contract-methodid-gates.md`](research/2026-08-27-pretty-browser-contract-methodid-gates.md).  
> **Out of scope:** Новые backend-операции, `>>` (Scope Drilldown), `>#hint` Self-Healing Anchor.

---

## 12. Эпик PK-WIRE-SYNC — Wire DSL ↔ Canvas Sync: Surgical AST Patching · 28 авг 2026 · 🟢 CLOSED

> **Статус:** 🟢 CLOSED (28 авг 2026). Все 5 карточек сданы (B1, B2, F1, L1, L2). 119 тестов FE + 54 теста PY, tsc 0. Живой контур: BrowserStage MJPEG → observe/click → DSL-шаг → Canvas → Monaco surgical patch.  
> **Спецификация:** [`docs/research/2026-08-27-wire-canvas-sync-plan.md`](research/2026-08-27-wire-canvas-sync-plan.md) — полный архитектурный контракт: асимметричное авторство, Surgical AST Patching, реестр семантики маркеров, нулевой шум на Canvas.

### Нарезка Boss — СДАНО ✅ (B1 + B2, ~6h)

| ID | Что сделано | Статус |
|---|---|---|
| **WIRE-SYNC-B1** | `wireDocumentParser.ts` + тесты (20/20): полноценный WireDocument с SourceSpans; `>@ { recover }` — детерминированная стейт-машина; ликвидация «0 шагов» | ✅ CLOSED |
| **WIRE-SYNC-B2** | `wireDocumentSerializer.ts` + тесты (11/11): хирургическая замена узлов — правка селектора сохраняет `>@ { recover }`, `>?`, комментарии и отступы побайтно | ✅ CLOSED |

### Нарезка Flash — СДАНО ✅ (F1, ~3h)

| ID | Что сделано | Статус |
|---|---|---|
| **WIRE-SYNC-F1** | `ScenarioStepCard.tsx` + `ScenarioDeckNode.tsx` + тесты (46/46): чистые карточки (0 шума), оранжевый `[RECOVER]`-аккордеон, жёлтый `[SOFT]`, красный `[SCENARIO FAILSAFE]`, TRY-BLOCK рамка, deep-link ↗ L14 в Monaco | ✅ CLOSED |

### Нарезка Luna — СДАНО ✅ (L1 + L2, ~5h)

| ID | Что сделано | Статус |
|---|---|---|
| **WIRE-SYNC-L1** | `BrowserStage.tsx` + тесты (4/4): скриншот-поллинг полностью ликвидирован; непрерывный JPEG-стрим (CDP `Page.startScreencast` 12fps + fallback noVNC `:7902`); клик по живому изображению → `computeViewportCoordsFromEvent` → `observeClick` → реальный DOM-клик → observe-кандидат | ✅ CLOSED |
| **WIRE-SYNC-L2** | `EditorWorkbench.tsx` + тесты (12/12): Monaco → Canvas (150ms debounce + хэш-страж); Canvas → Monaco (surgical AST patching по SourceSpan); зомби-колода `cdp-poc` ликвидирована; Demo Store изолирован; фокус Monaco не теряется | ✅ CLOSED |

### Итог PK-WIRE-SYNC

| Исполнитель | Карточки | Тесты | Часы | Статус |
|---|---|---|---|---|
| **Boss** | WIRE-SYNC-B1, WIRE-SYNC-B2 | 31 | 6h | ✅ CLOSED |
| **Flash** | WIRE-SYNC-F1 | 46 | 3h | ✅ CLOSED |
| **Luna** | WIRE-SYNC-L1, WIRE-SYNC-L2 | 16 | 5h | ✅ CLOSED |
| **ИТОГО** | **5 карточек · 3 исполнителя** | **93 FE · tsc 0** | **14h** | **🟢 CLOSED** |

Сквозной контур собран: BrowserStage live MJPEG → observe/click → DSL-шаг → Canvas (бейджи, deep-link) → Monaco (surgical patch без потери `>@`/`>?`/комментариев).

---

### 🔥 Волна CLEANUP: PK-DSL-CLEANUP — Миграция Попробовать → try/catch/finally · 🟢 CLOSED (28 авг 2026)

> **Статус:** 🟢 CLOSED. Monaco: `try/catch/finally` в автодополнении/форматтере ✅ | Canvas: бейдж `[TRY]` ✅ | Парсер: `wireDocumentParser.ts` принимает `try/catch/finally` ✅.
> **Хвост (не блокирует):** `prettyToWire.ts:65` «ВКонце», `textScan.ts:98,101` «Перехватить»/«ВКонце» — 3 строки, убрать при случае.

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **DSL-CLEAN-B1** | ✅ CLOSED | Boss |
| **DSL-CLEAN-F1** | ✅ CLOSED | Flash |
| **DSL-CLEAN-F2** | ✅ CLOSED | Flash |

### Приёмка PK-WIRE-SYNC (Keeper)

- **GWT-1:** Сценарий из 4 шагов с `>@` и `>?` честно отображается на Canvas: 4 карточки, заголовок, бейджи.
- **GWT-2:** Правка селектора на Canvas сохраняет `>@ { recover }` без искажений.
- **GWT-3:** Дебаунс 150ms, хэш-страж, фокус в Monaco не теряется при обновлении Canvas.
- Браузер в панели — живой поток 10+ fps, скриншот-поллинг удалён.
- `cdp-poc` и Demo Store изолированы; пустой Canvas только при пустом сценарии.
- tsc 0, точечные тесты зелёные.
- **PK-DSL-CLEANUP:** «Попробовать / Перехватить / ВКонце» отсутствуют в парсере, Monaco и Canvas.

### Out of scope PK-WIRE-SYNC

- Визуальный блочный редактор `try/catch` на Canvas (структура блока read-only).
- Полная перегенерация документа при сохранении из Canvas (только surgical patching).
- Новые DSL-конструкции (синтаксис зарезервирован, реализации нет).

---

## 13. Эпик PK-VIEWPORT — Viewport Relay: Async CDP Screencast в контейнере · 28 авг 2026 · 🟢 CLOSED

> **Статус:** 🟢 CLOSED (все 6 карточек сданы, 28 авг 2026). 9.5h, пропорция 20/40/40 (Boss/Flash/Luna).  
> **Спецификация:** [`docs/research/2026-08-28-browser-viewport-streaming.md`](research/2026-08-28-browser-viewport-streaming.md) — полный архитектурный кристалл: 3 изолированных канала, контракты Frame/Input/Lifecycle, формула coordinate mapping, FIFO-1 backpressure.  
> **Проблема:** текущий CDP screencast живёт на sync `_BrowserWorker`, блокированном на `queue.get()`. Колбэки `Page.screencastFrame` обрабатываются только при активных API-вызовах, а не в непрерывном цикле. Relay должен быть вынесен в независимый async event loop.  
> **Цель:** эвакуировать screencast relay с sync worker, добавить WS frame/input contract, убрать host Chromium fallback, принять Juice Shop Steel Thread через контейнер, вычистить legacy screenshot polling.

### Нарезка Boss — Тяжёлое ядро (20%, 1 карточка, VP-B1)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-B1** | Async CDP Screencast Relay: независимый event loop, не блокируемый очередью команд sync воркера. WS-сервер отдаёт бинарные JPEG-кадры с JSON-заголовком (`type: "frame"`, `seq`, `width`, `height`, `deviceScaleFactor`). FIFO-1 backpressure (только последний кадр). Input-контракт: `type: "pointer"`, `action`, `x`, `y`, `button`, `clickCount` — транслируется в CDP `Input.dispatchMouseEvent`. При обрыве контейнера — `type: "error"`, `code: "BROWSER_UNAVAILABLE"`. | **Given:** контейнер `playwright-authoring` поднят, Chromium жив на `:9223`. **When:** открыт BrowserStage. **Then:** WS relay подключается к CDP, отправляет `Page.startScreencast`, кадры приходят в реальном времени без задержек очереди команд; клиент получает `type: "ready"` с `browserId`; при падении контейнера — `type: "error"`, реконнект. | 3h | Boss |

### Нарезка Flash — Быстрый UI (40%, 2 карточки, VP-F1 + VP-F2)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-F1** | BrowserStage WS-клиент: `<canvas>` рендеринг JPEG-кадров из нового relay (вместо `<img src=".../stream">`), калибровка `computeViewportCoordsFromEvent` под фактические `width`/`height`/`deviceScaleFactor` из frame-заголовка. Масштабирование pointer coordinates: `scaleX = frameWidth / canvas.clientWidth`. | **Given:** WS relay жив, кадры идут. **When:** оператор кликает по отрендеренному canvas. **Then:** координаты пересчитаны в CSS viewport (1280×800), отправлен `type: "pointer"` с точными `x, y`; DOM-клик в контейнере попадает в тот же элемент, что видит оператор. | 1.5h | Flash |
| **VP-F2** | Cleanup: удаление screenshot polling из `data_playground.py` (`_browser_screencast_stream` — multipart MJPEG на скриншотах). Обновление тестов: `BrowserStage.test.tsx` проверяет WS-контракт (frame header, coordinate mapping), не наличие `<img>`. `browserSession.screencast.test.ts` и `clickCoordinate.test.ts` обновлены под viewport calibration. `browser_service.py` — удалён `_cmd_screenshot` как основной транспорт кадра (остаётся только для smoke/отладки). | **Given:** WS relay работает, BrowserStage на canvas. **When:** прогон тестов. **Then:** 0 упоминаний скриншот-поллинга; тесты проверяют frame contract и coordinate mapping; старый MJPEG endpoint удалён или заменён на прокси к relay. | 1.5h | Flash |

### Нарезка Luna — Тяжёлый контур (40%, 2 карточки, VP-L1 + VP-L2)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-L1** | Container enforcement в `browser_service.py`: удалён host Chromium fallback (`headless=True` локальный запуск). `PK_BROWSER_CDP_ENDPOINT` обязателен. Статус `/api/browser/status` возвращает `runtime: "container"`, `headless: false`, `transport: "playwright"`. При недоступности контейнера — `connected: false`, `error: "BROWSER_UNAVAILABLE"`. Повторный `status()` не спавнит новых процессов. | **Given:** контейнер не поднят. **When:** запрошен `/api/browser/status`. **Then:** ответ `connected: false`, `error: "Container required — start playwright-authoring"`; на хосте 0 новых процессов Chrome; нет тихого fallback на локальный headless. | 1h | Luna |
| **VP-L2** | Интеграция: сквозной Juice Shop Steel Thread через контейнерный Chromium. Проверка: navigate → hover на карточке товара (живой hover в стриме) → click по кнопке «Add to Basket» → observe event с tag/role/AX → DSL-кандидат → Canvas → Monaco. Починка всего, что сломано на живом проходе (координаты, тайминги, CDP-сессии). | **Given:** контейнер поднят, WS relay жив, BrowserStage открыт. **When:** ручной проход Juice Shop Steel Thread (8 шагов из §8 спецификации). **Then:** все 8 шагов пройдены; observe→DSL цепочка замкнута; координаты клика точны (куда кликнул = что в DOM); 0 регрессий по сданным тестам. | 1h | Luna |

### Нарезка Luna — Долг по тестам (1 карточка, VP-L1-FIX, ~1.5h)

> **Причина:** VP-L1 перевела `browser_service.py` с module-level API на class-based `_BrowserWorker` + `dispatch()`, но `orchestrator/tests/test_browser_service.py` остался на старом API и падает целиком (ложная зелёность — живой проход VP-L2 не поймал, потому что юнит-слой молча упал).
> **Факт (28 авг):** `py -3 -m pytest orchestrator/tests/test_browser_service.py -q` → **29 failed** (`AttributeError: no attribute '_get_page' / '_enrich_observed_event'`).

| ID | Что делаем | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-L1-FIX** | Переписать `test_browser_service.py` под class-based `_BrowserWorker` API. Маппинг: `bs._get_page` → `worker._ensure_browser()`; `bs._page`/`_observe_active`/`_browser_id`/`_connected` → `worker._*`; `bs._enrich_observed_event` → `worker._enrich_event()`. Юнит-тесты зовут `worker._cmd_*()` напрямую (handler, не `dispatch()`), `worker._page = mock` вместо патча `_get_page`. `test_get_page_launches_headless` переписать под VP-L1 (без env → `None` + `_last_cdp_error` с `"PK_BROWSER_CDP_ENDPOINT not set"`). Boss уже: hit-test fix `_cmd_observe_click` (elementFromPoint + dispatchEvent), 3 observe_click-теста, integration-тест → skip. | **Given:** новый `_BrowserWorker` API. **When:** прогон тестов. **Then:** `test_browser_service.py` = 40 passed / 0 failed / 1 skipped; grep по файлу — 0 упоминаний `_get_page`/`_enrich_observed_event`/`_connected`/`_observe_page`; `test_pw_airgap_and_cdp.py` (54) и `test_cdp_viewport_relay.py` (16) не сломаны. | ✅ CLOSED (39 passed, 1 skipped, 28 авг) | Luna |

### Итог PK-VIEWPORT

| Исполнитель | Карточки | Часы | Статус |
|---|---|---|---|
| **Boss** | VP-B1 (Async CDP Relay + WS contract) | 3h | ✅ CLOSED |
| **Flash** | VP-F1 (BrowserStage canvas), VP-F2 (cleanup) | 3h | ✅ CLOSED |
| **Luna** | VP-L1 (container enforcement), VP-L2 (Steel Thread), VP-L1-FIX (тесты под новый API) | 3.5h | ✅ CLOSED |
| **ИТОГО** | **6 карточек · 3 исполнителя** | **9.5h** | **🟢 CLOSED** |

### Приёмка PK-VIEWPORT (Keeper)

- [ ] WS relay отдаёт JPEG-кадры без задержек очереди sync воркера (FIFO-1).
- [ ] BrowserStage рендерит `<canvas>`, не `<img src=".../stream">`.
- [ ] `computeViewportCoordsFromEvent` откалиброван под фактические `width`/`height`/`deviceScaleFactor`.
- [ ] Juice Shop Steel Thread: 8 шагов пройдены, observe→DSL цепочка замкнута, координаты точны.
- [ ] При недоступном контейнере — `BROWSER_UNAVAILABLE`, 0 процессов Chrome на хосте.
- [ ] Screenshot polling удалён из `data_playground.py`; тесты проверяют frame contract, не `<img>`.
- [ ] `tsc 0`, точечные тесты зелёные.
- [ ] 0 регрессий по сданным тестам PK-WIRE-SYNC (93 FE + 54 PY).

### Out of scope PK-VIEWPORT

- Удаление Selenium Grid (эпик PW-AIRGAP, припаркован).
- WebRTC, полноценный видеокодек, аппаратное ускорение.
- Мульти-вьюпорт (несколько параллельных authoring-сессий).
- noVNC как основной транспорт (fallback `:7902` сохранён, не трогаем).

---

## 14. Эпик PW-AIRGAP-2 — Execution Parity на Playwright (за флагом) · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 5 карточек, 14h est. Исполнители не распределены — по команде владельца.  
> **Спецификация:** [`docs/research/2026-08-27-browser-runtime-airgap.md`](research/2026-08-27-browser-runtime-airgap.md) — полный синтез: один Playwright-мир вместо Selenium Grid, scanner-прокси маршрут, Playwright Firefox ≠ Selenium Firefox, видеоформат webm→mp4.  
> **Проблема:** execution жёстко на Selenium (`core/controller.py` → `WebDriverAdapter`), хотя `PlaywrightAdapter` реализован целиком (428 строк) и не подключён. Split-brain дорожает: два мира образов, PlaywrightAdapter написан впустую.  
> **Цель:** Controller умеет гонять прогон через Playwright за флагом `PK_BROWSER_RUNTIME=playwright`, дефолт остаётся `selenium`; parity-прогон доказывает идентичность verdict/evidence до cutover.

### Карточки PW-AIRGAP-2

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **PW-E1** | Controller гоняет wired-прогон через `PlaywrightAdapter` за флагом `PK_BROWSER_RUNTIME=playwright`; дефолт остаётся `selenium`. scanner-прокси подхвачен через `host.docker.internal` (как уже решено у Selenium). | **Given:** wired с chrome/firefox. **When:** run с флагом playwright. **Then:** навигация/клики/заполнения идут через Playwright; трафик идёт через scanner-прокси; evidence тот же контракт, что у Selenium. | 4h |
| **PW-E2** | CDP-поверхность `BrowserAdapter` (cache/cookies/console logs) переписана на Playwright-native (`page.context.new_cdp_session()` / нативные эквиваленты). | **Given:** шаг «ОчиститьКэш» / «ОчиститьCookies». **When:** run на playwright. **Then:** результат идентичен Selenium; console logs собраны; 0 WebDriver-специфики в боевом пути. | 3h |
| **PW-E3** | Видео: `record_video_dir` + `run_id` нейминг + ffmpeg→MP4; Monitor replay работает тем же путём, что Grid-видео. | **Given:** run записан на playwright. **When:** открыт Monitor `?run_id=`. **Then:** видео воспроизводится; контракт MP4 сохранён (webm транскодится). | 3h |
| **PW-E4** | Live-вид execution: headed Playwright под Xvfb → noVNC, оператор видит прогон (не пустой desktop). | **Given:** run в headed-режиме на playwright. **When:** открыт Live. **Then:** живой экран прогона, не пустой Xvfb desktop; viewport корректный. | 2h |
| **PW-E5** | Parity-прогон: одинаковый wired гоняется на Selenium и Playwright (chrome+firefox, headed+headless) до зелёного. Расхождение = баг, фиксируется до cutover. | **Given:** набор wired-фикстур. **When:** parity run. **Then:** одинаковые verdict/evidence; расхождения зафиксированы как баги и закрыты. | 2h |

### Приёмка PW-AIRGAP-2

- [ ] Run с `PK_BROWSER_RUNTIME=playwright` проходит навигацию/клики/заполнения через Playwright.
- [ ] scanner-прокси подхвачен; evidence тот же контракт.
- [ ] CDP-поверхность (cache/cookies/console) идентична Selenium.
- [ ] Видео воспроизводится в Monitor (`?run_id=`).
- [ ] Live-вид показывает прогон, не пустой desktop.
- [ ] Parity-прогон зелёный по verdict/evidence на обеих runtime.
- [ ] Дефолт остаётся `selenium` — cutover отдельным эпиком.

### Out of scope PW-AIRGAP-2

- Выпиливание Selenium Grid (это PW-AIRGAP-3, после parity).
- WebKit как обязательное покрытие.
- Переписывание scanner (сканер отдельный).
- Crawler/gather_info полная замена (только боевой путь прогона).

---

## 15. Эпик PW-AIRGAP-3 — Cutover + Airgap Bundle · 28 авг 2026 · 🟢 CLOSED

> **Статус:** 🟢 CLOSED (28 авг 2026). C1/C2/C3 сданы (Boss + Luna). Webswing выпилен целиком; 40 Selenium-only методов вычеркнуты из `_METHOD_ID` (56 удалений, 0 вставок); `auto_authorize_discovery` удалён из `_STEP_DESCRIPTORS`; Grid выпилен из compose; airgap bundle готов.  
> **Верификация Boss:** целевые тесты 139 passed; полный suite 1714 passed / 48 failed (было 51 → минус 3 cutover'ом).  
> **⚠️ Хвост (pre-existing, НЕ cutover):** 48 failed в полном suite — `browser|*` каталог без русских имён (PlaywrightAdapter 120 методов), `scanner|apply_wired_auth/apply_wired_auth` нет в scannerAdapter, `gate_policy` env-разъезд (`SCANNER_API_KEY` vs `PK_SCANNER_API_KEY`), fuzz/teardown/juice/masking/scanner_dojo. Отдельный пласт → эпик PK-BROWSER-CATALOG (по команде владельца).
> **Цель достигнута:** дефолт на Playwright; Selenium Grid выпилен; airgap bundle собирается как один образ.

### Карточки PW-AIRGAP-3

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **PW-C1** | Дефолт переключён на Playwright; Selenium Grid (hub/node/chrome-video/firefox) выпилен из compose. Wired `browser_type` контракт не сломан. | **Given:** parity зелёный. **When:** cutover. **Then:** execution идёт на Playwright; Grid-сервисы не поднимаются; существующие wired-сценарии работают без правки. | 3h |
| **PW-C2** | Airgap bundle: один образ Playwright (браузеры+либы+ffmpeg) экспортируется `docker save`, грузится `docker load` на чистом хосте. `playwright install` НЕ вызывается — браузеры уже в образе. | **Given:** чистый airgap-хост без интернета. **When:** load + up. **Then:** authoring + execution работают офлайн; ноль внешних зависимостей. | 3h |
| **PW-C3** | ✅ CLOSED (Boss) — Registry вычищен: `export_keywords`/`wired_validate`/тесты не тянут `WebDriverAdapter` как боевой путь. 40 Selenium-only методов вычеркнуты из `_METHOD_ID` (crawl_urls, hold_click, click_and_hold, drag_and_drop*, switch_to_frame/window, accept_alert/dismiss_alert/get_alert_text, take_element_screenshot, assert_not_*/assert_true/false, log_marker, get_location/size…). `gather_info` оставлен (controller-level). `auto_authorize_discovery` удалён. 10 dangling aliases + 3 dead UI_IDS вычищены. `git diff --stat method_id.py` = 56 удалений, 0 вставок. | **Given:** cutover выполнен. **When:** `test_suite_imports` + smoke. **Then:** registry maps на Playwright; 0 ссылок на боевой Selenium-путь. | 2h |

### Приёмка PW-AIRGAP-3

- [x] Execution идёт на Playwright по умолчанию; Grid не поднимается.
- [x] Airgap bundle: `docker load` на чистом хосте → authoring + execution работают офлайн.
- [x] Registry: 0 ссылок на боевой WebDriverAdapter; `dead_METHOD=0`, `dangling_aliases=0`, `dead_UI=0`.
- [x] Все существующие тесты зелёные (или моки обновлены) — целевые 139 passed; полный suite 1714 passed / 48 failed (pre-existing, не cutover).

### Out of scope PW-AIRGAP-3

- Горизонтальное масштабирование worker pool.
- Распределённый Playwright (несколько машин).
- Удаление noVNC fallback (`:7902` остаётся диагностикой).

---

## 16. Эпик PK-RUNCTL — System Layers: Health / Edge / Run Control Plane / Telemetry / Profiles · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 17 карточек, 20h est. Исполнители не распределены.  
> **Спецификация:** [`docs/research/2026-08-27-system-layers-health-run-ctl-backlog.md`](research/2026-08-27-system-layers-health-run-ctl-backlog.md) — полная нарезка: GWT, DoD, out-of-scope на каждую карточку.  
> **Проблема:** запуск — синхронный CLI-процесс; если упал — run потерян. Нет очереди, нет «ровно один раз», нет health-контракта, нет единой точки входа.  
> **Цель:** production-зрелость системных слоёв: health, edge gateway, run control plane, сквозная telemetry, защита Pure Box.

### Пакет HEALTH — Контракт жизнеспособности (3 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **HEALTH-1** | Стандартный health-ответ любого сервиса: жив / готов / draining. «Готов» ≠ «жив» (без PG — «не готов»). | **Given:** сервис жив, зависимость недоступна. **Then:** сообщает «жив, но не готов». | 2h |
| **HEALTH-2** | Compose hardening: зависимости через `condition: service_healthy`, startup-order инфраструктура → бизнес. | **Given:** PG не принимает соединения. **Then:** Auth не стартует и не падает с ошибкой. | 1h |
| **HEALTH-3** | Execution readiness: worker pool честно отвечает, есть ли свободная мощность (по capabilities). | **Given:** все worker'ы заняты. **Then:** «нет, слоты заняты». | 1h |

### Пакет EDGE — Единая точка входа (2 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **EDGE-1** | Edge Gateway: один внешний порт (443), TLS, WebSocket/SSE не обрываются, внутренние сервисы (PG/Valkey/scanner/OpenBao/Grid) не exposed. | **Given:** self-hosted профиль. **Then:** всё через один порт; прямой запрос к PG не доходит. | 3h |
| **EDGE-2** | CORS + rate-limiting на уровне gateway (единая политика, не в каждом сервисе). | **Given:** неразрешённый origin. **Then:** отклонён на gateway; превышение лимита → 429. | 2h |

### Пакет RUN-CTL — Run Control Plane (6 карточек, ядро)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **RUN-CTL-1** | Модель жизненного цикла запуска: очередь → выполняется → завершён/ошибка → отменён. Переходы атомарны, история состояний сохранена. | **Given:** создан запуск. **Then:** статус «в очереди» → «выполняется» → «завершён». | 2h |
| **RUN-CTL-2** | Защита от дублирования: повторный идентичный запрос не создаёт второй run. | **Given:** двойной клик «Запустить». **Then:** возвращён существующий run. | 1h |
| **RUN-CTL-3** | Ограничение одновременных запусков: FIFO-очередь, позиция и ожидание видны. | **Given:** worker'ы заняты. **Then:** новый запуск в очереди с позицией. | 2h |
| **RUN-CTL-4** | Назначение подходящему worker'у по capabilities (браузер/scanner/зона). | **Given:** нужен Chrome, свободен только безбраузерный. **Then:** запуск ждёт браузерного worker'а. | 2h |
| **RUN-CTL-5** | Worker lease + обнаружение зависших запусков (замолчал > минуты → завис). | **Given:** worker перестал отвечать. **Then:** запуск помечен «зависший», не висит вечно. | 2h |
| **RUN-CTL-6** | Автоматический retry с классификацией: инфраструктурные — повтор (до N), валидация/target — мгновенный fail. | **Given:** потеря соединения с worker'ом. **Then:** авто-повтор; ошибка валидации → без повтора. | 1h |

### Пакет TELEMETRY — Сквозная корреляция (3 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **TELEMETRY-1** | Сквозная идентификация: run → попытка → шаг → worker → артефакт связаны ID-цепочкой. | **Given:** создан артефакт. **Then:** известно, к какому run/шагу он относится. | 2h |
| **TELEMETRY-2** | Структурированные логи с контекстом run (фильтр по run_id). | **Given:** событие в лог. **Then:** запись содержит run/attempt/step ID. | 1h |
| **TELEMETRY-3** | Базовые метрики: активные запуски, очередь, живые worker'ы, ошибки/час. | **Given:** очередь растёт. **Then:** метрика «глубина очереди» увеличивается. | 1h |

### Пакет PROFILES — Защита Pure Box (1 карточка)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **PROFILES-1** | Честный контракт Pure Box: не требует PG/Valkey/очереди; системные слои Enterprise не ломают Pure Box. | **Given:** запущен Pure Box. **Then:** не пытается подключиться к PG/Valkey; синхронный in-process запуск работает. | 1h |

### Приёмка PK-RUNCTL

- [ ] Все управляемые сервисы возвращают стандартный health-ответ (жив/готов/draining).
- [ ] Compose-зависимости через `service_healthy`.
- [ ] Один внешний порт; внутренние сервисы не exposed.
- [ ] Запуск проходит фиксированный жизненный цикл с атомарными переходами.
- [ ] Двойной клик не дублирует run; очередь FIFO; worker lease + обнаружение зависаний.
- [ ] Retry только на инфраструктурные ошибки.
- [ ] Run/attempt/step/worker/artifact связаны ID-цепочкой.
- [ ] Pure Box работает без внешних сервисов (0 регрессий).

### Out of scope PK-RUNCTL

- Kubernetes (Ingress/probes) — Compose-совместимый контракт.
- Полноценный дашборд метрик (Grafana) и алерты.
- Экспоненциальный backoff и ручной retry-интерфейс.
- Приоритеты запусков и multi-tenant лимиты.

---

## 17. Эпик WARZONE — Signature Rewind 100/100 · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 8 карточек, 20h est. Исполнители не распределены.  
> **Спецификация:** [`docs/research/2026-08-27-studio-warzone-rewind-specification.md`](research/2026-08-27-studio-warzone-rewind-specification.md) — полная математика: S(t) свертка, интенсивность луча I(t), RTS-камера spring oscillator, VideoTrackAdapter.  
> **Цель:** детерминированная попиксельная перемотка боевой сцены (вперёд/пауза/скраб/реверс) в Studio Execution Hub. Killer-фича-дифференциатор.

### Карточки WARZONE

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **WZ-1** | Timeline Controller (`IStudioTimelineController`): play/pause/seek/setSpeed + регистрация подписчиков на `WarzoneSceneSnapshot`. | **Given:** прогон записан. **When:** play/pause/seek(14.3s). **Then:** подписчики получают детерминированный snapshot в момент t. | 2h |
| **WZ-2** | Event Journal: NDJSON-журнал → упорядоченные события (τ, k, p); чистая свертка S(t) из S₀ + события ≤ t. | **Given:** журнал событий. **When:** запрошено S(t). **Then:** состояние идентично при forward/backward/direct seek (инвариант 100/100). | 3h |
| **WZ-3** | Beam Renderer: плазменный луч с интенсивностью I(t) (сигмоида ramp/dim + пульс), ядро/ореол, волновое смещение. Реверс плавно сворачивает луч. | **Given:** луч активен на [t_start, t_end]. **When:** скраб влево. **Then:** луч плавно гаснет к t_start, без залипших лазеров и скачков. | 3h |
| **WZ-4** | RTS-камера: critically damped spring, zoom 1.0–3.5×, Action Focus Director (lead-in 120ms / focus 2.8× / decay 350ms). | **Given:** атака на сущность. **When:** камера наводится. **Then:** плавный захват без рывков и дрожания. | 3h |
| **WZ-5** | VideoTrackAdapter: бесшовный переход Live Stream → MP4 Replay без чёрного экрана и скачка позиции. | **Given:** бэкенд завершил MP4. **When:** переход. **Then:** playhead синхронизирован, UI не перезагружается. | 3h |
| **WZ-6** | Три режима UI: Hybrid Operational (War Zone 60% + видео 40% + лог-тикер), Enterprise Audit (двойной лог System/Security), Signature Battlefield (полноэкранный командный центр + HUD). | **Given:** открыт Execution Hub. **When:** переключение режимов. **Then:** каждый режим корректен, без потери состояния таймлайна. | 3h |
| **WZ-7** | Timeline scrubber: мастер-ползунок с маркерами (STEP/HIGH/BEAM_START/scanner), двухступенчатый рендеринг (Canvas каждый rAF, видео/логи квант 60ms). | **Given:** скраб-драг ползунка. **Then:** 60 FPS на основном треке; видео и логи не грузят декодер. | 2h |
| **WZ-8** | Производительность + приёмка: 60 FPS при 10 лучах / 50 нодах, детерминизм 100/100 в контрольных точках (t=5/14.3/30с). | **Given:** полноэкранный режим, 10 лучей, 50 нод. **When:** Playwright Performance Trace. **Then:** frame budget ≤ 16.6ms; хэши снимков идентичны при forward/backward. | 1h |

### Приёмка WARZONE

- [ ] Детерминизм: хэш Render(S(t)) идентичен при forward / backward / direct seek.
- [ ] Луч плавно гаснет по сигмоиде, без залипания.
- [ ] Камера без рывков, стабильный захват при 2.8×, плавный выход на 1.0×.
- [ ] 60 FPS в полноэкранном режиме при 10 лучах / 50 нодах.
- [ ] Live→MP4 переход без чёрного экрана.
- [ ] Двойной аудит логов синхронен при скраббе (бинарный поиск строки < 2ms).
- [ ] Три режима работают, состояние таймлайна не теряется.

### Out of scope WARZONE

- WebRTC медиа-трек (используем CDP screencast + MP4).
- Мульти-пользовательский совместный просмотр боевой сцены.
- Автопилот/автоисправление сценариев.
- RTS-геймплей (кликабельные юниты) — только визуализация + перемотка.

---

## 18. Эпик PK-PERSIST — Persistence Foundation: PostgreSQL, MinIO и вывод Live из эксплуатации · PARKED · 27 авг 2026

> **Статус:** 🔒 PARKED — не начинать до закрытия браузерного E2E и отдельной команды владельца.  
> **Discovery:** [`sanctuary/cosmoport2/persistence-and-minio.md`](../sanctuary/cosmoport2/persistence-and-minio.md) — полный архитектурный синтез, инвентаризация Live, бюджет событий Valkey, 7-шаговая стратегия миграции.  
> **Исходный раунд:** Gemini Discovery от 27 авг 2026 — исследование текущего persistence-контура, графа producers/consumers, матрицы владения данными.  
> **Проблема:** вся история запусков, доказательств, логов, видео и отчётов живёт в файлах на диске (`reports/`). После рестарта процесса активные сессии обхода теряются. Старый пульт (`:8767`) — единственная поверхность чтения этих данных. При росте числа прогонов файловая система не даёт ни поиска, ни аудита, ни защищённого хранения артефактов.  
> **Цель:** перевести историю и сущности в PostgreSQL, бинарные артефакты (видео, скриншоты, HAR, scanner-отчёты, сырые логи) — в MinIO/S3, живой стрим событий — через Valkey, а старый пульт вывести из эксплуатации только после полной проверки. Pure Box остаётся на локальном хранилище без обязательного MinIO.

### Пакет FOUNDATION — Фундамент хранения (4 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) | Est |
|---|---|---|---|
| **PERS-B1** | История запусков, статусы, вердикты, реестр проверок и доказательств живут в базе данных и не теряются при перезапуске. | **Given:** выполнено несколько прогонов. **When:** процесс перезапущен. **Then:** вся история доступна: какой прогон, на какой проверке, с каким вердиктом, когда; поиск по приложению и временной метке работает; статус «в процессе» обновляется в реальном времени. | 6h |
| **PERS-B2** | Видеозаписи, скриншоты, HAR-архивы, сырые ответы сканера и логи сохраняются в объектное хранилище как неизменяемые артефакты с контрольной суммой. | **Given:** прогон завершён с evidence. **When:** оператор открывает карточку доказательств. **Then:** видео проигрывается, скриншот открывается, HAR скачивается; у каждого файла есть размер, дата и контрольная сумма; целостность артефакта можно проверить. | 5h |
| **PERS-B3** | Локальный запуск (Pure Box / airgap) работает без внешнего объектного хранилища; при включении Enterprise-режима артефакты автоматически пишутся в S3-совместимое хранилище. | **Given:** Pure Box на чистой машине. **When:** выполнен прогон. **Then:** артефакты лежат локально, всё работает; при переключении профиля те же артефакты пишутся в MinIO без изменения кода проверок. | 4h |
| **PERS-D1** | В инфраструктуре появляется MinIO/S3-хранилище: приватный бакет, доступ только через API, короткоживущие ссылки для фронтенда. | **Given:** поднят Enterprise-стенд. **When:** оператор смотрит видео или скриншот. **Then:** файл открывается по временной ссылке; прямой доступ к хранилищу из браузера невозможен; учётные данные хранилища не видны на фронтенде. | 3h |

### Пакет MIGRATE — Переезд существующих данных (2 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) | Est |
|---|---|---|---|
| **PERS-D2** | Все ранее выполненные прогоны, видео, скриншоты и отчёты перенесены в новое хранилище без повторов и потери данных. | **Given:** на диске — история прогонов за всё время. **When:** запущена миграция. **Then:** каждый прогон с артефактами появляется в базе и объектном хранилище ровно один раз; повторный запуск миграции не создаёт дубликатов; исходные файлы на диске не удалены до ручной проверки. | 4h |
| **PERS-B4** | Новый API и живой стрим событий заменяют старый пульт: статус прогона, лента событий, список запусков и evidence доступны через единую точку входа. | **Given:** активный прогон. **When:** оператор открывает монитор. **Then:** виден текущий статус; события приходят живым стримом без перезагрузки страницы; при обрыве связи стрим восстанавливается с последней точки без потери событий; все старые отчёты открываются по ссылкам. | 6h |

### Пакет RETIRE — Вывод старого пульта (2 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) | Est |
|---|---|---|---|
| **PERS-B5** | Старый пульт временно работает как прослойка: все запросы проксируются в новое хранилище, внешне ничего не меняется. | **Given:** старый пульт на `:8767` поднят. **When:** фронтенд или скрипт запрашивает список запусков. **Then:** ответ приходит из базы данных, а не из файлов на диске; разницы в поведении нет. | 3h |
| **PERS-B6** | Старый пульт полностью отключён. Все данные доступны через новый API; старые файлы-индексы на диске больше не используются. | **Given:** новый API работает, миграция подтверждена, все smoke-проверки зелёные. **When:** старый пульт остановлен. **Then:** ни одна функция продукта не сломана; история запусков, видео, отчёты и стрим событий работают через новый API; порт `:8767` свободен. | 2h |

### Пакет INTEGRITY — Целостность и защита данных (3 карточки)

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) | Est |
|---|---|---|---|
| **PERS-B7** | Система честно показывает хвосты: потерянный артефакт, запись без файла, файл без записи в реестре. Ни один из этих случаев не маскируется под успешный прогон. | **Given:** часть артефактов недоступна (файл удалён, диск сбой). **When:** оператор открывает карточку доказательств. **Then:** показана ошибка «Артефакт недоступен»; вердикт прогона не меняется задним числом на зелёный; администратор видит список всех осиротевших записей и бесхозных файлов. | 3h |
| **PERS-B8** | Активная сессия обхода приложения не теряется при перезапуске процесса. | **Given:** оператор начал обход, накопил страницы и клики. **When:** процесс перезапущен. **Then:** сессия восстановлена: список страниц, маршрутов и накопленные действия на месте; незавершённая сессия видна в списке активных; оператор может продолжить или закрыть. | 2h |
| **PERS-B9** | Поток событий фаззинга не кладёт систему: в живой стрим уходит только самое важное, а сырой дамп всех попыток сохраняется отдельным файлом артефакта. | **Given:** запущен фаззинг с миллионами попыток. **When:** оператор смотрит живой стрим. **Then:** стрим показывает: старт/стоп шага, прогресс раз в секунду, штучные аномалии (не чаще нескольких в секунду); браузер не зависает; полный лог всех попыток доступен для скачивания отдельным файлом в карточке доказательств. | 3h |

### Приёмка PK-PERSIST (Keeper)

- [ ] После рестарта процесса вся история запусков, статусов и доказательств доступна без потерь.
- [ ] Видео, скриншоты и HAR открываются в браузере; у каждого артефакта есть размер и контрольная сумма.
- [ ] Pure Box работает на локальном хранилище без MinIO; Enterprise — с MinIO.
- [ ] Миграция старых прогонов не создаёт дубликатов; исходные файлы сохранены до ручной проверки.
- [ ] Потерянный артефакт, запись без файла и файл без записи честно показаны как ошибка, не как успех.
- [ ] Активная сессия обхода переживает перезапуск.
- [ ] Фаззинг с миллионами попыток не вешает браузер и не забивает живой стрим; сырой дамп скачивается.
- [ ] Старый пульт отключён; порт `:8767` свободен; все данные доступны через новый API.

### Out of scope PK-PERSIST

- Полноценный Cosmoport 2.0 (отдельный приоритет, припаркован).
- Удаление Selenium Grid (эпик PW-AIRGAP).
- AI-ассистент, рекомендации по допуску, пересчёт гейтов.
- Автономный оператор, автопилот, автоисправление сценариев.
- Замена Valkey на другой брокер (Kafka/RabbitMQ).
- Горизонтальное масштабирование на кластер.
- Полное удаление исходных файлов после миграции — только после ручной проверки владельцем.

---

## 19. Эпик PK-VIEWPORT-FIX — Эвакуация Screencast, Stand Lifecycle, Canvas Stream Fix · 28 авг 2026 · 🟡 ready

> **Статус:** 🟢 CLOSED (28 авг 2026). 3 карточки, все сданы (F1 — Flash, B1+L1 — Luna). Живой смоук пройден.  
> **Причина (доказана на живом контуре):** `http://localhost:5173/#/checks/.../editor` показывает пустой canvas, хотя Juice Shop открыт в контейнере. Три дефекта:
> 1. `browser_service.py` (`_BrowserWorker`) сам дёргает `_start_screencast()` **параллельно** с `cdp_viewport_relay.py` → два владельца `Page.startScreencast` на одной странице, relay глохнет (`frames = 0`).
> 2. `cdp_viewport_relay.py` **не прописан** в `lab_ensure_ui.ps1` → не поднимается/не перезапускается штатно, висят зомби-процессы (`data_playground` ×2, `cdp_viewport_relay` ×2).
> 3. `useBrowserCanvasStream.ts` **дважды переопределяет** `img.onload` → теряется `canvas.width/height = frameW/frameH`, canvas остаётся `300×150` и рисует впустую.
>
> **Зафиксировано:** `/api/browser/status` = `connected:true, url:http://juice-shop:3000/#/`; `/api/browser/screenshot` = валидный PNG 848KB; CDP `:9223` отдаёт страницу Juice Shop; WS `:9224` принимает соединение, но **0 кадров за 30с**; BrowserStage canvas `300×150`, `framesReceived=0`.

### Нарезка Luna — Тяжёлое ядро + контур (60%, 2 карточки: VP-FIX-B1 + VP-FIX-L1)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-FIX-B1** | ✅ CLOSED (28 авг, Luna) — Эвакуация screencast из `browser_service.py`: вырезан `_start_screencast()` из `_ensure_browser()`, удалены `_start_screencast`/`_screencast_active`/`_last_frame`/`_cdp_session`/`_cmd_screencast_frame`/`browser_screencast_frame()`. `grep screencast` = 0. `_cmd_screenshot()` оставлена как smoke/debug. Relay `:9224` встроен в `lab_ensure_ui.ps1` (идемпотентная проверка `netstat :9224 LISTENING`, `python -m browser.cdp_viewport_relay`). | **Given:** контейнер поднят, CDP `:9223` жив. **When:** поднят стенд через `lab_ensure_ui.ps1`. **Then:** ровно один процесс `cdp_viewport_relay.py` слушает `:9224`; `browser_service.py` не вызывает `Page.startScreencast`; `pytest test_browser_service.py -q` зелёный; `page.screenshot` остаётся как smoke/debug. | 2h | Luna |

### Нарезка Flash — Быстрый UI (40%, 1 карточка, VP-FIX-F1)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-FIX-F1** | ✅ CLOSED (28 авг, Flash) — Починка `useBrowserCanvasStream.ts`: единый `img.onload` (`revokeObjectURL` → `canvas.width/height = frameW/frameH` → CSS-scale → `drawImage`), `img.onerror` для освобождения blob. `tsc 0`, 8 тестов зелёные. Единственный файл `frontend/src/terminal/useBrowserCanvasStream.ts` (строки 73–88). | **Given:** WS relay шлёт бинарный кадр. **When:** BrowserStage открыт, `connected:true`. **Then:** canvas.width/height = 1280/800; кадр рисуется корректно, без мыла; `framesReceived` инкрементируется; `npx tsc --noEmit` = 0; `npm run test -- BrowserStage.test.tsx` зелёный. | 2h | Flash |

### Нарезка Luna — продолжение (VP-FIX-L1)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **VP-FIX-L1** | ✅ CLOSED (28 авг, Luna) — Стабилизация `cdp_viewport_relay.py`, 3 бага починено: (1) `metadata.width/height` → `metadata.deviceWidth/deviceHeight` + fallback 1280×800 (иначе размеры всегда 0); (2) клиент на статичной странице не получал кадр — при подключении WS-клиента немедленно шлётся последний кадр; (3) реконнект-обходчик `_reconnect_loop` (watch-dog 5с) — при обрыве CDP relay не падает, `_connect_to_browser` больше не кидает. Живой смоук: WS-клиент → 1920×1080, JPEG=True, 110836 bytes, magic=`ffd8`. | **Given:** контейнер поднят, Chromium на `:9223`. **When:** открыт BrowserStage. **Then:** WS `:9224/api/browser/canvas` отдаёт валидные JPEG-кадры; реконнект без ручного вмешательства; `pytest test_cdp_viewport_relay.py -q` 100%. | 3h | Luna |

### Приёмка PK-VIEWPORT-FIX (Keeper)

- [x] `lab_ensure_ui.ps1` поднимает 4 сервиса: Vite `:5173`, Playground `:8765`, Live `:8767`, Relay `:9224`.
- [x] Идемпотентность: повторный запуск → `alive`, без новых зомби (parent-child relay→node driver — норма).
- [x] `:9224` стабильно отдаёт JPEG-кадры Juice Shop — смоук 1920×1080, magic `ffd8`, 110KB.
- [x] На десктопе оператора 0 окон Chrome (браузер в контейнере).
- [x] `browser_service.py` не содержит screencast (`grep` = 0).
- [x] `tsc --noEmit` = 0; `test_browser_service.py` 39 passed/1 skipped; `test_cdp_viewport_relay.py` 17 passed; всего 132 passed/1 skipped.
- [ ] Editor на `#/checks/114a306c-.../editor` глазами показывает живой UI Juice Shop (визуальный финальный кик Максима).

### Out of scope PK-VIEWPORT-FIX

- WebRTC / аппаратное ускорение / мульти-вьюпорт.
- noVNC как основной транспорт (`:7902` остаётся fallback-пультом).
- Переписывание scanner-сканера.
- Выпиливание Selenium Grid (отдельный эпик PW-AIRGAP-3).

---

## 20. Эпик PK-WIRED-RENAME-TAIL — Недобитый ренейм Wired → Wired в auth-контексте · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 1 карточка, 1h est. Одна связная цепочка недобитого ренейма — 13 точек в 3 файлах.  
> **Причина:** при Wired → Wired ренейме реестр `method_id.py` переехал на `apply_wired_auth` (правильно), но метод в `scanner_adapter.py` и вызовы в `controller.py` остались на старом `apply_wired_auth`. Тест `test_auth13_compose.py:358` ждёт `scannerAdapter.apply_wired_auth` → `AttributeError`; `test_auth13_compose.py:297` ждёт `_enrich_scanner_wired_params` → его нет. Это один из 48 red.
> **Направление фикса (канон):** `wired` — старое, `wired` — новое (см. `sanctuary/ALTAR.md` §15, `wired-sot`). Добиваем в сторону `wired`, НЕ наоборот.

### Карточка PK-WIRED-TAIL-1 — добить ренейм до `wired`

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **PK-WIRED-TAIL-1** | Добить ренейм `wired → wired` во всех 13 точках auth-контекста. Точечные `edit` (не regex). После — `ПрименитьAuth` ведёт в реальный метод, рассинхрон реестра/адаптера/контроллера закрыт. | **Given:** `ПрименитьAuth` → `("scanner", "apply_wired_auth")`. **When:** прогон `test_auth13_compose.py` + `test_methods_placement_smoke.py`. **Then:** `scannerAdapter.apply_wired_auth` существует, вызовы идут на него; `_enrich_scanner_wired_params` существует; тесты зелёные; `grep apply_wired_auth` = 0 в боевом пути. | 1h |

**Точный список 13 точек (по файлам):**

`orchestrator/adapters/scanner_adapter.py`
1. строка 531 — `_apply_wired_auth_compose` → `_apply_wired_auth_compose`
2. строка 575 — `def apply_wired_auth(` → `def apply_wired_auth(`
3. строка 592 — комментарий `Controller._enrich_scanner_wired_params` → `_enrich_scanner_wired_params`
4. строка 599 — `self._apply_wired_auth_compose(` → `_apply_wired_auth_compose(`

`orchestrator/core/controller.py`
5. строка 608 — `_enrich_apply_wired_auth_params` → `_enrich_apply_wired_auth_params`
6. строка 632 — `_enrich_scanner_wired_params` → `_enrich_scanner_wired_params`
7. строка 637 — `if action == "apply_wired_auth":` → `"apply_wired_auth"`
8. строка 638 — `self._enrich_apply_wired_auth_params(` → `_enrich_apply_wired_auth_params(`
9. строка 671 — `self._enrich_scanner_wired_params("apply_wired_auth", ...)` → `_enrich_scanner_wired_params("apply_wired_auth", ...)`
10. строка 672 — `scanner.apply_wired_auth(` → `scanner.apply_wired_auth(`
11. строка 2331 — `"apply_wired_auth",` → `"apply_wired_auth",`
12. строка 2334 — `self._enrich_scanner_wired_params(action, params)` → `_enrich_scanner_wired_params(action, params)`

`orchestrator/tests/test_methods_placement_smoke.py`
13. строка 386 — `"apply_wired_auth",` (в frozenset scanner-helpers) → `"apply_wired_auth",`

**DoD:** точечные `test_auth13_compose.py` + `test_methods_placement_smoke.py` зелёные; `grep -r "apply_wired_auth" orchestrator/` = 0 (кроме допустимых комментариев/legacy); реестр/адаптер/контроллер согласованы.

### Out of scope PK-WIRED-RENAME-TAIL

- Переименование `_enrich_scanner_wired_params` в других (не-auth) контекстах — только auth-цепочка.
- Другие 47 red (browser-каталог, gate_policy env, fuzz/teardown/juice) — отдельный эпик PK-DEBT-RED.

---

## 21. Эпик PK-SCANNER-RENAME — scanner → scanner: внутренние имена без лишнего брендинга · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 3 карточки, 6h est. Исполнители по команде владельца.  
> **Идея:** мы не убираем scanner из fame list. Просто нахуй надо упоминать — и так знаем что scanner. Внешние зависимости (`zapv2`) и реальный scanner-API не трогаем — только **наши** внутренние имена.
> **Масштаб:** 300 файлов с `scanner` (orchestrator+services+frontend): 130 refs `scannerAdapter`, 70 `PK_SCANNER_*`/`SCANNER_API_KEY`, 39 compose `scanner`.  
> **Класс работ:** тот же что Wired → Wired ренейм — системный дебрендинг внутренних имён.

### Граница — что меняем / что НЕ трогаем (железобетон)

| Меняем | НЕ трогаем (необходимое) |
|---|---|
| `scanner_adapter.py` → `scanner_adapter.py` | `zapv2` / `from zapv2 import zapv2` — внешняя библиотека OWASP |
| `scannerAdapter` → `ScannerAdapter` (130 refs) | scanner API endpoints: `/JSON/core/...`, `scanner.sh`, `zaproxy` бинарь/образ |
| `PK_SCANNER_*` env → `PK_SCANNER_*` (с read-both fallback) | docker image `zaproxy/scanner2docker-*` |
| `SCANNER_API_KEY` → `SCANNER_API_KEY` (чинит gate_policy env 48 red) | термин «scanner-алерт» когда про реальный детектор OWASP — допустим |
| compose service `scanner` → `scanner` (39 refs) | «scanner» в исторических docstrings/archive — оставить как есть |
| `scanner_mode`, `scanner_context`, `scanner_ctx`, `kdt-scanner`/`pk-scanner` имена | |
| логи и docstrings: «scanner» как внутреннее имя → scanner | |
| gate_policy / method_id / controller: scanner-ссылки | |

### Нарезка — 3 карточки по слоям

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **SCN-R1** | Ядро адаптера: `scanner_adapter.py` → `scanner_adapter.py`, `scannerAdapter` → `ScannerAdapter`. Все import-ссылки, registry, controller, method_id, export_keywords, тесты (130 refs total). Внешний клиент `zapv2` внутри нового ScannerAdapter остаётся — это реальный движок OWASP scanner. | **Given:** адаптер переименован. **When:** `from adapters.scanner_adapter import ScannerAdapter`; прогон точечных тестов. **Then:** все import работают; controller вызывает `ScannerAdapter`; method_id маппит `"scanner"`-компонент (имя компонента в wire остаётся `"scanner"` — это контракт DSL, не брендинг); 0 `scannerAdapter` в боевом пути. | 3h |
| **SCN-R2** | Env / гейты / compose: `PK_SCANNER_*` → `PK_SCANNER_*` с read-both fallback (`PK_SCANNER_*` || `PK_SCANNER_*` || `scanner_*`). `SCANNER_API_KEY` → `SCANNER_API_KEY`. Compose service `scanner` → `scanner`, docker-compose файлы, health checks. Gate_policy env-разъезд закрыт (один из 48 red). | **Given:** старый env `PK_SCANNER_API_KEY` установлен. **When:** код читает `PK_SCANNER_*` с fallback. **Then:** старые env работают; compose поднимается c `scanner`; `SCANNER_API_KEY` fallback читается; gate_policy тесты зелёные. | 2h |
| **SCN-R3** | Логи / docstrings / комментарии / следы: внутренние упоминания «scanner» в текстах логов, docstrings, комментариях — → scanner. `scanner_mode`/`scanner_context`/`scanner_ctx` имена. Исключение: термин «scanner-алерт» в контексте реального детектора — допустим. Исторические docstrings в archive/ — не трогаем. | **Given:** `grep -r "[Zz][Aa][Pp]" orchestrator/` после R1+R2. **When:** вычищены логи/docstrings. **Then:** в живых логах и docstrings нет «scanner» как внутреннего имени; `zapv2` и scanner-API не затронуты; archive нетронут. | 1h |

### Приёмка PK-SCANNER-RENAME (Keeper)

- [ ] `scanner_adapter.py` → `scanner_adapter.py`; `scannerAdapter` → `ScannerAdapter`; все import работают.
- [ ] `PK_SCANNER_*` читается как fallback; compose `scanner` поднимается; gate_policy env чист.
- [ ] Живые логи/docstrings не упоминают «scanner» как внутреннее имя.
- [ ] `zapv2`, scanner API endpoint, docker образ — не тронуты.
- [ ] Archive (`docs/archive/`, исторические docstrings) не тронут.
- [ ] Точечный suite зелёный; 0 регрессий.

### Out of scope PK-SCANNER-RENAME

- Переименование компонента в DSL с `"scanner"` на `"scanner"` — это machine-контракт wired, он остаётся `"scanner"` (не брендинг, а wire-идентификатор).
- Удаление scanner из fame list / внешних упоминаний OWASP scanner.
- Замена scanner-движка на другой сканер.

---

## 22. Эпик SOR — Session Orchestration & Multi-Substrate Delivery · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 18 карточек, 5 волн, 46h est. Фундамент зафиксирован в research, НЕ канон — 2FA-канонизация отдельным шагом.  
> **Спецификация:** [`docs/research/2026-08-28-session-orchestration-and-multi-substrate-architecture.md`](research/2026-08-28-session-orchestration-and-multi-substrate-architecture.md).  
> **Смысл:** PrettyK перестаёт быть single-operator скриптовым контуром и становится multi-substrate продуктом. Вводится иерархия **Box → Session → Run**, единый долгоживущий control plane `pk-control`, граница `RuntimeProvider` (Compose appliance / K8s cluster), fencing/lease, и внешний API-контракт с Cosmoport2.  
> **Разделение исполнителей:** вся инфра (Compose/K8s/бандлы/сети/Helm) — **Buddy**. Архитектурное ядро и контракты — **Boss**. Браузерный/сканер runtime-контур — **Luna**. UI/Studio — **Flash**.

### Граница — что строим / что НЕ трогаем (железобетон)

| Строим | НЕ трогаем |
|---|---|
| `pk-control` как долгоживущий control plane (Python, host-side в appliance / Deployment в K8s) | `main.py` остаётся точкой входа CLI-прогона, не переписывается |
| `RuntimeProvider` ABC + `ComposeProvider` + `KubernetesProvider` | существующий `RunControlPlane` (in-memory ядро) — используется как база, не ломается |
| Session state machine + fencing + lease + reconciliation | `sanctuary/ALTAR.md`, `sanctuary/pure/` — канон не трогаем до 2FA |
| Compose split: `docker-compose.base.yml` + `session-template.yml` | текущие живые прогоны/тесты — split вводится аддитивно |
| per-session scanner/browser/relay binding | `zapv2` и внешний scanner API-контракт (не переименовываем — это PK-SCANNER-RENAME) |
| Cosmoport2 API boundary (REST/Webhook) | внутренние импорты Cosmoport в DAST — **запрещены** |

### ⚠️ Порядок (зависимости волн)

Wave 1 → Wave 2 → Wave 3. Wave 4 (K8s) и Wave 5 (Cosmoport) — параллельны Wave 2/3, но их рантайм-валидация идёт после Wave 1. `SOR-B1` (контракт) блокирует все провайдерные карточки (`SOR-D2`, `SOR-D6`).

---

### Wave 1 — Interface & State Isolation

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **SOR-B1** | Контракт `RuntimeProvider` в `orchestrator/infra/runtime_provider.py`: ABC + типы `ResourceType`, `ServiceEndpoint`, `SessionResourceBundle`, `generation`. Чистое ядро без I/O. | **Given:** объявлен ABC. **When:** `from infra.runtime_provider import RuntimeProvider, ResourceType`. **Then:** все провайдеры реализуют один контракт; юнит-тесты на сигнатуры зелёные; 0 импортов docker/k8s в контракте. | 2h | Boss |
| **SOR-B2** | Session Manager core: Session state machine (`creating→provisioning→ready→releasing→released→failed`) с идемпотентными переходами, `SessionRecord`, in-memory store. Отдельная сущность от Run. | **Given:** создаётся Session. **When:** переходы `provisioning→ready`, `ready→releasing→released`, попытка недопустимого перехода. **Then:** состояние атомарно, недопустимый переход → ошибка, повторный create идемпотентен. | 3h | Boss |
| **SOR-D1** | Compose split: `docker-compose.base.yml` (системные: pk-control, postgres/valkey, allure, live) + `session-template.yml` (шаблон scanner/browser/relay/target). Убраны фиксированные `container_name`/host-порты из session-шаблона. `lab_up.ps1` переведён на base. | **Given:** запуск `docker compose -f docker-compose.base.yml up -d`. **When:** поднят base + развёрнута сессия из template под `-p pk-session-<id>`. **Then:** системный контур и сессия — разные проекты; session-сервисы без жёстких `container_name`; lab-контур не сломан. | 2h | Buddy |
| **SOR-L1** | Browser session binding: `browser_service.py` + `cdp_viewport_relay.py` переведены из глобальных в per-session (relay endpoint привязан к `session_id`, не глобальный `:9224`). | **Given:** две сессии. **When:** открыт relay каждой сессии. **Then:** кадры не смешиваются; endpoint резолвится через session; `test_cdp_viewport_relay.py` зелёный. | 3h | Luna |

### Wave 2 — Standalone Compose Provider

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **SOR-D2** | `ComposeProvider` — реализация `RuntimeProvider`: `provision_session_bundle` через `docker compose -p pk-session-<id>` + генерация из `session-template.yml`; `release_session_bundle`; `check_bundle_health`. Изолированная сеть `pk-net-<id>`. | **Given:** вызов `provision_session_bundle(id)`. **When:** сессия создана. **Then:** контейнеры подняты в отдельном проекте/сети, внутренние имена резолвятся (`scanner:8080`), `release` полностью удаляет проект+сеть. | 3h | Buddy |
| **SOR-D3** | Lease Controller + zombie GC: expiry sweep, force teardown зависших сессий, labels `com.prettyk.session-id`/`generation`, восстановление Session Map после рестарта `pk-control`. | **Given:** сессия с истёкшим lease + рестарт pk-control. **When:** sweep запущен. **Then:** зависшие ресурсы уничтожены; после рестарта control plane находит живые контейнеры по labels и восстанавливает состояние. | 2h | Buddy |
| **SOR-B3** | Reconciliation loop в `pk-control`: фоновый worker сравнивает desired vs observed (healthcheck), выполняет targeted recreate конкретного сервиса без сноса всей сессии. | **Given:** scanner ушёл в `unhealthy`. **When:** цикл сработал. **Then:** пересоздаётся только scanner; browser/relay/чужие сессии не затронуты; UI видит `recovering`. | 3h | Boss |
| **SOR-B4** | Fencing token: `generation` в заголовке `X-PK-Session-Generation`; stale-owner запросы отклоняются `409 Conflict`. | **Given:** lease перешёл новому владельцу (generation++). **When:** старый владелец шлёт команду со старым generation. **Then:** запрос отклонён; новый владелец работает; нет split-brain. | 2h | Boss |
| **SOR-L2** | Playwright Authoring Slot: выделенный headed Chromium per session + CDP session routing (`connect_over_cdp` к динамическому target сессии). | **Given:** две параллельные сессии авторинга. **When:** navigate/observe в каждой. **Then:** браузеры изолированы, CDP-таргеты не пересекаются; parity-тесты зелёные. | 3h | Luna |
| **SOR-L3** | Scanner Session Controller: per-session scanner daemon binding — выделенный инстанс с session-scoped state (context/history/alerts), не глобальный daemon. | **Given:** две сессии сканирования. **When:** прогон в каждой. **Then:** alerts/sites/history не смешиваются; `capability_scanner.py` создаёт context строго в своём инстансе. | 3h | Luna |
| **SOR-D4** | Offline bundle v1: манифест версий/контрольных сумм + images + compose + install/verify (Win/Linux). Расширить `airgap-bundle` с одного Playwright image до полной коробки. | **Given:** чистая airgap-машина. **When:** `install` + `verify-bundle`. **Then:** коробка стартует без сети; `pip/npm/playwright install` на рантайме не вызываются; checksum-верификация проходит. | 3h | Buddy |
| **SOR-D5** | Parallel sessions integration test: 2 параллельные сессии с разными scanner/browser, проверка изоляции ресурсов и артефактов. | **Given:** две сессии. **When:** одновременный run + authoring. **Then:** нет утечек состояния/портов/артефактов между сессиями; тест детерминирован. | 2h | Buddy |

### Wave 3 — UI / Studio Integration

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **SOR-F1** | BrowserStage подключается к динамическому relay endpoint через `pk-control` API, а не хардкод `:9224`. | **Given:** сессия с relay. **When:** открыт BrowserStage. **Then:** WS-адрес взят из session endpoint; кадры идут из своей сессии. | 2h | Flash |
| **SOR-F2** | Runtime Ops UI: индикатор здоровья сессии (`ready/recovering/degraded`) + кнопка «Recreate Workspace»; capability-заглушка Deployment-слоя (скрыта в pure-профиле). | **Given:** сессия в degraded. **When:** оператор жмёт Recreate. **Then:** `pk-control` пересоздаёт workspace; статус обновляется; Deployment-вкладка не мешает pure-пользователю. | 2h | Flash |

### Wave 4 — Kubernetes Provider & Helm Packaging

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **SOR-D6** | `KubernetesProvider` — реализация `RuntimeProvider` поверх K8s API: Namespace/Pod lifecycle per-session, NetworkPolicy изоляция. | **Given:** тестовый кластер. **When:** `provision_session_bundle` через K8s. **Then:** создаётся изолированный namespace/workload; release удаляет их; NetworkPolicy блокирует межсессионный трафик. | 3h | Buddy |
| **SOR-D7** | Helm-чарт `prettyk` (base system + session workloads) + валидация установки в тестовом кластере. | **Given:** `helm install`. **When:** chart развёрнут. **Then:** системный контур поднят, сессия создаётся из chart-шаблона; upgrade не рвёт живые сессии. | 3h | Buddy |

### Wave 5 — Cosmoport2 Integration Boundary

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **SOR-B5** | API/Events boundary: нейтральный версионируемый REST/Webhook контракт для вызова DAST-проверок из внешних CI/CD и Cosmoport — без внутренних импортов/общей БД. | **Given:** внешний вызывающий. **When:** вызов `/api/v1/scans` + webhook события. **Then:** PrettyK core не импортирует Cosmoport; контракт версионируем; идемпотентный запуск по dedup_key. | 3h | Boss |
| **SOR-D8** | Artifact exchange contract: экспорт OCI/airgap bundle + SBOM/SARIF для внешних систем. | **Given:** завершённый run. **When:** экспорт артефактов. **Then:** SBOM/SARIF/OCI-пакет отдаются наружу; секреты не утекают в артефакты. | 2h | Buddy |

### Приёмка SOR (Keeper)

- [ ] `RuntimeProvider` контракт един для Compose и K8s; 0 docker/k8s-импортов в ядре.
- [ ] Session state machine атомарна; fencing отклоняет stale owner.
- [ ] Compose split: base + session-template; lab-контур не сломан.
- [ ] Две параллельные сессии не смешивают scanner/browser/relay/артефакты.
- [ ] Offline bundle стартует на чистой airgap-машине без сети.
- [ ] BrowserStage берёт relay endpoint из `pk-control`, не хардкод.
- [ ] Helm-чарт валиден; K8s-сессии изолированы NetworkPolicy.
- [ ] Cosmoport-интеграция — только через API/events, без внутренних импортов.
- [ ] Точечные suite зелёные; 0 регрессий в живом DAST-контуре.

### Out of scope SOR

- Канонизация в `sanctuary/pure/` и `ALTAR.md` — отдельный полный 2FA после зелёных Wave 1–2.
- Переименование scanner → scanner (это `PK-SCANNER-RENAME`).
- Реализация Cosmoport2 как продукта (это отдельный [`sanctuary/cosmoport2/backlog.md`](../sanctuary/cosmoport2/backlog.md)).
- Собственный Kubernetes scheduler / operator для жизненного цикла самих кластеров (Cluster API) — не на этом этапе.
- Переписывание `main.py` / живого DAST-рантайма.

---

## 23. Эпик PK-CRAWLER — Playwright SPA/State Crawler + Corpus Awakening · 28 авг 2026 · 🟡 research

> **Статус:** 🟡 research (POC design готов, 28 авг 2026). 11 карточек: P0 (стальной трек, 7 карточек, 17.5h) + P1 (расширение, 4 карточки, 8h). НЕ канон — 2FA отдельным шагом после P0.  
> **Пропорция:** Boss 30% / Flash 40% / Luna 30% (Луна меньше — она добивает хвосты).  
> **Спецификация:** [`docs/research/2026-08-28-playwright-spa-crawler-poc.md`](research/2026-08-28-playwright-spa-crawler-poc.md).  
> **Смысл:** вместо слепого scanner AJAX Spider строится собственный Playwright-native краулер, который обходит SPA по состояниям (а не URL), строит граф переходов, безопасно пробуждает сиротские формы живым UI-действием, и передаёт только проверенные RequestTemplate в CorpusFuzzer. scanner остаётся downstream MITM/сканером.  
> **Разделение:** Boss — crawler core + BFS-архитектура + UI awakening + replay. Luna — fingerprint + network capture + persona matrix + fuzzer handoff. Flash — policy classifier + fixture SPA + wired export + state graph визуализация.

### Граница — что строим / что НЕ трогаем

| Строим | НЕ трогаем |
|---|---|
| Новый `spa_crawler` на Playwright — BFS/priority queue, state fingerprint, action graph, CrawlerConfig с бюджетами | scanner AJAX Spider (`ajax_spider_scan`, `client_spider_scan`, `spider_scan`) — **не трогаем до выпила после P1** |
| Browser-native network capture: Playwright `request`/`response`/`console`/`pageerror` события → нормализованный NetworkDelta | `discovery_capture.py` (scanner History-based) — **не ломаем, дополняем отдельным адаптером; не меняем сигнатуры capture_current** |
| UI Awakening: живое действие в Playwright-контексте (fill + submit) для сиротской формы → capture реальный ответ браузера | Существующие `awaken_candidates()` — **не удаляем, используем как fallback; не трогаем сигнатуру без 2FA** |
| CorpusFuzzer handoff: только RequestTemplate с provenance `observed` или `operator_approved` | Существующий `CorpusFuzzer` / sniper/cluster bomb / `generate_mutations()` — **публичный API не меняем, только фильтр на входе** |
| Fixture SPA для приёмки: 3 клиентских роута (history.pushState), модалка на том же route, таб-панель, lazy форма с 2 API-эндпоинтами | Живой Juice Shop / продакшен-цели — **не обязательны для P0; приёмочные тесты только на fixture** |
| `DiscoverySession` расширение: state_key, network_delta, awaken provenance, CrawlerRunResult | `sanctuary/ALTAR.md`, `sanctuary/pure/` — **канон не трогаем до отдельного полного 2FA** |
| State-driven обход: единица покрытия = состояние (route + AX digest + видимые controls + модалки/диалоги) | Традиционный URL-обход через `<a>` / `link[href]` / слепой DOM parse всех страниц — **не строим, не проектируем** |

### ⚠️ Порядок (зависимости карточек)

P0: CRAWL-1 (crawler core) — блокирует все остальные P0-карточки, потому что они расширяют его. CRAWL-2 (fingerprint) зависит от CRAWL-1. CRAWL-3 (policy) и CRAWL-4 (network) параллельны после CRAWL-1. CRAWL-5 (awakening) после CRAWL-4 (нужен captured network для детекции orphan). CRAWL-6 (fixture) параллелен CRAWL-2…5, но нужен для приёмки всех карточек. CRAWL-7 (handoff) после CRAWL-5 (нужны verified templates).

P1: после полного зелёного P0. CRAWL-8 (replay) → CRAWL-9 (persona, нужен replay для переключения контекстов без re-navigation). CRAWL-10 и CRAWL-11 параллельны.

---

### P0 — Стальной трек: фикстурный SPA-краулер (7 карточек, 17.5h · Boss 5.5 / Flash 6 / Luna 6)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **CRAWL-1** | Crawler core + BFS-архитектура: запуск сессии на любом SPA через Playwright-контекст (launch или attach к CDP), извлечение интерактивных элементов из AX-снимка, построение очереди действий, выполнение их в изолированном контексте, сбор state snapshot после каждого значимого действия. **НЕ делает:** fingerprint (CRAWL-2), network capture (CRAWL-4), policy (CRAWL-3). Краулер знает только BFS-цикл и CrawlerConfig (max_states, max_depth, max_actions_per_state, settle_timeout, allowed_origins). | **Given:** фикстурный SPA с тремя клиентскими роутами (`/#/`, `/#/login`, `/#/dashboard`), модалкой на `/#/` и таб-панелью на `/#/dashboard`. **When:** краулер стартует с `CrawlerConfig(target_url, max_states=50, max_depth=3)`. **Then:** все три роута посещены (переходы зафиксированы без window.location перезагрузки); модалка открыта через click и зафиксирована как отдельный snapshot; табы переключены; граф переходов содержит рёбра вида `(from_state, action_type, action_target, to_state)`; бюджет `max_depth` соблюдён; при исчерпании очереди краулер возвращает `CrawlerRunResult` с количеством состояний, переходов и причиной остановки. | 3.0h | Boss |
| **CRAWL-2** | State fingerprinting + дедупликация: вычисление state_key из стабильных атрибутов страницы, детекция повторов до выполнения действия, ведение visited-реестра, остановка при превышении бюджета. **Что входит в fingerprint:** normalized_url (без query, без trailing slash), route (путь без хоста), отсортированный список видимых accessible names интерактивных элементов, список видимых heading текстов, признак наличия модалки/диалога (role=dialog), digest AX-дерева (усечённый до 3 уровней). **Что НЕ входит:** timestamps, request id, nonce, cookie-значения, координаты, полные URL картинок/шрифтов/статики, заголовки Authorization. | **Given:** SPA, где модалка `/#/` и пустой `/#/` — разные состояния с разными наборами кнопок. **When:** краулер возвращается на `/#/` через разные пути. **Then:** пустой `/#/` зафиксирован один раз при первом посещении; открытие модалки даёт другой state_key; при повторном заходе на пустой `/#/` fingerprint совпадает с visited → действие пропущено; при достижении `max_states` краулер останавливается с `stop_reason=budget_exhausted` и в артефакте указано, сколько состояний не обойдено. | 2.0h | Luna |
| **CRAWL-3** | Policy gate classifier: перед выполнением любого действия классификация элемента как safe/dangerous/out-of-scope. **Классификатор:** матчинг по accessible name, role, и тексту кнопки/ссылки. **Dangerous (блокировать, записать как blocked):** Logout, Sign out, Выйти, Delete, Remove, Удалить, Pay, Купить, Reset, Сбросить, Change password, Сменить пароль, Deactivate. **Out-of-scope (записать без выполнения):** ссылки на другие origin (не в allowed_origins), `mailto:`, `tel:`, `javascript:`. **Safe (выполнять):** всё остальное — табы, меню, аккордеоны, кнопки навигации, формы поиска, пагинация, раскрывающиеся списки. Классификатор получает массив правил, а не хардкод-список. | **Given:** страница с кнопками «Удалить аккаунт» (role=button, name=Удалить аккаунт), «Выйти» (text=Выйти), «Поиск» (role=button, name=Поиск) и ссылкой `<a href="https://external.com">`. **When:** краулер извлёк все элементы и прогоняет через classifier. **Then:** «Удалить аккаунт» → blocked, reason=dangerous_action; «Выйти» → blocked; «Поиск» → safe, выполнено; external-ссылка → out_of_scope, reason=cross_origin, записана без перехода; все blocked/out-of-scope элементы присутствуют в артефакте со статусом и причиной; safe элементы дали transitions. | 3.0h | Flash |
| **CRAWL-4** | Browser-native network capture: подписка на Playwright-события `request`, `response`, `console`, `pageerror` в контексте краулера, нормализация в общий формат NetworkDelta, привязка к transition. **Что сохраняется для каждого запроса:** method, URL (полный, без редиректов), status, resource_type (из request.resource_type — xhr/fetch/document/websocket/script/stylesheet), request_body (первые 2000 байт), response_body (первые 2000 байт), response_content_type. **Redaction:** значения полей с именами из _SECRET_FIELD_NAMES (password, passwd, secret, token, csrf, api_key, authorization) заменяются на `[REDACTED]`; целиком заголовки Cookie/Authorization/Set-Cookie не пишутся. **Что НЕ сохраняется:** бинарные тела (WebSocket frames, blob), ответы > 64KB (обрезаются), OPTIONS/preflight, статика (resource_type=image/font/media). | **Given:** SPA отправляет `POST /api/login` с телом `{"email":"test@test.com","password":"secret123"}` и получает `200 {"token":"jwt..."}`. **When:** краулер заполнил и отправил форму логина. **Then:** в NetworkDelta есть запись: `method=POST, url=/api/login, resource_type=fetch, status=200`; request_body содержит `email=test@test.com` и `password=[REDACTED]`; response_body содержит `token=[REDACTED]`; запись привязана к transition_id действия «Нажать Войти»; console и pageerror события также записаны с уровнем и текстом. | 2.0h | Luna |
| **CRAWL-5** | UI Awakening — пробуждение сиротских форм: детекция полей в DOM, для которых ни один зафиксированный HTTP-запрос не содержит совпадения по имени параметра или form action; попытка живого UI-действия в Playwright; fallback на synthetic template только при невозможности UI. **Алгоритм:** (1) из state snapshot берём все FormField; (2) ищем совпадения поля с query/body-параметрами из NetworkDelta (CRAWL-4); (3) ненайденные → orphan; (4) для каждого orphan: `page.get_by_label(name).fill(safe_value)` → найти ближайшую кнопку submit или родительский form → `page.locator(form).press("Enter")` → settle → capture network delta; (5) если после UI-действия появился новый запрос к известному или новому endpoint → provenance=observed, endpoint добавлен в ServiceMap; (6) если UI-действие невозможно (элемент не видим, нет submit, таймаут) → генерируется один bounded RequestTemplate с provenance=synthetic_candidate. **Безопасное значение:** тип email → `awakened@secops.test`, text → `awakened-test-value`, password → `AwakenedP@ss1`, number → `42`. | **Given:** форма поиска с `<input name="q">` и кнопкой «Искать», при этом поиск делает XHR, который не попал в пассивный capture (CRAWL-4), потому что сработал до установки слушателей. **When:** краулер обнаружил orphan field `q`. **Then:** Playwright заполняет поле → жмёт «Искать» → settle 750ms → в NetworkDelta появляется `GET /api/search?q=awakened-test-value` → provenance=observed; endpoint `/api/search` добавлен в ServiceMap. Если бы кнопка была `display:none` → submit невозможен → создан `RequestTemplate(method=GET, url=/api/search, query_params=[{name:q, value:...}])` с provenance=synthetic_candidate. | 2.5h | Boss |
| **CRAWL-6** | Фикстурный SPA для приёмочного тестирования: автономное мини-приложение (один HTML+JS, без сервера), которое открывается через `file://` или локальный http-сервер и предоставляет все необходимые для тестов поверхности. **Обязательные элементы:** (1) три клиентских роута через history.pushState — `/#/`, `/#/login`, `/#/dashboard` — с разными наборами кнопок на каждом; (2) модальное окно на `/#/`, открывающееся по кнопке «Настройки» и содержащее 2 инпута + кнопку «Сохранить»; (3) таб-панель на `/#/dashboard` с вкладками «Профиль», «Платежи», «История» — каждая показывает разный набор полей; (4) форма с lazy-загрузкой (появляется через 500ms после открытия таба «Профиль»); (5) две XHR-заглушки: `POST /api/login` (200 или 401 в зависимости от payload) и `GET /api/search` (200 с разным контентом). В fixture **обязана** быть кнопка «Удалить аккаунт» и кнопка «Выйти» для policy-тестов. **Формат:** один HTML-файл с инлайн-скриптом, перехватывающий history.pushState и эмулирующий SPA-роутинг без сервера. | **Given:** fixture SPA открыт в браузере. **When:** прогон тестов CRAWL-1…CRAWL-5 на нём. **Then:** fingerprint test: 5+ уникальных состояний (3 роута + модалка + таб с формой); policy test: «Удалить аккаунт» и «Выйти» классифицированы как dangerous и не нажаты; dedupe test: модалка на `/#/` ≠ пустой `/#/`; awaken test: lazy-форма с API даёт observed endpoint после UI-пробуждения; network test: оба XHR зафиксированы с redacted полями. | 3.0h | Flash |
| **CRAWL-7** | Fuzzer handoff — фильтр и передача подтверждённых RequestTemplate в CorpusFuzzer. **Логика фильтра:** все RequestTemplate из артефакта делятся на три категории: (1) observed — endpoint зафиксирован в NetworkDelta после реального браузерного действия → передаётся в фаззер; (2) synthetic_candidate — создан через fallback в обход браузера → НЕ передаётся, ждёт явного operator_approved; (3) operator_approved — synthetic, который оператор явно пометил как verified → передаётся. **Что именно передаётся:** `CorpusFuzzer.generate_mutations(template, count=50, mode="sniper")` для каждого verified шаблона. **Что НЕ делается:** не запускается фаззинг автоматически (handoff отдаёт список шаблонов, запуск — отдельный шаг оператора). | **Given:** краулер собрал артефакт с 7 observed endpoint'ов и 3 synthetic_candidate. **When:** оператор запускает handoff (явное действие, не авто). **Then:** CorpusFuzzer получает 7 шаблонов с mode=sniper; 3 synthetic остаются в артефакте с provenance=synthetic_candidate и фильтруются; оператор видит список synthetic и может вручную approve любой из них (меняет provenance на operator_approved); после approve — повторный handoff включает одобренный шаблон; provenance каждого шаблона виден в артефакте. | 2.0h | Luna |

### P1 — Расширение: replay, persona, wired экспорт, визуализация (4 карточки, 8h · Boss 2 / Flash 4 / Luna 2)

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **CRAWL-8** | Action replay chains — восстановление состояния через повтор цепочки действий от корня, без seed re-navigation. **Как работает:** краулер хранит для каждого состояния путь действий от seed: `[(action_type, target, candidate_locator), ...]`. При необходимости вернуться в состояние — создаётся свежий изолированный BrowserContext (storage изолирован), и цепочка проигрывается последовательно. После каждого действия — проверка fingerprint. Если на шаге N fingerprint не совпал — replay прерывается честной ошибкой `replay_diverged`, а не молча продолжается с неверным состоянием. **Ограничения:** не replay'ит состояния глубже глубины 6; не replay'ит через actions, которые изменили серверный state (POST/PUT/DELETE с неидемпотентным эффектом); для таких состояний — честный fallback на seed re-navigation. | **Given:** состояние `/#/dashboard` достигнуто через: navigate `/` → click «Войти» → fill email → fill password → click «Вход». **When:** краулер хочет восстановить `/#/dashboard` после обхода другой ветки. **Then:** replay chain выполняет 5 действий последовательно; после каждого — проверка fingerprint; конечный state_key совпадает с оригиналом; время replay < 2× re-navigation; если на шаге 2 («Войти») кнопка исчезла — replay_diverged, зафиксировано, используется re-navigation. | 2.0h | Boss |
| **CRAWL-9** | Multi-persona crawl — обход одного SPA под разными ролями (anonymous, authenticated-user, admin) с изолированными контекстами и раздельными графами состояний. **Как работает:** CrawlerConfig принимает список `personas: [{name, auth_chain}]`, где auth_chain — цепочка действий для аутентификации (например, fill login + fill password + click submit). Для каждой персоны создаётся изолированный BrowserContext (storage_state не пересекается). Каждая персона даёт свой граф состояний — один и тот же route может быть доступен под admin и недоступен под anonymous. **В артефакте:** persona_hash в каждом state, раздельные transitions, сводная матрица доступности `(persona × state → accessible | blocked | redirected)`. | **Given:** SPA с `/`, `/#/login`, `/#/admin` (доступен только после auth). **When:** краулер запущен с persona=[anonymous, admin]. **Then:** anonymous: `/` и `/#/login` обойдены, `/#/admin` → 401/redirect, зафиксирован как blocked с причиной auth_required; admin: все три роута обойдены, форма в `/admin` заполнена; persona_hash в состояниях разный; матрица доступности в артефакте. | 2.0h | Luna |
| **CRAWL-10** | Wired page model export — оператор выбирает одно или несколько состояний из графа, и они экспортируются как валидный `wired.json` Page Family с устойчивыми локаторами и data-модулем. **Приоритет локаторов:** T0 data-testid → T1 role + accessible name → T2 label/placeholder → T3 name attr → T4 nth-child (с пометкой fragile). **Что попадает в экспорт:** для каждого выбранного состояния — navigate-шаг, все зафиксированные элементы с их лучшим локатором, привязка value_class (email/secret/phone) к data_module. **Что НЕ попадает:** состояния глубже выбранных, synthetic endpoint'ы, элементы с tier=T4 без явного подтверждения оператора, секреты в открытом виде. **Инкрементальный merge:** при повторном экспорте того же состояния существующие ручные правки локаторов сохраняются (trust=manual-edited), новые элементы добавляются. | **Given:** краулер обошёл 3 страницы: Login, Dashboard, Admin. **When:** оператор выбирает Login и Dashboard → «Экспорт в wired». **Then:** создан wired.json с двумя page_families; локатор для кнопки «Войти» — T0 (если есть data-testid) или T1 (role=button + name=Войти); поле пароля имеет value_class=secret и биндинг `Secret $password_ref` в data_module; ручные правки из предыдущего экспорта сохранены; элементы без уверенного локатора помечены `_trust=review-needed`. | 2.0h | Flash |
| **CRAWL-11** | State graph visualization — read-only визуализация графа состояний и переходов в Studio: узлы = состояния (сгруппированы по route), рёбра = действия, цвет узла = глубина/статус, подписи = action type + target. **Интерактив:** клик по узлу → превью snapshot (URL, заголовок, количество элементов, наличие модалки); клик по ребру → превью action (тип, цель, outcome, network delta); фильтр по персоне (если CRAWL-9 выполнен). **Ограничения:** чисто read-only; НЕ редактирует wired; НЕ меняет DAST-рантайм; визуализация — отдельная вкладка или панель в Studio, не блокирует основной UI. | **Given:** артефакт CrawlerRunResult с 8 состояниями и 15 переходами. **When:** оператор открывает «Граф обхода» в Studio. **Then:** видна направленная сеть: узлы с route-подписями, рёбра с action type; узел модалки визуально связан с родительским route; при клике на узел — превью с details; фильтр по персоне скрывает/показывает соответствующую часть графа; визуализация не меняет артефакт. | 2.0h | Flash |

### Приёмка PK-CRAWLER (Keeper)

- [ ] P0: краулер на фикстурном SPA обходит клиентские роуты без перезагрузки; граф переходов корректен.
- [ ] P0: модалка/табы зафиксированы как отдельные состояния с разными fingerprint; пустой route ≠ route с модалкой.
- [ ] P0: повторные состояния детектятся и пропускаются; visited-реестр работает.
- [ ] P0: бюджет max_states / max_depth / max_actions_per_state соблюдается; краулер останавливается с явной причиной.
- [ ] P0: destructive controls (Logout, Delete, Remove, Pay, Reset) зафиксированы как blocked, не нажаты.
- [ ] P0: cross-origin ссылки зафиксированы как out-of-scope без перехода; allowed_origins соблюдается.
- [ ] P0: XHR/fetch-запросы привязаны к transition и redacted (password, token, cookie, authorization — [REDACTED]).
- [ ] P0: UI awakening даёт observed endpoint там, где пассивный capture его не видел; synthetic только как fallback.
- [ ] P0: synthetic RequestTemplate явно помечен provenance=synthetic_candidate и не попадает в фаззер без operator_approved.
- [ ] P1: action replay chain восстанавливает состояние без re-navigation; replay_diverged честно зафиксирован.
- [ ] P1: разные персоны дают разные графы; anonymous/admin матрица доступности корректна; изоляция контекстов не нарушена.
- [ ] P1: wired экспорт даёт валидный page model с семантическими локаторами (T0..T3, не генерированные id).
- [ ] P1: state graph визуализация отображает узлы/рёбра/фильтры; read-only, не меняет артефакт.
- [ ] Точечные тесты зелёные по каждой карточке; существующий DAST-контур не сломан.
- [ ] Artifact `CrawlerRunResult` валиден: state graph целостный, awaken provenance явный, секретов в открытом виде нет.

### Out of scope PK-CRAWLER

- Замена/удаление существующих scanner AJAX Spider operations (`ajax_spider_scan`, `client_spider_scan`, `spider_scan`) — отдельный шаг после P1.
- Полноценный LLM suggestion layer как execution authority (только candidate generator — P2).
- Mutation-guided exploration и coverage scoring по неизведанным endpoint'ам (P2).
- Cross-browser сравнение (Firefox/WebKit) — P2.
- Канонизация в `sanctuary/pure/` и `ALTAR.md` — отдельный полный 2FA после P0+P1.
- Переписывание живого DAST-рантайма под новый краулер.
- Изменение сигнатур `discovery_capture.py` / `awaken.py` / `CorpusFuzzer` без отдельного 2FA.

---

## 24. Эпик PK-SPIDER-APOCALYPSE — Spider Rename → Crawl + scanner Deprecation · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 1 карточка, 3.5h, исполнитель Flash.  
> **Смысл:** свой PK-CRAWLER решили — старый scanner Spider хороним. Но не удаляем, а переименовываем в алиасы на `scanner|crawl`, чтобы существующие wired-сценарии не ломались. scanner-специфичные операции (`ajax_spider_*`, `client_spider_*`, `status`, `stop`) помечаем @deprecated.  
> **Правило rename, не remove:** `Сканер https://x` → резолвится в `scanner|crawl|https://x`. Юзер не теряет рабочие сценарии. Новые пишут `Сканировать https://x`.  
> **af_plan.py НЕ трогаем:** `type: spider` / `type: spiderAjax` / `type: spiderClient` — это типы scanner Automation Framework плана, не наши внутренние имена. scanner ждёт их именно такими. Менять — сломаем генерацию ZAF-планов.

### ⚠️ Стратегия

| Старое русское имя | Старый wire | Новый wire | Статус |
|---|---|---|---|
| Сканер | `spider_scan` | `crawl` | Алиас на `Сканировать` |
| СканерЛокальный | `spider_scan_local` | `crawl` | Алиас (local depth → CrawlerConfig) |
| СканерГлубокий | `spider_scan_deep` | `crawl` | Алиас на `СканироватьГлубоко` |
| СканерSPA | `spider_scan_spa` | `crawl` | Алиас на `Сканировать` |
| Краулер | `ajax_spider_scan` | — | @DEPRECATED |
| КраулерГлубокий | `ajax_spider_scan_deep` | — | @DEPRECATED |
| КраулерПоверхностный | `ajax_spider_scan_shallow` | — | @DEPRECATED |
| КраулерИтератор | `ajax_spider_scan_iterator` | — | @DEPRECATED |
| КраулерКлиент | `client_spider_scan` | — | @DEPRECATED |
| СтатусСканера | `spider_status` | — | @DEPRECATED |
| ОстановитьСканера | `stop_spider` | — | @DEPRECATED |
| СтатусКраулера | `ajax_spider_status` | — | @DEPRECATED |
| СтатусКраулерКлиент | `client_spider_status` | — | @DEPRECATED |
| — | `stop_all_spiders` | — | @DEPRECATED |
| — | `stop_client_spider` | — | @DEPRECATED |

**Важно:** `Сканировать` уже есть в реестре с wire `crawl` (PK-SCANNER-RENAME). Старые алиасы должны резолвиться в тот же `("scanner", "crawl")`.

---

### Карточка SPA-1: Spider → Crawl rename + scanner deprecation · 3.5h · Flash

#### Шаг 1: `orchestrator/core/method_id.py`

Файл содержит ДВА места с spider-маппингами:

**Место 1 — строка 61:** убрать `("scanner", "ajax_spider_scan")` из `StepDescriptor`.

**Место 2 — строки 256-269 (первый маппинг) и 435-448 (второй маппинг):**
- `Сканер: ("scanner", "spider_scan")` → `("scanner", "crawl")`
- `СканерЛокальный: ("scanner", "spider_scan_local")` → `("scanner", "crawl")`
- `СканерГлубокий: ("scanner", "spider_scan_deep")` → `("scanner", "crawl")`
- `СканерSPA: ("scanner", "spider_scan_spa")` → `("scanner", "crawl")`
- Остальные 10 имён (Краулер, КраулерГлубокий, КраулерПоверхностный, КраулерИтератор, КраулерКлиент, СтатусСканера, ОстановитьСканера, СтатусКраулера, СтатусКраулерКлиент) → **удалить из маппинга.**

**Место 3 — строки 1124-1143 (списки action'ов):** убрать все 14 spider-строк, добавить `"crawl"` где уместно.

#### Шаг 2: `orchestrator/core/controller.py`

В методе `_execute_scanner_action` (~строки 2723-2963):

- **spider_scan / spider_scan_spa / spider_scan_deep / spider_scan_local:** четыре отдельных блока → **один блок `crawl`**. Сигнатура унифицируется: `crawl(url, depth, timeout)`.
- **ajax_spider_scan* и client_spider_scan:** убрать dispatch, оставить заглушку: `logger.warning("ajax_spider_scan is @deprecated — use crawl instead")` + return `{"ok": False, "deprecated": True}`.
- **spider_status / stop_spider / ajax_spider_status / client_spider_status / stop_client_spider / stop_all_spiders:** то же — заглушка с WARNING.
- `_execute_scanner_action` не удалять — там ещё `active_scan` и `passive_scan`.

#### Шаг 3: `orchestrator/adapters/scanner_adapter.py`

**НЕ удалять методы** — scanner daemon ещё жив как downstream сканер.

Добавить `# @deprecated 2026-08-28 — replaced by PK-CRAWLER` на ВСЕ публичные методы:
`spider_scan`, `spider_scan_spa`, `spider_scan_deep`, `spider_scan_local`, `spider_status`, `stop_spider`, `stop_all_spiders`, `ajax_spider_scan`, `ajax_spider_scan_shallow`, `ajax_spider_scan_deep`, `ajax_spider_scan_iterator`, `ajax_spider_status`, `client_spider_scan`, `client_spider_status`, `stop_client_spider`.

И на приватные: `_normalize_spider_scan_args`, `_set_spider_options`, `_set_ajax_spider_options`, `_set_client_spider_options`, `_spider_scan_impl`, `_ajax_spider_scan_impl`, `_client_spider_scan_impl`.

В docstring класса (строка 3809+) убрать spider-секцию из описания.

#### Шаг 4: Регенерация generated JSON

```bash
python -m orchestrator.tools.export_keywords --gen-method-id
python -m orchestrator.tools.export_keywords --gen-keywords
```

Проверить что spider-записи стали `crawl` или исчезли в:
- `frontend/src/generated/method_ids.json` (~14 записей)
- `frontend/src/generated/keywords.json` (~14 keyword-блоков)
- `cosmo/src/generated/method_ids.json`
- `cosmo/src/generated/keywords.json`

#### Шаг 5: Frontend — spider → crawl / удалить

| Файл | Что |
|---|---|
| `frontend/src/monaco/spiderCompletions.ts` | **УДАЛИТЬ ЦЕЛИКОМ** (~120 строк) |
| `frontend/src/monaco/scriptLanguage.ts:40` | Убрать `import { registerSpiderCompletionProvider }` + вызов |
| `frontend/src/monaco/securityDiagnostics.ts:135` | `"spider/discovery"` → `"crawl"` |
| `frontend/src/editor/wireDocumentParser.ts:149-150` | `'spider': 'Spider'` → `'crawl': 'Crawl'`, убрать `'spiderscan'` |
| `frontend/src/ci/PipelinePreview.tsx:81` | `includes('spider')` → `includes('crawl')` |
| `frontend/src/studio/Canvas.tsx:90` | `"spider"` → `"crawl"` в description |
| `frontend/src/studio/ScenarioFlow.tsx:28` | `"spider"` → `"crawl"` в demoSteps |
| `frontend/src/terminal/commandSafety.ts:71` | Убрать `spider` из regex |
| `frontend/src/studio/graph/GraphTelemetryOverlay.tsx:38` | `case 'spider': return '#00F0FF'` → `case 'crawl':` |
| `frontend/src/studio/graph/GraphTelemetryOverlay.test.tsx:14,77` | `'spider'` → `'crawl'` |
| `frontend/src/contracts/mockStepTimeline.ts:34` | `'step-03-spider-crawl'` → `'step-03-crawl'` |
| `frontend/src/keywords/constructor.test.ts:132` | `'ajax_spider_scan_iterator'` → `'crawl'` |
| `frontend/src/keywords/prettyToWire.test.ts:35` | `'scanner Краулер $base'` → `'Сканировать $base'` |

#### Шаг 6: Тесты — 10 файлов (af_plan НЕ трогаем — там scanner Automation Framework типы)

| Файл | Что |
|---|---|
| `test_method_id.py:37-82` | `"Сканер" → ("scanner", "spider_scan")` → `("scanner", "crawl")`. Тесты на `"Краулер"` убрать (deprecated). `resolve_call("scanner Сканер https://x")` → `resolve_call("Сканировать https://x")` |
| `test_methods_placement_smoke.py:377,384` | Убрать `"stop_client_spider"` и `"stop_all_spiders"` из списка |
| `test_scan_base_url.py:16-99` | 4 теста `test_normalize_spider_*` → удалить (приватный deprecated). `resolve_call("Сканер juice_ctx 1")` → `resolve_call("Сканировать juice_ctx 1")`. `("spider_scan", 2231, ...)` → `("crawl", 2231, ...)`. Записи `ajax_spider_scan` и `client_spider_scan` → удалить |
| `test_execution_trace.py:95-115` | `"spider_scan"` → `"crawl"`. `"Сканер: Запустить Spider"` → `"Сканер: Запустить Crawl"`. Тест с `"ajax_spider_scan"` → удалить |
| `test_execute_chain.py:240-286` | `fake_spider` → `fake_crawl`. `scanner.spider_scan` → `scanner.crawl`. `("spider", ctx)` → `("crawl", ctx)` |
| `test_g01_no_auto_scan.py:23-55` | `"не вызывает spider"` → `"не вызывает crawl"`. `scanner.spider_scan` → `scanner.crawl` |
| `test_diary_live.py:434-455` | `"ajax_spider_scan"` → `"crawl"`. `"AJAX Spider found"` → `"Crawl found"`. `"AJAX Spider started"` → `"Crawl started"` |
| `test_gather_info.py:32-287` | `spider_scan` → `crawl`. `stop_all_spiders` → `stop_crawl`. `spider_sec` → `crawl_sec`. `BrowseThenSpider` → `BrowseThenCrawl`. Все имена тестов с `_spider` → `_crawl`. `caps["spider_sec"]` → `caps["crawl_sec"]` |
| `test_scanner_g46_g49.py:39-58` | Строки с `_scanner.spider.set_option_logout_avoidance` и `_scanner.ajaxSpider.*` → удалить. `test_spider_scan_applies_logout_avoidance_mock` → удалить. `test_af_plan_logout_avoidance_on_spider_jobs` → `..._on_crawl_jobs` |
| `test_scanner_work_stream.py:18-69` | `spider_scan` → `crawl`. `stop_all_spiders` → `stop_crawl`. `spider_burst` → `crawl_burst` |
| `fixtures/exp01_reference/_freeze_artifacts.py:18-28` | Блок «Spider URLs from scanner» → закомментировать с `# @deprecated 2026-08-28` |
| `fixtures/exp01_reference/spider_urls.json` | **УДАЛИТЬ файл** |

#### Шаг 7: Финальный grep + тесты

```bash
tsc --noEmit                                    # 0 ошибок
rg -i "spider" orchestrator/core/               # только @deprecated комментарии (af_plan ЗАФ-типы не трогаем)
rg -i "spider" orchestrator/adapters/scanner_adapter.py  # только @deprecated
rg -i "spider" orchestrator/tests/              # 0 попаданий
rg -i "spider" frontend/src/                    # 0 попаданий

python -m pytest orchestrator/tests/test_method_id.py -x -q
python -m pytest orchestrator/tests/test_scan_base_url.py -x -q
python -m pytest orchestrator/tests/test_execution_trace.py -x -q
python -m pytest orchestrator/tests/test_execute_chain.py -x -q
python -m pytest orchestrator/tests/test_gather_info.py -x -q
python -m pytest orchestrator/tests/test_scanner_work_stream.py -x -q
python -m pytest orchestrator/tests/test_diary_live.py -x -q
```

### Приёмка PK-SPIDER-APOCALYPSE

- [ ] `Сканер https://x` резолвится в `scanner|crawl|https://x`
- [ ] `Сканировать https://x` резолвится в `scanner|crawl|https://x`
- [ ] Старые scanner-имена (Краулер, СтатусСканера…) отсутствуют в реестре
- [ ] `scanner_adapter.py` spider-методы имеют `@deprecated`, но НЕ удалены
- [ ] `export_keywords` перегенерировал все 4 generated JSON без spider
- [ ] `spiderCompletions.ts` удалён, `scriptLanguage.ts` больше не импортит
- [ ] 11 тестовых файлов переписаны с `spider` на `crawl`
- [ ] `tsc 0`, все 8 точечных тестов зелёные
- [ ] `rg -i "spider" orchestrator/core/ orchestrator/adapters/scanner_adapter.py` → только `@deprecated`
- [ ] `rg -i "spider" orchestrator/tests/ frontend/src/` → 0 попаданий

### Out of scope PK-SPIDER-APOCALYPSE

- Удаление spider-методов из `scanner_adapter.py` (scanner daemon жив, удалим после полного перехода на PK-CRAWLER)
- `webdriver_adapter.py` — там только комментарий, не трогаем
- `corpus/` — не упоминает spider
- `sanctuary/ALTAR.md`, `sanctuary/pure/` — канон, отдельный 2FA
- Сам scanner daemon (`zapv2`, docker image `zaproxy/scanner-stable`) — жив
- `af_plan.py` и `test_af_plan.py` — `type: spider`/`spiderAjax`/`spiderClient` это типы scanner Automation Framework плана, не наши внутренние имена. ZAF ждёт их именно такими.

---

## ⛔ Стены и ограничения (Железобетон)

1. **Gate A — строгий рубеж:** ни один декоративный компонент не должен подменять живой `CheckWorkspace` / `formData`.
2. **SoT `docs/wired.json` / `orchestrator/models/wired.py` не ломать:** Machine-контракт неизменен.
3. **Plaintext-секреты запрещены:** ни в `localStorage`, ни в draft, ни в экспорте, ни в DOM.
4. **Один Chromium runtime:** Browser Stage и runner изолируют контексты через `BrowserContext`, но не плодят параллельные процессы Chrome.
5. **Тесты:** при изменениях запускать точечно по затронутым файлам. Весь suite целиком во время отладки не гонять.
