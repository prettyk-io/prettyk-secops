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
| **🔥 PK-DSL-CLEANUP** | **DSL CLEANUP — Миграция Попробовать → try/catch/finally по замороженному контракту** | **🟡 ready (B1 закрыт ранее: 32/32 теста · F1 + F2 остались)** | Flash | 1h (est) | § Эпик PK-WIRE-SYNC ниже → Волна CLEANUP · 2 карточки Flash (Monaco + Canvas) · Boss B1 уже сдан в предыдущем проходе |
| **🔥 PK-VIEWPORT** | **VIEWPORT RELAY — Async CDP Screencast в контейнере: эвакуация Sync Worker, контракты Frame/Input, приёмка Juice Shop** | **🟢 CLOSED (6/6 карточек, 28 авг)** | Boss + Flash + Luna | 0h (закрыто) | § Эпик PK-VIEWPORT ниже · 6 карточек (B1/F1/F2/L1/L2/L1-FIX) · Спецификация: [`docs/research/2026-08-28-browser-viewport-streaming.md`](research/2026-08-28-browser-viewport-streaming.md) |
| **🔥 PW-AIRGAP-2** | **EXECUTION PARITY — Controller гоняет прогон через PlaywrightAdapter за флагом, CDP-поверхность, видео, live-вид, parity-прогон** | **🟡 ready (нарезано, 28 авг)** | не распределено | 14h (est) | § Эпик PW-AIRGAP-2 ниже · 5 карточек · Спецификация: [`docs/research/2026-08-27-browser-runtime-airgap.md`](research/2026-08-27-browser-runtime-airgap.md) |
| **🔥 PW-AIRGAP-3** | **CUTOVER + AIRGAP BUNDLE — дефолт на Playwright, Selenium выпилен, docker save/load, registry вычищен** | **🟡 ready (нарезано, 28 авг)** | не распределено | 8h (est) | § Эпик PW-AIRGAP-3 ниже · 3 карточки · после parity зелёного |
| **🔥 PK-RUNCTL** | **SYSTEM LAYERS — Health-контракт, Edge Gateway, Run Control Plane, Telemetry, Pure Box защита** | **🟡 ready (нарезано, 28 авг)** | не распределено | 20h (est) | § Эпик PK-RUNCTL ниже · 17 карточек (HEALTH 3 / EDGE 2 / RUN-CTL 6 / TELEMETRY 3 / PROFILES 1) · Спецификация: [`docs/research/2026-08-27-system-layers-health-run-ctl-backlog.md`](research/2026-08-27-system-layers-health-run-ctl-backlog.md) |
| **🔥 WARZONE** | **SIGNATURE REWIND 100/100 — детерминированная перемотка луча фаззинга, RTS-камера, 3 режима Execution Hub** | **🟡 ready (нарезано, 28 авг)** | не распределено | 20h (est) | § Эпик WARZONE ниже · 8 карточек · Спецификация: [`docs/research/2026-08-27-studio-warzone-rewind-specification.md`](research/2026-08-27-studio-warzone-rewind-specification.md) · killer-фича-дифференциатор |
| **🔒 COSMOPORT-2** | **CONTROL PLANE — Forge/Gitea + Woodpecker + Pipeline DAG + Run State Machine + Evidence Ledger** | **🟡 нарезано (18 карточек, не в едином бэклоге)** | не распределено | ~46-66h | § в [`sanctuary/cosmoport2/backlog.md`](../sanctuary/cosmoport2/backlog.md) · мажор · флаг-модель 20/40/40 |

> 🏛️ **Архив выполненного:** Все 25+ закрытых эпиков (SC, WAR, DP, DP-ADM, ADM-V3, AUTH-PROF, AUTH-SPIKE, AUTH-PROD, PK-CI 1–3, PK-TRM 1–4, PK-BL, DOJO-S, MH-FIX, IMPX, RK, PSI, VN, CD и др.) перенесены в [`archive/backlog-archive-2026-08.md`](archive/backlog-archive-2026-08.md).

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
- ZAP, Dojo, Allure, findings и evidence pack integration
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
| **PURGE-F2** | **Чистые заголовки документации.** Оператор читает документацию и видит «PrettyK», а не «KDT» в названиях и заголовках. | **Given:** открыт `security.md`, `manifest.md` или `stand.md`. **When:** оператор видит заголовок. **Then:** заголовки и вводные фразы говорят «PrettyK», а не «KDT»; технические env-имена остаются как есть. |

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
> **Out of scope:** Переписывание ZAP, WebKit как обязательное покрытие, полный crawler.

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

### 🔥 Волна CLEANUP: PK-DSL-CLEANUP — Миграция Попробовать → try/catch/finally

> **Причина:** сахарный контракт заморожен 28 авг 2026 — «Попробовать / Перехватить / ВКонце» вырезаны из канона. В сданном коде WIRE-SYNC осталось 29 упоминаний старых русских алиасов. Это техдолг: код поддерживает конструкции, которых нет в утверждённом контракте.

| ID | Что получает оператор | Приёмочный сценарий GWT | Est | Кто |
|---|---|---|---|---|
| **DSL-CLEAN-B1** | `wireDocumentParser.ts` и тесты принимают `try/catch/finally` вместо `Попробовать/Перехватить/ВКонце`. Старые русские токены удалены из control-flow парсера. | **Given:** DSL с блоком `try { ... } catch { ... } finally { ... }`. **When:** парсер читает сценарий. **Then:** распознан TryNode; «Попробовать» больше не парсится и не тестируется. | 0.5h | Boss |
| **DSL-CLEAN-F1** | Monaco: автодополнение, форматтер, keywords, prettyToWire — используют `try/catch/finally`. Русские алиасы удалены. | **Given:** Monaco с автодополнением. **When:** ввод `try`. **Then:** автодополнение предлагает блок `try {…} catch {…} finally {…}`; «Попробовать» отсутствует в подсказках. | 0.5h | Flash |
| **DSL-CLEAN-F2** | Canvas: TRY-BLOCK → чистый бейдж `[TRY]`; подпись «Попробовать» заменена на «try/catch». StepDslScanner ищет `try` вместо `Попробовать`. | **Given:** сценарий с `try/catch` блоком. **When:** открыт Canvas. **Then:** бейдж `[TRY]`, подпись `try/catch`; «Попробовать» не упоминается. | 0.5h | Flash |

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
> **Спецификация:** [`docs/research/2026-08-27-browser-runtime-airgap.md`](research/2026-08-27-browser-runtime-airgap.md) — полный синтез: один Playwright-мир вместо Selenium Grid, ZAP-прокси маршрут, Playwright Firefox ≠ Selenium Firefox, видеоформат webm→mp4.  
> **Проблема:** execution жёстко на Selenium (`core/controller.py` → `WebDriverAdapter`), хотя `PlaywrightAdapter` реализован целиком (428 строк) и не подключён. Split-brain дорожает: два мира образов, PlaywrightAdapter написан впустую.  
> **Цель:** Controller умеет гонять прогон через Playwright за флагом `PK_BROWSER_RUNTIME=playwright`, дефолт остаётся `selenium`; parity-прогон доказывает идентичность verdict/evidence до cutover.

### Карточки PW-AIRGAP-2

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **PW-E1** | Controller гоняет wired-прогон через `PlaywrightAdapter` за флагом `PK_BROWSER_RUNTIME=playwright`; дефолт остаётся `selenium`. ZAP-прокси подхвачен через `host.docker.internal` (как уже решено у Selenium). | **Given:** wired с chrome/firefox. **When:** run с флагом playwright. **Then:** навигация/клики/заполнения идут через Playwright; трафик идёт через ZAP-прокси; evidence тот же контракт, что у Selenium. | 4h |
| **PW-E2** | CDP-поверхность `BrowserAdapter` (cache/cookies/console logs) переписана на Playwright-native (`page.context.new_cdp_session()` / нативные эквиваленты). | **Given:** шаг «ОчиститьКэш» / «ОчиститьCookies». **When:** run на playwright. **Then:** результат идентичен Selenium; console logs собраны; 0 WebDriver-специфики в боевом пути. | 3h |
| **PW-E3** | Видео: `record_video_dir` + `run_id` нейминг + ffmpeg→MP4; Monitor replay работает тем же путём, что Grid-видео. | **Given:** run записан на playwright. **When:** открыт Monitor `?run_id=`. **Then:** видео воспроизводится; контракт MP4 сохранён (webm транскодится). | 3h |
| **PW-E4** | Live-вид execution: headed Playwright под Xvfb → noVNC, оператор видит прогон (не пустой desktop). | **Given:** run в headed-режиме на playwright. **When:** открыт Live. **Then:** живой экран прогона, не пустой Xvfb desktop; viewport корректный. | 2h |
| **PW-E5** | Parity-прогон: одинаковый wired гоняется на Selenium и Playwright (chrome+firefox, headed+headless) до зелёного. Расхождение = баг, фиксируется до cutover. | **Given:** набор wired-фикстур. **When:** parity run. **Then:** одинаковые verdict/evidence; расхождения зафиксированы как баги и закрыты. | 2h |

### Приёмка PW-AIRGAP-2

- [ ] Run с `PK_BROWSER_RUNTIME=playwright` проходит навигацию/клики/заполнения через Playwright.
- [ ] ZAP-прокси подхвачен; evidence тот же контракт.
- [ ] CDP-поверхность (cache/cookies/console) идентична Selenium.
- [ ] Видео воспроизводится в Monitor (`?run_id=`).
- [ ] Live-вид показывает прогон, не пустой desktop.
- [ ] Parity-прогон зелёный по verdict/evidence на обеих runtime.
- [ ] Дефолт остаётся `selenium` — cutover отдельным эпиком.

### Out of scope PW-AIRGAP-2

- Выпиливание Selenium Grid (это PW-AIRGAP-3, после parity).
- WebKit как обязательное покрытие.
- Переписывание ZAP (сканер отдельный).
- Crawler/gather_info полная замена (только боевой путь прогона).

---

## 15. Эпик PW-AIRGAP-3 — Cutover + Airgap Bundle · 28 авг 2026 · 🟡 ready

> **Статус:** 🟡 ready (нарезано, 28 авг 2026). 3 карточки, 8h est. Запускается ТОЛЬКО после зелёного parity (PW-E5).  
> **Цель:** дефолт переключается на Playwright; Selenium Grid выпилен из compose; airgap bundle собирается как один образ `docker save`/`docker load`.

### Карточки PW-AIRGAP-3

| ID | Что получает оператор | Приёмочный сценарий GWT | Est |
|---|---|---|---|
| **PW-C1** | Дефолт переключён на Playwright; Selenium Grid (hub/node/chrome-video/firefox) выпилен из compose. Wired `browser_type` контракт не сломан. | **Given:** parity зелёный. **When:** cutover. **Then:** execution идёт на Playwright; Grid-сервисы не поднимаются; существующие wired-сценарии работают без правки. | 3h |
| **PW-C2** | Airgap bundle: один образ Playwright (браузеры+либы+ffmpeg) экспортируется `docker save`, грузится `docker load` на чистом хосте. `playwright install` НЕ вызывается — браузеры уже в образе. | **Given:** чистый airgap-хост без интернета. **When:** load + up. **Then:** authoring + execution работают офлайн; ноль внешних зависимостей. | 3h |
| **PW-C3** | Registry вычищен: `export_keywords` / `wired_validate` / тесты больше не тянут `WebDriverAdapter` как боевой путь. | **Given:** cutover выполнен. **When:** `test_suite_imports` + smoke. **Then:** registry maps на Playwright; 0 ссылок на боевой Selenium-путь. | 2h |

### Приёмка PW-AIRGAP-3

- [ ] Execution идёт на Playwright по умолчанию; Grid не поднимается.
- [ ] Airgap bundle: `docker load` на чистом хосте → authoring + execution работают офлайн.
- [ ] Registry: 0 ссылок на боевой WebDriverAdapter; wired `browser_type` контракт не сломан.
- [ ] Все существующие тесты зелёные (или моки обновлены).

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
| **EDGE-1** | Edge Gateway: один внешний порт (443), TLS, WebSocket/SSE не обрываются, внутренние сервисы (PG/Valkey/ZAP/OpenBao/Grid) не exposed. | **Given:** self-hosted профиль. **Then:** всё через один порт; прямой запрос к PG не доходит. | 3h |
| **EDGE-2** | CORS + rate-limiting на уровне gateway (единая политика, не в каждом сервисе). | **Given:** неразрешённый origin. **Then:** отклонён на gateway; превышение лимита → 429. | 2h |

### Пакет RUN-CTL — Run Control Plane (6 карточек, ядро)

| ID | Что получает оператор | Приёмочный сценарий GWT (кратко) | Est |
|---|---|---|---|
| **RUN-CTL-1** | Модель жизненного цикла запуска: очередь → выполняется → завершён/ошибка → отменён. Переходы атомарны, история состояний сохранена. | **Given:** создан запуск. **Then:** статус «в очереди» → «выполняется» → «завершён». | 2h |
| **RUN-CTL-2** | Защита от дублирования: повторный идентичный запрос не создаёт второй run. | **Given:** двойной клик «Запустить». **Then:** возвращён существующий run. | 1h |
| **RUN-CTL-3** | Ограничение одновременных запусков: FIFO-очередь, позиция и ожидание видны. | **Given:** worker'ы заняты. **Then:** новый запуск в очереди с позицией. | 2h |
| **RUN-CTL-4** | Назначение подходящему worker'у по capabilities (браузер/ZAP/зона). | **Given:** нужен Chrome, свободен только безбраузерный. **Then:** запуск ждёт браузерного worker'а. | 2h |
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
| **WZ-7** | Timeline scrubber: мастер-ползунок с маркерами (STEP/HIGH/BEAM_START/ZAP), двухступенчатый рендеринг (Canvas каждый rAF, видео/логи квант 60ms). | **Given:** скраб-драг ползунка. **Then:** 60 FPS на основном треке; видео и логи не грузят декодер. | 2h |
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
> **Цель:** перевести историю и сущности в PostgreSQL, бинарные артефакты (видео, скриншоты, HAR, ZAP-отчёты, сырые логи) — в MinIO/S3, живой стрим событий — через Valkey, а старый пульт вывести из эксплуатации только после полной проверки. Pure Box остаётся на локальном хранилище без обязательного MinIO.

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

## ⛔ Стены и ограничения (Железобетон)

1. **Gate A — строгий рубеж:** ни один декоративный компонент не должен подменять живой `CheckWorkspace` / `formData`.
2. **SoT `docs/manifest.json` / `orchestrator/models/wired.py` не ломать:** Machine-контракт неизменен.
3. **Plaintext-секреты запрещены:** ни в `localStorage`, ни в draft, ни в экспорте, ни в DOM.
4. **Один Chromium runtime:** Browser Stage и runner изолируют контексты через `BrowserContext`, но не плодят параллельные процессы Chrome.
5. **Тесты:** при изменениях запускать точечно по затронутым файлам. Весь suite целиком во время отладки не гонять.
