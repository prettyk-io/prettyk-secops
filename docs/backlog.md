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

**Поток:** Максим ↔ Keeper (PO/Discovery) → бэклог → Boss + Flash (параллельное исполнение) → Keeper (приёмка по GWT) → Максим (инвентаризация в Святилище).

---

## Карта оперативной очереди

| # | Эпик | Статус | Кому | Часы | Суть / Ссылка |
|---|---|---|---|---|---|---|
| **PK-WB** | **WORKBENCH — Editor ↔ Studio: единый CheckWorkspace, Commit, Diff, Browser Stage** | **CLOSED (100% ✅)** | Boss + Flash | 0h (73h закрыто) | § Эпик PK-WB ниже · 352 теста, tsc 0, фундамент сдан |
| **PK-ER** | **EDITOR REBORN — Возврат продуктового Explorer, навигация, visual rails, continuity** | **IMPLEMENTED (52 теста, tsc 0)** | Boss + Flash | 13h | § Эпик PK-ER ниже · Стратегия: `docs/editor-reborn.md` |
| **🔥 CDP-WIRE** | **LIVE DISCOVERY — CDP → Wire → Studio Step + Editor Step Drawn** | **Phase 1 🟥 BLOCKED (live-баг)** | Boss + Flash | 20h (Plan) | § CDP-WIRE ниже · 79 тестов · live-клик роняет `_on_click` NameError — Boss чинит, потом re-verify |
| **BUD-E2E** | **PRETTYK BUDDY end-to-end — живой CDP-клик + engine → Studio → run → evidence** | **🟡 ДВИЖОК И STU-V2 РЕАЛИЗОВАНЫ · PROMOTE ЗАБЛОКИРОВАН** | Boss + Flash | — | § Эпик BUD-E2E ниже · движок 64/64, STU-V2 402/402, tsc 0 · PROMOTE после live CDP и перехода на канонические рельсы STU-RAILS |
| **STU-V2** | **STUDIO V2 — долить функционал старого Studio (живой Explorer, конструктор, валидация, отладчик, browser stage, консоль) + идти по instance id** | **🟡 IMPLEMENTED (402/402 тестов, tsc 0)** | Boss + Flash | — | § Эпик STU-V2 ниже · функциональный долив сдан на временном `-v2` маршруте · переход на канонические рельсы — STU-RAILS |
| **STU-RAILS** | **CANONICAL STUDIO/EDITOR — новые поверхности на обычных маршрутах, legacy на `-old`** | **🟡 IMPLEMENTED (tsc 0 · 66 тестов)** | Boss + Flash | — | § Эпик STU-RAILS ниже · B1-B6 + F1-F4 сданы · ждёт живой UX-проход CDP |
| **POC-AI-PROVIDER** | **AI PROVIDER MATRIX — optional Local Qwen + optional Gemini для non-AirGap** | **READY (PoC)** | Keeper discovery → Boss после отдельной команды | — | [`spike/2026-08-26-ai-provider-matrix.md`](spike/2026-08-26-ai-provider-matrix.md) · AirGap скрывает Gemini · deterministic fallback обязателен |
| **SANCTUARY-MAP** | **ТАКТИЧЕСКИЙ РАДАР ОБИТЕЛИ — интерактивная карта приложения: семантический зум, 5 линз, телепортация** | **🔨 IN PROGRESS (Boss зона сдана · Flash зона в работе)** | Boss + Flash | 27h | § Эпик SANCTUARY-MAP ниже · B1-B3+J1 сданы (33 теста) · Flash доделывает холст/шейдеры/Idea Forge+Ctrl+M |
| **KCF** | **KIMAKI CHARACTER FRAMEWORK — Discord × OpenCode × Buddy: разумные боги** | **READY** | Buddy lead + Boss + Flash | — | § Эпик KCF ниже · Полный план: `docs/research/2026-08-25-kimaki-character-framework-plan.md` |
| **KDT-PURGE** | **KDT PURGATORY FINISH — закрыто (26 авг 2026)** | **CLOSED (100 % ✅)** | Boss + Flash | 0h (закрыто) | Boss B1–B4 ✅ · Flash F1+F2 ✅ · принято Keeper · § Эпик KDT-PURGE ниже |
| **ADM-PURE** | **SecOps Control для pure — Applications / Targets / Runs / Findings / Policies** | **PARKED (until scanner PR)** | Boss | 17h | Не приоритет. Продукт = сканер, дашборды потом. |
| **PK-CI-F4** | **PRETTYK-CI фаза 4 — Адаптеры к Jenkins / Tekton / Argo / Azure DevOps** | **FUTURE** | Boss | — | По реальному спросу |
| **PK-TRM-F5** | **WEB-IDE-TERMINAL фаза 5 — Security Playbook Notebook + AI-подсказки** | **FUTURE** | Flash | — | По реальному спросу |
| **PAL** | **PAL (IHSTTYPWNB) — `cosmo-custom` портал** | **PARKED** | — | — | До отдельного решения |

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

## 5. Эпик KCF — Kimaki Character Framework (READY · 25 авг 2026)

> **Статус:** `READY` — полный Plan подготовлен; реализацию и эксплуатационный
> контур ведёт Buddy. Архитектурный и продуктовый результат принимают Keeper и
> Максим.
> **План:** [`research/2026-08-25-kimaki-character-framework-plan.md`](research/2026-08-25-kimaki-character-framework-plan.md).
> **Граница:** «разумные боги» = широкая capability-модель без угодничества,
> но с неотключаемыми identity/policy/audit/recovery-инвариантами.
> **Важно:** KCF не является permissionless LLM и не превращает Discord nickname,
> сообщение или роль в членство PrettyK.

### Epic Brief

**Цель:** дать владельцу и нескольким явно назначенным операторам мощный Discord
контур, где Kimaki умеет отвечать, помнить подтверждённые предпочтения и
управлять разрешёнными ресурсами, а Buddy обеспечивает живучесть, секреты,
наблюдаемость и восстановление.

**Роли:** Buddy — delivery/operations lead; Boss — доменный runtime и интеграции;
Flash — Discord UX и admin surfaces; Keeper — требования и приёмка; Максим —
owner и финальное решение.

**Out-of-scope:** self-bot; произвольный REST/shell из LLM; скрытая запись всей
истории; автоматическое PrettyK enrollment; production install/deploy без
явного приказа Максима; Sanctuary/canon без 2FA.

### Нарезка задач KCF

| ID | Что получает пользователь | Приёмочный сценарий GWT (ЧИСТО) | Кому |
|---|---|---|---|
| **KCF-0** | Ясный режим полномочий: owner, operators, agents, guests; мощное прямое поведение без sycophancy и без саморасширения прав. | **Given:** агент получает запрос на действие. **When:** действие требует capability. **Then:** решение опирается на actor/scope/policy; агент говорит прямо и выполняет разрешённое, а не льстит и не выдумывает доступ. | Buddy lead + Boss |
| **KCF-1** | Бот подключается к разрешённому guild и устойчиво принимает interactions/events. | **Given:** бот перезапущен или Gateway разорвал соединение. **When:** сервис возвращается. **Then:** heartbeat/reconnect/resume работают; команды не дублируются; состояние здоровья видно оператору. | Buddy + Boss |
| **KCF-2** | Пользователь всегда узнаётся правильно, даже после смены nickname/username. | **Given:** пользователь меняет отображаемое имя. **When:** он вызывает команду снова. **Then:** открывается прежняя identity; новый дубль не создан; guild scope не перепутан. | Boss |
| **KCF-3** | Нейтральный guest и управляемый character profile с opt-in, show, edit, export, disable и forget. | **Given:** новый пользователь пишет боту. **When:** нет явного согласия. **Then:** он остаётся guest; после opt-in можно сохранить только подтверждённое предпочтение; show/export/forget показывают честный результат. | Boss + Flash |
| **KCF-4** | Наблюдения не становятся фактами без подтверждения; profile не становится членством проекта. | **Given:** модель предполагает интерес, роль или шутку. **When:** пользователь не подтвердил это. **Then:** запись остаётся session-only или отбрасывается; Discord membership и PrettyK membership не меняются. | Boss |
| **KCF-5** | Durable memory и контекст Kimaki выдаются строго в текущем scope. | **Given:** у пользователя есть данные из другого guild/project. **When:** Kimaki отвечает здесь. **Then:** чужой scope не попадает в контекст; после forget факт исчезает из retrieval/cache/новой сессии. | Boss |
| **KCF-6** | Kimaki получает profile context через OpenCode без загрязнения глобального prompt. | **Given:** запрос приходит из Discord. **When:** создаётся/продолжается агентная сессия. **Then:** identity, guild, consent и approved context связаны с этой сессией; untrusted message не меняет policy или capability. | Boss |
| **KCF-7** | Discord admin plane с понятными read-only, reversible и destructive действиями. | **Given:** агент предлагает изменение. **When:** операция выполняется. **Then:** typed allowlist, Discord permissions, role hierarchy, scope и approval level проверены; произвольный REST запрещён. | Boss |
| **KCF-8** | Опасные действия требуют видимого preview/confirmation, а владелец может остановить запись. | **Given:** предлагается удалить, забанить, массово изменить или сменить policy. **When:** нет нужного approval. **Then:** действие не выполняется; при подтверждении есть before/after/result; kill switch блокирует agent writes. | Boss + Flash |
| **KCF-9** | Полный audit и восстановление: кто, что, где, почему и чем закончилось. | **Given:** изменён профиль, роль, канал или policy. **When:** оператор открывает audit/recovery. **Then:** виден correlation trail; доступен export/revoke/rollback; восстановление проверено на non-production guild. | Buddy + Flash |
| **KCF-10** | Сервис живёт как управляемый production-like контур: secrets, migrations, health, alerts, backups, rate-limit handling. | **Given:** сервис стартует, падает или получает 401/403/429. **When:** Buddy запускает/обновляет/останавливает его. **Then:** секреты не попадают в repo/logs/prompts; состояние диагностируется; retry уважает Discord headers; restore runbook исполним. | Buddy |
| **KCF-11** | Private pilot и adversarial acceptance перед расширением полномочий. | **Given:** один тестовый guild и owner/operators. **When:** выполнены IDOR, cross-guild, prompt injection, memory poisoning, replay, secret leakage и rate-limit tests. **Then:** все критические gates green; только после этого разрешается следующий wave/multi-guild. | Boss + Buddy + Keeper |

### KCF acceptance gates

| Gate | Факт |
|---|---|
| **KCF-A** | ID stable; nickname changes do not duplicate identity. |
| **KCF-B** | Guest/profile/membership/permission/memory scopes are isolated. |
| **KCF-C** | No durable memory without consent; forget is effective everywhere. |
| **KCF-D** | Agent actions are typed, allowlisted, authorized and audited. |
| **KCF-E** | Gateway reconnect/resume and Discord rate-limit handling are proven. |
| **KCF-F** | Kill switch, backup and restore are demonstrated. |
| **KCF-G** | Private pilot passes adversarial tests; Keeper accepts GWT; Максим sees it. |

---

## 6. Эпик ADM-PURE — SecOps Control для pure (PARKED · 25 авг 2026)

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

## 8. Эпик HDO — Headless Observe (браузер ВНУТРИ коробки) · IN PROGRESS · 27 авг 2026

> **Тип:** `Plan` — переворот авторинг-браузера из «окно на десктопе» в «невидимый
> headless-процесс + рендер скриншотами + клик по координатам». Это финально
> закрывает CDP-WIRE Phase 1 (PROMOTE) и разблокирует BUD-E2E + STU-RAILS.
> **Причина:** headed `chromium.launch(headless=False)` спавнит окно Chrome на
> десктопе оператора — браузер живёт СНАРУЖИ. Коробке нужен браузер ВНУТРИ:
> рендер в `<img>` (скриншот), клик оператора по картинке → координаты →
> `page.mouse.click(x,y)` в headless → реальный DOM click → observe → DSL.
> **Философия:** никаких окон на десктопе; браузер — невидимый процесс Playground;
> рендер только скриншоты; клики только координаты.

### Нарезка Boss (backend: headless launch + observe/click + enrich + Play) — 10h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **HDO-B1** | **Браузер невидим и живёт внутри Playground.** При старте авторинга не появляется окно Chrome на десктопе — браузер поднимается headless с заданным viewport. | **Given:** оператор жмёт Go в Browser Stage. **When:** `_get_page()` запускает браузер. **Then:** `chromium.launch(headless=True)` с `viewport={width:1280,height:800}`; на десктопе нет ни одного нового окна Chrome; `connected=true` и `url` возвращаются корректно. |
| **HDO-B2** | **Клик по картинке = клик в браузере.** Оператор кликает по скриншоту во встроенной панели; система транслирует координаты в реальный DOM click. | **Given:** headless-браузер открыл целевую страницу, скриншот виден. **When:** фронт шлёт `{x,y}` в новый endpoint. **Then:** `page.mouse.click(x,y)` производит реальный DOM click; `document.addEventListener('click')` + `expose_binding` ловят его; событие попадает в очередь; `event: null` больше не возвращается. |
| **HDO-B3** | **Обогащение работает в headless.** AX-нода, candidates, valueClass и isAmbiguous строятся для клика в невидимом браузере так же, как раньше для физического. | **Given:** клик пойман (HDO-B2). **When:** `browser_observe_event` достаёт событие. **Then:** у события есть `candidates` (role-first), `role`, `accessibleName`, `valueClass`, `isAmbiguous`; неоднозначный кандидат блокирует автоприменение. |
| **HDO-B4** | **Play role/label/test_id исполняется в headless.** Записанный шаг реально выполняется невидимым браузером: `get_by_role`/`get_by_label`/`get_by_test_id`. | **Given:** сценарий с Click/Type/Open шагами. **When:** оператор жмёт Play. **Then:** `page.get_by_role`/`get_by_label`/`get_by_test_id` находят элемент в headless и кликают; `get_by_test_id` приоритетнее; после шага скриншот обновляется; Type-шаг redacted. |
| **HDO-B5** | **Сквозной integration-тест доказывает цепочку.** `POST observe/click {x,y}` → mouse.click → observe → candidates → DSL — без моков на уровне Playwright. | **Given:** поднят Playground + headless-браузер. **When:** гоняется `test_browser_service.py` (расширен). **Then:** полный цикл `navigate → observe/click → event(candidates) → шаг` зелёный; `event: null` никогда; таймауты и обрыв соединения дают честный fail, не pass. |

### Нарезка Flash (frontend: клик по <img>, proposal, Record UX, StepPill/DSL) — 9h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **HDO-F1** | **Клик по живой картинке.** Оператор кликает прямо по скриншоту во встроенной панели; фронт считает координаты в масштабе viewport и шлёт их на backend. | **Given:** скриншот страницы показан в Browser Stage. **When:** оператор кликает по `<img>`. **Then:** координаты вычисляются с учётом `object-contain` (letterboxing) и шлются в `/api/browser/observe/click {x,y}`; клик не уходит за пределы реальной страницы. |
| **HDO-F2** | **Proposal Accept/Reject → DSL.** Пойманный клик превращается в reviewable proposal; Accept создаёт ровно один DSL-шаг, Reject не трогает draft. | **Given:** клик по картинке пойман (HDO-F1). **When:** фронт поллит `observe/event` и показывает proposal. **Then:** Accept (Enter) создаёт один canonical step; Reject (Esc) не меняет workspace; неоднозначный locator блокирует auto-apply; дубль не создаётся без нового Accept. |
| **HDO-F3** | **Record UX честный.** В режиме Record виден индикатор «Recording clicks», скриншот обновляется после каждого действия, координатный клик не ломает DOM страницы. | **Given:** Record включён, headless-браузер открыт. **When:** оператор кликает по скриншоту. **Then:** индикатор пульсирует; после шага скриншот обновляется; вёрстка панели не ломается; disconnected/timeout показаны честно, не как успех. |
| **HDO-F4** | **Один шаг — две проекции.** Принятый шаг появляется в Studio как StepPill и в Editor как DSL-строка с общим identity и provenance. | **Given:** шаг принят (HDO-F2). **When:** открыты Studio и Editor. **Then:** в Studio — StepPill с цветом действия; в Editor — DSL-строка «✨ Discovered»; общая step identity, нет двух копий. |

### Приёмка HDO (Keeper)

- На десктопе оператора НЕ появляется ни одного окна Chrome (headless, внутри Playground).
- Клик по скриншоту = реальный DOM click в headless; `event: null` не возвращается.
- AX/candidates/valueClass/isAmbiguous работают в headless; неоднозначный блокирует.
- Play role/label/test_id исполняется headless; Type redacted.
- Accept/Reject детерминированы; до Accept workspace не меняется; дублей нет.
- Studio StepPill + Editor DSL — один шаг, одна identity.
- Интеграционный тест доказывает `navigate → observe/click → event → DSL`.
- tsc 0; точечные тесты зелёные; ни один существующий движок (Buddy 64/64, STU-V2 402/402) не регрессит.

### Out of scope HDO

- Live-video/streaming рендер вместо скриншот-поллинга (будущий оптимизационный эпик).
- Полный crawler, авто-принятие шагов, все action types (только click + type + open + wait).
- Grid/noVNC execution (`:7900`) — это Studio execution, не авторинг, не трогаем.

---

## 9. Эпик RAILS-PROMOTE — Canonical Rails + BUD-E2E PROMOTE · IN PROGRESS · 27 авг 2026

> **Тип:** `Plan` — финальная канонизация поверхностей и PROMOTE двух PoC.
> **Контекст:** STU-V2 (402/402) и BUD-E2E движок (64/64) уже реализованы, но живут
> на временных маршрутах (`#/studio-v2`) и не прошли живой run. STU-RAILS (66 тестов)
> нарезан ранее. Этот эпик сводит всё к каноническим рельсам и выдаёт PROMOTE после
> живого CDP-run через новый headless observe (эпик HDO).
> **Цель:** один instance id → обычные `studio`/`editor`; legacy под `-old`;
> публичного `-v2` нет; живой run глазами оператора; PROMOTE BUD-E2E и CDP-WIRE.

### Нарезка Luna (канонизация маршрутов + живой PROMOTE) — 14h

| ID | Что получает оператор | Приёмочный сценарий GWT (ЧИСТО) |
|---|---|---|
| **RAILS-L1** | **Канонические маршруты.** Новая Studio/Editor открываются на обычных `#/checks/<id>/studio` и `#/checks/<id>/editor` по instance id; legacy доступен только под `-old`. | **Given:** две проверки. **When:** оператор открывает `#/checks/<id>/studio`. **Then:** открывается новая Studio именно этой проверки; `-old` ведёт на legacy; публичный `-v2` не используется; неизвестный id даёт честную ошибку/пустоту, не home. |
| **RAILS-L2** | **Studio ↔ Editor — две проекции одного instance.** Переход сохраняет id, draft, выбранный документ и resource context. | **Given:** открыт документ/правка. **When:** оператор переходит Studio ↔ Editor и обратно. **Then:** тот же instance, та же сущность, тот же draft; другой id открывает другой контекст. |
| **RAILS-L3** | **Один хедер, одна навигация.** Активная поверхность честно обозначена; двойного хедера и временного `-v2` в навигации нет. | **Given:** открыт новый `studio`/`editor`. **When:** оператор смотрит на шапку и переключается. **Then:** один хедер; активная поверхность обозначена; переход сохраняет id. |
| **RAILS-L4** | **Explorer живой и единственный; Canvas не дублирует дерево.** | **Given:** у проверки есть сущности. **When:** раскрыт Explorer. **Then:** шесть корней с реальными сущностями; Canvas показывает рабочий граф, а не вторую копию корней со счётчиками. |
| **RAILS-L5** | **Живой run через headless observe.** После HDO оператор гоняет `intent → skeleton → clarify → proposal → run → evidence` на одном тестовом приложении без окон на десктопе. | **Given:** тестовое приложение доступно. **When:** оператор запускает bounded run. **Then:** шаги реально выполняются headless-браузером; виден текущий шаг; Stop работает; disconnected/timeout честный fail, не pass. |
| **RAILS-L6** | **PROMOTE CDP-WIRE + BUD-E2E + STU-V2.** После зелёного живого run канонические рельсы и PoC движки признаются production-ready; временные маршруты и mock-фолбэки уходят из пользовательского пути. | **Given:** RAILS-L1..L5 зелёные. **When:** Keeper проводит приёмку. **Then:** `studio`/`editor` каноничны; live run доказан evidence; PASS только при доказанных assertions; plaintext-секретов нет; вердикт PROMOTE зафиксирован в бэклоге. |

### Приёмка RAILS-PROMOTE (Keeper)

- `studio`/`editor` каноничны, `-old` legacy, `-v2` нет в публичном пути.
- Studio ↔ Editor сохраняет instance id, draft, документ, resource context.
- Один хедер; Explorer единственный; Canvas не дублирует дерево.
- Живой run (headless observe) доказан: клик → event → proposal → Accept → run → evidence.
- PASS только по доказанным assertions; Stop/отключение не маскируются под успех.
- PROMOTE выдаётся после зелёной приёмки; tsc 0; Buddy/STU-V2/фундамент не регрессируют.

### Out of scope RAILS-PROMOTE

- Удаление legacy-кода/маршрутов (отдельная команда владельца).
- Новый функциональный долив вне STU-V2 (уже сдан).
- Полный redesign Sanctuary Map; AI provider; автономный AI-оператор.

---

## 10. Эпик PW-AIRGAP — Browser Runtime Unify на Playwright · evolve · 27 авг 2026

> **Тип:** `evolve` — план. Решающий развилок принят: **Путь A (unify now)**.
> **Research:** [`docs/research/2026-08-27-browser-runtime-airgap.md`](research/2026-08-27-browser-runtime-airgap.md).
> **Проблема:** окна Chrome на десктопе оператора + два браузерных мира (Selenium Grid для execution, Playwright для authoring) + отсутствие браузерного рантайма на проде/airgap.
> **Цель:** один Playwright-мир (chromium+firefox+webkit+ffmpeg) в одном контейнере; execution переезжает за флагом `PK_BROWSER_RUNTIME`; authoring = headed-под-Xvfb + живой стрим (noVNC) в коробку; Selenium выпиливается после parity-прогона.

### Нарезка Boss (backend / infra / ядро)

| ID | Что получает оператор | GWT приёмка |
|---|---|---|
| **PW-A1** | Один Playwright-контейнер (chromium+firefox+webkit+ffmpeg) в compose, headed Chromium под Xvfb, noVNC на канон-порту. | **Given:** `lab_up`. **When:** контейнер стартовал. **Then:** один Playwright-процесс; на десктопе хоста ноль окон Chrome; noVNC живой; `playwright install` НЕ вызывается. |
| **PW-A2** | `browser_service.py` authoring привязан к headed-браузеру контейнера (connect_over_cdp/remote), не headless+скриншот. | **Given:** Studio/BrowserStage. **When:** клик по живому стриму. **Then:** реальный клик в headed Chromium; observe→proposal→DSL; hover/фокус живые. |
| **PW-A4** | Ровно один браузер на сессию: класс-синглтон, пассивный `status()`, переиспользование, полный teardown. | **Given:** браузер жив. **When:** повторный вход/поллинг status. **Then:** тот же `browserId`, новых процессов нет; `status()` никогда не запускает браузер. |
| **PW-E1** | Controller гоняет прогон через Playwright за флагом `PK_BROWSER_RUNTIME=playwright`, дефолт `selenium`. | **Given:** wired chrome/firefox. **When:** run playwright. **Then:** nav/click/fill на Playwright; ZAP-прокси подхвачен (`host.docker.internal`); evidence тот же контракт. |
| **PW-E2** | CDP-поверхность BrowserAdapter переписана на Playwright-native (`new_cdp_session`). | **Given:** шаг ОчиститьКэш/ОчиститьCookies. **When:** run playwright. **Then:** результат идентичен Selenium; 0 ссылок на `execute_cdp_cmd`. |
| **PW-E3** | Видео: `record_video_dir` + `run_id` нейминг + ffmpeg→MP4; Monitor replay тем же путём. | **Given:** run записан. **When:** Monitor `?run_id=`. **Then:** видео играет; пустого кадра нет в headed. |
| **PW-E5** | Parity-прогон: один wired на Selenium и Playwright (chrome+firefox, headed+headless) до зелёного. | **Given:** набор wired-фикстур. **When:** parity run. **Then:** одинаковые verdict/evidence; расхождение = баг до cutover. |
| **PW-C1** | Дефолт Playwright; Selenium выпилен из compose (hub/node/video). | **Given:** parity зелёный. **When:** cutover. **Then:** execution на Playwright; Grid не поднимается; контракт `browser_type` цел. |
| **PW-C2** | Airgap bundle: один образ `docker save` → `docker load` на чистом офлайн-хосте. | **Given:** airgap-хост без интернета. **When:** load + up. **Then:** authoring+execution офлайн; `--with-deps` не вызывается. |
| **PW-C3** | Registry вычищен: `export_keywords`/`wired_validate`/тесты не тянут `WebDriverAdapter` как боевой путь. | **Given:** cutover. **When:** smoke. **Then:** registry maps на Playwright; 0 ссылок на боевой Selenium-путь. |

### Нарезка Flash (frontend / UI)

| ID | Что получает оператор | GWT приёмка |
|---|---|---|
| **PW-A3** | Живой стрим в коробку: `<iframe>` noVNC (или CDP screencast), не скриншот-поллинг. | **Given:** браузер поднят. **When:** BrowserStage. **Then:** живой поток; скриншот-поллинг и `clickCoordinate.ts` удалены из авторского пути. |
| **PW-A5** | Честный Record UX на живом noVNC: proposal/индикатор/ambiguous на стриме; клик не эмулируется координатами. | **Given:** Record + стрим. **When:** клик по стриму. **Then:** observe→proposal→Accept/Reject→один DSL-шаг; неоднозначный блокирует. |
| **PW-E4** | Live-вид execution: headed-прогон стримится в Live/VideoTrack (noVNC iframe). | **Given:** run headed. **When:** Live. **Then:** живой экран; noVNC→запись бесшовно. |
| **PW-F1** | Фронт без headless-костылей: 0 ссылок на `observe/click`/`clickCoordinate`; подписи «Authoring». | **Given:** grep по фронту. **When:** чистка. **Then:** 0 refs на координатную эмуляцию; подписи каноничны. |
| **PW-F2** | Parity отображение: evidence/вердикт одинаково рендерятся для selenium/playwright; dev-переключатель runtime. | **Given:** два прогона. **When:** результаты. **Then:** одинаковые карточки/вердикты; переключатель только в dev. |

### Приёмка PW-AIRGAP (Keeper)

- Один Playwright-мир; Selenium выпилен; на десктопе юзера ноль окон браузера.
- Authoring — headed-под-Xvfb + живой стрим (hover/анимация/фокус живые).
- Execution — parity зелёный до cutover; видео/live-вид идентичны Grid.
- Airgap bundle разворачивается офлайн без `playwright install`.
- `status()` пассивен, тестовый путь проходит; весь suite по затронутым файлам.

### Out of scope PW-AIRGAP

- Переписывание ZAP (сканер) — отдельный контур, не трогаем.
- WebKit как обязательное покрытие в wired — бонус в образе, без приказа не добавляем.
- Crawler-функции (`crawl_urls`/`gather_info`) полной замены — мигрируем только боевой путь прогона.

---

## ⛔ Стены и ограничения (Железобетон)

1. **Gate A — строгий рубеж:** ни один декоративный компонент не должен подменять живой `CheckWorkspace` / `formData`.
2. **SoT `docs/manifest.json` / `orchestrator/models/wired.py` не ломать:** Machine-контракт неизменен.
3. **Plaintext-секреты запрещены:** ни в `localStorage`, ни в draft, ни в экспорте, ни в DOM.
4. **Один Chromium runtime:** Browser Stage и runner изолируют контексты через `BrowserContext`, но не плодят параллельные процессы Chrome.
5. **Тесты:** при изменениях запускать точечно по затронутым файлам. Весь suite целиком во время отладки не гонять.
