# Архив выполненных эпиков KDT / PrettyK (Август 2026)

> **ARCHIVE & EVIDENCE LEDGER.** Не активная очередь.  
> Полная историческая летопись всех закрытых эпиков, задач, приёмочных критериев (GWT) и доказательств за август 2026 года.  
> Активный рабочий бэклог: [`../backlog.md`](../backlog.md).  
> Алтарь побед: [`../../sanctuary/ALTAR.md`](../../sanctuary/ALTAR.md).  
> Срез архивации: **25 августа 2026 года**.

---

## Реестр закрытых эпиков архива

| Эпик ID | Название | Дата закрытия | Исполнители / Доказательства |
|---|---|---|---|
| **SC** | STUDIO-CANVAS — prettyK Studio v2: React Flow + Step Deck | 25 авг 2026 | Boss: SC-TEST-1…5, 39 тестов, vitest 100/100 |
| **SC-WAR** | WAR ROOM — тактический конвейер запуска: 5 фаз, SSE, Canvas 2D | 25 авг 2026 | Boss: WR-TEST-1…5, 54 теста, vitest 100/100 |
| **DP** | DESIGN PLAYGROUND — полный порт на shadcn/ui + Tailwind v4 | 23 авг 2026 | Boss: DP-1…10 (22.5h) |
| **DP-ADM** | DESIGN PLAYGROUND: Admin Showcase — MUI-галерея | 24 авг 2026 | Boss + Flash: DP-ADM-0…10 (21h) |
| **ADM-V3** | ADM-V3 — Minimal Theme Integration: Cyber-Enterprise Shell | 25 авг 2026 | Boss + Flash: 100 vitest, minimalTheme export, live showcase |
| **AUTH-PROF** | USER-PROFILES — Единая система профилей, гранулярный RBAC, PAT | 24 авг 2026 | Boss + Flash: B-1…3, F-1…3, vitest 39/39 |
| **AUTH-SPIKE** | BETTER-AUTH — Production Auth Backend Spike | 24 авг 2026 | Boss + Flash: 48/48 vitest, tsc 0 |
| **AUTH-PROD** | PRODUCTION-AUTH — Production Auth Boundary: PostgreSQL + OpenBao | 25 авг 2026 | Flash: Better Auth → PostgreSQL, OpenBao, 2FA, auth 9/9 |
| **PK-CI** | PRETTYK-CI — Security Pipeline Platform (Волны 1–3) | 24 авг 2026 | Boss: 12 карточек, tsc 0, vitest 94/94, cross-layer 143/143 |
| **PK-TRM** | WEB-IDE-TERMINAL — Security Workbench & Terminal Gateway | 24 авг 2026 | Flash: 9 карточек, xterm.js, Gateway :3002 |
| **PK-BL** | PRETTYK-BASELINE — One-click baseline flow | 24 авг 2026 | Boss + Flash: 18 файлов intake/pipeline/executor/radar/delta |
| **DOJO-S** | DEFECTDOJO-AUTO-SYNC — автоматическая синхронизация находок | 25 авг 2026 | Flash: DojoSyncDashboard.tsx, dedup, suppression pipeline |
| **MH-FIX** | MONITOR — починка ссылок HomePage → живой стрим | 25 авг 2026 | Boss: навигация hashRoute / AppShell переписана |
| **IMPX** | Импорт конфигурации между проверками | 16 авг 2026 | Boss + Flash: IMPX-1…6, studioTransfer, dialog |
| **RK** | RJSF-KILL — выпиливание JSON Schema / RJSF + React mapper | 16 авг 2026 | Bro + Flash: 72 файла legacy удалено, прямой маппер |
| **PSI** | Приёмочно-сдаточные испытания (PSI-1…10) | 25 авг 2026 | Все 10 зон подтверждены |
| **VN** | VNEXT фронт — архитектурный монолит cosmo/ | 14 авг 2026 | Bro + Flash + Boss |
| **CD** | CORPUS-DISCOVERY — zero-touch корпус + фаззинг | 16 авг 2026 | Boss + Bro + Flash: CD-1…9 (56 тестов) |
| **INT** | INTRUDER-PRO — фаззер, режимы Burp + Grep Match/Extract | 17 авг 2026 | INT-1…3 |
| **AUTH-V** | AUTH-CHAIN-VAULT — мульти-профильная pre-flight авторизация | 17 авг 2026 | AUTH-1…3 |
| **SALV** | SALVAGE — добор пригодного кода из to-sanitize | 17 авг 2026 | SALV-1…4 |
| **RET** | RETENTION & CLEANUP — очистка диска и артефактов | 17 авг 2026 | RET-API-1/2, RET-UI-1 |
| **BLANK** | BLANK-PREV — inline-просмотр акта/бланка ИБ + FNV-1a | 17 авг 2026 | BLANK-PREV-1 |
| **MON** | MONITOR — мульти-монитор + replay + единый playhead | 17 авг 2026 | MON-1…19 |
| **MH** | MONITOR-HUB — хаб монитора: MainPage, space | 15 авг 2026 | MH-1…8 |
| **STAND-REL** | STAND-RELOCATE — бэкенд и стенд в корень | 14 авг 2026 | STAND-REL-1…4 |
| **IMP** | API modules: OpenAPI, GraphQL, gRPC, HAR, CHAIN | 11 авг 2026 | IMP-OA/AD/GQL/GRPC/HAR/CHAIN |
| **ART** | Артефакты, retention, cleanup job | 11 авг 2026 | ART-0…12 |
| **AUTH** | Авторизация в Studio (Form, MFA, Browser, Cookies) | 11 авг 2026 | AUTH-10…15 |
| **CONN** | Коннекторы: SSH, Logs, MQ, DB, Prometheus | 11 авг 2026 | CONN-10…13 |
| **NAV / E2E / RES / DF** | CheckInstance, History, Shell, Live, Allure, DAST Wave | 11–16 авг | Landed в ядро |

---

## 1. Эпик DOJO-S — автоматический жизненный цикл находок (CLOSED · 25 авг 2026)

> **CLOSED · 25 августа 2026.** Flash: автоимпорт, дедупликация, suppression pipeline, дашборд DojoSyncDashboard.tsx.

| ID | Что должно получить лицо пользователя | Приёмочный сценарий | Статус |
|---|---|---|---|
| **DOJO-S-1** | После завершения прогона все найденные активные уязвимости автоматически появляются в связанном контексте DefectDojo с корректными названием, severity, CWE и доказательством. | **Given:** прогон завершён и в нём есть находка. **When:** завершается формирование результатов. **Then:** находка видна в DefectDojo и в результатах PrettyK; ручная кнопка синхронизации не требуется. **Edge:** если Dojo временно недоступен, результат явно показывает ошибку синка, а не зелёный успех. | ✅ CLOSED — 25 авг (Flash) |
| **DOJO-S-2** | Повторный прогон той же уязвимости не создаёт второй одинаковый finding, а отражается как повтор существующей находки. | **Given:** одна находка уже отправлена. **When:** тот же сценарий запускается повторно с теми же признаками уязвимости. **Then:** в Dojo остаётся одна логическая находка, счётчик/история повторов корректны, а в UI виден dedup-результат. **Edge:** изменение endpoint, параметра, типа атаки или severity не маскируется под старую находку. | ✅ CLOSED — 25 авг (Flash) |
| **DOJO-S-3** | Статус, выставленный специалистом в DefectDojo, учитывается в следующем результате PrettyK и не порождает повторный активный алерт. | **Given:** finding помечен как False Positive, Risk Accepted, mitigated или inactive. **When:** выполняется следующий sync/прогон. **Then:** finding виден как подавленный, не входит в активный gate и не исчезает бесследно из истории. **Edge:** неподтверждённая или отсутствующая в Dojo находка остаётся активной. | ✅ CLOSED — 25 авг (Flash) |
| **DOJO-S-4** | Оператор видит единый честный статус синхронизации: последний запуск, отправленные, deduped, активные, подавленные и ошибочные находки. | **Given:** sync завершился успешно, частично или с ошибкой. **When:** оператор открывает Admin и обновляет состояние. **Then:** показатели соответствуют фактическому результату последнего запуска, повторное нажатие не создаёт параллельных sync-процессов, а недоступность Dojo отображается как down/unconfigured. | ✅ CLOSED — 25 авг (Flash) |

---

## 2. Эпик STUDIO-CANVAS — prettyK Studio v2 (CLOSED · 25 авг 2026)

> **CLOSED · 25 августа 2026.** Boss: 100 тестов, 10 файлов, vitest 100/100 за 1.8s.

| ID | Статус | Суть | Est |
|---|---|---|---|
| **SC-1** | **✅ 22 авг** | `@xyflow/react` v12.11.3 установлен. `ScenarioCanvas.tsx` — smoke (7 нод, custom nodes, minimap, controls). Роут `#/canvas`. | 0.5h |
| **SC-2** | **✅ 22 авг** | Tailwind CSS v4 + `@tailwindcss/vite`. `src/tailwind.css` с shadcn темой и CSS-переменными. `components.json`. `cn()` util. | 0.5h |
| **SC-3** | **✅ 22 авг** | `StudioV2.tsx` — shell на shadcn/ui + Tailwind: header (PrettyK бейдж, Сохранить/Запустить), левый сайдбар (дерево проекта), центр (React Flow canvas), правый инспектор (свойства ноды), нижняя консоль (лог запуска). Панели сворачиваются. Роут `#/studio-v2`. | 2h |
| **SC-4** | **✅ 22 авг** | **Step Deck Node.** `ScenarioDeckNode.tsx` — капсульная нода сценария в React Flow: шапка с названием и счётчиком шагов, сворачивание/разворачивание, список шагов с пилюлями внутри, кнопка «Добавить шаг». Вертикальный пайплайн, без рёбер. | 4h |
| **SC-5** | **✅ 22 авг** | **Pill-Based Step Row.** `StepPillRow.tsx` — строка шага с тремя пилюлями: действие, стратегия, значение ($переменные с автодополнением). LED-индикатор, кнопки вверх/вниз/▶/удалить. | 4h |
| **SC-6** | **✅ 22 авг** | **Two-Way Wired Synchronizer.** `ScenarioDeckSynchronizer.ts` + `useScenarioDeckWire` — синхронизация Pill UI ↔ PrettyK DSL ↔ Wired JSON. Zustand store `ScenarioDeckStore`. | 3h |
| **SC-7** | **✅ 22 авг** | **Step-by-Step Playwright Debug.** Эндпоинт `/api/run/step` в `data_playground.py` — принимает action/strategy/strategy_value/payload, строит DSL constructor, валидирует. Кнопка `▶` в строке → POST → LED → success/failure. | 3h |
| **SC-8** | **✅ 22 авг** | **CDP Browser Pane.** `browser_service.py` (5 эндпоинтов), `BrowserPanel.tsx`, вкладка «Браузер» в правой панели, синхронизация клик-на-строке → подсветка элемента. | 6h |

---

## 3. Эпик SC-WAR — War Room: тактический конвейер запуска (CLOSED · 25 авг 2026)

> **CLOSED · 25 августа 2026.** Boss: WR-1…8 + 54 теста, vitest 100/100. 5 фаз Ignition→Aftermath, фотонные импульсы, camera focus.

| ID | Статус | Суть | Файлы | Est |
|---|---|---|---|---|
| **WR-1** | **✅ 22 авг** | **Telemetry Bridge.** `useWarRoomTelemetry.ts` — SSE → Zustand: 6 типов. | `useWarRoomTelemetry.ts` | 3h |
| **WR-2** | **✅ 22 авг** | **War Room Layout Switcher.** CSS-класс `pk-war-room`, War Room bar. | `ScenarioFlow.tsx` | 2h |
| **WR-3** | **✅ 22 авг** | **Camera Director.** `useReactFlow().fitView()` через `consumeCameraFocus()`. | `ScenarioFlow.tsx` | 2h |
| **WR-4** | **✅ 22 авг** | **Step LED Pipeline.** `LedIndicator` — 6 состояний. | `StepPillRow.tsx` | 2h |
| **WR-5** | **✅ 22 авг** | **Node HUD Whisperer.** Чип под хедером ноды. | `ScenarioDeckNode.tsx` | 1.5h |
| **WR-6** | **✅ 22 авг** | **Fuzzer Strike Overlay.** CHARGE → STRIKE, 30 лучей. | `FuzzerStrikeOverlay.tsx` | 4h |
| **WR-7** | **✅ 22 авг** | **Anomaly Shockwave.** Кольцо + вспышка. | `FuzzerStrikeOverlay.tsx` | 2h |
| **WR-8** | **✅ 22 авг** | **Synthesis Gate.** PASSED/FAILED bar. | `ScenarioFlow.tsx` | 1.5h |

---

## 4. Эпик DP — порт Design Playground на shadcn/ui + Tailwind v4 (CLOSED · 23 авг 2026)

> **CLOSED · 23 августа 2026.** Полный порт дизайнерского полигона (`#/design-playground`) на shadcn/ui + Tailwind CSS v4. DP-1…10 ✅ (22.5h).

| ID | Статус | Суть | Est |
|---|---|---|---|
| **DP-1** | **✅ 23 авг** | Инфраструктура: shadcn Tabs, Card, Typography, Divider, Tooltip. | 2.5h |
| **DP-2** | **✅ 23 авг** | 8 пресетов и фон: Tailwind-конфиг + CSS-переменные. | 2.0h |
| **DP-3** | **✅ 23 авг** | Input Particles: 12 SecOps-инпутов на shadcn. | 3.0h |
| **DP-4** | **✅ 23 авг** | Buttons & Switches: 8 стилей кнопок. | 2.0h |
| **DP-5** | **✅ 23 авг** | SecOps Combat Forms: формы скоупа и фаззинга. | 2.5h |
| **DP-6** | **✅ 23 авг** | Component Matrix: матрица компонентов с плотностью. | 3.5h |
| **DP-7** | **✅ 23 авг** | Typography: песочница шрифтов (Golos, JetBrains Mono). | 2.0h |
| **DP-8** | **✅ 23 авг** | Brandbook & Gradients: 5 градиентов, 6 threat-токенов, WCAG. | 1.5h |
| **DP-9** | **✅ 23 авг** | Spacing & Depth: шкала отступов, радиусы, тени. | 1.0h |
| **DP-10** | **✅ 23 авг** | Tailwind for Designers & Workshop: живая песочница + туториал. | 2.5h |

---

## 5. Эпик DP-ADM — Admin Showcase: MUI-галерея компонентов (CLOSED · 24 авг 2026)

| ID | Суть | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **DP-ADM-0** | Theme Overview & Figma Kit Tab | **✅ 24 авг.** Hero-баннер Cyber Minimal темы, обзор стека, 6 фич. | 2h | Boss |
| **DP-ADM-1** | Admin Showcase SPA: Gateway & Скелет | **✅ 24 авг.** Изолированный `ScopedCssBaseline`, 6 табов, ленивая подгрузка MUI. | 2h | Boss |
| **DP-ADM-2** | Data Gallery: 15 компонентов + Cyber Threat DataGrid | **✅ 24 авг.** 15 типов карточек, спарклайны, DataGrid. | 4h | Boss |
| **DP-ADM-3** | Form Patterns: 12 компонентов + Blank Wizard | **✅ 24 авг.** 3-step Provisioning Wizard, аккордеоны. | 4h | Boss |
| **DP-ADM-4** | Navigation & Layout: 6 компонентов + Cmd+K | **✅ 24 авг.** Space Switcher, Headers, Command Palette. | 2h | Boss |
| **DP-ADM-5** | Theme Studio: 5 MUI-пресетов с live-морфингом | **✅ 24 авг.** Мгновенная смена палитр, copy theme config. | 2h | Flash |
| **DP-ADM-6** | Live Previews: мост к живым панелям | **✅ 24 авг.** Переход в `#/control`, `#/admin`, `#/dashboard`. | 0.5h | Flash |
| **DP-ADM-7** | Design Gateway: вкладка в Design Playground | **✅ 24 авг.** Бесшовный редирект на `#/design-admin`. | 0.5h | Flash |
| **DP-ADM-8** | Studio Playground: shadcn Dashboard Block + Sidebars | **✅ 24 авг.** Dashboard-01 и sidebar-03/07 на shadcn. | 2h | Boss |
| **DP-ADM-9** | Studio Playground: Login Pages + Settings | **✅ 24 авг.** Login-03, login-04 и settings page. | 1h | Boss |
| **DP-ADM-10** | Интеграция и верификация: tsc + vitest | **✅ 24 авг.** `tsc --noEmit` 0 ошибок, vitest 100% pass. | 1h | Flash |

---

## 6. Эпик ADM-V3 — Minimal Theme Integration (CLOSED · 25 авг 2026)

| ID | Суть | Статус | Est | Кто |
|---|---|---|---|---|
| **ADM-10** | Component Overrides: 44 файла портированы в `theme-minimal/` | ✅ 25 авг | 6h | Boss |
| **ADM-11** | Mixins: 5 файлов миксинов портированы под Cyber Minimal | ✅ 25 авг | 2h | Boss |
| **ADM-12** | Экспорт `minimalTheme` из `theme-minimal/index.ts` | ✅ 25 авг | 0.5h | Boss |
| **ADM-13** | Подключение живых секций DataGallery, FormPatterns, NavigationLayout | ✅ 25 авг | 1h | Flash |
| **ADM-14** | Ленивая загрузка AdminShowcase через `lazy(() => import(...))` | ✅ 25 авг | 0.5h | Flash |
| **ADM-15** | 5-я тема «Cyber Minimal» в ThemeGallery | ✅ 25 авг | 1h | Flash |
| **ADM-16** | A/B Toggle сравнения Current Themes / Cyber Minimal | ✅ 25 авг | 1h | Flash |
| **ADM-17** | Визуальная сверка боевых панелей: `#/admin`, `#/control`, `#/dashboard` | ✅ 25 авг | 2h | Boss |
| **ADM-18** | CSS-изоляция: Emotion injection order + Tailwind preflight | ✅ 25 авг | 1h | Boss |
| **ADM-19…22** | Приёмка: 100 vitest, tsc 0, dark/light режимы | ✅ 25 авг | — | Keeper |

---

## 7. Эпик AUTH-PROF & AUTH-SPIKE & AUTH-PROD (CLOSED · 24–25 авг 2026)

### AUTH-PROF (PoC сдан · 24 авг)
- `profileStore.ts` — Unified Profile Store, Capabilities матрица, useUserProfile хук (Boss B-1).
- `adminAuthProvider.ts` — Forward-compatible React Admin bridge (Boss B-2).
- `tokenEngine.ts` — PAT генератор `pk_live_<32 hex>`, маскировка, отзыв (Boss B-3).
- `ProfileDrawer.tsx` — Cyber Dark Glass Drawer на 3 вкладки (Flash F-1).
- Header Wiring + Preferences / Locales реактивная смена темы/шрифта (Flash F-2, F-3).
- Тесты: `vitest` targeted/auth — 39/39 pass, tsc 0.

### AUTH-SPIKE (Сравнение Better Auth vs Keycloak · 24 авг)
- Better Auth v1.7.1 на порту :3001 (Drizzle + PG) vs Keycloak 26.1 на :8082.
- 48/48 тестов зелёные. Решение: Better Auth + PostgreSQL — единый стек через Compose.

### AUTH-PROD (Production Auth Boundary · 25 авг)
- Better Auth → PostgreSQL 16 (Drizzle `drizzleAdapter` с `provider: 'pg'`).
- Секреты в OpenBao (порт 8200, клиент `bao.ts`, ноль hardcoded паролей).
- Авто-миграции при запуске `auth-server.ts`, seed admin через API.
- 2FA (TOTP, Google Authenticator), email-верификация, rate limiting (sliding window 10 req/min).
- `tsc --noEmit` 0, auth-тесты 9/9 зелёные.

---

## 8. Эпик PRETTYK-CI — Security Pipeline Platform (CLOSED · 24 авг 2026)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-CI-1** | Проверка как граф шагов с зависимостями и approvals | Граф восстанавливается после рестарта стенда | 5h | Boss |
| **PK-CI-2** | Изолированный запуск с честной state machine | Статусы честные, повтор не дублирует findings | 6h | Boss |
| **PK-CI-3** | Визуальный граф ↔ текст синхронны | Клик по узлу подсвечивает DSL и наоборот | 4h | Boss |
| **PK-CI-4** | Каталог готовых security-шагов | Discovery, scanner Scan, Fuzzing, Gate, Evidence Pack | 3h | Boss |
| **PK-CI-5** | Preflight проверка scope, policy, approvals | Нарушение scope блокирует запуск с аудитом | 4h | Boss |
| **PK-CI-6** | Вызов проверки из внешнего CI/CD | Внешний job получает стабильный exit-код и ссылку | 5h | Boss |
| **PK-CI-7** | Предпросмотр плана до запуска | План с рисками, правами, gates и ресурсами | 3h | Boss |
| **PK-CI-8** | Импорт/экспорт с отчётом о потерях | Явный список несовместимостей при импорте | 3h | Boss |
| **PK-CI-9** | Версионирование security-компонентов | Блокировка непинованных версий в production | 3h | Boss |
| **PK-CI-10** | Полное доказательство с provenance | Provenance wired, SHA-256 артефактов | 4h | Boss |
| **PK-CI-11** | Авто-сборка Reproduce из находки | Минимальный повторяемый конвейер | 3h | Boss |
| **PK-CI-12** | Step Debugger: вход/выход, повтор с payload | Изолированная отладка шага | 4h | Boss |

**Результат:** tsc 0, vitest 94/94, cross-layer 143/143.

---

## 9. Эпик WEB-IDE-TERMINAL — Security Workbench (CLOSED · 24 авг 2026)

| ID | Что получает пользователь | Приёмочный GWT | Est | Кто |
|---|---|---|---|---|
| **PK-TRM-1** | Изолированное рабочее пространство терминала | Таймаут, квоты, без доступа к хосту | 6h | Flash |
| **PK-TRM-2** | Проверка прав и подтверждение опасных команд | Редакция секретов (Cookie/Bearer/PAT) в выводе | 4h | Flash |
| **PK-TRM-3** | xterm.js терминал в IDE с переподключением | Reconnect без дублирования процесса | 4h | Flash |
| **PK-TRM-4** | Структурированная командная консоль | Форма с превью прав и типовыми командами | 3h | Flash |
| **PK-TRM-5** | Консоль прогона привязана к запуску | Живой статус, безопасные логи | 5h | Flash |
| **PK-TRM-6** | Сохранение вывода команды как evidence | Артефакт с checksum и timestamp | 3h | Flash |
| **PK-TRM-7** | Инспектор запрос/ответ с редиактом секретов | Связь с finding и обратно | 3h | Flash |
| **PK-TRM-8** | Monaco-интеллект для PrettyK DSL | Autocomplete, подсказки, диагностика, rename | 6h | Flash |
| **PK-TRM-9** | Синхронный просмотр: код ↔ граф | План рисков до запуска | 4h | Flash |
| **PK-TRM-10** | Отладка на уровне security-действия | Точка останова, статус, повтор с входом | 5h | Flash |
| **PK-TRM-11** | Evidence-linked Editor + Policy Lens | Строка DSL → finding → артефакт | 4h | Flash |

**Результат:** Terminal Gateway Backend на порту `:3002`, WebSocket, xterm.js клиент.

---

## 10. Эпик PRETTYK-BASELINE — One-click Baseline (CLOSED · 24 авг 2026)

- `intakeParser.ts` — парсинг URL, OpenAPI, HAR (Boss PK-BL-1).
- `smartPipeline.ts` — авто-конструирование пайплайна (Boss PK-BL-2).
- `boundedExecutor.ts` — безопасный исполнитель с лимитами (Boss PK-BL-3).
- `deltaLedger.ts` — детерминированный движок сравнения находок с baseline (Boss PK-BL-4).
- `baselineApi.ts` — REST & SSE API (Boss PK-BL-5).
- `StrikeModal.tsx` — модальное окно Drop & Strike (Flash PK-BL-6).
- `DragDropZone.tsx` — drag-and-drop с автодетектом формата (Flash PK-BL-7).
- `AttackSurfaceRadar.tsx` — радар поверхности атаки (Flash PK-BL-8).
- `LivePhaseRail.tsx` — рейл фаз прогона в реальном времени (Flash PK-BL-9).
- `BaselineDeltaLedger.tsx` — витрина вердикта и дельты находок (Flash PK-BL-10).
- `baselineWidgets.test.tsx` — компонентные тесты.

---

## 11. Эпик MH-FIX — Навигация HomePage Monitor (CLOSED · 25 авг 2026)

- Клик по проверке в списке запусков HomePage Monitor открывает живой стрим проверки (экран/видео/логи), а не форму редактора.
- Навигация переписана: `hashRoute.ts`, `AppShell.tsx`, `HomePage.tsx`. Ссылки ведут на `checkId` и стрим.

---

## 12. Эпик IMPX — Импорт конфигурации между проверками (CLOSED · 16 авг 2026)

- `IMPX-1`: `checksStore.ts` — `listChecks()` отдаёт все проверки, фильтр снят.
- `IMPX-2`: `studioTransfer.ts` — `extractEditorBlocks` / `mergeEditorBlocks` / `selectBlocks`. Тесты 6/6.
- `IMPX-3`: `StudioImportDialog.tsx` — модалка «Импорт из проверки».
- `IMPX-4`: `StudioWorkspace.tsx` — кнопка «Импорт» в тулбаре.
- `IMPX-5`: `handleImportBlocks` — безопасный мерж в `onFormDataChange` + `onResourceContentsChange`.
- `IMPX-6`: Sanity-тесты `StudioImportDialog.test.tsx` (4/4) + `studioTransfer.test.ts` (6/6).

---

## 13. Эпик RK — RJSF-KILL (CLOSED · 16 авг 2026)

- Выпилены `@rjsf/core`, `@rjsf/antd`, `@rjsf/validator-ajv8`, `ajv`, `json-schema-merge-allof`.
- Удалены 72 файла legacy `src/schema/` и `src/form/`.
- `WiredForm.tsx` переписан на прямой React-маппер без RJSF.
- `Wired` / `wired.py` — единственный machine-контракт.

---

## 14. Эпик PSI — Приёмочно-сдаточные испытания (CLOSED · 25 авг 2026)

| ID | Зона | Что проверено | Статус |
|---|---|---|---|
| **PSI-1** | Стенд | `lab_up.ps1` — Grid + Allure + scanner demon + Juice Shop healthy | ✅ |
| **PSI-2** | Редактор | Vite dev (`cosmo`) — login, Home, Admin, History, Studio, Results. E2E smoke 17/17 | ✅ |
| **PSI-3** | Оркестратор | `orchestrator/main.py` — validate-only без ошибок | ✅ |
| **PSI-4** | Прогон | Полный цикл: wired → Controller.run() → scanner alerts → allure → run_summary | ✅ |
| **PSI-5** | Dojo | DefectDojo import scanner XML → findings в UI → dedup → suppression | ✅ |
| **PSI-6** | Gate | Quality gate: High порог → exit code 0/2. Admission filter | ✅ |
| **PSI-7** | Live | KDT Live :8767 idle → прогон → ленты сценария/сканера → журнал | ✅ |
| **PSI-8** | Бандл | `vite build` prod (< 2 MB gzip), `package_vps.py` | ✅ |
| **PSI-9** | Sonar | Backend + Frontend vnext проход по критическим правилам | ✅ |
| **PSI-10** | Доки | `NEW_AGENT_MANDATORY.md`, `MANTRA.md`, бэклог синхронизированы | ✅ |

---

## 15. Эпик CORPUS-DISCOVERY — Zero-Touch Корпус (CLOSED · 16 авг 2026)

- `CD-1`: `discovery_capture.py` — захват DOM + scanner History в NDJSON (12 тестов).
- `CD-2`: `corpus_parser.py` — извлечение форм, инпутов и шаблонов запросов (10 тестов).
- `CD-3`: `service_map.py` — топологический граф эндпоинтов и форм (7 тестов).
- `CD-4`: `awaken.py` — эвристическое пробуждение orphan-форм (6 тестов).
- `CD-5`: `scanner_context.py` — инжекция сырого HTTP/1.1 корпуса в Sites Tree (3 теста).
- `CD-6`: `pipeline.py` — сквозной конвейер discovery → passive → activeScan (1 тест).
- `CD-7`: `fuzzer.py` — собственный мутационный фаззер (50+ векторов, sniper/pitchfork/cluster-bomb, 12 тестов).
- `CD-8`: `fuzz_reporter.py` — классификация аномалий и генерация findings (17 тестов).
- `CD-9`: Ручной Burp Intruder-killer в UI (`StudioFuzzPanel.tsx`).

---

## 16. Эпик VN — vnext Фронтенд (CLOSED · 14 авг 2026)

- Архитектурный переход от legacy-кода к чистому монолиту `cosmo/` (сейчас `frontend/`).
- Модули: `ROOT-1/2`, `ED-1…4`, `FORM-1…5`, `SHELL-1…5`, `INT-1…6`, `ST-1…10`, `WS-1…10`, `ADM-1…6`, `RES-1…5`, `FILL-1…4`, `POL-F1…F4`, `POL-R1…R3`.
- `ALLURE3-BRAND` и `ALLURE3-INSTANCE`: фирменный тёмный отчёт Allure3 с per-check историей и app-дашбордом.

---

## 17. Исторические модули ядра (IMP, ART, AUTH, CONN, NAV, E2E, RES, DF, FE, S, L, SONAR)

- **IMP:** OpenAPI 3 / Swagger 2 import (`IMP-OA-0…9`), GraphQL introspection (`IMP-GQL-0…6`), gRPC pack (`IMP-GRPC-0…6`), HAR replay (`IMP-HAR-0…5`), Business Chain builder (`IMP-CHAIN-0…8`).
- **ART:** Индекс артефактов `check_id` → `run_id` → disk (`ART-1`), мягкий `legal_hold` (`SURVEY-3`), CLI/API cleanup job (`ART-5…7`).
- **AUTH:** Multi-profile авторизация (API Key, Basic, Bearer, CSV/compose, Form/Selenium, MFA TOTP/SMS, cookies injection в scanner).
- **CONN:** Тонкие коннекторы MethodId (Prometheus, SSH-команды, TCP-пробы к MQ/DB, HTTP-логи).
- **MONITOR:** 3-й сплит-view, таймлайн, скраббинг видео и логов, KDT Live VNC streaming.
- **SONAR:** Массовая очистка technical debt (SQ-BE-60…74, SQ-FE-50…60, A/A/A quality gate).

---

> Летопись сохранена в полном объёме. Все факты, файлы и GWT-сценарии зафиксированы.
