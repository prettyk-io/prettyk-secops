# Milestone: Полный цикл «ЗАПУСК → РЕЗУЛЬТАТЫ»

> **Дата ревью:** 21 августа 2026
> **Владелец:** Максим
> **Режим:** Keeper (Gemini) + GPT review перед спуском строителей (DeepSeek)
> **Статус:** план полностью выверен, канонические инварианты зафиксированы, P0-фиксы в FE применены

## Назначение

Закрыть полный жизненный цикл одной проверки:

```text
пустая проверка → содержательный сценарий → запуск → Live → артефакты
→ Allure/Dojo/QWEN/gate → assessment/conclusion → package → PDF → 2FA
```

Главный инвариант: новый `check_id` не видит ни одного события, hook, summary,
finding, verdict или пакета от другого `check_id`. При параллельной или последовательной
работе с десятками проверок («на выходе святилища толпа») данные изолированы на 100%.

Канон входных данных — `docs/wired.json`. Demo-seed, legacy migration,
`smoke`, `lab-stub` и очистка «на авось» в acceptance runtime не допускаются.

---

## 🏛️ Хранительские инварианты Святилища (Keeper / Sanctuary Checklist)

Обезьяны забывали занести ключевые канонические правила из `sanctuary/canon/`. Фиксируем их железобетонно:

1. **Две оси допуска («Банку нельзя врать» — `sanctuary/canon/admission.md`):**
   - **Ось исполнения (Execution)**: краш/fatal -> `exit 1` / `fail_run` / `ci_gate=void`. Акт допуска **не формируется** («Допуск: недействителен / VOID»).
   - **Ось допуска ИБ (Admission)**: тесты завершены, но порог Critical/High превышен -> `exit 2` / `fail_gate`. Это **полноценный завершённый прогон**, акт допуска **формируется** (вердикт «Не допущен к релизу»).
   - **Pass / Pass_watch** (`exit 0`) -> акт формируется (вердикт «Допущен к релизу»).

2. **Защита от Cross-Check Contamination (Изоляция при переключении):**
   - Если пользователь запустил Чек A и переключился в UI на Чек B, фоновый Live-поллер **не имеет права** записывать прогон Чека A в массив `runs[]` Чека B.
   - `syncActiveCheckRunFromLive(meta)` маршрутизирует данные строго по `meta.check_id` (уже исправлено и покрыто тестом).

3. **Empty Check Guard & PrettyK 32 Lines (`sanctuary/canon/prettyk-core.md`):**
   - Конструктор имеет канон 32 строк. 32 пустые строки (whitespace) считаются пустым сценарием.
   - Клик Play на пустом чеке сразу показывает тост `Заполните сценарий` **до** запуска валидации схемы и Monaco-линтера (уже исправлено и покрыто тестом).
   - Директивы `@ Title`, `@ Description`, `@ Tag`, `@ Author` валидны в Monaco и отрезаются при сборке runtime payload.

4. **Пакет и защита секретов (`sanctuary/canon/honest-contract.md` §4):**
   - Пакет проверки (`run_package.py`) скачивается как `.zip` только при готовности обязательных evidence.
   - При сборке пакета и акта токены, пароли и ключи в `Wired.json` и `diary.ndjson` экранируются (`[REDACTED]`).
   - Escape hatch для отладки: `KDT_PACKAGE_ALLOW_SECRETS=1`.

5. **Monitor Stream & MH-FIX-LINKS (`sanctuary/acceptance/2026-08-15-monitor-acceptance.md`):**
   - На Monitor Home (`:8767/`) клик по инстансу в таблице ведёт на **живой стрим проверки** (`?run_id=...&check_id=...`), а не на форму редактора.
   - В хедере монитора ссылка «Результаты» ведёт в hash-роут Editor: `http://localhost:5173/#/checks/<check_id>/results`.
   - В headless-режиме VNC/видео скрыты, автоматически включается split/log view. В non-headless — VNC во время прогона плавно переходит в WebM-видео с playhead/carret.

6. **Retention и Legal Hold (ART-1..ART-12):**
   - Очистка старых артефактов (`artifact_cleanup.py`) не должна удалять проверки, помеченные флагом `legal_hold`.
   - История `runs[]` в чеке ограничена `CHECK_RUNS_MAX = 40`.

---

## GPT-аудит текущего плана

### Блокирующие замечания (P0)

| ID | Уровень | Замечание | Статус |
|---|---|---|---|
| G-01 | P0 | Пустота проверялась после валидации схемы и Monaco. | **ИСПРАВЛЕНО** в `appPipelineStart.ts` + тест |
| G-02 | P0 | Интеграция журнала ломала сборку из-за несуществующего `runsRunId`. | **ИСПРАВЛЕНО** в `ResultsWorkspace.tsx` + `tsc` pass |
| G-03 | P0 | `export_diary_snapshot()` в backend отдавал весь `diary.ndjson` без фильтра по `run_id`. | В плане Фазы 3 (задача строителю) |
| G-04 | P0 | `results_hooks.json`, `run_summary.json` глобальные — свежий чек мог видеть старые тайлы. | В плане Фазы 3 (задача строителю) |

### Существенные замечания (P1)

| ID | Уровень | Замечание | Статус |
|---|---|---|---|
| G-05 | P1 | `syncActiveCheckRunFromLive()` безусловно писал Live meta в активный check. | **ИСПРАВЛЕНО** в `checkRunFromLive.ts` + тест |
| G-06 | P1 | Простое исключение `check_id` из `clear_ci_meta()` не изолировало артефакты. | Модель `check_id → run_id` зафиксирована |
| G-07 | P1 | Zero-run check должен гарантировать отсутствие старого journal data. | В плане Фазы 3 |
| G-08 | P1 | Summary, trend и locator-стрипы должны быть скрыты/пусты для zero-run чека. | В плане Фазы 3 |
| G-09 | P1 | `areReportHooksReady()` должен проверять валидность и принадлежность к текущему прогону. | В плане Фазы 5 |
| G-10 | P1 | Acceptance разделить на модульные тесты и реальный E2E прогон. | Зафиксировано в чеклисте DoD |
| G-11 | P1 | QWEN delta stage и algorithmic gate должны иметь четкий контракт. | В плане Фазы 5 |
| G-12 | P1 | PDF — отдельный детерминированный milestone, без подмены `window.print()`. | В плане Фазы 7 |
| G-13 | P1 | User 2FA — отдельный milestone безопасности (TOTP/WebAuthn), не путать с Sanctuary 2FA. | В плане Фазы 8 |

---

## Каноническая модель данных

Для каждого запуска должна быть одна явная identity:

```text
check_id    — стабильный идентификатор проверки в Editor (localStorage)
instance_id — стабильный ключ инстанса в Live/Space (равен check_id)
run_id      — уникальный hex-идентификатор конкретного запуска (Popen / main.py)
```

---

## Фазы реализации (Задачи для DeepSeek Builder)

```
[Phase 1] ────────► [Phase 2] ────────► [Phase 3] ────────► [Phase 4] ────────► [Phase 5] ────────► [Phase 6]
Launch Guard        Identity &          Per-run Diary       Live Views &        Allure/Dojo/        Package
(Frontend DONE)     Deep-link           & Isolation         Replay              Gate & Verdict      Readiness
```

### Фаза 1: Launch Guard до любой валидации (Выполнено)
- [x] 1.1 `isCheckEmpty()` перемещён в начало `runPipelineStart()`.
- [x] 1.2 Регрессионный тест на пустой сценарий (32 строки whitespace).
- [x] 1.3 Позитивный тест на сценарий с шагом `Открыть`.
- [x] 1.4 Scope executable content: шаги сценария, шаги страницы, фаззер.

### Фаза 2: Identity и Live Deep-link (В работе)
- [x] 2.1 Передача `check_id` в `postRunStart`, `lab_run.py`, `controller.py` и `runs_index`.
- [x] 2.2 `syncActiveCheckRunFromLive` фильтрует метаданные по `meta.check_id`.
- [x] 2.3 `buildMonitorUrl` генерирует `?run_id=<run>&token=<tok>&check_id=<check>`.
- [ ] 2.4 В `orchestrator/static/live/index.html` кнопка «Результаты» активна всегда при наличии `urlBoundCheckId` и не скрывается при смене статуса.

### Фаза 3: Per-Run Diary & Results Isolation (Heavy Task)
- [ ] 3.1 Backend `export_diary_snapshot(run_id=...)` фильтрует события `diary.ndjson` строго по `run_id`.
- [ ] 3.2 `ResultsJournalPanel` пуллит `/api/journal/latest?run_id=<runId>` только для чеков с прогонами. Для zero-run чека панель показывает аккуратный empty-placeholder без запросов в сеть.
- [ ] 3.3 `/api/results/hooks` возвращает hooks с привязкой к `run_id` и `check_id`.
- [ ] 3.4 SummaryPanel, TrendChart и Locator-стрипы очищаются/скрываются, если у текущего чека нет собственных завершенных прогонов.

### Фаза 4: Live Views & Replay Acceptance
- [ ] 4.1 Headless-запуск (`chrome-headless`): VNC скрыт, focus/observer disabled, автопереключение в split/log view.
- [ ] 4.2 Non-headless запуск: VNC в live-режиме переключается в `<video>` (WebM) по окончании прогона.
- [ ] 4.3 Playhead / carret: перемотка назад синхронно двигает видео, фильтрует лог по таймстемпу и обновляет шаги execution-rail.

### Фаза 5: Allure, DefectDojo, QWEN & Admission Gate
- [ ] 5.1 Allure: проект создаётся per-check (`KDT_CHECK_ID`).
- [ ] 5.2 DefectDojo: Product `exp01-baseline`, Type `Research and Development`, engagement per-check, test per-run. Gate фильтрует findings по `test_id`.
- [ ] 5.3 QWEN Delta stage: сравнение алертов с baseline на `:8766`.
- [ ] 5.4 Admission Axis:
  - Exit 0 -> Pass / Pass_watch (Допущен) -> Акт доступен.
  - Exit 2 -> Fail_gate (Не допущен) -> Акт доступен.
  - Exit 1 -> Fail_run / Crash -> VOID -> Акт заблокирован («Недействителен»).

### Фаза 6: Package Readiness & Secrets Redaction
- [ ] 6.1 Кнопка «Сохранить пакет» активна только когда оба хука (Allure + Dojo) подтверждены.
- [ ] 6.2 В zip-архив включаются `Wired.json`, `runner.log`, `run_summary.json`, `diary.ndjson`, `act.html` (если включен).
- [ ] 6.3 Секреты в телеметрии экранируются (`redact_secrets`).

---

## 🚀 Готовность к исполнению

- **TypeScript:** `npm run typecheck` — 0 ошибок.
- **Frontend Tests:** `npm test` (targeted) — 30/30 passed.
- **Backend Tests:** `test_diary_live.py` + `test_notify_results_hooks.py` — 39/39 passed.
- **План:** согласован, приёмка разложена по полочкам. Можно спускать DeepSeek на Heavy Execution бэкенда и связки.
