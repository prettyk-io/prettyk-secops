# Единый рабочий backlog KDT

> **QUEUE** — не истина. Hub: [`../sanctuary/canon/INDEX.md`](../sanctuary/canon/INDEX.md).  
> Группировка **только по эпикам** (префикс ID). Срез: **16 августа 2026**.  
> Ветки: **`dev` → `main`** (FF по вехам). Feature-тоннель: [`feature-routing-backlog.md`](feature-routing-backlog.md).

---

## Братство и роли

| Роль | Кто | Модель | Зона |
|---|---|---|---|
| **Владелец** | Максим | — | Продуктовая цель, необратимые решения. Ходит к Keeper'у обсуждать «что надо» |
| **Keeper** | Boss (ты) | deepSeek-v4-pro | **PO + CTO + аналитик заказчика.** Сверху обсуждает с Максимом «что надо», переводит в требования, спускает бэклог Boss'у. Снизу — хранитель Святилища: сортирует verified-списки, 2FA, вечерняя инвентаризация. |
| **Boss** | Bro | deepSeek-v4-pro | **Delivery (исполнитель).** Получает бэклог сверху, нарезает карточки, распределяет Flash/Legion, собирает verified-списки → Keeper. «Как» — его, «что» — не его. |
| **Flash** | Flash | deepSeek-v4-flash | **Dev.** Правая рука Boss. Пишет, закрывает карточки. |
| **Buddy** | внешний | deepSeek-v4-pro | **DevOps / VPS / Docker.** Обитает в `C:\cursor-buddy`, не в репозитории. В иерархию продукта не входит. |
| **Legion** | безликие | — | Руки. Получают карточку — делают. В канон не ходят. |

**Поток:** Максим ↔ Keeper (PO/CTO) → бэклог → Boss нарезает → Flash/Legion пилят → Boss собирает verified-список → Keeper сортирует (friend/possible/seeker) → вечерняя инвентаризация с Максимом в Святилище.

**Иерархия, устав, 2FA:** [`../sanctuary/canon-temple/TEMPLE-CORE.md`](../sanctuary/canon-temple/TEMPLE-CORE.md) · [`../sanctuary/canon-temple/CHARTER.md`](../sanctuary/canon-temple/CHARTER.md).

---

## Структура репозитория (14 авг)

```
prettyk-dev/
├─ cosmo/    ← WORKSPACE: vnext фронт (КОД)
├─ orchestrator/            ← БЭКЕНД (solid AF) + tools/*.ps1 (lab_up/lab_clean/sonar…)
├─ services/                ← docker-compose (Grid/Allure/ZAP/Juice/Dojo/Sonar)
├─ reports/                 ← артефакты прогона (allure-results, live, zap-results)
├─ .venv/                   ← python-окружение бэкенда
├─ pure/                    ← CANON BASE доки (MANTRA + ledger)
├─ sanctuary/               ← ВЕРХНЯЯ ПОЛКА: каноны + устав + 2FA
│   ├─ canon-temple/        ← CHARTER + TEMPLE-CORE
│   ├─ canon/               ← hub (INDEX + 27 FRIEND topics)
│   └─ CANON-PURE / TZ-INTEGRATION / 2FA
├─ docs/                    ← SoT + вход агентов (manifest.json, backlog.md, NEW_AGENT_MANDATORY.md…)
├─ legacy/                  ← всё старое (frontend/docs-старые/debug-tools/sandbox…)
└─ .cursor/ .github/        ← агентские правила / CI
```

---

## Карта документов

| Что | Путь |
|---|---|
| Hub FRIEND | [`../sanctuary/canon/INDEX.md`](../sanctuary/canon/INDEX.md) · 2FA на правку |
| Устав / Temple Core | [`../sanctuary/canon-temple/CHARTER.md`](../sanctuary/canon-temple/CHARTER.md) · [`TEMPLE-CORE.md`](TEMPLE-CORE.md) |
| Friend-requests (inbox) | [`../docs/friend-requests/`](../docs/friend-requests/) · `lane: ready` \| `evolve` |
| Canon-requests (inbox) | [`../docs/canon-requests/`](../docs/canon-requests/) · пакеты к 2FA \| evolve-черновики |
| Эпики (паспорта) | [`../legacy/docs/`](../legacy/docs/) · `*-epic.md` |
| As-built | [`../legacy/docs/internal/`](../legacy/docs/internal/) |
| Evidence | [`../legacy/docs/acceptance/`](../legacy/docs/acceptance/) · [`history/`](../legacy/docs/history/) · [`proof_of_concept/`](../legacy/docs/proof_of_concept/) |

---

## Индекс эпиков (порядок очереди)

| # | Эпик | Статус контура | Паспорт / якорь |
|---|---|---|---|
| **INT** | **INTRUDER-PRO — фаззер, режимы Burp (Sniper/Pitchfork/Cluster Bomb) + Grep Match/Extract** | **CLOSED — 17 авг (INT-1…3 ✅)** | § Эпик INTRUDER-PRO ниже · [`friend-requests/INTRUDER-PRO-ADVANCED-ATTACKS.md`](friend-requests/INTRUDER-PRO-ADVANCED-ATTACKS.md) |
| **AUTH-V** | **AUTH-CHAIN-VAULT — мульти-профильная pre-flight авторизация, цепочки токенов и ZAP Replacer injection** | **CLOSED — 17 авг (AUTH-1…3 ✅)** | § Эпик AUTH-CHAIN-VAULT ниже |
| **DOJO-S** | **DEFECTDOJO-AUTO-SYNC — автоматическая синхронизация находок и дедупликация** | **IN PROGRESS (Flash solo)** | § Эпик DEFECTDOJO-AUTO-SYNC ниже |
| **SALV** | **SALVAGE — добор годноты из `to-sanitize` (~3–5%)** | **CLOSED — 17 авг (SALV-1…4 ✅)** | § Эпик SALVAGE ниже · [`friend-requests/SALVAGE-USABLE-CODE.md`](friend-requests/SALVAGE-USABLE-CODE.md) |
| **RET** | **RETENTION & CLEANUP — управление диском и очистка артефактов в Админке** | **CLOSED — 17 авг (RET-API-1/2, RET-UI-1 ✅)** | § Эпик RETENTION ниже · [`friend-requests/RETENTION-AND-CLEANUP.md`](friend-requests/RETENTION-AND-CLEANUP.md) |
| **BLANK** | **BLANK-PREV — честный inline-просмотр акта/бланка ИБ в Результатах + FNV-1a отпечаток** | **CLOSED — 17 авг (BLANK-PREV-1 ✅)** | § Эпик BLANK ниже · [`friend-requests/BLANK-INLINE-PREVIEW.md`](friend-requests/BLANK-INLINE-PREVIEW.md) |
| **MON** | **MONITOR — мульти-монитор + replay + единый playhead + 3-й view** | **CLOSED — 17 авг (MON-1…19 ✅)** | § Эпик MONITOR ниже · [`research/2026-08-15-monitor-rewind.md`](research/2026-08-15-monitor-rewind.md) |
| **MH** | **MONITOR-HUB — хаб монитора: MainPage, кнопки, instance-группировка, space** | **CLOSED — 15 авг** | § Эпик MONITOR-HUB ниже · [`friend-requests/MONITOR-MAINPAGE-AND-SPACE.md`](friend-requests/MONITOR-MAINPAGE-AND-SPACE.md) |
| **MH-FIX** | **MONITOR — починка битых ссылок HomePage → Editor (instance_id → check_id)** | **P0 · NEW — 15 авг** | § Эпик MH-FIX-LINKS ниже · [`../sanctuary/acceptance/2026-08-15-monitor-acceptance.md`](../sanctuary/acceptance/2026-08-15-monitor-acceptance.md) |
| **IMPX** | **Импорт конфигурации между проверками (pages/scenarios/modules)** | **CLOSED — 16 авг** | § Эпик IMPX ниже · [`friend-requests/IMPX-CONFIG-IMPORT.md`](friend-requests/IMPX-CONFIG-IMPORT.md) |
| **RK** | **RJSF-KILL — выпилить RJSF + REGULATION-EDITOR-SPLIT** | **CLOSED — 16 авг (факт кода)** | § Эпик RK ниже · [`friend-requests/RK-RJSF-KILL-SPLIT.md`](friend-requests/RK-RJSF-KILL-SPLIT.md) |
| **PSI** | **Приёмочно-сдаточные испытания** | **ACTIVE** | § Эпик PSI ниже |
| **VN** | **VNEXT фронт (без RJSF)** | **CLOSED** — форма/студия/интеграции откачены к legacy; результаты/админка OK | [`../sanctuary/canon/fe-vnext-architecture.md`](../sanctuary/canon/fe-vnext-architecture.md) · § Эпик VN ниже |
| **CD** | **CORPUS-DISCOVERY — zero-touch корпус из discovery + свой фаззинг-слой** | **CLOSED — 16 авг (CD-1…8 ✅)** | § Эпик CORPUS-DISCOVERY ниже · [`friend-requests/CORPUS-DISCOVERY-ZERO-TOUCH.md`](friend-requests/CORPUS-DISCOVERY-ZERO-TOUCH.md) |
| **0** | **IMP** — OpenAPI / GQL / gRPC / HAR / **CHAIN** | OA…GRPC/HAR/CHAIN MVP + scope smoke; next bank/CANON 2FA | [`../legacy/docs/imp-api-modules-epic.md`](../legacy/docs/imp-api-modules-epic.md) |
| **1** | **ART** — артефакты / retention / cleanup | **1…12 landed** | [`../legacy/docs/artifact-cleanup-epic.md`](../legacy/docs/artifact-cleanup-epic.md) |
| **2** | **AUTH** | lab **10…15 + cookie→ZAP + Studio form/action UI** landed; residual deep SSO | [`../legacy/docs/internal/auth-module.md`](../legacy/docs/internal/auth-module.md) |
| **3** | **CONN** | 10–13 + logs landed | [`../legacy/docs/internal/connectors.md`](../legacy/docs/internal/connectors.md) |
| **4** | **E2E** / **NAV** | lab ripe; SSO open | [`../legacy/docs/e2e-shell-epic.md`](../legacy/docs/e2e-shell-epic.md) · [`nav-check-epic.md`](../legacy/docs/nav-check-epic.md) |
| **5** | **ADM** | KPI/VIS landed | [`../legacy/docs/internal/admin-secops.md`](../legacy/docs/internal/admin-secops.md) |
| **6** | **QG-AF** | lab landed | [`../legacy/docs/qg-af-epic.md`](../legacy/docs/qg-af-epic.md) |
| **7** | **RES** | closed | [`../legacy/docs/results-epic.md`](../legacy/docs/results-epic.md) |
| **8** | **DF** | Phase 2 closed | [`../legacy/docs/dast-fuzzing.md`](../legacy/docs/dast-fuzzing.md) |
| **9** | **FE** | FE-12 P2 | [`../legacy/docs/frontend-spec.md`](../legacy/docs/frontend-spec.md) |
| **10** | **S** / **L** | S-1…3 · L-1…3 **landed** | [`../legacy/docs/acceptance/`](../legacy/docs/acceptance/) |
| **11** | **SONAR** / **QA** / **CANON-CULT** / **DOC-POC** | infra / docs | § ниже |
| **12** | **PAL** (IHSTTYPWNB) — `cosmo-custom` | **PARKED** | [`../legacy/docs/ihsttypwnb-epic.md`](../legacy/docs/ihsttypwnb-epic.md) |

---

## Эпик SALVAGE — добор годноты ботов из `to-sanitize/` (~3–5%)

> **evolve · 15 августа 2026.** Аудит `to-sanitize/` выявил ~3–5% пригодного кода, который боты (Bro/Flash) сгенерили в первом VN, но потом всё снесли. Не остальные 95% дичи — именно эти 4 вещи имеют смысл добрать, когда основной контур устаканится.
> **Принцип:** дособираем после закрытия MONITOR + IMPX + RK. Сейчас — evolve, не active. Завтра обсудим, какие брать в ready.
> **Сорс:** [`../to-sanitize/`](../to-sanitize/) — snapshot первого VN (31 591 файл), [`../docs/investigation-vnext-fuckup.md`](../docs/investigation-vnext-fuckup.md) § «Прямое пригодное».

### Пригодные куски

| ID | Зона | Что | Сорс в `to-sanitize/` | Смысл |
|---|---|---|---|---|
| **SALV-1** | Form config | ✅ `manifest/fields.ts` + `manifest/path.ts` + `ManifestForm.tsx` (251 строка, data-driven). Тест: `fields.test.tsx` (17/17). | `to-sanitize/manifest/fields.ts` · `to-sanitize/manifest/path.ts` | **Рефактор ManifestForm** — вынести логику полей в конфиг, форма станет тоньше и читаемее. |
| **SALV-2** | Validation | ✅ `manifest/validateManifestFields.ts` + `App.tsx` fieldErrors. Тест: `validateManifestFields.test.ts` (14/14). | `to-sanitize/manifest/validateManifestFields.ts` · `to-sanitize/manifest/validateManifestFields.test.ts` | **Валидация перед submit** — санитизация полей, проверка лимитов, обязательность. |
| **SALV-3** | Roles | ✅ `roles/RoleContext.tsx` + `roles/RoleGuard.tsx` — декларативный caps-контекст + HOC для скрытия полей/кнопок по роли. Тест: `src/roles/RoleContext.test.tsx` (3/3). | `to-sanitize/src-hybrid/roles/RoleContext.tsx` · `to-sanitize/src-hybrid/roles/RoleGuard.tsx` | **Декларативное RBAC на фронте** — caps на поля/кнопки вместо хардкода `readOnly`. |
| **SALV-4** | Cosmo ladder | ✅ `integrations/cosmoportLadderMock.ts` — каскад App→Build→Deploy для cosmo-custom (поиск, резолв deployUrl). Тест: `src/integrations/cosmoportLadderMock.test.ts` (4/4). | `to-sanitize/src-hybrid/form/cosmoportLadderMock.ts` · `to-sanitize/src-hybrid/form/CosmoportLadderFields.tsx` | **Integration-скелет** — лесенка сущностей Cosmo, не в коробку. |

### DoD (на evolve, не сейчас)

- SALV-1: `ManifestForm.tsx` < 400 строк, поля читаются из fields-config, `tsc --noEmit` зелёный, форма визуально не меняется.
- SALV-2: `validateManifestFields()` зовётся перед `onChange`, ошибки показываются в форме, `vitest run src/manifest/validateManifestFields.test.ts` зелёный.
- SALV-3: `RoleContext` заменяет `readOnly` в ManifestForm, роли через caps, `tsc --noEmit` зелёный.
- SALV-4: `cosmoportLadderMock.ts` в `cosmo/docs/source/tocompose/` как reference, не в коробку. Лесенка встанет при интеграции PAL.

### Стены

- **Не до RK:** SALV не должен мешать текущим MONITOR + IMPX + RK. Начинаем только после закрытия этих трёх эпиков.
- **SALV-4 — integration, не коробка:** ни одна строка лесенки не идёт в `pure/` или `cosmo/src/` без cosmo-контура.
- **Не тащить остальное:** 95% `to-sanitize/` — мусор (новые формы, снесённые студии, healthcheck-интеграции). Не поддаваться соблазну «а давайте ещё вот это».

---

## Эпик MONITOR — мульти-монитор + replay + единый playhead + 3-й view

> **NEW · 15 августа 2026.** Максим запросил: унифицировать хедер, кнопка «Перейти к результатам» с UX-проработкой, множественный монитор, повторяемость, отмотка, 3-й view (split 50/50), **единый playhead на все view** (ползунок ↔ таймер, скраббинг логов и видео вперёд и назад).
> **СКОУП (15 авг, изоляция):** Monitor изолирован. Пилю только внутренности Monitor — `orchestrator/static/live/index.html` + `orchestrator/utils/live_server.py`. **Кнопки снаружи (MON-2, MON-10) — PARKED** до отдельного подхода; прокинутся из Editor позже. Прошивка Editor ↔ Monitor не трогается в этом эпике.
> Friend-requests: [`friend-requests/MONITOR-HEADER.md`](friend-requests/MONITOR-HEADER.md) · [`friend-requests/MONITOR-INSTANCE-LINK.md`](friend-requests/MONITOR-INSTANCE-LINK.md) · [`friend-requests/MONITOR-INSTANCE-BINDING.md`](friend-requests/MONITOR-INSTANCE-BINDING.md) · [`friend-requests/MONITOR-AUTH-BINDING.md`](friend-requests/MONITOR-AUTH-BINDING.md) · [`friend-requests/MONITOR-RETENTION.md`](friend-requests/MONITOR-RETENTION.md) · [`friend-requests/MONITOR-MULTI-REPLAY.md`](friend-requests/MONITOR-MULTI-REPLAY.md) · [`friend-requests/MONITOR-SPLIT-VIEW.md`](friend-requests/MONITOR-SPLIT-VIEW.md) · [`friend-requests/MONITOR-PLAYHEAD.md`](friend-requests/MONITOR-PLAYHEAD.md).
> Research по отмотке + UX best practice таймлайна: [`research/2026-08-15-monitor-rewind.md`](research/2026-08-15-monitor-rewind.md) §1–4.

### Нарезка (активная, изолированный Monitor)

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **MON-1** | Monitor header | ✅ **`orchestrator/static/live/index.html`**: wordmark (SVG bracket 20×20, «SecOps Lab», measure-bar). | Flash | — |
| **MON-11** | Единый playhead (ядро) | ✅ **`orchestrator/static/live/index.html`**: общий playhead во всю ширину, двусторонняя связь с логом/видео/таймером. | Flash | MON-1 |
| **MON-9** | 3-й view — split 50/50 | ✅ **`orchestrator/static/live/index.html`**: `data-live-view="split"`, видео слева + лог/каретка справа. | Flash | MON-1, MON-11 |
| **MON-3** | Мульти-монитор (архитектура) | ✅ **`orchestrator/utils/live_server.py`**: роутинг `?run_id=` на порту 8767 (`/api/meta`, `/api/diary`, `/api/journal`, `/api/recording`). Тест: `test_diary_live.py` (36/36). | Bro | MON-1 |
| **MON-4** | Replay лога (post-hoc) | ✅ **`orchestrator/utils/run_journal.py`** + **`orchestrator/utils/live_server.py`**: `/api/journal?run_id=…` + восстановление каретки. | Flash | MON-3 |
| **MON-6** | Скраббер лога по времени | ✅ **`orchestrator/static/live/index.html`**: `filterByTime` через playhead. | Flash | MON-4, MON-11 |
| **MON-5** | Replay видео (Selenium Grid chrome-video → MP4) | ✅ **`orchestrator/utils/run_recording.py`**: `find_video_for_run(run_id)` + `serve_video_range_body` с HTTP 206 (Range). Тест: `test_run_recording.py` (8/8). | Bro | MON-3 |
| **MON-7** | Seek видео | ✅ **`orchestrator/static/live/index.html`**: `<video>` MP4 с `currentTime = playhead.currentTime`, скраббинг и Play/Pause. | Flash | MON-5, MON-11 |
| **MON-8** | E2E smoke | ✅ **`orchestrator/tests/test_diary_live.py`**: 36 тестов на роутинг, journal, replay и range streaming. | Bro | MON-11 |

### ACTIVE — инстанс-биндинг + ACL + retention (новые, 15 авг)

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **MON-2** | Кнопка «Мониторинг» в Editor + индикатор | **`EditorViewSegmented.tsx` + `App.tsx`**: segmented-переключатель «Мониторинг» между Редактор/Результаты. `handleOpenMonitor()` → `window.open(LIVE_HOME?run_id=…)`. Серый/зелёный/пульсирующий индикатор (`MonitorState`). **Сделано Bro 15 авг.** | Bro | — |
| **MON-10** | UX Monitor→Results (кнопка в Monitor) | **`index.html`**: отдельная кнопка «Перейти к результатам проверки →» в хедере Monitor. Ведёт на `#/check/<check_id>`. Пульсация при live (уже есть `status-pulse`). См. [`friend-requests/MONITOR-INSTANCE-LINK.md`](friend-requests/MONITOR-INSTANCE-LINK.md). | Flash | MON-2 |
| **MON-12** | Instance-id в хедере Monitor | **`index.html`**: `run_id` / `check_id` из query + meta всегда в хедере (live и replay), компактный `#<id[:8]>` + tooltip. Голый `:8767` без run_id — не показывать чужой meta; либо список своих, либо подсказка. См. [`friend-requests/MONITOR-INSTANCE-BINDING.md`](friend-requests/MONITOR-INSTANCE-BINDING.md). | Flash | MON-10 |
| **MON-13** | ACL Monitor: свой/чужой + bind-токен | **`live_server.py` + `live_pers_acl.py`**: split `may_view_owner` на `admin_appsec`/`admin_abnormal` (admin видят любой, оператор только свой). Bind-токен в URL (`?run_id=…&token=…`) для «свой без логина». См. [`friend-requests/MONITOR-AUTH-BINDING.md`](friend-requests/MONITOR-AUTH-BINDING.md). | Bro | MON-12 | ✅ |
| **MON-14** | Retention: purge on demand + 7-дневный таймер | **`live_server.py` + админка**: on demand purge по `run_id` (NDJSON+видео+sidecar, **не** meta-ledger). Таймер 7 дней — удаление артефактов, meta-ledger бессрочно. История чартов — из meta-ledger, не страдает. См. [`friend-requests/MONITOR-RETENTION.md`](friend-requests/MONITOR-RETENTION.md). | Bro | MON-13 | ✅ |

### ACTIVE — полиш логов и каретки (15 авг, правки по скрину 8)

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **MON-15** | Фаззинг в каретку + PrettyK-формат | **`index.html`**: `updateExecutionRail` принимает kind `ФАЗЗИНГ`/`FUZZ` наравне с `STEP`/`NEXT`. **`controller.py`**: `_diary_leaf_preamble` шлёт `pretty` поле — PrettyK-строка в каретку (`Нажать css "…"`), лог остаётся `WebDriver: Нажать элемент | wire`. **`diary_bus.py`**: `publish` + `pretty`. **`run_journal.py`**: `_as_event` сохраняет `pretty`. Тесты: `test_publish_step_with_pretty`. ✅ **Bro 15 авг.** | Bro | — |
| **MON-16** | DisplayKind: WebDriver / ЛогАтаки бейджи | **`index.html`**: `displayKindBadge(ev)` — для STEP с категорией `WebDriver:` пишет бейдж `WebDriver` вместо `STEP`; LOG с `ЛогАтаки` → бейдж `ЛогАтаки` (цвет ZAP/оранжевый). `displayRowKind(ev)` — CSS-класс строки: `ЛогАтаки` → `.row.ZAP`. Фаззинг → `.row.ФАЗЗИНГ`. Обратная совместимость: старые события без префикса остаются `STEP`. ✅ **Bro 15 авг.** | Bro | MON-15 |
| **MON-17** | Убрать filter-presets ВСЕ/СИГНАЛ/ОШИБКИ | **`index.html`**: удалён `<div class="filter-presets">` из всех трёх панелей (focus/diary/zap). Оставлены только kind-chips (ВСЕ/ZAP/STEP/LOG/ERROR) + search. `createLogPane` больше не читает `presetChipsEl`. ✅ **Bro 15 авг.** | Bro | — |
| **MON-18** | Скраббинг каретки без replayMode gate | **`index.html`**: `rebuildExecutionRailAtTime()` вызывается **всегда** (live и replay), не только в `replayMode`. Убрано 5 мест `if (replayMode) rebuild…`. Каретка перестраивается при перемотке вперёд и назад, не «запоминает последнее состояние». ✅ **Bro 15 авг.** | Bro | — |
| **MON-19** | Зеркало: бэк отдаёт pretty в STEP | **`controller.py`**: `_step_pretty_for_live()` — приоритет description → `wire_to_pretty_line`. **`diary_bus.py`**: `publish(pretty=…)`. **`webdriver_adapter.py`**: `session_diary(pretty=…)`. **`run_journal.py`**: `_as_event` сохраняет `pretty`. ✅ **Bro 15 авг.** | Bro | — |

### Приоритет очереди (изолированный Monitor)

1. **MON-1** (ready) — хедер wordmark, CSS/HTML-полиш. Flash.
2. **MON-11** (evolve) — единый playhead (полоска во всю ширину + таймер + `currentTime`). Ядро. Flash.
3. **MON-9** (evolve) — 3-й view split 50/50 поверх playhead. Flash.
4. **MON-3** (evolve) — `run_id`-роутинг в `live_server.py`. Bro.
5. **MON-4 + MON-6** (evolve) — лог-архив и скраббер по времени. Flash.
6. **MON-5 + MON-7** (evolve) — запись Grid MP4 + video seek. Bro + Flash.
7. **MON-8** (evolve) — E2E smoke внутри Monitor. Bro.
8. **MON-2** (active) — кнопка «Мониторинг» + индикатор в Editor. Bro. ✅ сделано 15 авг.
9. **MON-10** (evolve) — кнопка «Перейти к результатам» в Monitor. Flash.
10. **MON-12** (evolve) — instance-id в хедере + запрет чужого meta. Flash.
11. **MON-13** (evolve) — ACL + bind-токен. Bro.
12. **MON-14** (evolve) — retention: purge on demand + 7 дней. Bro.
13. **MON-15…MON-19** — полиш логов и каретки. Bro. ✅ done 15 авг.

---

## Эпик MONITOR-HUB — хаб монитора: HomePage, кнопки, instance-группировка, space, дропдаун

> **NEW · 15 августа 2026.** Максим: хедерные кнопки Allure/WireK убрать, «Результаты →» (стрелка справа) → на instance проверки. **HomePage монитора** по `http://127.0.0.1:8767/` — динамическая таблица apps с коллапсами. Кнопка «Результаты» ведёт на табу «Результаты» именно того инстанса проверки. Space в мониторе создаётся в момент `start_run`, URL биндится к instance. Новый Run того же instance → новый monitor instance (новое видео/логи). Дропдаун «Все запуски» в хедере — переключение между run_id одного instance. Доступ к чужим запускам — регулировать позднее.
> **HomePage (уточнено 15 авг):** единственная страница (AppInstancesPage — отложено). Таблица apps:
>   - **Динамическая** — рефрешится при новом `run_id` для любого `instance_id`/app (SSE или polling `runs_index.ndjson`).
>   - **Коллапсы:** app-code → внутри N коллапсов deployments (deploy_URLs) → внутри deployment-коллапса лейбл `instance_id` со ссылкой на вкладку **«Регламент»** релевантного instanceId.
>   - **Сортировка:** по дате последнего запуска (свежие выше); вторично — по дате первого запуска (`first_run_ts` = первый запуск пайпа для этого app-code, НЕ создание app-code как сущности).
>   - **Pagination:** 10 строк (app-коллапсов) на страницу.
>   - **Ссылка на app в портале АС Космопорт** — в коллапсе app-code; **заглушка** (без ссылки) до появления hook-интеграции.
> **СКОУП:** интеграция Editor ↔ Monitor, HomePage, instance-биндинг. **Следующий после полиша MON-15…MON-19.** Возможна делегация на Flash.
> Friend-request: [`friend-requests/MONITOR-MAINPAGE-AND-SPACE.md`](friend-requests/MONITOR-MAINPAGE-AND-SPACE.md).

### Нарезка

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **MH-1** | Убрать кнопки Allure и WireK из хедера | **`index.html`**: удалить кнопки «Allure» и «WireK» из хедера Monitor. Оставить только «Мониторинг» и «Результаты». | Flash | — |
| **MH-2** | Кнопка «Результаты →» (стрелка справа) | **`index.html`**: кнопка «Результаты» — стрелка справа (`→` / svg), ведёт на `/#/check/<check_id>?tab=results` того инстанса, где создан данный монитор. `check_id` из `meta.check_id`. | Flash | MON-10 |
| **MH-3** | HomePage монитора: `GET /` → динамическая таблица apps | **`live_server.py` + `index.html`**: по голому `http://127.0.0.1:8767/` (без `run_id`) — HomePage. Таблица из `runs_index.ndjson`, коллапсы: **app-code** (ссылка на портал — заглушка) → **deployments** (N штук по deploy_URL) → **instance_id** (лейбл + ссылка на вкладку «Регламент» релевантного instanceId). **Динамический refresh** (polling 5s). **Pagination 10 строк** (app-коллапсов). **Сортировка:** по `last_run_ts` (свежие выше), вторично по `first_run_ts`. Фильтр/поиск по app-code. | Bro | MH-2 | ✅ |
| **MH-4** | Space: создание Monitor-пространства при start_run | **`lab_run.py`**: в `start_run()` создавать запись в `runs_index.ndjson` с полями `{ instance_id, run_id, app_code, deploy_url, check_id, created_at, owner, first_run_ts }`. `first_run_ts` ставится только если app-code ещё не было (первый запуск пайпа = инициализация app-code). | Bro | MH-3 | ✅ |
| **MH-5** | Новый Run → новый monitor instance | **`live_server.py` + `runs_index.py`**: каждый `start_run` создаёт новую запись (новый `run_id` + своё видео/логи), обновляет `last_run_ts` для app-code. Старые run_id не перезаписываются (upsert не затирает space-поля). | Bro | MH-4 | ✅ |
| **MH-6** | Дропдаун «Все запуски» в хедере live monitor | **`index.html`**: `<select>` / кастомный дропдаун в хедере — список run_id того же `instance_id`. Переключение → `window.location` с новым `run_id`. **Разблокирован: `instance_id` теперь пишется в `runs_index.ndjson` (MH-4/MH-5).** | Flash | MH-3, MH-5 | ✅ |
| **MH-7** | Доступ к чужим запускам (черновик политики) | **ACL-проект**: `filter_runs_for_caller()` в `live_pers_acl.py` — admin_appsec/admin_abnormal видят всё, оператор только свои, без caller — всё (HomePage без логина). Вешается на `/api/runs/apps` + `/api/runs/index` через `X-KDT-User`/Cookie. См. FR §10. | Bro | — | ✅ |
| **MH-8** | E2E smoke: HomePage + дропдаун | **Playwright**: открыть HomePage → таблица apps с коллапсами → раскрыть app → deployment → клик instance_id → монитор/вкладка открылась. Дропдаун в хедере переключает run_id. | Bro | MH-6 | ✅ |

### Приоритет очереди (Bro + Flash)

1. **MH-1** (ready) — убрать Allure/WireK из хедера. **Flash.** Независимо. ✅
2. **MH-2** (ready) — кнопка «Результаты →» со стрелкой справа. **Flash.** (`check_id` из `meta.check_id` уже есть.) ✅
3. **MH-3** (evolve) — HomePage `/` → динамическая таблица apps (коллапсы, pagination, сортировка). **Bro.** ✅ (`/api/runs/apps` + HomePage SPA-режим)
4. **MH-4** (evolve) — Space: запись в `runs_index` при `start_run` (`instance_id`, `app_code`, `deploy_url`, `first_run_ts`). **Bro.** ✅
5. **MH-5** (evolve) — новый Run → новый monitor instance + `last_run_ts`. **Bro.** ✅ (`upsert_run_index` в `runs_index.py`)
6. **MH-6** (done) — дропдаун «Все запуски» в хедере live monitor. **Flash.** ✅ `instance_id` уже в `runs_index.ndjson`; фильтр по нему (fallback на check_id) работает.
7. **MH-7** (evolve, не блокер) — ACL-черновик доступа к чужим запускам. **Bro.** ✅
8. **MH-8** (done) — E2E smoke HomePage + дропдаун. **Bro.** ✅ `e2e/monitor-hub-smoke.spec.ts` — 4 теста зелёные (HomePage рендер, коллапсы app→deploy→instance, pagination, без JS-ошибок).

### DoD эпика
- Хедер без Allure/WireK, кнопка «Результаты →» ведёт на instance проверки.
- `:8767/` — HomePage: динамическая таблица apps с коллапсами (app → deployments → instance_id со ссылкой на «Регламент»), pagination 10, сортировка по дате последнего/первого запуска.
- app-code ссылка на портал — заглушка (без URL до hook-интеграции).
- Новый run → новый monitor instance с отдельным URL, обновление `last_run_ts`.
- Дропдаун «Все запуски» в хедере монитора.
- Политика доступа — черновик, не блокирует.
- AppInstancesPage — **отложено** (подумаем позже).

---

## Эпик MH-FIX-LINKS — навигация HomePage Monitor → стрим (не форма)

> **NEW · 15 августа 2026.** Приёмка Keeper + Максим. Приоритет **P0**.
> Требование сформулировано на стороне заказчика. «Как» — зона Boss'а.

### Что сказал Максим (verbatim, источник истины)

> «на homepage monitor как бы по уму разуму должны быть ссылки на **сам стрим**, а не битые ссылки на форму instance там uuid»

### Наблюдаемое поведение (факт, проверено)

- В списке запусков (HomePage Monitor) у каждой проверки есть лейбл-ссылка.
- Сейчас клик по этой ссылке открывает **форму редактора** этой проверки.

### Желаемое поведение (результат)

Клик по проверке в списке запусков должен открывать **живой стрим этой проверки** (то, что видно при запуске: экран/видео/логи прогона), а не форму редактора.

### Нарезка (Boss — исполнитель)

| ID | Что должно получиться | Приёмочный сценарий |
|---|---|---|
| **MH-FIX-1** | Клик по проверке в списке запусков открывает её живой стрим | **Given:** открыт список запусков, есть хотя бы одна завершённая проверка. **When:** раскрываю проверку и кликаю по её идентификатору. **Then:** открывается живой стрим этой проверки (экран/видео/логи), а не форма редактора. |

### Критерии готовности (DoD — проверяемые факты)

- Клик по проверке в списке ведёт на её стрим, а не на форму редактора.
- Для завершённой проверки открывается её запись (видео/логи), для активной — live-стрим.
- Проверено руками: после клика виден стрим проверки, а не белая/пустая форма.

### Что НЕ делать (out of scope)

- Не трогать кнопку «Результаты →» в шапке стрима — она по замыслу ведёт в результаты проверки, это другая история.
- Не добавлять ссылку на портал Космопорт — это заглушка, интеграция отложена.
- Не менять общий вид списка запусков, порядок, пагинацию — только поведение ссылки.

---

## Эпик IMPX — импорт конфигурации между проверками

> **NEW · 15 августа 2026.** Максим: «объекты в редакторе надо уметь импортить — конфигурацию тестов (страницы/сценарии/модули/фаззеры/ресурсы)». Сейчас есть импорт целого JSON-манифеста (HomePage болванка) и replay check из History, но **нет переноса отдельных блоков из чужой/другой проверки внутрь открытой**.
> **Преднастройки instance (deploy-driven blank) уже реализованы** — `buildManifestFromDeploy` + `ensureDeploy` в админке + select app/deploy на HomePage (`ADM-BLANK-1`, `ADM-DEPLOY-ENSURE`). Не дублировать.
> Стены: не тащить `BankDeploy`/`appCode`/банковские роли в коробку (INTEGRATION). Импорт = перенос конфигурации, не авторинг экземпляра.

### Нарезка (Boss + Flash, 60/40)

> **Правило 60/40 (Максим, 16 авг):** Flash — 60% объёма (визуал, диалоги, тесты), Boss — 40% + ревью и приёмка. Нарезка ниже уже по этому правилу.

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **IMPX-1** | Чтение чужих checks | ✅ `src/checks/checksStore.ts`: `listChecks()` отдаёт все, фильтр владельца снят. История: все проверки видны, replay/открытие работает. | Boss (факт ✅) | — |
| **IMPX-2** | Модель переноса | ✅ `src/studio/studioTransfer.ts` (новый): `extractEditorBlocks` / `mergeEditorBlocks` / `selectBlocks` / `countBlocks`. Тест: `studioTransfer.test.ts` 6/6. | Boss | IMPX-1 |
| **IMPX-3** | Source picker | ✅ `src/studio/StudioImportDialog.tsx` (новый): модалка «Импорт из проверки» — список checks минус текущая, чекбоксы типов, плюрализация блоков, Empty. | Flash | IMPX-2 |
| **IMPX-4** | Кнопка в студии | ✅ `src/studio/StudioWorkspace.tsx`: кнопка «Импорт» в тулбаре (ImportOutlined), класс `.kdt-studio-import-btn` в `styles.css`. Стейт `showImportDialog` в StudioWorkspaceInner. | Flash | IMPX-3 |
| **IMPX-5** | Интеграция (внутри Studio, не App) | ✅ `handleImportBlocks` в StudioWorkspaceInner: `mergeEditorBlocks` → `onFormDataChange` + `onResourceContentsChange`. Dirty-guard через дебаунс. `App.tsx` не тронут. | Flash | IMPX-4 |
| **IMPX-6** | Sanity-тесты | ✅ `StudioImportDialog.test.tsx` 4/4 + `studioTransfer.test.ts` 6/6. `tsc --noEmit` зелёный. | Flash | IMPX-5 |

### DoD эпика
- В студии открытой проверки можно импортировать страницы/сценарии/модули/фаззеры/ресурсы из другой проверки (своей или чужой — все видны).
- Индексы не ломаются, папки сохраняются, дубли не плодятся.
- `tsc --noEmit` зелёный + sanity-тесты зелёные.

---

## Эпик RK — RJSF-KILL: выпилить RJSF + REGULATION-EDITOR-SPLIT

> **NEW · 15 августа 2026.** Выпиливание JSON Schema / RJSF из формы — операция REMOVE, не REPLACE.
> Результаты (ResultsWorkspace) и Админка (ProLayout + Overview + charts) — не трогаем.
> Legacy `form/` + `schema/` = 72 файла — визуальный ориентир «как было».
> Canon-request: [`../docs/canon-requests/REGULATION-EDITOR-SPLIT.md`](../docs/canon-requests/REGULATION-EDITOR-SPLIT.md).
> Investigation: [`../docs/investigation-vnext-fuckup.md`](../docs/investigation-vnext-fuckup.md).
> Pydantic — в ядре, не удаляем. Manifest.json — заменяем на плоский typed JSON.

### Урок предыдущего VN (не допустить повторения)

| Что тогда | Что сейчас |
|---|---|
| «Vyпилить RJSF» → нарезал «заменить форму с нуля» | Явно: **REMOVE, не REPLACE**. Форма, студия, интеграции — остаются визуально идентичными legacy |
| Нарезал VN-FORM-1…5 = новый ManifestForm | Нарезаем RK-REMOVE-* = удаление RJSF-зависимостей, замена render-слоя без изменения UI |
| Нарезал VN-ST-1…10 = новая Studio | Нарезаем RK-STUDIO-* = точечная замена RJSF-конструкторов на прямой маппер внутри существующей Studio |
| Интеграции → healthcheck display only | Интеграции — полные панели как в legacy (Dojo настройки + Allure + коннекторы) |

### Нарезка на двоих

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **RK-REMOVE-1** | Удаление | **schema/ (25 файлов)**: удалить `src/schema/` целиком — все файлы. Удалить npm-зависимости: `@rjsf/core`, `@rjsf/antd`, `@rjsf/validator-ajv8`, `ajv`, `json-schema-merge-allof` — из `package.json`. `npm install`. `tsc --noEmit` — зелёный. | Bro | — |
| **RK-REMOVE-2** | Удаление | **form/ (47 файлов)**: удалить `src/form/` целиком. Временно: form-зависимый код (`LegacyManifestForm`, импорты в `App.tsx`, `StudioWorkspace.tsx`) — закомментировать с `// RK-TODO`. `tsc --noEmit` — зелёный. | Bro | RK-REMOVE-1 |
| **RK-MANIFEST-1** | Типы | **`src/manifest/types.ts`**: плоский typed JSON-контракт из `docs/canon-requests/REGULATION-EDITOR-SPLIT.md` § «Целевой формат». `Regulation`, `EditorPayload`, `AuthModule`, `ConnectorModule`, `ChainModule`, `FuzzerModule`, `DataModule`. `tsc --noEmit` — зелёный. | Flash | — |
| **RK-MANIFEST-2** | Парсер | **`src/manifest/parse.ts`**: `parseManifest(json: unknown): ManifestResult`. Читает `docs/manifest.json` (2729 строк JSON Schema), извлекает поля в плоский typed JSON. Legacy → новый контракт. `vitest run src/manifest/parse.test.ts` — зелёный. | Flash | RK-MANIFEST-1 |
| **RK-FORM-1** | Рендер | **`src/manifest/ManifestForm.tsx`**: прямой маппер из плоского typed JSON. Визуально = legacy форма без RJSF. Секции: Регламент (meta, assessment_purpose, base_url, zap_mode, gate) + Редактор (PrettyK через `EditorWidget`, модули через `ModuleList`). `vitest run src/manifest/ManifestForm.test.tsx` — зелёный. | Flash | RK-MANIFEST-2 |
| **RK-FORM-2** | Виджеты | **`src/manifest/fields.ts`**: `RegulationField` / `EditorField` — прямые замены RJSF-виджетов. `KdtSelectWidget`, `KdtNumberInput`, `KdtTextareaWidget` — но без RJSF, как обычные Ant Design контролы. `vitest run src/manifest/fields.test.tsx` — зелёный. | Flash | RK-FORM-1 |
| **RK-FORM-3** | Импорт/экспорт | **`src/manifest/io.ts`**: `download`, `loadFromFile`, `resetToDefault`. Замена `exportManifest.ts`. `vitest run src/manifest/io.test.ts` — зелёный. | Flash | RK-FORM-1 |
| **RK-STUDIO-1** | Конструкторы | **`src/studio/StudioWorkspace.tsx`**: замена RJSF-конструкторов модулей на прямой маппер. Auth-форма, Chain-форма, Fuzzer-форма — как в legacy, но без RJSF. Канвасы с кодом, кнопки. `vitest run src/studio/StudioWorkspace.test.tsx` — зелёный. | Bro | RK-MANIFEST-1 |
| **RK-STUDIO-2** | Action Hub | **`src/studio/ActionHub.tsx`**: единственный create (как в legacy). Кнопки «Добавить auth», «Добавить цепочку», «Добавить фаззер» — без RJSF. `vitest run src/studio/ActionHub.test.tsx` — зелёный. | Bro | RK-STUDIO-1 |
| **RK-INTEG-1** | Интеграции | **`src/admin/sections/IntegrationsPanel.tsx`**: проверить, что рендерится legacy-версия (Dojo настройки + Allure + коннекторы), не health-only. Если нет — восстановить из `legacy/frontend/src/admin/sections/IntegrationsPanel.tsx`. `tsc --noEmit` — зелёный. | Bro | RK-REMOVE-1 |
| **RK-INTEG-2** | Dojo брендинг | **Verify**: Dojo-панель показывает findings, severity, dedup/FP marking. Если нет — восстановить Dojo-фичи из legacy. `tsc --noEmit` — зелёный. | Bro | RK-INTEG-1 |
| **RK-WIRE-1** | Vite proxy | **`vite.config.ts`**: убедиться, что `/api` проксирует на `http://127.0.0.1:8765` (playground), `/live` на `http://127.0.0.1:8767`. `tsc --noEmit` — зелёный. | Flash | — |
| **RK-SMOKE-1** | E2E | **`e2e/rk-smoke.spec.ts`**: login → home → form (глазами: поля все на месте, submit шлёт JSON) → studio (конструкторы кликабельны, канвасы есть) → admin/integrations (Dojo/Allure панели полные) → results → history. 12+ тестов. `npx playwright test e2e/rk-smoke.spec.ts` — зелёный. | Bro | RK-FORM-1, RK-STUDIO-1, RK-INTEG-1 |
| **RK-CLEAN-1** | Чистка | **`rg` мёртвых RJSF импортов**: после удаления schema/ и form/ — убедиться, что `rg "@rjsf|ajv|json-schema" src/` пуст. Остатки `// RK-TODO` — разобрать. `tsc --noEmit` — зелёный. | Flash | RK-REMOVE-2 |
| **RK-SPLIT-1** | Manifest split | **`docs/regulation.schema.json` + `docs/editor-payload.json`**: замена `docs/manifest.json` (JSON Schema) на два плоских typed JSON. Сгенерировать из парсера (`RK-MANIFEST-2`). Старый `manifest.json` → `legacy/docs/manifest.legacy.json` (reference). | Flash | RK-MANIFEST-2 |

### Стены

- **Не трогаем ResultsWorkspace / ResultsTabs / ResultsJournal** — работает, зона результатов закрыта.
- **Не трогаем AdminLayout / ProLayout / Overview / hooks / RunsPage / G2-чарты** — работает, зона админки закрыта.
- **Не трогаем Monaco / editor / keywords / generated** — Editor работает.
- **Не трогаем shell / auth / roles / theme** — работает.
- **Legacy `form/` и `schema/` — удаляем без восстановления.** Reference остаётся в `legacy/frontend/src/form/` и `legacy/frontend/src/schema/`.
- **Legacy `docs/manifest.json` — сохраняем как reference** (`legacy/docs/manifest.legacy.json`), не удаляем.
- **Pydantic `orchestrator/models/manifest.py` — не трогаем.** Оркестратор получает на вход то же, что и раньше (через парсер).
- **Зона интеграций — полные панели**, не healthcheck-only.

### Инструкция для Bro и Flash

Каждый, прежде чем писать код, обязан ответить в `.cursor/investigation-log/` на три вопроса:

1. **Что делаю:** ID задачи из беклога + один абзац своими словами.
2. **Почему именно так:** ссылка на пункт «Урок предыдущего VN» выше — какое конкретно решение из VN я повторяю / избегаю.
3. **Что НЕ делаю:** три вещи, которые я мог бы сделать, но не делаю, потому что это выходит за DoD задачи.

Формат: `{timestamp}-{agent}-{taskID}.md`.

**Причина:** в прошлом VN Bro/Flash построили новую форму и студию с нуля, потому что «так было нарезано». Больше никаких «так было нарезано» без вопроса «а зачем мы переписываем работающий код?».

> **Модель контуров:** `pure` (коробка) · `integration` (cosmo-custom). Правило: **универсальное → оба контура; pure-only → коробка; portal-only → integration, никогда в pure.** PSI = приёмка + **интеграция коробки** (кастомизация под портал): что юзабельно и там и там — в оба; pure-only — фильтруем в коробку.

| Поток | Кто | Скоуп | Порядок |
|---|---|---|---|
| **Приёмка PSI** | Boss (Bro) | PSI-1…10 + VIS-ACC глазами; verified → Keeper | 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 |
| **Полировка коробки (pure)** | Flash | BRAND-2 wordmark + VIS-D1…D6 | параллельно PSI |
| **Интеграция (cosmo)** | Boss/Flash по PSI-кастомизации | ADM-APPCODE (portal-only), лесенка, роли, blank/deploy | после PSI-кастомизации |

**Стены:** `ADM-APPCODE` / `project_id` / банковские роли — **integration, не коробку**. `THEME-LIGHT` — park до кивка владельца. Legacy `frontend/` `orchestrator/` — reference.

---

## Эпик PSI — Приёмочно-сдаточные испытания

> **NEW · 14 августа 2026.** Живой каркас — Boss и Keeper наполняют совместно.
> Boss даёт verified-факты (что реально работает), Keeper сверяет со Святилищем.

### Каркас (будет наполняться)

| ID | Зона | Что проверяем | Статус | Кто | Verified Keeper |
|---|---|---|---|---|---|
| **PSI-1** | Стенд | `lab_up.ps1` — Grid + allure-light-secops + ZAP demon + Juice. Все контейнеры healthy, порты слушают. | ⬜ | Boss | ⬜ |
| **PSI-2** | Редактор | Vite dev (`cosmo`) — login, Home, Admin, History, Studio create, Results. E2E smoke 17/17 зелёный. | ⬜ | Boss | ⬜ |
| **PSI-3** | Оркестратор | `orchestrator/main.py --manifest … --validate-only` — без ошибок на тестовом манифесте. | ⬜ | Boss | ⬜ |
| **PSI-4** | Прогон | Полный цикл: manifest → Controller.run() → ZAP alerts → allure отчёт → run_summary.json. | ⬜ | Boss | ⬜ |
| **PSI-5** | Dojo | DefectDojo import ZAP XML → findings в UI → dedup → FP marking. | ⬜ | Boss | ⬜ |
| **PSI-6** | Gate | Quality gate: `High` порог → exit code 0/2. Admission filter: min_confidence + waivers. | ⬜ | Boss | ⬜ |
| **PSI-7** | Live | KDT Live idle → прогон → ленты сценария/сканера → журнал. | ⬜ | Boss | ⬜ |
| **PSI-8** | Бандл | `vite build` prod (зелёный, < 2 MB gzip), `package_vps.py` (по команде). | ⬜ | Boss | ⬜ |
| **PSI-9** | Sonar | BE (`prettyk-dev-backend`) — проход по CRITICAL. FE vnext (`prettyk-dev-frontend-vnext`) — проход. | ⬜ | Boss | ⬜ |
| **PSI-10** | Доки | `NEW_AGENT_MANDATORY.md` актуален. MANTRA актуальна. Backlog отражает реальность. | ⬜ | Boss | ⬜ |

**Формат отчёта Boss → Keeper:** `ID: done | evidence: <путь к скриншоту/логу/exit code> | notes: <что замечено>`.
Keeper верифицирует, ставит ✅ в колонке Verified Keeper, идёт к Максиму на инвентаризацию.

---

## Эпик STAND-RELOCATE — бэкенд и стенд в корень (14 авг вечер)

> **Решение владельца (14 авг 19:11):** бэкенд — в корень, рядом с `cosmo/`.
> `legacy/` должен был остаться старьём, а `orchestrator/` + `services/` переехать с новым каноном.
> Пересборка репо сломала операционные скрипты — они висят на старом layout. Босс поднял стенд вручную.

### Факты (сверено 14 авг 19:03)

| Скрипт | Где лежит | `$RepoRoot` сейчас | Что сломано |
|---|---|---|---|
| `lab_up.ps1` | `legacy/orchestrator/tools/` | `legacy/orchestrator` (резолв `..\..`) | `.venv`, `services\`, `orchestrator\tools\run_live_idle.py` — мимо |
| `lab_clean.ps1` | `legacy/orchestrator/tools/` | `legacy/orchestrator` | `reports\`, `services\` — мимо |
| `lab_ensure_ui.ps1` | `.cursor/scripts/` | корень (ок) | `frontend/` + `:5173` + маркеры `@rjsf`/`PrettyKEditorMark` — мёртвые; vnext на `cosmo/` `:5173` |

### Нарезка

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **STAND-REL-1** | Переезд | `orchestrator/` и `services/` из `legacy/` → корень (рядом с `cosmo/`). `legacy/` остаётся без них. `reports/` создаётся в корне при первом прогоне (или переносится, если уже есть данные) | Boss | — |
| **STAND-REL-2** | Самочин | `lab_up.ps1` + `lab_clean.ps1` работают из нового `orchestrator/tools/` без правок (пути `..\..` → корень). Smoke: `.\orchestrator\tools\lab_up.ps1` поднимает Grid+Allure+ZAP+Juice healthy | Boss | REL-1 |
| **STAND-REL-3** | Правка | `lab_ensure_ui.ps1`: vnext на `cosmo/` `:5173`, readiness-маркеры без RJSF (`ManifestForm`/`StudioScreen`/`ResultsWorkspace` из `App.tsx`), playground из `orchestrator/tools/data_playground.py`. Smoke: `lab_ensure_ui.ps1` поднимает и проверяет Editor+playground | Boss | REL-1 |
| **STAND-REL-4** | Docs | `stand-lab-ops.mdc`, `docs/stand.md`, `pure/MANTRA.md` § Структура РУТа — обновить пути на корневые `orchestrator/` + `services/` + `:5173`. Без дублирующих строк в legacy-доках | Boss | REL-2, REL-3 |

**Стены:**
- `legacy/frontend/` остаётся reference — не трогать, не поднимать.
- Редактируем **только** `lab_ensure_ui.ps1` (и его пути). `lab_up/lab_clean` правятся переездом, не ручным патчем.
- Запрещено тащить RJSF/`@rjsf`/`PrettyKEditorMark` маркеры обратно в readiness.
- `lab_clean.ps1 -Target juice` / `allure,live` — поведение не меняется, только пути.

---

## Эпик VN — vnext фронт (без RJSF)

> **ACTIVE · УТВЕРЖДЕНО вне очереди 13 авг 2026.** Манифест — забили, правим свободно под vnext.  
> Архитектура: [`../sanctuary/canon/fe-vnext-architecture.md`](../sanctuary/canon/fe-vnext-architecture.md) (14 решений).  
> **Root кода = `cosmo/`** (монолит: коробка + слоты под интеграцию).

### Нарезка

| Роль | Зона | Кто |
|---|---|---|
| **Boss** | PM/delivery: backlog, композиция, verified-списки → Keeper | Bro |
| **Flash** | Dev: добивка полировки + баги + тесты | Flash |
| **Keeper** | Святилище: приём verified, сортировка friend/possible/seeker, инвентаризация с Максимом | Boss (ты) |

**Сквозное (первый воркер находит):** `theme/` (перенос как есть) + boot vite/vitest.  
**`shell/` (Login/Home/History):** после Editor+формы, одним проходом.

### VN — порядок стройки (P0)

**Фундамент:** `VN-ROOT-1` (Bro) → `VN-ROOT-2` (Flash) → дальше **параллельно**: Bro = Editor, Flash = Форма.

> **Статус 13 авг вечер (Boss):** ROOT-1/2, ED-1…4, FORM-1…5, SHELL-1…5, ST-1…10, WS-1…10, INT-1…6, CTO-1/2/3/5 — **все сданы**. FK-FILTER — закрыт. Playwright e2e полный цикл зелёный. Остаток: Admin, Results, gap analysis.

| ID | Бот | DoD (сдано, когда) | Зависит |
|---|---|---|---|
| **VN-ROOT-1** | Bro | `cosmo/` поднят: vite + vitest + antd5 + Monaco в deps, `src/` каркас (`App.tsx`, `main.tsx`, `index.html`), один smoke vitest зелёный, `npm run dev` стартует | — |
| **VN-ROOT-2** | Flash | `theme/` перенесён как есть из legacy (`tokens.ts`, `catalog.ts`, `ThemeProvider.tsx`), тёмный default, подключается в `App.tsx` | ROOT-1 |
| **VN-ED-1** | Bro | `editor/` создан: `ConstructorWidget.tsx` — самостоятельный компонент, **один** инстанс Monaco (не пересоздаётся), 32 строки дефолта (канон `constructor-30-lines`) | ROOT-1 |
| **VN-ED-2** | Bro | `keywords/` + `generated/` перенесены как есть, доступны Editor | ROOT-1 |
| **VN-ED-3** | Bro | Keyword-раскраска: `prettykSemanticTokens.ts` расширен, monarch-regex (`prettykLanguage.ts`) **не** источник подсветки кейвордов | ED-1, ED-2 | ✅ |
| **VN-ED-4** | Bro | `api/editorValidate.ts` → `api/` — мост к playground `:8765` (`validateConstructorBackend()`). Пингвин (`orchestrator/core/constructor_validate.py`) **не трогаем**, только вызываем | ED-1 | ✅ |
| **VN-FORM-1** | Flash | `manifest/ManifestForm.tsx` — прямой маппер manifest → UI (решение #2), без RJSF | ROOT-1 |
| **VN-FORM-2** | Flash | `validation/validateManifestFields.ts` — карманный валидатор (~30 строк, решение #5) + smoke vitest | FORM-1 |
| **VN-FORM-3** | Flash | Секции/табы (решение #9), data-модули карточками (решение #10), шаги списком + drag (решение #11) | FORM-1 |
| **VN-FORM-4** | Flash | `roles/RoleContext.tsx` + `RoleGuard.tsx` (решение #8) — роли из контекста, **без** мутации JSON Schema | FORM-1 |
| **VN-FORM-5** | Flash | Импорт/экспорт (решение #12) + сохранение `state → JSON.stringify` (решение #7) | FORM-1, FORM-2 |

**Later (после Editor+Формы, одним проходом):** ~~`VN-SHELL-1` (Login/Home/History + `auth.ts`)~~ → **см. секцию VN-SHELL (Flash, active)** · `VN-ADMIN-1` (Admin ProLayout, общее) · `VN-INTEG-1` (слоты интеграции — на cosmo).

### VN-SHELL — Login/Home/History (Flash, 13 авг)

> **DONE (13 авг, Boss проверил).** Shell закрыт целиком: `auth.ts` generic (`operator`/`operator`, без банковских ролей), `LoginPage` (glass, r=6px), `HomePage`/`HistoryPage` (заглушки-карточки), роутинг в `App.tsx` через локальный state. Typecheck 0 ошибок, prod build зелёный, `shell/auth.test.ts` + стык 12/12.
> **Жёсткий сплит (канон `split-canon.md`):** коробка несёт `auth.ts` как **generic-механизм** (один оператор, без банковских ролей), банковские роли (`admin_ib`, `nshr`, `expert_ib`, `@spaceport.cbr.ru`) — **INTEGRATION, не в коробку**.

| ID | DoD (сдано, когда) | Зависит |
|---|---|---|
| **VN-SHELL-1** | `shell/auth.ts` — generic: `AuthUser = 'operator'`, `RoleCaps` берётся из `roles/RoleContext` (механизм), `login()/logout()/readSession()/writeSession()` на sessionStorage. **Без** `admin_ib/nshr/expert_ib`, **без** `@spaceport.cbr.ru`, **без** `verysecure`-списка | — |
| **VN-SHELL-2** | `shell/LoginPage.tsx` — стеклянная панель (канон эстетики), один input логин + пароль, `onSuccess` → в App. Без SSO-кнопки банка | SHELL-1 |
| **VN-SHELL-3** | `shell/HomePage.tsx` — заглушка: карточки «Создать проверку» / «История» (роутинг через локальный state App, не react-router) | SHELL-1 |
| **VN-SHELL-4** | `shell/HistoryPage.tsx` — заглушка списка прогонов (пустой state, «нет прогонов» placeholder) | SHELL-1 |
| **VN-SHELL-5** | `App.tsx` — если `!readSession()` → `LoginPage`, иначе Shell (Home/History/Form). Всё через локальный state, **без** react-router | SHELL-2…4 |

**Стены SHELL:**
- Не тащить `applyRoleFormCaps.ts`, `CosmoportLadderFields*`, `@spaceport.cbr.ru` — это INTEGRATION.
- `verysecure`-пароли и банковские учётки — НЕ в коробку. Generic `operator`/`operator` или одно поле.
- Не добавлять react-router (канон VN: монолит, локальный state).
- `SecOpsMark`, glass/видео-фон — если есть в vnext `theme/`, использовать; иначе CSS-классы `kdt-shell-*` из `styles.css` legacy НЕ тащить вслепую (проверить наличие).

### VN-INT — композиция / интеграция (Boss)

**Стыки Editor↔Форма.** Никто из воркеров не связывает компоненты — каждый пилит изолированно.
Boss проверяет контракты, доводит сборку и соединяет Editor с формой.

| ID | DoD (сдано, когда) | Зависит |
|---|---|---|
| **VN-INT-1** | `npm install` чистый, `npm run typecheck` зелёный (0 ошибок) | ROOT-1, ROOT-2, ED-1/2/4, FORM-1…5 |
| **VN-INT-2** | `ManifestSteps` встраивает Monaco через `ConstructorWidget` (шаг сценария = редактор, не TextArea). Контракт: `ScenarioStep.constructor` ↔ `value`/`onChange` пропсы | ED-1, FORM-3 |
| **VN-INT-3** | `App.tsx` подключает `KeywordsContext.Provider` (catalog + variables + allowedExtraDomains + baseUrl), `setupMonaco()` вызван до рендера | ED-1, ED-2 |
| **VN-INT-4** | Интеграционный smoke-тест: открыть форму → ввести конструктор → сохранить → экспорт → импорт → конструктор тот же | INT-1, INT-2, INT-3 |
| **VN-INT-5** | Пингвин-bridge контракт: /api/validate/constructor на playground `:8765` отрабатывает, FE обрабатывает batch-diagnostics от бэкенда | ED-4, INT-2 |

**Сделано Boss (13 авг, не пересекалось с воркерами):**
- **VN-INT-1 done:** `npm install` чистый, `npm run typecheck` **0 ошибок**, prod build зелёный (`✓ built in 2m 15s`).
- `src/utils/sortStrings.ts` + `src/utils/jsonTypes.ts` — общий клей (`compareLocaleStrings`, `JsonValue`, `isPlainObject`). Закрыл зависимость Editor+Form от `../schema/types` и `../utils/sortStrings` (которых в vnext не было).
- `npm install @monaco-editor/react` — install-дыра закрыта (package.json есть → node_modules нет).
- `src/keywords/keywordsFromManifest.ts` + `.test.ts` — чистый стык `ManifestData → KeywordsContext`-входы (variables/pageIds/allowedExtraDomains/baseUrl). 5/5 зелёный.
- **VN-INT-2 done:** `ManifestSteps.tsx` — `TextArea` заменён на `ConstructorWidget` (Monaco). Каждый шаг сценария — редактор с автокомплитом/диагностикой/подписью.
- **VN-INT-3 done:** `App.tsx` — lifted state, `setupMonaco()` + `KeywordsContext.Provider` с живыми variables из формы. `ManifestForm` адаптирован под controlled-режим (опциональные пропсы).
- **VN-INT-6 (мост контекстов):** `App.tsx` — `useEffect` → `setConstructorContext({catalog, variables, pageIds, formData: state})`. Закрыл дыру: навигация `page.Op`, автокомплит переменных, глобальные `Пусть/Секрет` в `prettykNavigation/scriptLanguage/prettykSignatureHelp` теперь видят форму (раньше `getConstructorContext()` всегда `undefined` в production).

### VN-FIX — правки по typecheck (13 авг)

> **DONE.** Flash ~~VN-FIX-4…7~~ (fields.ts, ManifestForm, ManifestSteps, theme) + Bro **VN-FIX-2/2b/3** — все закрыты. `npm run typecheck` = **0 ошибок** (Boss проверил), `studioModels` остался только в комментариях (живых импортов нет), `prettykSemanticTokens.ts` гарды на месте.

| ID | Бот | Суть | Статус |
|---|---|---|---|
| **VN-FIX-2** | Bro | `prettykNavigation.ts` — импорт `../studio/studioModels` (`ensureStudioModel`) выпилен, локальный хелпер | ✅ |
| **VN-FIX-2b** | Bro | `scriptLanguage.providers.test.ts` — `tabIdFromSuiteModelUri` выпилен, локальный аналог | ✅ |
| **VN-FIX-3** | Bro | `prettykSemanticTokens.ts` — гарды `line`/`word` possibly undefined | ✅ |

### VN-STUDIO — порт studio/ (Bro, 13 авг) ✅

> **Скоуп:** 161 файл legacy `frontend/src/studio/`. Editor уже в vnext — теперь перенести сам «цех»: дерево сценариев, табы, формы модулей, фаззеры.
> **Порядок:** по слоям — снизу вверх (типы → стор → дерево → табы → формы → воркспейс).
> **Стены:** RJSF не тащить. `studioModels` в vnext уже нет (VN-FIX-2). Не тащить `CosmoportLadderFields`, `appCode`, `blankDeploy*`, `BankDeploy` — это INTEGRATION.

| ID | DoD | Зависит |
|---|---|---|
| **VN-ST-1** | `src/studio/studioModels.ts` — типы `StudioTab`, `StudioTabKind`, `StudioNode`, `StudioTabId`. Только модели, без legacy-хвостов (`language: 'prettyk' | 'wirek'`, ок). НЕ `kdt-constructor`/`resource-form`/`fuzzer-form` строки (это legacy) | ED-1 |
| **VN-ST-2** | `src/studio/studioStore.ts` — стейт-машина студии: атомарный `StudioState` (tabs[], activeTabId, treeNodes, expandedIds, naming, dirty). Иммутабельные редьюсеры (`openTab`, `closeTab`, `setActiveTab`, `addNode`, `renameNode`, `deleteNode`, `moveNode`). БЕЗ persist/localStorage (VN-ST-3 отдельно) | ST-1 |
| **VN-ST-3** | `src/storage/draft.ts` — сохранение студийного состояния в localStorage (`kdt.studio.draft`), дебаунс 500ms, восстановление при mount. Honesty: если JSON битый — молча сбрасываем, не крашим | ST-2 |
| **VN-ST-4** | `src/studio/studioTreeLeafClass.ts` — иконки листьев дерева: сценарий (scenario-icon), страница, data-модуль (по moduleType), фаззер (fuzzer-icon), ресурс. Темы dark/light — через CSS-переменные `--kdt-*` из ThemeProvider. БЕЗ `icons8-*.png` (новые иконки — ASCII/SVG inline) | ST-1, ROOT-2 |
| **VN-ST-5** | `src/studio/StudioBlocksTree.tsx` — компонент дерева: Ant Tree, drag-and-drop, inline-rename (через `studioTreeNaming`), контекстное меню (Add Page / Scenario / Module / Folder / Delete). Папки раскрываются/сворачиваются. Клик по листу → openTab | ST-2, ST-4 |
| **VN-ST-6** | `src/studio/studioTreeNaming.ts` — машина inline-переименования: F2 / двойной клик / контекстное меню → поле ввода, Enter/Escape, валидация имени (латиница/цифры/подчёркивание, с буквы). Паттерны имён как в legacy: `scenarioName`, `login_page`, `module_id` | ST-5 |
| **VN-ST-7** | `src/studio/StudioWorkspace.tsx` — корневой компонент студии: слева `StudioBlocksTree`, справа табы Monaco (для сценариев/страниц) или карточки форм (для модулей/фаззеров). Заголовок таба = имя ноды. Крестик закрыть. Ctrl+S → markClean. БЕЗ `IRange`/`IPosition` из Monaco editor namespace (vnext Monaco не экспортирует) | ST-5, ED-1 |
| **VN-ST-8** | `src/studio/moduleForms/` — карточки для `data`, `connector`, `fuzz`, `grpc`, `graphql`, `openapi`, `chain`, `auth` модулей. Каждая — форма на Ant Design (поля как в legacy, без RJSF/ajv). При сохранении → `openTab` с телом модуля в `StudioTab.savedText`. Тело модуля = PrettyK-текст как в legacy `studioTabFromNode` | ST-2 |
| **VN-ST-9** | `src/studio/fuzzer/` — `FuzzerForm`, `fuzzerTargetBodyExpand`, `fuzzerDeferredInputs`. Фаззер = форма + кнопка «Сохранить как модуль». Поля: intent, target, body, headers, deferred-инпуты. БЕЗ `fuzz_pack.json` (генерируется Python, лежит в `generated/`) | ST-8 |
| **VN-ST-10** | SMOKE: typecheck 0 ошибок по `src/studio/`, `src/storage/`. Vitest: `studioStore.test.ts` (create tab → close → reopen с тем же текстом), `studioTreeLeafClass.test.ts` (все moduleType дают непустой className) | ST-1…9 |

### VN-WORKSPACE — checks + app + results + hash-роутинг (Flash, 13 авг) ✅

> **Скоуп:** 102 файла legacy: `checks/` (16) + `app/` (24) + `results/` (62). Это жизненный цикл проверки: создать → наполнить (форма/студия) → запустить → увидеть результат.
> **Ключевая идея:** `checkId` = UUID, `HashRoute = { kind; checkId?; view? }` — хэш-роутинг без react-router.
> **Стены:** не тащить `appCode`/`BankDeploy`/`blankDeploy*` (INTEGRATION). `verysecure`/банковские роли — не в коробку. `react-router` — не добавлять.

| ID | DoD | Зависит |
|---|---|---|
| **VN-WS-1** | `src/checks/types.ts` — `CheckView = 'form' \| 'studio' \| 'results'`. `CheckRecord = { checkId, createdAt, updatedAt, label?, manifest, studioState?, gate?, closedAt? }`. `HashRoute = { kind: 'home' \| 'history' \| 'admin' \| 'check'; checkId?: string; view?: CheckView }`. `parseHashRoute(): HashRoute`, `buildHashRoute(route): string` | — |
| **VN-WS-2** | `src/checks/checksStore.ts` — `Map<checkId, CheckRecord>` в памяти, `createCheck()`, `getCheck(id)`, `updateCheck(id, patch)`, `listChecks()`. БЕЗ remote/live-sync (VN-WS-5 отдельно). БЕЗ `appCode`/`project_id` (INTEGRATION). Vitest: create → update manifest → get → manifest совпадает | WS-1 |
| **VN-WS-3** | `src/checks/closeGuard.ts` — при `window.beforeunload`: если текущий check грязный (manifest !== savedManifest или studioState !== savedStudioState), показать диалог «Есть несохранённые изменения». Проверка через `checkIsDirty(checkId): boolean` | WS-2 |
| **VN-WS-4** | `src/checks/hashRoute.ts` — синхронизация `window.location.hash` ↔ React state. Монтирование: читаем hash → находим check → рендерим. Клик по history/check → `buildHashRoute` → `window.location.hash = ...` → hashchange → обновляем роутер. `hashRoute.test.ts`: parse → build → parse roundtrip | WS-1 |
| **VN-WS-5** | `src/app/appSecurityContext.ts` — `security_configuration`, `allowed_extra_domains`, `base_url_override`, `zap_mode`, `debug_mode` — read-only объект для гейтов и валидации. Провайдер через React Context. Заполняется из `ManifestData.infrastructure` при старте проверки | FORM-1 |
| **VN-WS-6** | `src/app/appValidationFlow.ts` — flow: при открытии check.view='form' → ManifestForm controlled (state из check.manifest, onChange → updateCheck). Кнопка «Валидировать» → `validateConstructorBackend()` батчем по всем конструкторам. Кнопка «В студию» → `setView('studio')`. Зелёный индикатор = все конструкторы валидны (клиент + бэкенд) | WS-2, ED-4, FORM-1 |
| **VN-WS-7** | `src/app/appGotoPage.ts` — CodeLens «Страница <pageId>» в Monaco → `gotoPage(pageId)`: скролл к шагу с `page.<pageId>.Open*`, подсветка строки (decoration). Без `ensureStudioModel` (VN-FIX-2 уже выпилен) | ED-1 |
| **VN-WS-8** | `src/results/` — порт 5 файлов ядра: `types.ts` (LiveMetaSnapshot, ResultsHooksSnapshot), `derivePipelineVerdict.ts` (ZAP counts + Dojo stats → pass/watch/fail), `executiveConclusion.ts` (CI verdict → executive_class + recommendations + top_findings), `buildRunRecordFromLive.ts` (trend points, dojo stats), `ResultsSummaryPanel.tsx` (карточка сводки: severity bars, тренд, вердикт, кластеры топ-находок). Всё остальное (62 файла) — портировать КАК ЕСТЬ, без правок, только адаптировать импорты под vnext | WS-2 |
| **VN-WS-9** | `src/app/App.tsx` refactor: заменить `useState<Screen>` на `HashRoute`. Логика: login → home → check? → form\|studio\|results. `window.addEventListener('hashchange', ...)`. При закрытии чека → home. При выборе из history → `buildHashRoute({kind:'check', checkId, view:'results'})` → читаем runRecord → рендерим ResultsSummaryPanel | WS-4, WS-6, WS-8 |
| **VN-WS-10** | SMOKE: typecheck 0 ошибок по `src/checks/`, `src/app/`, `src/results/`. Vitest: `checksStore.test.ts` (create → update → get), `hashRoute.test.ts` (roundtrip), `closeGuard.test.ts` (грязный → диалог, чистый → нет). Prod build зелёный | WS-1…9 |

### VN-CTO — композиция, ресерч, финальный cutover (Boss, 0.5)

> **0.5 ставки:** не кодю сам — проверяю стыки, ресёрчу что всплывёт, довожу до cutover.

| ID | DoD |
|---|---|
| **VN-CTO-1** | Typecheck + build по всему vnext зелёный после ST-1…10 + WS-1…10 | ✅ |
| **VN-CTO-2** | `vite.config.ts` proxy `/api` → `:8765` | ✅ |
| **VN-CTO-3** | `@ant-design/plots` + `src/admin/evidence/EvidenceCharts.tsx` в vnext | ✅ |
| **VN-CTO-4** | Gap analysis: чего не хватает для cutover → `docs/canon/fe-vnext-architecture.md` §10 | ✅ **DONE** |
| **VN-CTO-5** | Порт 5173, полный цикл: login → form → validate → studio. Playwright e2e зелёный (4.0s) | ✅ DONE |
| **VN-CTO-6** | `docs/backlog.md` cleanup: FK-FILTER + VN-STUDIO + VN-WORKSPACE done; дубли убраны; нарезка VN-ADM + VN-RES добавлена | ✅ **DONE** |

### FK-FILTER — централизованная фильтрация шума DAST ✅ CLOSED 13 авг

> **DONE.** Реестр FP (`fp_registry.json`), min_confidence, registry rules + waivers, `classify_finding()`, alert_filter wiring, gate_policy waivers, `close_old_findings`. Все тесты зелёные. Босс сделал всё сам (без Bro/Flash).

### VN-ADMIN — Admin ProLayout на vnext (Bro, 1.0)

> **Скоуп:** порт Admin shell + Overview + Integrations + DeployRegistry + G2-чарты. Без банковских ролей/appCode (INTEGRATION). Только коробочный read-only admin.
> **Стены:** не тащить `BankDeploy`, `CosmoportLadderFields`, `appCode`/`project_id` фильтр, `applyRoleFormCaps`.

| ID | DoD | Зависит |
|---|---|---|
| **VN-ADM-1** | `src/admin/AdminLayout.tsx` — ProLayout shell (лого, меню: Обзор/Интеграции/Прогоны/Реестр), хедер с «Выйти». Только коробочный shell | ✅ |
| **VN-ADM-2** | `src/admin/OverviewPage.tsx` — порт KPI-карточек из legacy: прогоны, уязвимости по severity, статус стенда. Хуки `useLiveStatus()`, `useDojoStats()` — honesty: API down → «Нет данных» | ✅ |
| **VN-ADM-3** | `src/admin/IntegrationsPage.tsx` — статус ZAP/Dojo/Allure (зелёный/красный индикатор), health-check через `/api/live/...`. Read-only | ✅ |
| **VN-ADM-4** | `src/admin/EvidenceCharts.tsx` — G2-чарты: donut по severity, stacked bar по типам, trend line Allure (уже портировано, дособрать в AdminLayout) | ✅ |
| **VN-ADM-5** | `src/admin/DeployRegistry.tsx` — таблица деплойментов (read-only), `ensureDeploy` hook | ✅ |
|| **VN-ADM-6** | SMOKE: typecheck 0 ошибок по `src/admin/`. `AdminLayout.test.tsx` (4 passed). Prod build зелёный | ✅ |
| **VN-ADM** | VN-ADM 1–6 — **done**. Bro: AdminLayout + OverviewPage + IntegrationsPage + DeployRegistry + RunsPage + adminApi + hooks + EvidenceCharts + EvidencePanel + DojoFindingsTable + PoliciesPanel. Typecheck 0, build 14.7s, vitest 4/4 | ✅ |

### VN-RES — results полный + History живые данные (Flash, 1.0)

> **Скоуп:** порт оставшихся 62 results-файлов (Flash в WS-8 портировал только ядро из 5), хуки к Live API, History с реальными чеками, экспорт.
> **Стены:** не тащить `../form/`, `../schema/`, `../admin/`, `../shell/` — заменить на vnext-аналоги. Без RJSF.

| ID | DoD | Зависит |
|---|---|---|
| **VN-RES-1** | Порт оставшихся results: `ResultsWorkspace` (табы: Сводка/Журнал/Бланки), `ResultsJournalPanel`, `blanks/`, `launchUi/`. Адаптировать импорты под vnext | ✅ |
| **VN-RES-2** | `src/results/resultsHooks.ts` — хуки `useLiveMeta(checkId)`, `useResultsHooks(checkId)`. Запросы к `:8767`. Honesty: 404 → «Нет данных» | ✅ |
| **VN-RES-3** | `src/shell/HistoryPage.tsx` — заменить заглушку на реальный список `listChecks()`. Карточка: label, дата, статус, severity. Клик → `buildHashRoute` | ✅ |
| **VN-RES-4** | `src/results/exportResults.ts` — экспорт JSON + placeholder PDF. Кнопка в ResultsSummaryPanel | ✅ |
| **VN-RES-5** | SMOKE: typecheck 0 ошибок по `src/results/`, `src/shell/`. Vitest: `resultsHooks.test.ts`, `HistoryPage.test.tsx`. Prod build зелёный | ✅ |

### VN-FILL — добивка до production cutover (Boss+Bro+Flash, 2.5)

> **Факт:** ~30% legacy портировано. Хэппи-путь работает. Добиваем P0 архитектурные блокеры + P1 функциональные дыры. Цель: 3 вечера → cutover.

#### VN-FILL-BOSS (0.5) — архитектура + стыки

| ID | DoD | Зависит |
|---|---|---|
| **VN-FB-1** | `src/shell/AppShell.tsx` — обёртка над App: dirty guard (`closeGuard` + `window.onbeforeunload`), `AppErrorBoundary` (crash → «Что-то сломалось»), hashchange listener. Без CommandPalette / ShellAmbientVideo (P2) | ✅ |
| **VN-FB-2** | `src/results/PipelineLaunchButton.tsx` — кнопка «Запустить» в ResultsWorkspace. POST `:8767/api/run/start` с `{checkId, manifest}`. Индикатор: idle → running → done/fail. Honesty: API down → «API недоступен» | ✅ |
| **VN-FB-3** | `src/app/appManifestDownload.ts` — скачать manifest как JSON (кнопка в форме). Расширить `exportResults.ts` — blank JSON + манифест в табе Бланки. Кнопка «Скачать манифест» в хедере чека | ✅ |
| **VN-FB-4** | SMOKE: typecheck 0 по всему vnext. e2e: AppShell guard + pipeline launch + download. `docs/canon/fe-vnext-cutover.md` | ✅ |

#### VN-FILL-BRO (1.0) — Admin досыщение

| ID | DoD | Зависит |
|---|---|---|
| **VN-FBR-1** | `src/admin/EvidencePanel.tsx` — карточки доказательств (pack ID, severity, тип находки, скрин). Запрос к `:8767/api/evidence/list`. Honesty: down → «Нет данных» | ADM-1 |
| **VN-FBR-2** | `src/admin/DojoFindingsTable.tsx` — таблица находок Dojo (severity, title, cwe, status, age). Пагинация. Запрос к `:8767/api/dojo/findings`. Honesty: down → «Нет данных» | ADM-1 |
| **VN-FBR-3** | `src/admin/PoliciesPanel.tsx` — gate-политики read-only карточками: waiver, min_severity, min_confidence, rules. Без редактирования (read-only). Запрос к `:8767/api/gate/policy` | ADM-1 |
| **VN-FBR-4** | SMOKE: typecheck 0 по `src/admin/`. Vitest: `EvidencePanel.test.tsx`, `DojoFindingsTable.test.tsx`, `PoliciesPanel.test.tsx`. Prod build зелёный | FBR-1…3 ✅ |
| **VN-FBR** | VN-FBR 1–4 — **done**. Bro: EvidencePanel + DojoFindingsTable + PoliciesPanel + AdminLayout.test.tsx. Зеленые | ✅ |

#### VN-FILL-FLASH (1.0) — Studio + Results досыщение

| ID | DoD | Зависит |
|---|---|---|
| **VN-FF-1** | `src/studio/moduleForms/FuzzerFormCard.tsx` — прямой маппер фаззера (как ModuleFormCard, без RJSF): intent, target, payload, encode. На основе legacy `FuzzerForm.tsx` но упрощённо. Врезать в `StudioWorkspace` moduleType switch | ST-8 |
| **VN-FF-2** | `src/studio/moduleForms/ChainFormCard.tsx` — прямой маппер цепи: шаги (step → module), order. Упрощённый порт legacy `ChainModuleForm.tsx` | FF-1 |
| **VN-FF-3** | `src/checks/replayCheck.ts` — клонировать check: новый `checkId`, копия `manifest` + `studioState`. Кнопка «Повторить» в HistoryPage на карточке чека | FF-1 |
| **VN-FF-4** | `src/results/resultsActionsBar.tsx` — панель действий: Экспорт JSON, Экспорт PDF (placeholder), Скачать манифест, Повторить. В ResultsWorkspace | RES-1 |
| **VN-FF-5** | SMOKE: typecheck 0 по `src/studio/`, `src/results/`, `src/checks/`. Vitest: `FuzzerFormCard.test.tsx`, `ChainFormCard.test.tsx`, `replayCheck.test.ts`. Prod build зелёный | FF-1…4 ✅ |
| **VN-FF** | VN-FF 1–5 — **done**. Flash: FuzzerFormCard + ChainFormCard + replayCheck + ResultsActionsBar. Typecheck 0, vitest 9/9, build ✓ | ✅ |

### Стены VN-FILL

- Не тащить RJSF / ajv / `schema/` / `form/` — заменены на `manifest/` прямой маппер.
- Не тащить `CosmoportLadderFields` / `applyRoleFormCaps` / банковские роли — INTEGRATION, не коробка.
- Не добавлять CommandPalette / ThemeToggle / ShellAmbientVideo — P2, после cutover.
- Не добавлять Blank HTML акт с лого — сейчас карточка-сводка, отдельная мини-эпика позже.

### VN-CUT — финальный cutover до ручного smoke (Boss+Bro+Flash, 3.0)

> **Цель:** довести vnext до состояния, когда Максим руками проходит полный цикл и не находит стыков. Сверено по коду 14 авг.
> **Факт:** хэппи-путь зелёный (E2E 17/17), но есть 3 P0-стыка и P1/P2-дожимы.

#### VN-CUT-BOSS (0.5) — стыки + ресерч

| ID | DoD | Зависит |
|---|---|---|
| **VN-CUT-B1** | `PipelineLaunchButton` → POST `/api/run/start` через Vite proxy (`:8765`), НЕ хардкод `:8767`. Тело как legacy `postRunStart.ts`: `{manifest, session_name?, resource_contents?, chain_bindings?, owner_user_id?}`. Ответ: `{ok, run_id, pid}` / 409 `alreadyRunning` / `unreachable`. Vitest: url содержит `/api/run/start`, 409 → alreadyRunning | — |
| **VN-CUT-B2** | Фаззер: `setModuleAt` в `StudioScreen` должен писать в `test_suites.fuzzers` по индексу фаззера (сейчас пишет в `test_data_constructor`). Добавить `setFuzzerAt()`. Vitest: обновление фаззера меняет `test_suites.fuzzers[i]`, не трогает модули | B1 |
| **VN-CUT-B3** | `StudioScreen` сохраняет `studioState` в `CheckRecord.studioState` при каждом изменении (через `onManifestChange`-аналог или `updateCheck`). При reopen чека `view='studio'` восстанавливает табы/dirty/expandedIds из `check.studioState` (иначе `initialStudioState`). Vitest: reopen возвращает 2 открытых таба | — |
| **VN-CUT-B4** | `src/api/apiBase.ts` — единый `API_BASE` + `LIVE_BASE` (env-override через `import.meta.env.VITE_API_BASE`). Перевести `adminApi.ts`, `resultsHooks.ts`, `runJournal.ts`, `ResultsSummaryPanel.tsx`, `PipelineLaunchButton.tsx`, `editorValidate.ts` на него. SMOKE: typecheck 0 | B1 |

#### VN-CUT-BRO (1.0) — студия + бланки

| ID | DoD | Зависит |
|---|---|---|
| **VN-CUT-R1** | `StudioScreen`/`StudioWorkspace` — восстановление draft: при mount чека `view='studio'` читать `loadStudioDraft()` и, если `formData` совпадает с manifest, поднять табы + dirty. Иначе чисто. (Связка с B3 — студийный state в CheckRecord) | B3 |
| **VN-CUT-R2** | `ThemeToggle` в `HomePage` header: переключатель dark/light + палитры (через `useThemeMode`). Без CommandPalette. Хранить `kdt.theme`/`kdt.palette` (уже есть в ThemeProvider). Vitest: toggle меняет `dataset.kdtMode` | — |
| **VN-CUT-R3** | `BlankPanel` → полный HTML-акт (аналог legacy blank-engine): шапка (label, checkId, дата, вердикт), таблица severity, список топ-находок, вердикт CI, подпись. Экспорт HTML (download) + печать. БЕЗ лого/brand PNG (P2 отдельно). Vitest: `blankHtml` содержит verdict + severity | — |
| **VN-CUT-R4** | SMOKE: typecheck 0 по `src/studio/`, `src/shell/`, `src/results/`. Vitest: `StudioScreen` restore test, `ThemeToggle` test, `BlankPanel` test. Prod build зелёный | R1…R3 |

#### VN-CUT-FLASH (1.0) — results + admin дожим

| ID | DoD | Зависит |
|---|---|---|
| **VN-CUT-F1** | `ResultsWorkspace` — polling статуса прогона: после «Запустить» (`:8765`/`/api/run/start`) опрашивать `useLiveMeta` по `run_id`, показывать живой статус (idle→running→done/fail), обновлять `ResultsSummaryPanel`. Honesty: down → статус «Нет данных» | B1 |
| **VN-CUT-F2** | `HistoryPage` — бейдж статуса прогона (running/completed/failed) из `useLiveMeta` по `checkId`. Клик карточки → results с живыми данными. Vitest: status-тег по meta | — |
| **VN-CUT-F3** | `AdminLayout` — подключить `ThemeToggle` (из R2) в header, выровнять header Home/Admin единообразно. `DojoFindingsTable` — фильтр по severity + пагинация уже есть, добавить empty-state «Нет находок» | R2 |
| **VN-CUT-F4** | SMOKE: typecheck 0 по `src/results/`, `src/admin/`, `src/shell/`. Vitest: `ResultsWorkspace` status test, `HistoryPage` badge test. E2E `vnext-smoke.spec.ts` остаётся зелёным (17/17) | F1…F3 |

### Стены VN-CUT

- `:8765` (playground run/eval) ≠ `:8767` (Live). Запуск прогона — **только** `:8765` через `/api` proxy. Live-метрики — `:8767`.
- `test_suites.fuzzers` (фаззеры) ≠ `test_suites.test_data_constructor` (модули). Не путать при записи.
- Без RJSF / ajv / react-router / CommandPalette / ShellAmbientVideo.
- Банковские роли / appCode / BankDeploy — INTEGRATION, не сюда.
- Legacy `frontend/`, `orchestrator/`, `services/` — **reference, не трогать**.

### VN-CUT2 — дожим до ручного smoke (Boss+Bro+Flash, 2.5)

> **Факт 14 авг:** всё ядро закрыто (B1–B4, F1–F4, R1/R3, Admin 8 секций, G2-чарты). Остались три дыры, которые всплывут глазами при ручном проходе: **brand пустой** (`public/` нет favicon), **Admin без «Оповещения»**, **PDF — заглушка**. Тесты не пилим (по приказу); гейт — `tsc --noEmit` + `build`.

#### VN-CUT2-BRO (1.0) — Brand / favicon / wordmark (P0 глаза)

| ID | DoD | Зависит |
|---|---|---|
| **VN-CUT2-RB1** | `public/` — скопировать `secops-lab-icon.svg`, `secops-lab-icon.png`, `secops-lab-icon-32.png` из `frontend/public/` как есть (**без пережатия**, канон `explorer-theme-icons`: dark≠light не шарить) | ✅ |
| **VN-CUT2-RB2** | `index.html` — `<link rel="icon" type="image/svg+xml" href="secops-lab-icon.svg?v=20260814a">` + `<link rel="apple-touch-icon" href="secops-lab-icon.png?v=...">` + `<title>SecOps Lab</title>` | ✅ |
| **VN-CUT2-RB3** | Wordmark «SecOps Lab» единый в Login (уже есть) + Home header + Admin header. Проверить, что на всех трёх экранах слово-бренд читается и не плывёт | ✅ |
| **VN-CUT2-RB4** | SMOKE: `tsc --noEmit` 0 + `npm run build` зелёный; favicon виден на вкладке | ✅ |

**Стена:** не тащить PNG-лес `frontend/public/PrettyK/` и `icons/` — только 3 favicon-файла. Не пережимать, не инвертировать.

#### VN-CUT2-FLASH (1.0) — Admin «Оповещения» (generic CRUD)

| ID | DoD | Зависит |
|---|---|---|
| **VN-CUT2-FF1** | `src/admin/notifyRules.ts` — generic: `NotifyRule { id, kind, title, channels: ('gui'\|'email')[], window_days: 7\|30, enabled, created_at }`. `NotifyRuleKind = run_result\|gate_change\|waiver_expiry\|new_evidence\|dojo_drift` (generic смысл). localStorage `kdt.admin.notify_rules.v1`. CRUD: `listNotifyRules/upsertNotifyRule/setNotifyRuleEnabled/deleteNotifyRule` | ✅ |
| **VN-CUT2-FF2** | `src/admin/NotifyPanel.tsx` — секция: список правил (тип/заголовок/окно/каналы/вкл), кнопка «Добавить» → форма, toggle enabled, delete. Empty-state «Нет правил». Honesty: всё localStorage, без live-сигналов | ✅ |
| **VN-CUT2-FF3** | `AdminLayout.tsx` — `AdminSection` + `'notify'`, MENU item «Оповещения» (BellOutlined), render `NotifyPanel` | ✅ |
| **VN-CUT2-FF4** | SMOKE: `tsc --noEmit` 0 по `src/admin/` + `npm run build` зелёный | ✅ |

**Стена:** **не тащить** live-сигналы из `BankDeploy`/`CheckInstance`/`AdminWaiver`/`app_code`/`project_id` — это INTEGRATION (в vnext этих типов нет). Чистый CRUD коробки. Не копипастить `CollectNotifySignalInput` legacy.

#### VN-CUT2-BOSS (0.5) — PDF честный + финальный приём

| ID | DoD |
|---|---|
| **VN-CUT2-BB1** | PDF честно: `exportResults.ts` + `BlankPanel` — вместо заглушки «скоро» отдать **print-to-PDF** (`window.print()` на чистом HTML-акте → браузерный «Сохранить как PDF»). Это честный PDF без тяжёлой либы | ✅ |
| **VN-CUT2-BB2** | Финальный приём: `tsc --noEmit` 0 + `npm run build` по всему vnext после RB+FF. Ручной smoke-чеклист (login → home → admin 9 секций → history → new check → studio → results → экспорт → logout) | ✅ приём (0 ошибок, build 7.53s); ручной smoke — BB3 |
| **VN-CUT2-BB3** | Резерв: что всплывёт по ручному smoke — фиксировать в backlog follow-on (не чинить втихую) |

### VN-POL — полировка + security до ручного smoke ✅ CLOSED 17 авг

> [`friend-requests/VN-POL-STUDIO-LADDER.md`](friend-requests/VN-POL-STUDIO-LADDER.md)

> **Факт 14 авг (сверено по коду):** всё ядро закрыто. Остались две честные дыры до канона:
> **(1) секреты утекают plaintext** — `redactSecrets` в vnext нет; `downloadManifest` + `exportResults` + `storage/draft` пишут пароли/токены как есть (P0 security).
> **(2) WireK preview** — `studioWorkspaceWirePreview` не портирован; в Studio нет переключателя PrettyK↔WireK.
> Порядок: **Flash F1 первым** (базовый `redactSecrets`) → Bro R1/R2 + Flash F2/F3 параллельно.
> Тесты НЕ пилим массово (по приказу); гейт — `tsc --noEmit` + точечный vitest на новые модули.

#### VN-POL-FLASH (1.0) — Redaction + blank letterhead

| ID | DoD | Зависит |
|---|---|---|
| **VN-POL-F1** | `src/form/redactSecrets.ts` + `src/form/redactSecretAssign.ts` — порт legacy **как есть** (без RJSF-хвостов): `isSecretFieldKey`, `redactManifestSecrets`, `redactSecretsForDraft`, `redactSecretAssignmentLines`, `tryRedactSecretAssignmentAt`, `redactManifestForPreview`, константы `REDACT_PLACEHOLDER`/`DRAFT_SECRET_PLACEHOLDER`. Vitest: `redactSecrets.test.ts` (password/token/api_key → `***`, draft → `''`, `Секрет $x = …` → маска RHS) | — |
| **VN-POL-F2** | Подключить redact: `manifestIO.downloadManifest` → `redactManifestSecrets(state)` перед скачиванием; `exportResults.buildResultsDump` → `redactManifestSecrets(manifest)`; `storage/draft.saveStudioDraft` → `redactSecretsForDraft(formData)` (восстановление — placeholder, не plaintext). Vitest: download/export/draft не содержат plaintext | F1 |
| **VN-POL-F3** | `src/results/blankLetterhead.ts` (`defaultBlankOrg`) + `manifestContentHash` (FNV-1a из legacy `blankPayload.ts`). Врезать `manifestContentHash` в подвал `BlankPanel.blankHtml` (`.foot` строка `отпечаток: <hash>`). Vitest: hash стабилен для одинакового payload | F1 |
| **VN-POL-F4** | SMOKE: `tsc --noEmit` 0 по `src/form/`, `src/manifest/`, `src/results/`, `src/storage/` + `npm run build` зелёный | F1…F3 |

#### VN-POL-BRO (1.0) — WireK preview в Studio

| ID | DoD | Зависит |
|---|---|---|
| **VN-POL-R1** | `src/studio/studioWorkspaceWirePreview.ts` — `buildWirePreviewText()` порт legacy: ресурс→`''`, фаззер→`JSON.stringify(fuzzer)`, коннектор→`JSON.stringify(connector)`, иначе `prettyToWire(text)` → `redactSecretAssignmentLines`. Использует существующий `../keywords/prettyToWire` + `../form/redactSecrets` (Flash F1) | F1 |
| **VN-POL-R2** | `StudioWorkspace.tsx` — переключатель «PrettyK ↔ WireK» у Monaco-табов (сценарий/страница); WireK preview — read-only `<pre>` под редактором. Честно: preview не пишется в `formData` (только отображение). Вкладки ресурсов/фаззеров — без переключателя | R1 |
| **VN-POL-R3** | SMOKE: `tsc --noEmit` 0 по `src/studio/`, `src/keywords/` + vitest `studioWorkspaceWirePreview.test.ts` (ресурс/фаззер/коннектор/сценарий→wirek, секреты маскированы) | R1, R2 |

**Стены VN-POL:** не тащить RJSF/`schema`/`formData`. `redactSecrets` — чистая логика, без `exportManifestPayload` legacy (flatten не нужен). WireK preview — display-only, не мутирует state. Legacy `frontend/` — reference.

### VN-ALLURE3 — переключение на Allure3 + per-run отчёты ✅ CLOSED 16 авг

> **Цель (Максим, 16 авг):** переключить всё на Allure3, «окультуривать» его; в instance проверки импортить данные из него, ссылка ведёт на **конкретный запуск**, не на `latest`.

| ID | DoD | Статус |
|---|---|---|
| **AL3-1** | `resolve_allure_service_base()` дефолт engine `3` → `:5051` (не `:5050`); `build_environment_lines` engine дефолт `3` | ✅ |
| **AL3-2** | `allure_project_mode()` дефолт `check` (per-run/per-check, не flat `default`) | ✅ |
| **AL3-3** | `resolve_allure_project_id()` приоритет `KDT_RUN_ID` (hex) → `KDT_CHECK_ID` → `default`. Per-run даёт уникальный отчёт и ссылку на конкретный запуск | ✅ |
| **AL3-4** | Allure3 `main.py`: динамическая раздача `/projects/{pid}/reports/latest/{rest:path}` (per-project статика, path-escape защита) | ✅ |
| **AL3-5** | Фронт fallback `LAB_RESULT_LINKS.allure` + `LAB_HOOK_URLS.allure` + `adminApi`/`defaults` → `:5051` | ✅ |
| **AL3-6** | Тесты (python + vitest): `5050` → `5051`; новый кейс `test_check_mode_prefers_run_id` | ✅ |
| **AL3-7** | SMOKE: `pytest test_allure_report_meta.py test_allure_project.py` + 5 файлов vitest + пересборка `allure3-secops` + `/health` ok + per-project роут отдаёт HTML | ✅ |

**Стены VN-ALLURE3:** `allure-light-secops` (`:5051`, legacy) оставлен живым как запасной контур (не выпиливаем в этом эпике). Канон теперь `allure3-secops` (`:5050`). `docs/manifest.json` не трогаем. `KDT_ALLURE_ENGINE=2` / `KDT_ALLURE_URL` остаются как явный override — дефолт теперь `3`.

### AL3-BRAND — окультуривание Allure3 под PrettyK SecOps Lab (Boss, раздаёт сам) ✅ CLOSED 16 авг

> **Цель (Максим, 16 авг):** Allure3 уже переключён и отдаёт per-run отчёты. Теперь «окультурить» — превратить ванильный отчёт в фирменный под бренд коробки. Владелец: **Boss** — думает башкой, сам нарезает DoD и сам делегирует (Flash/Legion). Трек верхнеуровневый: результат глазами заказчика, не рецепт.

**Результат, который принимает Максим (поведение):**

| ID | Что видит заказчик | Не делаем | Статус |
|---|---|---|---|
| AL3-B1 | Отчёт открывается и выглядит как PrettyK SecOps Lab, а не как дефолтный Allure. Фирменная шапка, единый wordmark, общий с Editor/Admin стиль. | Не плодим второй бренд, не берём дефолтный скин Allure | ✅ (Flash) |
| AL3-B2 | Обзор (Overview) — внятный дашборд: пропущено/упало/сломано, gate, категории, окружение, время. Читается за 5 секунд, не простыня. | Не делаем простыню из всех сырых полей | ✅ (Flash B2a + Bro B2b) |
| AL3-B3 | Тёмная тема — базовая атмосфера. Скругления по UI-канону (5–6px, не раздувать). Тело — читабельный шрифт коробки. | Не раздуваем «мягкость»/radius, не тащим чужие палитры | ✅ (Flash) |
| AL3-B4 | Категории SecOps + русские переменные отчёта — на месте и консистентны. Снаружи (внешний трекер/метрики) ничего не утекает. | Не отдаём аналитику/телеметрию наружу | ✅ (Flash) |
| AL3-B5 | Полный вид отчёта (SPA) остаётся доступен отдельно от обзора — глубокие данные не теряются. Плавающая кнопка «К обзору SecOps Lab» в SPA. | Не выкидываем детальный просмотр ради «красиво» | ✅ (Bro) |

**Out-of-scope (жёстко):** запасной контур `allure-light-secops` не трогаем. Механику per-run/per-check (уже закрыта в VN-ALLURE3) не переоткрываем. Протокол/порты/роуты не меняем — только внешний вид и подача данных, которые уже генерируются.

**DoD эпика:** Максим открывает Allure3-отчёт и видит фирменный, читаемый, тёмный отчёт под бренд коробки — обзор за 5 секунд, детали доступны, ничего наружу не утекает. Boss сам декомпозирует на карточки и сам назначает исполнителей. Closed 16 авг.

---

### AL3-INSTANCE — per-instance + per-app отчёты Allure3 (история вместо per-run) ✅ CLOSED 16 авг

> **Цель (Максим, 16 авг):** сейчас Allure3 пишет отдельный отчёт на каждый запуск (per-run) — прошлые запуски проверки не видны в одном месте, история теряется. Нужно: **один отчёт на проверку (instance)** с историей и перезапусками, и **дашборд по приложению (app)**, объединяющий его deployments/instances. Общий мета-дашборд по всему стенду — **не нужен**. Владелец: **Boss** — нарезает дальше сам.

**Результат, который принимает Максим (поведение):**

| ID | Что видит заказчик | Не делаем |
|---|---|---|
| AL3-I1 | Открыл результаты проверки → вижу **историю этой проверки** (все запуски, «Перезапуски»/«История»), а не свежий запуск без прошлого | Не теряем прошлые запуски при новом run |
| AL3-I2 | Открыл приложение → вижу **агрегат по всем его проверкам/deployments** (app-дашборд) | Не делаем отдельный мета-дашборд по всему стенду |
| AL3-I3 | Группа «Сценарии X» в отчёте **кликабельна** → ведёт на таблицу/список, где она открыта (`full.html`) | Не оставляем группу некликабельным заголовком |

**Out-of-scope (жёстко):** общий мета-дашборд (придумаем в админке портала позже). Брендинг/тёмная тема — отдельный эпик `AL3-BRAND`. Запасной контур `allure-light-secops` не трогаем.

**DoD эпика:** Максим открывает результаты проверки — видит историю запусков этой проверки; открывает app — видит агрегат по приложению; группа в отчёте кликабельна и ведёт на список. Boss декомпозирует и назначает исполнителей сам.

**Решения по точкам неопределённости (Boss, 16 авг):**

1. **История vs свежесть.** Открывается живой отчёт (последний запуск), под ним — колонка «История запусков» (список прошлых, кликабельны). Не список всех запусков вместо свежих результатов.
2. **Ключ инстанса.** `check_id` (= `instance_id` в `runs_index`). `resolve_allure_project_id()` теперь: `KDT_CHECK_ID` > `KDT_RUN_ID`. Новый run пишет results в `project_id = check_id`, Allure3 нативно подхватывает history по `historyId`.
3. **Границы app-агрегата.** `app_code` + `deploy_url` — не смешивать. `list_run_apps()` уже группирует именно так. Prod/stage с одним `app_code` но разными `deploy_url` — раздельные.
4. **Переход VN-ALLURE3 → AL3-INSTANCE.** Перестановка приоритета в `resolve_allure_project_id()` (не новый режим). Старые per-run проекты не чистим, не ретроктивно не сливаем.
5. **Кликабельность группы.** Группа кликабельна только при X > 1 сценария. Одиночный = заголовок без ссылки.
6. **Источник app-дашборда.** `runs_index` → `list_run_apps()` (тот же ledger, что HomePage монитора). App-дашборд — агрегат Allure-отчётов; монитор — стримы/состояния. Не дублируем, не расходимся.

**Нарезка (Bro 40% / Flash 60%):**

| ID | Зона | DoD | Кто |
|---|---|---|---|
| **AL3-I1a** | Приоритет project_id | **`orchestrator/utils/allure_project.py`**: `resolve_allure_project_id()` — `KDT_CHECK_ID` > `KDT_RUN_ID`. Новый дефолт: проект = `check_id`, не `run_id`. `KDT_ALLURE_PROJECT_ID` override остаётся первым. | Bro |
| **AL3-I1b** | Allure history (backend) | **`orchestrator/utils/allure_report_meta.py`**: `build_executor_payload()` — `buildName = check_id` (стабильный). `env["KDT_CHECK_ID"]` уже пишется. Несколько запусков → несколько `executor.json` в разных прогонах одного проекта — Allure3 читает `historyId`/`historyDataPoints` автоматом из `generators.js`. Генерация отчёта зовёт `generate_report(project_id=check_id)` (уже: `trigger_allure_report()` → `?project_id=…`). | Bro |
| **AL3-I1c** | Instance-обзор (front) | **`services/allure3-secops/…/generators.js` + `secops-overview.js`**: в `index.html` — под заголовком секция «История запусков» (хронологический список прошлых прогонов, url → `full.html`). Лейбл: дата + статус + количество сценариев. Без дублирования SPA. | Flash |
| **AL3-I2a** | App-дашборд endpoint | **`services/allure3-secops/app/main.py`**: новый роут `/app/{app_code}/` → статический HTML-дашборд из `app_dashboard.py`. Данные — через shared volume с `runs_index` (тот же ledger, что HomePage монитора). | Bro |
| **AL3-I2b** | App-дашборд HTML/CSS | **`services/allure3-secops/…/secops-overview-app.js` + `.css`**: карточки deploy → instances (pass/fail/broken/skip), ссылки на `/projects/{check_id}/reports/latest/`. Стиль: SecOps Lab, 5–6px, тёмная тема. | Flash |
| **AL3-I2c** | App-daшборд wiring | **`services/allure3-secops/app/app_dashboard.py` + `services/docker-compose.yml`**: автономная группировка `list_run_apps()` из `runs_index` (без зависимостей от orchestrator). Volume `../reports/live:/app/runs-index:ro`. Роут `/apps` — все приложения. | Bro |
| **AL3-I3** | Кликабельная группа | **`services/allure3-secops/…/secops-overview.js`**: в `renderCategories()` — группы из `suites.json` / `tree.json`. `<a href="full.html#suites/…">` если count > 1, иначе `<span>`. Дефолтный Allure3 уже группирует тесты по `suite`/`parentSuite` — только добавить ссылочность. | Flash |

**DoD карточек:** AL3-I1a → `pytest test_allure_project.py -k "instance_prefers_check_id"` зелёный. AL3-I1c → в `index.html` видна панель «История». AL3-I2 → `/app/juice-shop/` открывается дашборд. AL3-I3 → группа из 3 сценариев — ссылка на `full.html`. Docker compose rebuild + `/health` ok.

**Статус (16 авг):** ✅ CLOSED — все карточки сданы (Bro I1a/I1b/I2a/I2c + Flash I1c/I2b/I3). Health ok, /apps отдаёт дашборд.

**Файлы:** `allure_project.py` · `app_dashboard.py` (new) · `main.py` · `generators.js` · `secops-overview.js` · `secops-overview.css` · `secops-overview-app.js` (new) · `docker-compose.yml` · `test_allure_project.py`

**Стены:** VN-ALLURE3 не переоткрываем (per-run продолжает работать, `KDT_RUN_ID` — fallback если нет `check_id`). `allure-light-secops` / `:5051` не трогаем. Брендинг / тёмная тема — AL3-BRAND, здесь не миксовать. Старые per-run проекты в `/app/default-reports/` не чистим.

---

### FLASH-Q — направления для раздачи (Boss решает, что реально взять)

> **Цель (Максим, 16 авг):** Flash не должен сидеть без дела. Это не готовый эпик, а верхнеуровневые направления из живой очереди — Boss сам решает, что из этого реально нужно сейчас и кому отдать. Ничего не нарезаю вслепую, чтобы не продублировать уже розданное.

| Направление | Суть (что должен получить заказчик) | Приоритет |
|---|---|---|
| Monitor rewind | В ленте прогона можно отмотать назад/вперёд по таймлайну, синхронно лог и видео. Единый ползунок на все виды. | evolve, брать когда Boss скажет |
| Monitor split | Просмотр двух блоков рядом (например лог+видео) с общим временем — удобно сравнивать. | evolve |
| Report/retention UI | Управление временем жизни артефактов из админки: что хранить вечно, что чистится, ручная чистка. | evolve |
| Results blanks | Inline-превью бланка прямо в результатах, без скачивания наружу. | evolve |

**Правило для Boss:** сам проверяет, что Flash свободен, сам выбирает из очереди, сам ставит DoD по GWT и сам принимает. Keeper/Mаксим принимают итоговое поведение — не «карточки закрыты».

### Стены VN (жёстко)

- Legacy `frontend/`, `orchestrator/`, `services/` — **reference, не трогать**.
- `docs/manifest.json` — **забили, правим свободно** (порядок патча: `development.md`); удалённые поля обратно не тащим.
- `docs/canon/**` — без 2FA не писать.
- RJSF / ajv / `schema/` (22 файла) / `formData` — **не мигрирует**.
- Не экстрактить `@kdt/core|ui|editor` пакеты. Сначала монолит.
- Не менять Monaco на CodeMirror. Не добавлять react-router.

### Открытые 2FA (Boss, до кода канона)

| ID | Статус | Суть |
|---|---|---|
| **VN-2FA-1** | **closed** | root = `cosmo/` → `fe-vnext-architecture.md` §2 |
| **VN-2FA-2** | **closed** | манифест = runtime-контракт, патчится по приказу → §5 + `manifest-sot.md` + `schema-sot.mdc` |

---

## Эпик CORPUS-DISCOVERY — zero-touch корпус из discovery + свой фаззинг-слой (Burp-killer)

> **NEW · 16 августа 2026.** Максим: «нарезка корпусов из discovery». Коробка одной кнопкой: URL → grab network → spider cluster search → extract → process corpus → form list → activeScan → passiveScan → repeat? → report. **0 actions юзером** (не ввёл ни одного локатора), но куча потенциальных уязвимостей.
> **Идея:** после discovery (spider/passive) весь сырой трафик прогнать через процессинг DOM + Network-начинки → из «фарша» выделить локаторы/параметры → эвристически «пробудить» запросы (click → слушать afterclick network) → накидать в context корпус (200 или эвристические) → activeScan уже профаззит это дерьмо.
> **Стены:** ZAP = discovery + passive + опциональный activeScan. Свой фаззинг (payloads/мутации) — не зависит от ZAP. Webswing ZAP → legacy, выпиливаем когда свой фаззинг закроет ручной тык. Не пишем свой spider/activeScan с нуля (ZAP закрывает бесплатно). Не тащим RJSF/JSON Schema.

### Нарезка (фазы — сверху вниз по потоку данных)

| ID | Зона | DoD | Кто | Зависит |
|---|---|---|---|---|
| **CD-1** | DOM + Network граб | ✅ **`corpus/discovery_capture.py`** — `DiscoveryCorpus` (pages + network), `capture_current()` (DOM + ZAP History), NDJSON serialize. Тест: `tests/test_discovery_capture.py` 12/12. | Boss | — |
| **CD-2** | Парсер корпуса: extract параметры/инпуты | ✅ **`corpus/corpus_parser.py`** — `extract_form_fields()` (bs4 → FormField), `entry_to_template()` (NetworkEntry → RequestTemplate), `parse_corpus()`. Тест: `tests/test_corpus_parser.py` 10/10. | Boss | CD-1 |
| **CD-3** | Маппинг сервисов (endpoint → страница → инпут) | ✅ **`corpus/service_map.py`** — `ServiceMap` (endpoints + edges + bindings), `build_service_map()` (form_action, param name, origin fallback). Тест: `tests/test_service_map.py` 7/7. | Bro | CD-2 |
| **CD-4** | Эвристическое пробуждение (click → afterclick network) | ✅ **`corpus/awaken.py`** — `awaken_candidates()` (orphan detection, type heuristics, same-origin fallback). Тест: `tests/test_awaken.py` 6/6. | Flash | CD-3 |
| **CD-5** | Контекст ZAP: накидать корпус | ✅ **`corpus/zap_context.py`** — `build_zap_raw_request()` (HTTP/1.1 wire), `inject_corpus_into_zap()` (context include + Sites Tree requests). Тест: `tests/test_zap_context.py` 3/3. | Bro | CD-4 |
| **CD-6** | activeScan → passiveScan конвейер | ✅ **`corpus/pipeline.py`** — `run_discovery_pipeline()` (capture → parse → map → inject → active_scan), ActionFactory registration. Тест: `tests/test_pipeline.py` 1/1. | Bro | CD-5 |
| **CD-7** | Свой фаззинг-слой (payloads/мутации) | ✅ **`corpus/fuzzer.py`** — `CorpusFuzzer` (50+ payloads, multi-position §payload§, sniper mode, clean Python). Тест: `tests/test_fuzzer.py` 12/12. | Flash | CD-6 |
| **CD-8** | Интеграция: replay → gate → report | ✅ **`corpus/fuzz_reporter.py` + `admission_filter.py`** — `FuzzAnomaly` → Findings, `admit_fuzz_findings()`, Allure3 categories & summary. Тест: `tests/test_fuzz_reporter.py` 17/17. | Flash | CD-7 |
| **CD-9** | Ручной фаззинг в Editor (Burp-killer) | ✅ **CLOSED — 17 авг (CD-9a + CD-9b).** `studioFuzzEngine.ts` + `StudioFuzzPanel.tsx`. Эволюционировал в INTRUDER-PRO (pitchfork/cluster-bomb). [`friend-requests/INTRUDER-PRO-ADVANCED-ATTACKS.md`](friend-requests/INTRUDER-PRO-ADVANCED-ATTACKS.md). | Bro | CD-7 |

### Приоритет / фазы

1. **CD-1…CD-3** (discovery → extract → map) — фундамент. Boss + Bro.
2. **CD-4…CD-6** (awaken → context → конвейер) — суть zero-touch. Boss + Bro.
3. **CD-7…CD-8** (свой фаззинг + report) — отвязать от ZAP. Bro + Flash.
4. **CD-9** (ручной фаззинг в Editor) — Burp-killer, отдельно, эволюция.

### DoD эпика (верхнеуровнево)

- Одна кнопка → полный цикл: URL → grab → spider → extract → corpus → context → activeScan → passiveScan → report.
- 0 ручных локаторов юзером.
- Свой фаззинг не зависит от ZAP (только context анализирует passiveScan).
- Webswing ZAP → legacy (не нужен для ручного тыка, когда CD-9 закрыт).

### Горизонт (research, не сейчас)

- **Intruder pitchfork/cluster-bomb** — продвинутая мультипозиционность поверх CD-7. ✅ **CLOSED — 17 авг (INTRUDER-PRO)**. TS движок (`buildAttackRequests`, `computeTotalRequests`, `ATTACK_MODES`, `PAYLOAD_PRESETS`) — Flash; Python `CorpusFuzzer` (pitchfork/cluster_bomb/battering_ram) — Bro (18 тестов PY, 19 тестов TS). См. строку в § C ниже.

---

## Сырое / evolve (шапка QUEUE — не CANON)

> Hub не трогаем без 2FA (rule [`docs-canon.mdc`](../../.opencode/rules/docs-canon.mdc)).  
> Сортировка **по приоритету приёма**: A ready → B landed hub (архив) → C evolve → D evidence/park.  
> Тезисы/as-built сейф: [`history/2026-08-12-prep-dig-vault.md`](history/2026-08-12-prep-dig-vault.md).  
> PM park: [`history/2026-08-12-parked-pm-core-dev-light.md`](history/2026-08-12-parked-pm-core-dev-light.md) · Core Dev лайт — не перехватывать.

### A · Friend ready → обитель (вечерний 2FA)

| ID / тема | Одна строка | Inbox |
|---|---|---|
| **secops-lab-harness** | **важный FRIEND (не hub):** экшены Editor/Instance/Admin + local CDP; pure=канон без ИИ | [`friend-requests/…secops-lab-harness`](friend-requests/2026-08-12-secops-lab-harness.md) · [`profiles/secops-lab-harness`](profiles/secops-lab-harness.md) |
| **CORPUS-DISCOVERY** | **Zero-touch корпус + собственный фаззинг** (CD-1…8 As-Built, 56 тестов) | [`friend-requests/CORPUS-DISCOVERY-ZERO-TOUCH.md`](friend-requests/CORPUS-DISCOVERY-ZERO-TOUCH.md) |
| **Admin≠History** | программа vs личный реестр | [`friend-requests/…admin-ledger`](friend-requests/2026-08-12-admin-ledger-vs-history.md) · acc 42/45 |
| **Dojo обитатель Admin** | API charts + honesty · полировка admin-integrations | [`friend-requests/…admin-dojo`](friend-requests/2026-08-12-admin-dojo-inhabitant.md) · [thesis](history/2026-08-12-admin-dojo-2fa-thesis.md) |
| **Dojo full** | findings списком + verified/false_p + drift · **Boss** (не Bro P0) | [`friend-requests/…admin-dojo-full`](friend-requests/2026-08-12-admin-dojo-full.md) |
| **Коробка ‖ portal pack** | ready | `secops-lab-pure`=коробка · `cosmo-custom`=встройка в Cosmo (ЦБ) | [`profiles/`](profiles/README.md) · [FR](friend-requests/2026-08-12-product-forks-dual-rail.md) · [CR](canon-requests/2026-08-12-product-forks-dual-rail.md) |
| **replay≠new check** | History ▶ + vs prev | [`friend-requests/…replay`](friend-requests/2026-08-12-replay-vs-new-check.md) · acc 48 |
| **СборИнформации** | BrowseThenSpider / ZapWorkStream | [`friend-requests/…gather`](friend-requests/2026-08-12-gather-info-zapstream.md) · acc 56 |
| **Monitor header** | wordmark `margin-left: 6px` + bracket 20×20 в `static/live/index.html` | [`friend-requests/MONITOR-HEADER.md`](friend-requests/MONITOR-HEADER.md) |
| **Лист тезисов 2FA** | скоп A · hub не писать до go | [`history/2026-08-12-prep-2fa-thesis-list.md`](history/2026-08-12-prep-2fa-thesis-list.md) |

Observed-feed major уже в hub `dast-wave` — в лист только при copy-дыре.

### B · Уже в canon hub (не очередь)

| ID / тема | FRIEND / якорь |
|---|---|
| Цепь · API-модули · AUTH · CONN thin · hold/secrets | [`canon/INDEX`](canon/INDEX.md) |
| dast-wave корпус + observed | [`canon/dast-wave`](canon/dast-wave.md) · acc 39/43 |
| discovery-heal HEAL + DISC-LABEL | [`canon/discovery-heal`](canon/discovery-heal.md) · acc 47/52/54/55 |
| CANON-CULT-1…5 | closed 11 авг · § ниже |

### C · Evolve / later (не жать сегодня)

| ID / тема | Одна строка | Inbox |
|---|---|---|
| **SALV-1 fields+path** | **evolve** · декларативный конфиг полей формы вместо 650 строк хардкода ManifestForm.tsx | [`to-sanitize/manifest/fields.ts`](../to-sanitize/manifest/fields.ts) · [`to-sanitize/manifest/path.ts`](../to-sanitize/manifest/path.ts) · § Эпик SALVAGE |
| **SALV-2 validation** | **evolve** · ручная валидация по typed-контракту (сейчас форма валидацию не делает) | [`to-sanitize/manifest/validateManifestFields.ts`](../to-sanitize/manifest/validateManifestFields.ts) · § Эпик SALVAGE |
| **SALV-3 RoleContext+Guard** | **evolve** · декларативный caps-контекст + HOC для ролей (вместо хардкода readOnly) | [`to-sanitize/src-hybrid/roles/RoleContext.tsx`](../to-sanitize/src-hybrid/roles/RoleContext.tsx) · [`to-sanitize/src-hybrid/roles/RoleGuard.tsx`](../to-sanitize/src-hybrid/roles/RoleGuard.tsx) · § Эпик SALVAGE |
| **SALV-4 cosmoportLadder** | **evolve** · каскад App→Build→Deploy для cosmo-custom (интеграция, не коробка) | [`to-sanitize/src-hybrid/form/cosmoportLadderMock.ts`](../to-sanitize/src-hybrid/form/cosmoportLadderMock.ts) · § Эпик SALVAGE |
| **HAR≠Цепь / replace-map** | секции FRIEND Цепь | [`friend-requests/…har-vs-chain`](friend-requests/2026-08-11-har-vs-chain.md) · [replace-map](friend-requests/2026-08-11-chain-replace-map.md) |
| **observed≠guess deepen** | guess/Цепь later; observed в hub | [`friend-requests/…observed-vs-guess`](friend-requests/2026-08-12-observed-vs-guess-holes.md) |
| **Param Miner guess** | стена runtime | [`friend-requests/…param-miner`](friend-requests/2026-08-12-param-miner-guess.md) |
| **Intruder pitchfork/cluster-bomb** | **CLOSED — 17 авг (INTRUDER-PRO)** · продвинутые мульти-позиционные атаки: TS `buildAttackRequests` (Flash) + Python `CorpusFuzzer` pitchfork/cluster_bomb/battering_ram (Bro). 18 PY + 19 TS тестов зелёные. Глубокий пентест-слой поверх CORPUS-DISCOVERY | § Эпик CORPUS-DISCOVERY ниже |
| **Live caller lab** | X-KDT-User → session | [`friend-requests/…live-caller`](friend-requests/2026-08-12-live-caller-lab.md) |
| **Monitor multi+replay** | эволюция: мульти-порт/run_id, архив лога, запись видео, скраббер | [`friend-requests/MONITOR-MULTI-REPLAY.md`](friend-requests/MONITOR-MULTI-REPLAY.md) |
| **Monitor split 50/50** | 3-й view: два блока (playhead общий — MONITOR-PLAYHEAD) | [`friend-requests/MONITOR-SPLIT-VIEW.md`](friend-requests/MONITOR-SPLIT-VIEW.md) |
| **Monitor playhead** | единый playhead на все view: ползунок ↔ таймер, скраббинг лога+видео вперёд/назад | [`friend-requests/MONITOR-PLAYHEAD.md`](friend-requests/MONITOR-PLAYHEAD.md) · [research §1–4](research/2026-08-15-monitor-rewind.md) |
| **Monitor → Results UX** | evolve: кнопка отдельно, не таб; пульсация при live; макет → утверждение | [`friend-requests/MONITOR-INSTANCE-LINK.md`](friend-requests/MONITOR-INSTANCE-LINK.md) |
| **Monitor instance-binding** | evolve: свой экран на run_id; instance-id в хедере; запрет чужого meta | [`friend-requests/MONITOR-INSTANCE-BINDING.md`](friend-requests/MONITOR-INSTANCE-BINDING.md) |
| **Monitor auth-binding** | evolve: bind-токен «свой без логина»; admin/abnormal — любой; оператор — свой | [`friend-requests/MONITOR-AUTH-BINDING.md`](friend-requests/MONITOR-AUTH-BINDING.md) |
| **Monitor retention** | evolve: purge on demand + таймер 7 дней; meta-ledger бессрочно | [`friend-requests/MONITOR-RETENTION.md`](friend-requests/MONITOR-RETENTION.md) |
| **cosmo-custom ladder** | evolve · лесенка портала Cosmo → коробка; mock landed | [`profiles/cosmo-custom`](profiles/cosmo-custom.md) · [FR](friend-requests/2026-08-12-cosmoport-app-deploy-ladder.md) |
| **Admin blank + deploy init** | evolve · **будет КАНОН** · expert болванка ≠ JSON; import только admin_ib; deploy ensure по appcode | [FR](friend-requests/2026-08-12-admin-blank-deploy-init.md) · [Bro cut](history/2026-08-12-bro-admin-wave-cut.md) |
| **PAL** (`cosmo-custom` приятель) | **PARKED** · не FRIEND hub; portal dig ≠ harness | [FR](friend-requests/2026-08-12-pal-cosmo-custom.md) · § PAL ниже |
| **FE roles Cosmo lab** | **landed (code)** | nshr / admin_ib / expert_ib · mute Admin+emergency+pre_release+act | [cut](history/2026-08-12-roles-cosmoport-2bot-cut.md) · [profile](profiles/cosmo-custom.md) |
| **Bank hub → их Selenoid** | evolve | не тащить свой Chrome; env URL switch + later caps `selenoid\|grid` · bringup §5.1 |
| **ADM-VIS bank wow** | **landed (code)** | VIS-1…5 code · hand/tour eyes · [cut](history/2026-08-12-adm-dojo-vis-2bot-cut.md) · [research](research/2026-08-12-admin-bank-visual-research.md) |
| **ADM-VIS assortment** | ref | витрины V1–V6 · [assortment](research/2026-08-12-admin-visual-assortment.md) |
| **SecOps Lab brand/icon** | **plan** | F1+wordmark+VIS приёмка · [delivery](research/2026-08-12-secops-lab-brand-delivery-plan.md) · § ADM-BRAND |

### Admin hangings — **BRO целиком** (blank · deploy · VIS хвост)

> Канон-очередь Bro: [`history/2026-08-12-bro-admin-wave-cut.md`](history/2026-08-12-bro-admin-wave-cut.md).  
> Evolve→КАНОН: [`friend-requests/2026-08-12-admin-blank-deploy-init.md`](friend-requests/2026-08-12-admin-blank-deploy-init.md) (`lane: evolve`).  
> DOJO hand **PASS** (acc 58). PAL/portal — **не** Bro. Старый VIS бриф: [`trudyaga-admin-vis-dig`](history/2026-08-12-trudyaga-admin-vis-dig.md).

#### § ADM-BRO — P0 (смысл: цепь + болванка + стена JSON)

| ID | Статус | Суть | Бот |
|---|---|---|---|
| **ADM-IMPORT-WALL** | **landed** | `canImportManifest`: Home JSON только admin_ib/nshr; expert — нет | Bro |
| **ADM-APPCODE-1** | **landed** | код приложения = `project_id` (Admin фильтр/Dojo/Реестр/карточка) | Bro |
| **ADM-DEPLOY-ENSURE** | **landed** | `ensureDeploy` + UI «Создать / ensure» в Реестре | Bro |
| **ADM-BLANK-1** | **landed** | expert: app→deploy→болванка check без JSON | Bro |
| **ADM-BLANK-2** | **landed** | admin: «Подложить болванку (JSON)» + audit message (новая проверка) | Bro |
| **Seats** | **REJECT** Boss CORE rewrite | очередь = Bro cut | [seat-split REJECT](history/2026-08-12-admin-seat-split.md) |

#### Хвосты VIS / brand (P1 — seats)

| ID | Статус | Суть | Бот |
|---|---|---|---|
| **ADM-VIS-ANALYSIS** | **code+shot · await owner** | Overview Pro Analysis · [ref](research/assets/admin-assortment/pro-analysis-ref/) | Bro → Maxim |
| **ADM-VIS-1…5** | **landed (code)** | assortment wave | Bro |
| **ADM-RU-INTL** | **landed** | `kdtRuIntl` | Bro |
| **VIS-ACC** | **open · P1** | галочки V1…V6 assortment | Bro + Maxim |
| **VIS-D*** | **code done · await eyes** | дельты trudyaga residual: RU-хвост D4/D6 + D8 owner (код) | Bro |
| **ADM-BRAND** | **P0 глаза** | F1 `?v=20260812f1` + mark · [delivery](research/2026-08-12-secops-lab-brand-delivery-plan.md) | Bro → Maxim |
| **ADM-NOTIFY** | **landed (code)** | оповещения Admin: `notifyRules` + `NotifyPanel` (секция Оповещения) | Bro |

#### Landed / later

| ID | Статус | Суть | Бот |
|---|---|---|---|
| **ADM-DOJO-*** | **landed / PASS** | program API + honesty · [acc 58](acceptance/58-trials-admin-dojo-program-2026-08-12.md) | — |
| **ADM-DOJO FR** | у входа | [`friend-requests/…admin-dojo`](friend-requests/2026-08-12-admin-dojo-inhabitant.md) | Boss later 2FA |
| **ADM-APPCODE** | **→ ADM-APPCODE-1 landed** | был PAL open | Bro |
| **Стены** | — | iframe · SSO Admin · Job API · Cosmo live API · SoT без приказа | — |

| ID / тема | Одна строка | Inbox |
|---|---|---|
| **PERS rest** | SSO / signed Allure | [CR](canon-requests/2026-08-12-pers-rest.md) · acc 44 |
| **Traffic rest** | path/cookie/guess | [CR](canon-requests/2026-08-12-traffic-insertion-rest.md) |
| **Горизонт эпиков** | ZAP-slave · scope · carcass… | [`research/…horizon`](research/2026-08-12-theoretical-epics-horizon.md) |
| **FE-12 / CONN deeper / AUTH residual** | later | frontend-spec · § CONN · auth-slots |
| **KDT voice** | внутренний лист, не hub | [`internal/kdt-voice.md`](internal/kdt-voice.md) |

### D · Evidence / park (не истина)

| ID / тема | Одна строка | Путь |
|---|---|---|
| **Dig vault** | тезисы + as-built prep без потери | [`history/2026-08-12-prep-dig-vault.md`](history/2026-08-12-prep-dig-vault.md) |
| **Prep 3×2 closeout** | Boss‖Bro landed | [`history/2026-08-12-prep-3x2-closeout.md`](history/2026-08-12-prep-3x2-closeout.md) |
| **UD-D hand script** | руки после prep | [acc 57](acceptance/57-ud-d-hand-e2e-script-2026-08-12.md) |
| **Нарезка Core Dev** | T1/T2 landed · T3 → ADM-DOJO | § Нарезка ниже |
| **Night / Sonar / ADM-POC** | evidence landed | history night-closeout · sonar-closeout · acc 42–48 |
| **Park PM** | Boss стоп · вечер 2FA | [`history/2026-08-12-parked-pm-core-dev-light.md`](history/2026-08-12-parked-pm-core-dev-light.md) |
| **Park night (старше)** | космос off | [`history/2026-08-12-parked-for-tomorrow.md`](history/2026-08-12-parked-for-tomorrow.md) |

### Нарезка — Трудяга (Core Dev) + соло

> **Не CANON.** Системное имя роли: **Core Dev**. Кличка в чате: **Трудяга** (бывш. «Полка»).  
> Откуда задачи: хвосты landed Pareto + friend/evolve (не новый космос). Казино не билдим.  
> Стены пачки: Guess runtime · SoT без приказа · hub без вечернего 2FA · multi-VPS.

#### Трудяга — закрыто 12 авг (P1–P3)

| # | Фича | Статус |
|---|---|---|
| **T0.1** | Fuzzer: параметры из журнала трафика | landed |
| **T0.2** | Admin «Прогоны» ≠ History | landed |
| **T0.3** | LABEL/HEAL Results strips | landed |

#### Трудяга — prep 3×2 (12 авг PM)

| # | Фича | Статус |
|---|---|---|
| **T1** | Космопорт ladder stub (wire + mock) | **landed** · Регламент каскад |
| **T2** | Studio LABEL/HEAL accept honesty + RU hints | **landed** · banner vitest |
| **T3** | Admin Dojo charts по `project_id` | **unpark → ADM-DOJO-1/2** (волна Dojo) |

#### Соло — закрыто 12 авг + prep

| # | Цикл | Статус |
|---|---|---|
| **S1** | DISC juice-field | landed [acc 55](acceptance/55-trials-disc-juice-field-2026-08-12.md) |
| **S2** | СборИнформации Pareto A | landed [acc 56](acceptance/56-trials-info-gather-a-2026-08-12.md) |
| **S3** | Gather harden (unit) | **landed** · empty/pscan/diary edges |
| **S4** | Cosmo mock API (BE thin) | **skipped** — FE fixture хватило T1 |
| **S5** | Пакет 2FA (docs only) | **landed** лист · hub не писали · [thesis](history/2026-08-12-prep-2fa-thesis-list.md) |

**Сейчас:** DOJO hand PASS · VIS code · FE roles lab landed · Cosmo as-is = пайп→SARIF ([research](research/2026-08-12-cosmo-pipe-vs-box.md)). Перед commit/push — точечный smoke; БД стенда tomorrow.  
Boss: acc 58 / Product Dojo. Bro: VIS code. FR/hub — не mid-волны.

### Бедолаги / к зачислению (обряд инициализации)

> Major закрыт → хвост только косметика → `ready` → 2FA → hub на **полноценную основу**.  
> Уже в hub: **Цепь**, **API-модули**, **AUTH основа**, **CONN thin**, **hold/secrets honesty**. Ниже — CULT / bank later / evolve.

| Бедолага | Major as-built | Хвост (косметика / harden) | Зачисление |
|---|---|---|---|
| **AUTH module/slots** | 10…15 + cookie→ZAP + Studio form/action (30–37) | deep SSO / script slots | **landed hub** 11 авг |
| **Connectors** | CONN-10…13 + logs + after-fuzz | protocol MQ/SQL later; cheatsheet flags | **landed hub** thin |
| **ART / hold / secrets** | ART-1…12 + SURVEY-3 + secret_scan | History hold UX polish; ART epic note | **landed hub** honesty |
| **Live / Session** | L-1…3 · S-1…3 | — | **landed** runtime-shell touch 11 авг; detail → monitoring |
| **DAST wave** | DF-10…14 + dict A+B + observed feed A | rest path/guess/UI; CULT по боли | **landed hub** 12 авг (§ корпус + observed); [acc 39](acceptance/39-trials-fuzz-dictionaries-ab-2026-08-11.md) · [acc 43](acceptance/43-trials-traffic-insertion-a-2026-08-12.md) |
| **RES / QG-AF / ADM** | lab closed | — | CULT admin/admission по боли |
| **IMP bank productize** | lab 17/20/21/22/24 | demo polish | hub Цепь/API уже; bank promise joint |

### Очередь внешнего бота (BOT-EXT) — 3 цикла · **landed 11 авг**

> Циклы 1–3 закрыты. **Новая пачка UD-B** (user-driven E2E) — см. ниже + [`acceptance/38-…`](acceptance/38-trials-ud-e2e-dual-batch-2026-08-11.md). Стоп-лист тот же.

### BOT-EXT UD-B — user-driven E2E · **landed CYCLE-H1 12 авг**

> Evidence: [`acceptance/38-…`](acceptance/38-trials-ud-e2e-dual-batch-2026-08-11.md) § UD-B evidence. Не hub. Не SoT.

| ID | Est | Суть | DoD |
|---|---|---|---|
| **UD-B1** | M | Juice short Open→`ФаззингВолна` | **landed** exit 0 · `run_1786482736` |
| **UD-B2** | M | Auth form browser Juice → cookies Http+ZAP | **landed** `run_1786482827` |
| **UD-B3** | S | legal_hold → purge 409 · badge · release | **landed** |
| **UD-B4** | M | after-fuzz `connector_probe*` в digest | **landed** (+ digest persist fix) |
| **UD-B5** | S | Live СИГНАЛ/ОШИБКИ + Bearer redact | **landed** pytest 3 |
| **UD-B6** | S | package AKIA → `plaintext_secrets` | **landed** |

Стоп-лист: hub · discovery-heal · SoT enum · полный pytest · stash · push без команды.

### Босс UD-C — CYCLE-H1 UI poke soil · **landed**

| ID | Суть | DoD |
|---|---|---|
| **UD-C1…C6** | Editor жив · fuzz_pack generate · matrix honesty · [`operator-ui-poke-cheatsheet.md`](operator-ui-poke-cheatsheet.md) · точечный vitest · стык acc 38 | **done** (2026-08-12) |

**Цикл 1 — AUTH harden — landed (BOT-EXT)**

| ID | Est | Суть | DoD |
|---|---|---|---|
| **BOT-A1** | M | `expand_compose_profile`: `visited` / depth cap | **done** (код + `test_compose_cycle_ab_no_recurse`) |
| **BOT-A2** | M | `ПрименитьAuth`: CSV / compose → resolve | **done** (`test_enrich_primenit_auth_compose_not_none`) |
| **BOT-A3** | S | Пустой `modules=` → notes, не legacy | **done** (`test_compose_empty_modules_no_silent_legacy`) |
| **BOT-A4** | M | Studio form UI C: тип+значение локатора (без SoT rewrite) | **done** (`authFormFields` + `AuthFormModuleForm`) |
| **BOT-A5** | S | Acceptance 30 wording + matrix sync под 14/15/37 | **done** |

**Цикл 2 — CONN / ART / package — landed (BOT-EXT)**

| ID | Est | Суть | DoD |
|---|---|---|---|
| **BOT-C1** | S | connectors.md + cheatsheet flags LIVE/SSH/LOGS/MQ/DB | **done** |
| **BOT-C2** | M | after-fuzz note в operator-cheatsheet | **done** |
| **BOT-C3** | S | History hold badge / purge guard | **done** (+ vitest held no-purge) |
| **BOT-C4** | M | secret_scan run/manifest + cuts | **done** |
| **BOT-C5** | S | `held_skipped` в ART epic / stand | **done** |

**Цикл 3 — bank demo / onboard / FE P2 — landed (BOT-EXT)**

| ID | Est | Суть | DoD |
|---|---|---|---|
| **BOT-D1** | M | bank api-lab runbook | **done** [`operator-bank-api-lab-runbook.md`](operator-bank-api-lab-runbook.md) |
| **BOT-D2** | M | ONBOARD-1D lite | **done** [`onboard-1d-lite.md`](onboard-1d-lite.md) |
| **BOT-D3** | L | FE-12 slice1 semantic tokens Секрет/MethodId | **done** `prettykSemanticTokens.ts` |
| **BOT-D4** | S | export keywords/method_ids | **done** (regenerated) |
| **BOT-D5** | M | friend-requests auth as-built 14/15/37 | **done** |

**Стоп-лист боту:** hub `docs/canon/**` · discovery-heal дно · SoT enum без приказа · полный pytest suite · stash чужого WIP · push без команды · «industrial AS завтра».

**Follow-on (после 3 циклов, по «продолжай» 11 авг)**

| ID | Суть | Статус |
|---|---|---|
| **BOT-X1** | FE-12 slice2: `Пусть` + locator semantic | **done** |
| **BOT-X2** | Studio `auth=action` MFA UI (тип+значение) | **done** |
| **BOT-X3** | backlog index sync (UI C / residual) | **done** |

---

## Эпик IMP — API modules & самоавторизация (очередь лупа)

Паспорт: [`imp-api-modules-epic.md`](imp-api-modules-epic.md).  
**Правило:** один TAG / ночь. SoT `manifest.json` и CANON discovery — только по приказу / 2FA.

### IMP-OA — OpenAPI / Swagger (`TAG=OPENAPI`)

Окультурить **импорт схемы** → operation list → lab wire (targets / seed / opt-in ZAP). Галочка анкеты ≠ автоскан.

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-OA-0** | S | **done** | Паспорт + эта секция | epic + backlog |
| **IMP-OA-1** | S | **done** | Inventory as-built: где `openapi_*` в FE/BE/ZAP сегодня | epic § Inventory |
| **IMP-OA-2** | S | **done** | Контракт импорта: URL/file → normalized ops (без SoT break) | `utils/openapi_ops.py` + fixtures |
| **IMP-OA-3** | M | **done** | Parser OpenAPI 3 (lab) | `test_openapi_ops.py` |
| **IMP-OA-4** | M | **done** | Parser Swagger 2 compat или явный reject+note | swagger2 fixture + reject |
| **IMP-OA-5** | S | **done** | Studio UX: модуль OpenAPI (не tab-lab) | Hub `create-openapi` + `OpenApiModuleForm` |
| **IMP-OA-6** | M | **done** | Wire → fuzz `targets[]` candidates (opt-in) | `ops_to_fuzz_targets` |
| **IMP-OA-7** | M | **done** | Wire → ZAP OpenAPI import path (opt-in env) | `KDT_OPENAPI_ZAP_IMPORT` |
| **IMP-OA-8** | S | **done** | Seed PrettyK comments / stub steps (lab) | `seed_prettyk_comments` |
| **IMP-OA-9** | M | **done** | Acceptance lab | `docs/acceptance/13-trials-imp-openapi-2026-08-11.md` |

Порядок: 0→1→2→3→4→5→6→7→8→9.

### IMP-AD — самоавторизация Auth↔Discovery (`TAG=AUTHDISC`)

Auth module = боевой путь. `АвтоАвторизоваться` = discovery (DISC-1, **дно** в CANON). PoC lab ок; снятие «дна» — 2FA.

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-AD-0** | S | **done** | Паспорт AD в epic | ссылка + границы |
| **IMP-AD-1** | S | **done** | Карта: Auth IR apply vs MethodId discovery (код якоря) | `docs/internal/imp-auth-discovery-map.md` |
| **IMP-AD-2** | S | **done** | Матрица оператору: когда Auth / когда discovery / когда suite | QUEUE doc + `OPERATOR_MATRIX` |
| **IMP-AD-3** | M | **done** | Lab PoC Juice: Auth IR login → session | `test_auth_discovery_bridge` mock |
| **IMP-AD-4** | M | **done** | Lab PoC: `АвтоАвторизоваться` на Juice login form | MethodId stub → honest `applied:false`; live Juice DOM — later |
| **IMP-AD-5** | S | **done** | Связка: discovery fail → notes, не `applied: true` | bridge unit |
| **IMP-AD-6** | S | **done** | Live clue / diary на fail discovery | `live_discovery_fail_clue` |
| **IMP-AD-7** | S | **done** | Acceptance + решение: трогать ли CANON discovery | `acceptance/14-…` QUEUE only |

Порядок: 0→1→2→3→4→5→6→7. Не тащить DISC-2/HEAL заодно.

### IMP-GQL — GraphQL модуль (`TAG=GQL`)

Сначала **слот authoring** (паттерн CONN). Runtime — этап N.

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-GQL-0** | S | **done** | Паспорт GQL | epic §3 |
| **IMP-GQL-1** | S | **done** | Модель полей слота (endpoint, headers, SDL/URL) | `lab_graphql_shape` |
| **IMP-GQL-2** | M | **done** | Hub `create-graphql` + honest UI «нет executor» | `isLab` panel + badge lab |
| **IMP-GQL-3** | M | **done** | Import introspection / SDL → operations list | `test_graphql_ops.py` |
| **IMP-GQL-4** | S | **done** | Показ ops в Studio read-only | `ApiLabImportPanel` + `/api/lab/graphql/parse` |
| **IMP-GQL-5** | M | **done** | PoC один query leaf (HTTP/graphql) | `build_query_leaf_poc` body |
| **IMP-GQL-6** | S | **done** | Acceptance + банк «с вас schema/auth» | `acceptance/15-…` |

Порядок: 0→1→2→3→4→5→6.

### IMP-GRPC — gRPC модуль (`TAG=GRPC`)

Слот + proto/reflect inventory. Streaming — не MVP.

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-GRPC-0** | S | **done** | Паспорт gRPC | epic §4 |
| **IMP-GRPC-1** | S | **done** | Модель полей (host, proto path, metadata) | `lab_grpc_shape` |
| **IMP-GRPC-2** | M | **done** | Hub `create-grpc` + proto pack form | `GrpcModuleForm` + `/api/lab/grpc/pack` |
| **IMP-GRPC-3** | M | **done** | Proto parse → service/method list | `test_grpc_ops.py` |
| **IMP-GRPC-4** | M | **done** | Server reflection path (lab opt-in) или skip+note | `try_server_reflection` |
| **IMP-GRPC-5** | L | **done** | PoC unary call harness | без флага bolvan; `KDT_GRPC_UNARY=1` → lab Ping (acceptance 24) |
| **IMP-GRPC-6** | S | **done** | Acceptance + TLS/metadata later | `acceptance/16-…` |

Порядок: 0→1→2→3→4→5→6.

### Статус волны (2026-08-11) — closeout

**CLOSED (порядок TAG):** OA → AUTHDISC → GQL → GRPC → bank productize → HAR (вкл. **HAR-4** live opt-in) → CHAIN → PRE → MAP/MAP-MOD → scope smoke.  
Open-карточек IMP-* нет.  
**Productize bank (QUEUE):** SoT modules + forms + `kdt-api-lab` + acceptance 17/20/21 — к CANON 2FA по кивку (hub не трогать без приказа).  
**Репорт документалисту:** [`history/2026-08-11-imp-documentalist-handoff.md`](history/2026-08-11-imp-documentalist-handoff.md) · canon-request черновик [`canon-requests/2026-08-11-imp-chain-api-polish.md`](canon-requests/2026-08-11-imp-chain-api-polish.md).  
**Scope:** [`acceptance/22-trials-imp-scope-smoke-2026-08-11.md`](acceptance/22-trials-imp-scope-smoke-2026-08-11.md).  
Дальше по кивку: bank / CANON 2FA — не новый IMP TAG.

### IMP-HAR — HAR через Resources → ZAP sequence (`TAG=HAR`)

> SoT `imports.kind=har_file`; Studio Resources attach `.har`; lab-run `resource_contents`; ZAP volume + path rewrite.  
> Паспорт: [`imp-api-modules-epic.md`](imp-api-modules-epic.md) § HAR.  
> **Запуск:** Editor bind/seed; прогон = обычный check/Live.

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-HAR-0** | S | **landed** | Паспорт + inventory | epic § HAR |
| **IMP-HAR-1** | S | **landed** | SoT `har_file` + controller path scalar + ZAP rewrite | unit `test_har_import_path` |
| **IMP-HAR-2** | M | **landed** | Resources attach `.har` + kind UI (не Hub lab panel) | `studioResources` / attach |
| **IMP-HAR-3** | M | **landed** | Seed PrettyK `ИмпортHAR` ± `СканПоследовательности` | `seedHarImport` + ResourceForm |
| **IMP-HAR-4** | M | **landed** | Lab live: fixture HAR → import → sequence active (opt-in) | `KDT_HAR_SEQUENCE_LIVE` + `test_har_sequence_live` |
| **IMP-HAR-5** | S | **landed** | Честность + stand/cheatsheet volume note | stand + cheatsheet |

Порядок: 0→5 landed (вкл. live-4 opt-in).

### IMP-CHAIN — запись цепей → templated HAR → бомба (`TAG=CHAIN`)

> Индустрия: ZAP Sequence (record / Import HAR → sequence-activeScan); Burp Stepper/macros (`$VAR` extract→inject); GitLab API Fuzzing from HAR; replay с CSRF/token correlation.  
> У нас: **IMP-HAR** = чужой `.har` в Resources. **CHAIN** = сами строгаем поток, помечаем что менять, на прогоне подставляем свежие токены и бьём.  
> Паспорт: [`imp-api-modules-epic.md`](imp-api-modules-epic.md) § CHAIN.  
> Не путать с **AUTH-10a** (`auth=chain` логин) — там вход; здесь **бизнес-поток** (перевод, checkout, смена пароля).

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **IMP-CHAIN-0** | S | **landed** | Паспорт + границы vs HAR / AUTH-10a / DF | epic § CHAIN |
| **IMP-CHAIN-1** | M | **landed** | SoT `module_type=Цепь` + `chain_fields` + Pydantic | manifest + generate:schema |
| **IMP-CHAIN-2** | M | **landed** | Record/trim: paste HAR → steps (skip assets/OPTIONS) | `chain_from_har` lab API |
| **IMP-CHAIN-3** | M | **landed** | Templatize UI: слоты + bind/play values | `ChainModuleForm` |
| **IMP-CHAIN-4** | M | **landed** | Materialize → Resources `har_file` + lab-run bindings | Play button + `chain_bindings` |
| **IMP-CHAIN-5** | L | **landed** | Bomb A: seed facade | opt-in checkbox |
| **IMP-CHAIN-5a** | M | **landed** | MethodId: `ВыполнитьЦепь` play / `СканированиеЦепи` удар; API без `режим=` | `test_execute_chain` |
| **IMP-CHAIN-6** | L | **landed** | Bomb B: Play → targets в Fuzzer `chain_*` | `chainFuzzAttach` |
| **IMP-CHAIN-7** | S | **landed** | Honesty copy; template `{{slot}}`; no silent scan | form Alert + notes |
| **IMP-CHAIN-8a** | L | **landed** | `РасследованиеЦепи` scaffold | `test_execute_chain` |
| **IMP-CHAIN-8b** | L | **landed** | Auth из HAR → `apply_zap_auth` (Bearer/Cookie) | extract_auth_from_har |
| **IMP-CHAIN-8c** | L | **landed** | Evidence `meta/chain_investigate_*.json` + purge `kdt-auth*` | write_investigate_evidence |
| **IMP-CHAIN-8+** | L | **landed** | `ФаззингЦепи`: prepare(pre) → sync attack → wave | `test_fuzz_chain` |
| **IMP-CHAIN-PRE-0** | S | **landed** | Пауза фазза; смысл фугаса | [`history/2026-08-11-fugas-preconditions.md`](history/2026-08-11-fugas-preconditions.md) |
| **IMP-CHAIN-PRE-1** | M | **landed** | step `role` pre\|attack; setup/attack HAR; fuzz=attack | Studio Select + materialize |
| **IMP-CHAIN-PRE-2** | M | **landed** | extract→inject (jsonpath/regex/header) | `extract:step:N:…` |
| **IMP-CHAIN-PRE-3** | M | **landed** | dry-run pre + MethodId `ПодготовитьЦепь` | lab `/dry-run-pre` |
| **IMP-CHAIN-MAP-0** | S | **landed** | Контракт: карта=slots; values=data-модуль | [`history/2026-08-11-chain-replace-map.md`](history/2026-08-11-chain-replace-map.md) |
| **IMP-CHAIN-MAP-1** | M | **landed** | UX «Карта подмен» + paste JSON → bindings | Studio ChainModuleForm |
| **IMP-CHAIN-MAP-2** | M | **landed** | slot `match` / `apply` step\|all | `chain_ops` template/materialize |
| **IMP-CHAIN-MAP-3** | M | **landed** | CSV lab (legacy) — не развиваем | deprecated vs MAP-MOD |
| **IMP-CHAIN-MAP-MOD** | M | **landed** | `value_pack_module` → properties data-модуль | materialize / Studio |

MAP + HAR-4 landed. Scope: [`acceptance/22-…`](acceptance/22-trials-imp-scope-smoke-2026-08-11.md). Ход: [`history/2026-08-11-chain-sprint.md`](history/2026-08-11-chain-sprint.md). Не `docs/canon/**` без 2FA.

### Шаблон команды (копипаст) — архив

```text
IMP night loop TAG=OPENAPI: один цикл.
Следующий open IMP-OA-* из docs/backlog.md (порядок секции).
DoD → точечные тесты → backlog → commit+push origin/dev → стоп.
Самостоп: IMP-OA-0…9 closed ИЛИ нужен юзер / SoT / CANON 2FA.
Не трогай docs/canon/** без 2FA. Не stash. Не другой TAG.
Паспорт: docs/imp-api-modules-epic.md.
```

Замени `OPENAPI`/`IMP-OA` на `AUTHDISC`/`IMP-AD`, `GQL`/`IMP-GQL`, `GRPC`/`IMP-GRPC`.

---

## Эпик ART — артефакты, retention, cleanup job

Паспорт: [`artifact-cleanup-epic.md`](artifact-cleanup-epic.md).  
**Решение (11 авг):** delete карточки ≠ hard-cascade; retention = отдельная job; `lab_clean` остаётся ops.  
**1…12 landed** — cleanup + хвост orphan/badge/audit ([`acceptance/23-…`](acceptance/23-trials-art-tail-2026-08-11.md)).

### Волна A — честность (сначала)

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **ART-0** | S | **done** | Паспорт эпика + эта секция | [`artifact-cleanup-epic.md`](artifact-cleanup-epic.md) + индекс |
| **ART-1** | M | **landed** | **Artifact index**: `check_id` → `run_id` → disk paths + dojo `test_id`/`engagement_id` + hooks URLs | `utils/artifact_index.py` + finalize wire + pytest |
| **ART-2** | S | **landed** | `deleteCheck` = **unlink only**; UI History: явный текст «отчёты на диске/Dojo не удаляются» | History modal copy; purge только галка (ART-3) |

### Волна B — opt-in purge + политика retention

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **ART-3** | M | **landed** | Opt-in **Purge artifacts** при удалении карточки (модалка: unlink / unlink+purge) | Live `POST /api/artifacts/purge`; History checkbox |
| **ART-4** | S | **landed** | `artifact_retention_days` → отдельный **RetentionPolicy** store (Admin → файл/Live), **не** в GatePolicy counts | `retention_policy.py` + FE serialize + Live API |

### Волна C — cleanup job

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **ART-5** | M | **landed** | Job skeleton: `tools/artifact_cleanup_job.py` — **dry-run** по retention + index | CLI + `list_retention_candidates` |
| **ART-6** | M | **landed** | Execute **disk**: paths из index | `purge_disk_for_check`; refuse allure-results root; audit ndjson |
| **ART-7** | L | **landed** | Execute **Dojo**: test delete только `ENGAGEMENT_MODE=check`; `fixed` → skip | `purge_dojo_for_check` + тест |

### Волна D — границы и приёмка

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **ART-8** | S | **done** | Граница **lab_clean** vs ART job: cheatsheet/stand — когда какой инструмент | stand + operator-cheatsheet |
| **ART-9** | M | **done** | Acceptance: unlink · opt-in purge · dry-run job · retention cut | [`acceptance/12-trials-art-cleanup-2026-08-11.md`](acceptance/12-trials-art-cleanup-2026-08-11.md) |

### Зависимости / стены ART

| Зависит от | Зачем |
|---|---|
| NAV delete / History UI | ART-2/3 |
| finalize + Dojo import meta | ART-1 (test_id) |
| Admin Policies поле retention | ART-4 (уже UI stub) |

| Не делать | Почему |
|---|---|
| Cascade delete в `fixed` Dojo | чужие findings |
| Вешать TTL на клик History | нужен job |
| Путать waiver `expires_at` с retention отчётов | разные оси |

**Порядок имплементации:** ART-0 → 1 → 2 → 4 → 5 → 3 → 6 → 7 → 8 → 9  
(сначала index+честность+dry-run; purge UI после API; Dojo последним).

### Волна E — хвост после 9 (ночь / следующий заход)

| ID | Est | Статус | Суть | DoD |
|---|---|---|---|---|
| **ART-10** | M | **landed** | Orphan scan: paths на диске без записи в index | `scan_orphan_run_dirs` + Live/CLI |
| **ART-11** | S | **landed** | History badge «арт.» из index | `/api/artifacts/index` + HistoryPage |
| **ART-12** | S | **landed** | Audit ndjson export / тонкий viewer | `/api/artifacts/audit` + модалка |

---

## Эпик SURVEY — ночной рой дыр (docs → карточки)

Не код без дешёвого PoC. После ART-9 или при упоре.

| ID | Статус | Суть |
|---|---|---|
| **SURVEY-1** | **done** | honest-contract + agent-suggested: дыры ниже (ночь 11 авг) |
| **SURVEY-2** | **done** | Orphan path gaps → ART-10 landed |
| **SURVEY-3** | **landed (A+B)** | Soft `legal_hold` + `KDT_ARTIFACT_PURGE=0`; [`research/joint/2026-08-11-survey3-legal-hold.md`](research/joint/2026-08-11-survey3-legal-hold.md) · [`acceptance/31-…`](acceptance/31-trials-survey3-logs-secrets-2026-08-11.md) |

### SURVEY-1 notes (11 авг)

| Дыра | Куда |
|---|---|
| Orphan disk без index | ART-10 |
| History не показывает «есть артефакты» | ART-11 |
| Audit viewer | ART-12 |
| AUTH-12 / CONN-11 | свои эпики; не ART |
| Bank legal hold на wipe | SURVEY-3 landed (soft hold) |

## Эпик POC — узкий spike (≤1 цикл, только если survey нашёл)

| ID | Статус | Суть |
|---|---|---|
| **POC-*** | — | слот: mock/unit spike + тест; иначе не плодить |

Порядок после ART-9: SURVEY-1 → (PoC если дешёво) → ART-10… или стоп если нужен юзер.

---

## Эпик AUTH — авторизация в Studio

Паспорт: [`future-plans.md`](future-plans.md) §1 · hub [`canon/auth-module.md`](canon/auth-module.md) · detail [`internal/auth-module.md`](internal/auth-module.md).

| ID | Статус | Суть |
|---|---|---|
| **AUTH-10** | **landed (lab)** | module-kind Авторизация; IR/validate |
| **AUTH-10a** | **landed (lab)** | `auth=chain` + Capture; Http bootstrap |
| **AUTH-11** | **done** | матрица → [`internal/auth-matrix.md`](internal/auth-matrix.md) |
| **AUTH-12** | **landed (wave1)** | API Key / Query Key + success check + compose каркас; [`acceptance/30-…`](acceptance/30-trials-auth12-apikey-2026-08-11.md) |
| **AUTH-13** | **landed (lab)** | CSV/`auth=compose` + form/action dialect → ZAP helper; [`acceptance/34-…`](acceptance/34-trials-auth13-compose-2026-08-11.md) |
| **AUTH-14** | **landed (lab A+B+C)** | Form dialect + Selenium + cookies→Http/ZAP + Studio тип+значение; [`acceptance/35-…`](acceptance/35-trials-auth14-form-browser-2026-08-11.md) |
| **AUTH-15** | **landed (lab)** | MFA TOTP/SMS + split OTP + cookies→Http/ZAP; [`acceptance/36-…`](acceptance/36-trials-auth15-mfa-2026-08-11.md) · [`37-…`](acceptance/37-trials-auth-browser-zap-cookie-2026-08-11.md) |
| **AUTH residual** | **evolve** | deep SSO / Push/WebAuthn / script slots — по кивку (UI form+action + compose harden landed) |

---

## Эпик CONN — коннекторы

Паспорт: [`future-plans.md`](future-plans.md) §2 · [`internal/connectors.md`](internal/connectors.md) · EVIDENCE [`history/2026-08-11-conn-admin-activate/`](history/2026-08-11-conn-admin-activate/).

| ID | Статус | Суть |
|---|---|---|
| **CONN-10** | **landed (lab)** | Admin packs + Studio activate + snapshot |
| **CONN-11** | **landed** | PrettyK init + Prom pack (`KDT_CONNECTOR_LIVE`); [`acceptance/27-…`](acceptance/27-trials-conn11-prom-2026-08-11.md) |
| **CONN-12** | **landed (SSH)** | `ВыполнитьКомандуSSH` + allowlist; [`acceptance/29-…`](acceptance/29-trials-self-l3-conn12-mc4-2026-08-11.md) |
| **CONN-logs** | **landed (thin)** | `ЗапроситьЛогиКоннектора` HTTP GET (`KDT_CONNECTOR_LOGS`); after-fuzz dispatch; [`acceptance/31-…`](acceptance/31-trials-survey3-logs-secrets-2026-08-11.md) · [`32-…`](acceptance/32-trials-hold-badge-afterfuzz-logs-2026-08-11.md) |
| **CONN-13** | **landed (thin)** | MQ/DB TCP probe (`KDT_CONNECTOR_MQ`/`DB`); [`acceptance/33-…`](acceptance/33-trials-conn13-mq-db-2026-08-11.md) |
| **CONN-13** | **landed (TCP)** | MQ/DB reachability probe (no publish/SQL); [`acceptance/33-…`](acceptance/33-trials-conn13-mq-db-2026-08-11.md) |

### Review later (не пилить сейчас)

| ID | Суть |
|---|---|
| **CONN-ADAPT-SPLIT** | Логически выделять отдельные adapter-классы под каждый тул (SSH/MQ/CLI…) — **отложено**. Сейчас расширение = MethodId-обёртки на существующих компонентах (`core`/`http`/…), как RF keywords. Вернуться, если появятся общие lifecycle/секреты/пулинг. |
| **RF-BRIDGE** | Пайплайн RF UI → HAR/proxy → KDT security gate (не замена UI-регресса). |
| **ONBOARD-1D** | Онбординг «с улицы»: lab + 1 манифест + два exit-кода + словарь MethodId. |

---

## Ядро — внешние команды (RF-паритет обёрток)

| ID | Статус | Суть |
|---|---|---|
| **CORE-CMD-1** | **landed** | `ВыполнитьКоманду` → `core|run_command`; gate `KDT_EXECUTE_COMMAND` + opt `KDT_COMMAND_ALLOWLIST`; dry `KDT_API_LAB_DRY` | `test_run_command.py` |

Потенциал «нарезать keywords как RF» = этот паттерн, не бесконечный marketplace adapters.

---

## Эпик NAV — CheckInstance / History

Паспорт: [`nav-check-epic.md`](nav-check-epic.md). Hub: [`canon/nav-check.md`](canon/nav-check.md).

| ID | Статус | Суть |
|---|---|---|
| **NAV-1…6** | **done** | store, hash, lifecycle, history UI, docs |
| **NAV-RUN** | **landed (lab)** | Live/CI → `runs[]` |
| **NAV-API** | **landed (lab)** | `/api/checks` file-bus |
| **NAV-POL** | **landed (lab)** | Policies ≠ runs → Admin |
| **NAV-DEL** | **→ ART-2/3** | семантика delete карточки вынесена в ART (не плодить второй эпик) |

---

## Эпик E2E — shell Login / Home / ЖЦ

Паспорт: [`e2e-shell-epic.md`](e2e-shell-epic.md). Hub: [`canon/fe-shell.md`](canon/fe-shell.md).

| ID | Статус | Суть |
|---|---|---|
| **E2E-1…6** | **done** | Login, Home, import, History shell, dark, hub mute |
| **E2E-HIST** | **done (lab)** | History = NAV registry |
| **E2E-LOGIN-BG** | **done** | video + glass |
| **E2E-SSO / AUTH** | **open** | Blitz / server auth |
| **E2E-POL** | **partial** | shell + QG-AF-7; SSO open |

---

## Эпик ADM — SecOps Admin

Паспорт: [`internal/admin-secops.md`](internal/admin-secops.md). Hub слой: [`canon/admin-integrations.md`](canon/admin-integrations.md).

| ID | Статус | Суть |
|---|---|---|
| **ADM-1…5** | **landed** | KPI live, gates sync, evidence charts, waivers UI |
| **ADM-6** | **done** | docs/acceptance |
| **ADM-POC-A** | **landed** | секция «Прогоны»: `collectAdminRuns` + RunsPanel + Runs·7d; [acc 42](acceptance/42-trials-admin-runs-ledger-2026-08-12.md) |
| **ADM-POC-B** | **landed** | Live runs index + Admin merge + Deploy last N · [acc 45](acceptance/45-trials-admin-poc-b-runs-index-2026-08-12.md) |
| **ADM-E1…4** | **landed** | Overview→Прогоны · Owner filter · Evidence→Deploy · Policy fingerprint |
| **ADM-E5…7** | **landed** | probe honesty · bulk link · waiver warn · [acc 46](acceptance/46-trials-admin-e5-e7-2026-08-12.md) · [research](research/2026-08-12-epic-admin-features.md) |
| **ADM-DOJO-1/2** | **landed (code)** · hand OPEN | [acc 58](acceptance/58-trials-admin-dojo-program-2026-08-12.md) · [FR](friend-requests/2026-08-12-admin-dojo-inhabitant.md) |
| **ADM-VIS-ANALYSIS** | **code+shot · await owner** | Overview Pro Analysis · [ref](research/assets/admin-assortment/pro-analysis-ref/) |
| **ADM-VIS-1** | **landed (code)** | Overview Analysis + mini Runs · [assortment V1](research/2026-08-12-admin-visual-assortment.md) |
| **ADM-VIS-3** | **landed (code)** | SecOps tokens Admin radius 5–6 |
| **ADM-VIS-2** | **landed (code)** | ProTable Прогоны/Реестр |
| **ADM-VIS-4** | **landed (code)** | Evidence tabs · empty Result |
| **ADM-VIS-5** | **landed (code)** | Deploy Descriptions + empty Result |
| **ADM-RU-INTL** | **landed** | `theme/kdtRuIntl.ts` · Pro switch Вкл/Выкл |
| **ADM-BRAND** | **plan** | Полный скоуп бренд/иконка/морда — [delivery plan](research/2026-08-12-secops-lab-brand-delivery-plan.md) |
| **BRAND-0** | **landed** | Inventory + plan MD |
| **BRAND-1** | **open · P0** | Favicon F1 виден на вкладке (Editor/Admin); cache-bust если надо · `public/secops-lab-icon.*` |
| **BRAND-2** | **open · P0** | Wordmark SecOps Lab: Login/Home/Admin/Live — один проход глазами |
| **BRAND-3** | **landed (21:31)** | `vite build`; повтор после правок brand |
| **BRAND-4** | **open · P0** | Owner: «вижу F1 + SecOps Lab» → ADM-BRAND landed |
| **VIS-ACC** | **open · P1** | Закрыть галочки V1…V6 в assortment: принято / хвост |
| **VIS-ANALYSIS** | **code+shot · await owner** | Pro Analysis Overview · shot `pro-analysis-ref/admin-overview-analysis.png` · Maxim: «как Analysis» → V1 accept |
| **VIS-D*** | **open · P1** | Дельты D1–D6 polish · D7–D8 later · [trudyaga](history/2026-08-12-trudyaga-admin-vis-dig.md) |
| **THEME-LIGHT** | **park** | Light SecOps pack — только по кивку |
| **ADM-NOTIFY** | **landed** | Оповещения в Admin · `notifyRules.ts` + `NotifyPanel.tsx` · [wire](history/2026-08-12-bro-admin-wave-cut.md) |
| **ADM-APPCODE** | **open** | Project code в Admin · § PAL-ADM-APPCODE |
| **ADM-RET** | **→ ART-4** | retention field wiring — в ART, не второй сюжет |
| **2-bot cut** | **now** | [history/…adm-dojo-vis-2bot-cut](history/2026-08-12-adm-dojo-vis-2bot-cut.md) |

---

## Эпик QG-AF — Quality Gate Auto Filtering

Паспорт: [`qg-af-epic.md`](qg-af-epic.md). Hub: [`canon/admission.md`](canon/admission.md).  
Контур **lab landed** (0…13, поле 9). Новое — regress / bank process, не спринт с нуля.

| Блок | ID | Статус |
|---|---|---|
| Спринт A | **QG-AF-0…5** | **landed** |
| Волна B | **QG-AF-6…13** (порядок был 10→11→6→12→7→8→13→9) | **landed** / **9 lab** |

Детали filter/act/zip — не дублировать здесь: [`internal/results-as-built.md`](internal/results-as-built.md) · [`admission-act-ib.md`](admission-act-ib.md).

---

## Эпик RES — Результаты проверки

Паспорт: [`results-epic.md`](results-epic.md).  
**Lab DoD + bank tails MC-RES-1…3/5 — closed** (11 авг). **MC-RES-4** wont (стена Job API).

| Якорь | Факт |
|---|---|
| RES-3…7 / L / H / ACT / GATE | lab landed |
| Pipe + Juice ПИ | [`acceptance/10-…`](acceptance/10-trials-act-gates-pipe-2026-08-11.md) · [`11-…`](acceptance/11-trials-juice-pi-act-2026-08-11.md) |
| Очередь | не RES — см. индекс (§ ART / AUTH / CONN) |

---

## Эпик DF — DAST-фаззинг Phase 2

Канон narrative: [`dast-fuzzing.md`](dast-fuzzing.md). Hub wave: [`canon/dast-wave.md`](canon/dast-wave.md).

| ID | Статус |
|---|---|
| **DF-10…14** + MC-3 reflection | **closed** |

Не блокер демо ЖЦ. SoT `wave_mode` — maybe-cool / приказ.

---

## Эпик FE — Studio UI polish

Спека: [`frontend-spec.md`](frontend-spec.md).

| ID | Статус | Суть |
|---|---|---|
| **FE-10** | **done** | light contrast |
| **FE-11** | **done** | `$var` glow light |
| **FE-FORM** | **done** | rhythm + actions pad |
| **FE-ED** near | **done** (11 авг) | context menu, SignatureHelp, cmdk, HUD |
| **FE-12** | **open (P2)** | Monaco semantic tokens — не near; [`future-plans.md`](future-plans.md) §7 |

---

## Эпик S — сессия / браузерный контекст

Паспорт: [`session-epic.md`](session-epic.md).

| ID | Статус | Суть | Якорь |
|---|---|---|---|
| **S-1** | **landed** | Replay storage keys → fuzz `Authorization` | [`acceptance/25-…`](acceptance/25-trials-live-session-lane-2026-08-11.md) |
| **S-2** | **landed** | Redact storage keys in reports (имена, не JWT) | same |
| **S-3** | **landed** | ZAP `httpSessions` snapshot: имена/count в meta/digest | `http_sessions_snapshot_meta` |

---

## Эпик L — Live / мониторинг

Паспорт: [`monitoring.md`](monitoring.md). Hub roles: [`canon/runtime-shell.md`](canon/runtime-shell.md).

| ID | Статус | Суть | Якорь |
|---|---|---|---|
| **L-1** | **landed** | Presets фильтра Live (`all`/`signal`/`errors`) | [`acceptance/25-…`](acceptance/25-trials-live-session-lane-2026-08-11.md) |
| **L-2** | **landed** | Deep-link Allure / WireK | same |
| **L-3** | **landed** | Redact Bearer/JWT/password в Live diary NDJSON/SSE | [`acceptance/29-…`](acceptance/29-trials-self-l3-conn12-mc4-2026-08-11.md) |

> **Мульти-монитор / replay / отмотка** — отдельный эпик **MONITOR** (§ выше), не L. L — фильтры/deep-links/redact.

---

## Эпик SONAR — quality cuts (infra)

Стенд: [`sonar-lab.md`](sonar-lab.md). Скан **только** по приказу (inline: `orchestrator/tools/sonar_scan.ps1`).

| Пульт | Факт |
|---|---|
| Цикл **12 авг** risk/QG | **ACCEPTED** · verify-2 Open BE **121** / FE **30** · bugs/vuln **0** · QG **OK/OK** · A/A/A · [`sonar-closeout-2026-08-12.md`](sonar-closeout-2026-08-12.md) §7 |
| Старт дня 12 авг | BE Open **176** · bugs **1** · vuln **2** · QG **ERROR** · FE Open **40** |
| Rematch 11 авг | FE **0** / BE **105** · bugs/vuln **0** · оба QG **OK** |
| Inventory | [`history/2026-08-sonar-dig/sonar-inventory-2026-08-12.md`](history/2026-08-sonar-dig/sonar-inventory-2026-08-12.md) · verify2 `reports/sonar-snapshot-2026-08-12-verify2/` |
| Хвост Open | **SQ-BE-74** / **SQ-FE-60** — backlog **maintainability**, не блокер risk/QG |
| Verify-3 pulse 12 авг | BE smells **96** · FE **45** · bugs BE **1→fix S5850** (language_engine lookahead) · QG FE OK; BE был ERROR на bug |
| Не путать | **Musthave / profile** ≠ **копаем extracts’ами** (см. таблицу ниже) |

**Не путать (канон triage):**

| Класс | Что | Действие |
|---|---|---|
| **Musthave / profile** | Style · lab-http · RU MethodId literals (`S1192`) | Profile / musthave. **Не** размазываем в константы «ради нуля». **Не** mass-WONTFIX на всё подряд |
| **Чиним (dig)** | Реальный долг: **S3776** и прочий maint Open | Packs **SQ-BE-74** / **SQ-FE-60** — extracts’ами; Open цифры после verify |

### Микро-бэклог хвоста maintainability (дальше копаем)

> Скан подтверждён давно (verify-2 **ACCEPTED**: BE Open **121** / FE **30**, bugs/vuln **0**, QG **OK/OK**).  
> После пост-verify dig в backlog — **Verify-3 pulse**: BE smells **96** / FE **45** (BE bug `S5850` → fix pending).  
> Хвост = чистый eloquency: **S3776** и maint Open, **не** musthave, **не** suppress.

| ID | Est | Статус | Суть |
|---|---|---|---|
| **SQ-BE-74a** | L | **open · dig** | left-overs **S3776** фуксов после BE-70…73: в т.ч. `utils/*` + `core/run_package` + `reporter` (см. verify-3: BE **96**) |
| **SQ-BE-74b** | M | **open · dig** | maint Open **non-S3776** (`S8786` misc): regex/auth/wire хвост, не правило-профиль |
| **SQ-FE-60a** | M | **open · dig** | leftover **S3776** FE после FE-56…59: StudioWorkspace / chain / RunTable хвост (verify-3: FE **45**) |
| **SQ-FE-60b** | S | **open · dig** | maint Open FE: `S7718`/`S8786` misc — extract, не suppress |
| **SQ-VERIFY-3** | — | **open · по команде** | после закрытой порции — `sonar_scan -Target both` по приказу (cap при ожидании) |
| **SQ-BE-75** / **SQ-FE-61** | S | **meta · done** | как только дойдём до 0-остатка по зоне — закрыть «следующий dig» ref'ом сюда |

**Правило:** копаем **extracts’ами** пачками (не по одному smell → один тест). Musthave/style/RU-S1192 не трогаем. Контроль — только после явной команды Максима.

### Следующий dig — feature packs (очередь)

| ID | Est | Статус | Суть |
|---|---|---|---|
| **SQ-BE-60** | S | **landed (code)** | P0 ×5: S3923 GraphQL endpoint · S4790 TOTP NOSONAR · S2068 param label · S3516 coverage/FE return · `set_proxy` True/False |
| **SQ-BE-61** | L | **landed (code)** | `auth_module.py` S3776 — dispatch validate/bootstrap + apply helpers (pytest auth batch 79) |
| **SQ-BE-62** | L | **landed (code)** | `chain_ops.py` S3776 — extract/suggest/apply/materialize helpers (pytest chain 26) |
| **SQ-BE-63** | L | **landed (code)** | `zap_adapter.py` S3776 — auth/chain/graphql/poll helpers (pytest zap+chain 53) |
| **SQ-BE-64** | L | **landed (code)** | `fuzzing.py` S3776 — hole/digest/live/wave/chain helpers |
| **SQ-BE-65** | L | **landed (code)** | `controller.py` S3776 — auth bootstrap / Zap enrich / suite imports (pytest 50) |
| **SQ-BE-66** | M | **landed (code)** | language/expr/parse/validate/pretty — S3776 helpers; controller stub `manifest` soft; pytest language batch **113** |
| **SQ-BE-67** | M | **landed (code)** | connector/run_package/api_runtime/lab_run/live S3776 helpers; pytest runtime batch **77** |
| **SQ-BE-68** | S | **landed (code)** | af_plan/auth_bootstrap/log_cuts/gate/pipeline/gha helpers; pytest misc batch **61** |
| **SQ-BE-69** | — | **verify-1 done** | Open **119** (vuln 0); closeout 12 авг |
| **SQ-BE-69a** | S | **landed (code)** | post-verify bug `traffic_insertion_points` S3923; pytest 5 |
| **SQ-BE-70** | M | **landed (code)** | non-S3776 + extracts; pytest zone **43**; Open цифры после скана |
| **SQ-BE-71** | L | **landed (code)** | S3776 extracts (manifest/connector/pattern/artifact/openapi/dojo/job); pytest **47** |
| **SQ-BE-72** | L | **landed (code)** | run_command/dojo cursor/live json/artifact purge/legacy policy/G-64; pytest **57** |
| **SQ-BE-73** | L | **landed (code)** | final dig fuzz/lab/reporter/chain/grpc/heal/console/job; pytest **55+43** |
| **SQ-BE-74** | L | **backlog maint** | чиним: leftover **S3776** (+ maint Open) extracts’ами; не musthave; Open после verify |
| **SQ-FE-50** | M | **landed (code)** | `ResourceFormPanel` → `resourceFormHints` (S3358/S3776); vitest hints |
| **SQ-FE-51** | M | **landed (code)** | `chainModuleFields` slot/value-pack/bindings helpers |
| **SQ-FE-52** | M | **landed (code)** | `studioWorkspaceFormFlags` + `studioActionFormSubmit` |
| **SQ-FE-53** | S | **landed (code)** | auth serialize + API inventory text (OA/GQL/gRPC) |
| **SQ-FE-54** | S | **landed (code)** | suiteZip entry + studioResources path; vitest зона **33** |
| **SQ-FE-55** | — | **verify-1 done** | Open **30**; QG ERROR new bug S2871 |
| **SQ-FE-55a** | S | **landed (code)** | `RunsPanel` `localeCompare` sort |
| **SQ-FE-56** | M | **landed (code)** | S7718/S8786/S3776 extracts; vitest **25**; Open после скана |
| **SQ-FE-57** | M | **landed (code)** | ActionForm sections + Workspace pane/chain helpers; vitest **13** |
| **SQ-FE-58** | M | **landed (code)** | ActiveBody/chain-play/ActionKind/OA inventory/suiteZip/admin runs; vitest **13** |
| **SQ-FE-59** | M | **landed (code)** | shared auth options + wire label + admin filter; vitest **6+** |
| **SQ-FE-60** | M | **backlog maint** | чиним: leftover **S3776** (+ maint Open) extracts’ами; не musthave; Open после verify |
| **SQ-VERIFY-2** | — | **done** | Open BE **121** / FE **30**; bugs 0; QG OK/OK |
| **SQ-ACCEPT-12** | — | **ACCEPTED** | risk/QG цикл 12 авг · closeout §7 · boss-report |
| **SQ-BOSS-12** | — | **done** | [`sonar-boss-report-2026-08-12.md`](sonar-boss-report-2026-08-12.md) |
| Closeout | — | **accepted** | [`sonar-closeout-2026-08-12.md`](sonar-closeout-2026-08-12.md) · dig [`history/2026-08-sonar-dig/sonar-dig-2026-08-12.md`](history/2026-08-sonar-dig/sonar-dig-2026-08-12.md) |

---

## Эпик QA — тестовый контур (политика)

| ID | Статус | Суть |
|---|---|---|
| **QA-0** | **closed** | lint/vitest baseline |
| **QA-1** | **landed** | markers `heavy`/`lab` + `pytest_fast.ps1` + notes в `development.md` §6 |

---

## Эпик CANON-CULT — окультуривание FRIEND (docs)

Только docs. Правка `docs/canon/**` — **2FA** ([`canon/INDEX.md`](canon/INDEX.md) § Замок).

| ID | Топик | Статус |
|---|---|---|
| **CANON-CULT-1** | [`canon/data-modules.md`](canon/data-modules.md) | **done** 11 авг |
| **CANON-CULT-2** | [`canon/admin-integrations.md`](canon/admin-integrations.md) | **done** 11 авг |
| **CANON-CULT-3** | [`canon/auth-slots.md`](canon/auth-slots.md) | **done** 11 авг |
| **CANON-CULT-4** | [`canon/lab-up.md`](canon/lab-up.md) | **done** 11 авг |
| **CANON-CULT-5** | [`canon/security-lab.md`](canon/security-lab.md) | **done** 11 авг |

Эпик CULT **closed** (смотритель). Не путать с кодом ART/AUTH.

---

## Эпик DOC-POC — пакет proof_of_concept (docs)

Папка: [`proof_of_concept/`](proof_of_concept/). База: [`proof_of_concept/walkthrough.md`](proof_of_concept/walkthrough.md).  
**Не hub:** SOLID/2FA CANON не применяются. Rewrite и дописывание — норма. Приоритет: держать комплекс актуальным.

| ID | Статус | Суть |
|---|---|---|
| **DOC-POC-0** | **landed** | База `walkthrough.md` (нейтральный research) + политика пакета в README |
| **DOC-POC-1** | **open** | При смене осмотра / рынка / исходного контура — апдейт walkthrough (+ `sources`, затронутые черновики `00`–`06`) |
| **DOC-POC-2** | **landed (11 авг)** | Сверка walkthrough: нейтральный research, без продукта «между строк» |
| **DOC-POC-3** | **landed spike (12 авг)** | Allure Wave A RU + allure3-secops `:5051` SecOps logo — [`acceptance/40-…`](acceptance/40-trials-allure-brand-spike-2026-08-12.md) · research PoC |
| **DOC-POC-4** | **landed (12 авг)** | Stage 2 проблема/тупик (цепь ИБ) — [`06`](proof_of_concept/06-stage2-platform-as-is.md) · эпик **PAL** |
| **DOC-POC-5** | **landed (12 авг)** | Нейтральный нарратив разрыва JTBD — [`08`](proof_of_concept/08-narrative-gap.md) |
| **DOC-POC-6** | **landed (13 авг)** | Allure 3 кастомный плагин **SecOps** (Overview + категории + тёмная тема) — [`research/2026-08-13-allure3-custom-plugin.md`](research/2026-08-13-allure3-custom-plugin.md) · FR [`…-allure3-custom-plugin`](friend-requests/2026-08-13-allure3-custom-plugin.md) |

---

## Эпик PAL (IHSTTYPWNB) — `cosmo-custom`

Паспорт: [`ihsttypwnb-epic.md`](ihsttypwnb-epic.md). Alias **PAL** · FR [`friend-requests/2026-08-12-pal-cosmo-custom.md`](friend-requests/2026-08-12-pal-cosmo-custom.md) (`evolve`).  
Тезисы (нейтрально): [`proof_of_concept/08-narrative-gap.md`](proof_of_concept/08-narrative-gap.md). Пайп священен; hub FRIEND — только 2FA.

### Тезисы → очередь (из волны 12 авг)

| ID | Статус | Тезис / DoD (коротко) | Якорь |
|---|---|---|---|
| **PAL-THESIS** | **landed** | Цепь карточка→ЖЦ→URL→автотесты→DAST→hub; тон без упрёка | [`08`](proof_of_concept/08-narrative-gap.md) · [`06`](proof_of_concept/06-stage2-platform-as-is.md) |
| **PAL-CARD-LIST** | partial | Таблица `/projects`: код, тип, группа, видимость по команде | [wave1](research/2026-08-12-cosmo-portal-settings-wave1.md) |
| **PAL-CARD-NEW** | open | Форма `/projects/new` → сущности create (скелет) | wave1 · PAL-3 |
| **PAL-CARD-TABS** | partial | Табы карточки: Информация · Сборки · Релизы · **Команда** · Квоты · Настройки | [routes](research/2026-08-12-pal-card-routes-wave.md) |
| **PAL-TEAM-RBAC** | open | Команда + AD-группы → права/видимость; роли (не только ФИО) | wave1 · owner nshr note |
| **PAL-LC-STEPS** | **landed (fact)** | ЖЦ `stepId` (build…owasp_dast) + custom build/deploy | [lc map](research/2026-08-12-pal-lc-stage-map-draft.md) · dig lc-body |
| **PAL-PIPE-CUSTOM** | open | Custom child до BRPO; при custom стандартный build/deploy off | `lc-test-build-include` / `build.yml` / `deploy.yml` (вне репо) |
| **PAL-AUTOTEST-REPO** | draft | Автотесты (Maven/Java/Allure/Selenoid) + ZAP-файлы в **репе релиза** — запах | [PAL-5](research/2026-08-12-pal-release-repo-zap-anchor.md) |
| **PAL-DAST-PIPE** | open | Модалка → job → AF/autorun → SARIF → AppSecHub; vars/zap шпаргалки | [pipe-vs-box](research/2026-08-12-cosmo-pipe-vs-box.md) · PAL-4 |
| **PAL-PI-SALVAGE** | **landed** | Спасение ПИ: custom CI + script-auth (факт, не архитектура) | [salvage](research/2026-08-12-pal-pi-salvage-before-after.md) |
| **PAL-NOTIFY-ASIS** | partial | Portal `/settings/notifications`: таблица, create modal, Команда→Приложение+роль | wave1 · dig-notify-team |
| **PAL-ADM-NOTIFY** | **open · P0 Admin** | **В нашу Admin — оповещения** (смысл as-is: тип · заголовок · адресаты · окно · вкл; Команда = app + роль; доставка GUI/email). Не копипаст морды портала | → **ADM-NOTIFY** |
| **PAL-ADM-APPCODE** | **open · P0 Admin** | **Project code / код приложения тянуть в Admin** (программа, фильтры, связка Dojo `Product.name`/`project_id`, адресаты оповещений) | → **ADM-APPCODE** · Dojo acc 58 |
| **PAL-SKELETON** | draft | Единый скелет сущностей Project / LcStep / NotifyRule / Team… | [skeleton](research/2026-08-12-pal-entity-skeleton-draft.md) |
| **PAL-MAP-Q** | open | Вопросы владельцу → логическая карта v1 | паспорт §4 |

### ID-очередь (короткие)

| ID | Статус | Суть |
|---|---|---|
| **PAL-0** | **landed** | Stage 2 (`06`) |
| **PAL-1** | **landed** | card routes + settings ЖЦ |
| **PAL-2** | partial | = PAL-NOTIFY-ASIS |
| **PAL-3** | draft | = PAL-SKELETON + CARD-* |
| **PAL-4** | open | = PAL-DAST-PIPE (карточка → переменные job) |
| **PAL-5** | draft | = PAL-AUTOTEST-REPO + hub/QG pain |
| **PAL-6** | **landed** | = PAL-PI-SALVAGE |
| **PAL-7** | **→ split** | было «admin/notify brief» → **PAL-ADM-NOTIFY** + **PAL-ADM-APPCODE** |
| **PAL-8** | open | = PAL-MAP-Q |
| **PAL-9** | park | Live API / БД стенда |
| **PAL-10** | wall | Подмена BRPO / SoT под модалку |
| **PAL-FR** | evolve | Promote FRIEND PAL — не раньше ready+2FA |

---

## Эпик DBG — режим отладки (**closed**)

`infrastructure.debug_mode`: пауза Live, all-failsafe, admission VOID.  
Код: `debug_run.py` · Live `/api/debug/*`. Self-heal — не DBG (см. Дно).

---

## maybe-cool (кивок Максима)

| ID | Est | Статус | Суть |
|---|---|---|---|
| **MC-1** | S | **landed** | Sonar exclusions бинарников/медиа (BE/FE/joint properties) |
| **MC-2** | M | **landed** | Coverage → Sonar properties + `sonar_coverage_prep` | [`acceptance/28-…`](acceptance/28-trials-multi-mc2-survey-conn-2026-08-11.md) |
| **MC-4** | M | **landed** | Juice MASK_1/2: `lab_fuzz_juice_df11` + `test_fuzz_df11` | [`acceptance/29-…`](acceptance/29-trials-self-l3-conn12-mc4-2026-08-11.md) |
| **MC-5** | L | wall | SoT `wave_mode` в манифест — по приказу |

---

## Дно (не поднимать без явной фразы)

| ID | Суть |
|---|---|
| **DISC-1…3** | [`canon/discovery-heal.md`](canon/discovery-heal.md) §1–2 (HEAL §3 — не дно) |
| **FE-INS / VALUE / Probe Farm** | **SHELVED («Полка»)** — unmute только по явной фразе |

---

## Стены

**CANON:** [`canon/walls.md`](canon/walls.md) · Void: [`canon/INDEX.md`](canon/INDEX.md).  
Кратко: нет Desktop Fuzzer/Jython; нет LSP; нет Job API из UI; нет SecLists в git; void presentation-tool не воскрешать.

---

## Закрытые якоря (не откатывать)

| Эпик | Факт |
|---|---|
| **DF-10…14** | session-bound / corpus / pitchfork / alerts / digest — closed |
| **RES lab + MC-RES-1…3/5** | closed 11 авг; MC-RES-4 wont |
| **QG-AF lab** | nested ACTIVE + filter + Admin policy — landed |
| **DBG 0–6** | closed |
