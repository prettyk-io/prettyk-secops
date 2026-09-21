# PK-DEBT-RED — сверка red-счёта полного suite

> **Карточки:** RC2-5 (Run Control wave 2 — Debt) + RC2-6 (Zero-TSC фронтенд + триаж heavy/lab).  
> **Исполнитель:** Luna (worker).  
> **Дата сверки:** 2026-09-20.  
> **Раннер:** `D:\prettyk-secops\.venv\Scripts\python.exe -m pytest -q` (rootdir `D:\prettyk-secops`).  
> **Зачем:** закрыть «предсуществующий хвост» из backlog (L940, L1218: 47–48 red: browser-каталог, gate_policy env, fuzz/teardown/juice) и честно объяснить каждый оставшийся red.

---

## 1. Итоговый baseline

### RC2-5 (до чужих WIP-правок)

```
2 failed, 2192 passed, 60 skipped, 15 warnings in 379.01s
```

Было (PROGRESS.md, 2026-09-20, non-heavy): `2099 passed, 47 skipped; 20 fail + 8 collect-error`.

Снижение: **20 fail + 8 collect-error → 2 fail**, collect-errors → 0.

### RC2-6 (после триажа heavy/lab и чужих WIP-правок Boss/Flash)

```
2235 passed, 55 skipped, 168s  → exit 0
```

Тот же прогон до RC2-6 был `2235 passed, 55 skipped, 0 failed`; рост числа тестов (2254 → 2290 collected) — чужие правки в дереве (Boss: `test_browser_step_execute.py` BBA-EXEC-1, BBA-5). Регрессий от RC2-6 нет.

---

## 2. Что закрыто в этом проходе

### 2.1. 8 collect-error → 0 (stale-импорты `scanner_*` → `zap_*`)

Модули `orchestrator.utils.scanner_work_stream` и родственные переименованы в `zap_*`, но импорты остались старыми:

| Файл | Строка |
|---|---|
| `orchestrator/corpus/pipeline.py` | 19 |
| `orchestrator/utils/gather_info.py` | 17 |
| `orchestrator/utils/reporter.py` | 575 |
| `orchestrator/tests/test_capability_zap.py` | 3 (`adapters.capability_scanner` → `adapters.capability_zap`) |
| `orchestrator/tests/test_zap_context.py` | 6 |
| `orchestrator/tests/test_zap_report_summary.py` | 6 |
| `orchestrator/tests/test_zap_work_stream.py` | 7 |

Символы внутри модулей уже назывались `zap*` — правились только пути модулей.

### 2.2. Тестовые зависимости

`orchestrator/requirements-dev.txt`: добавлены `fakeredis>=2.0.0,<3`, `pytest-asyncio>=0.23,<2` (`bs4` уже был). Установлены в `.venv`.

### 2.3. 15 падений `test_run_lease.py` — утечка event loop (не баг lease)

Симптом: `RuntimeError: Runner.run() cannot be called from a running event loop` + каскад `coroutine ... was never awaited`. Проявлялось **только в полном suite**, изолированно lease был зелёный.

Root cause: `orchestrator/tests/test_pw_airgap_phase2.py::test_playwright_adapter_cdp_clear_cache_no_browser` вызывает `PlaywrightAdapter.cdp_clear_browser_cache()` → `sync_playwright().start()` поднимает `ProactorEventLoop` в главном потоке. Браузер не запускается, исключение глушится `_ensure_cdp`, а `stop()`/`shutdown()` не вызывается → loop остаётся `running=True` до конца процесса и отравляет **все** последующие async-тесты.

Фикс (только тест, продукт не тронут): `try/finally: ad.shutdown()` в `test_pw_airgap_phase2.py:55-58`.

Диагностика: pytest-плагин-проба, отмечавший первый тест, после которого в главном потоке остался running loop (см. «Воспроизведение»).

### 2.4. Конфиг pytest

`pytest.ini`: добавлены `asyncio_mode = auto` и `asyncio_default_fixture_loop_scope = function`. Совпадает с намерением репо (комментарий PARITY-LIVE в `test_browser_runtime_parity.py:11-13`).

---

## 3. Оставшийся red (2) — ЗАКРЫТ (Boss/BBA, 2026-09-20)

| Тест | Причина | Диспозиция |
|---|---|---|
| `test_browser_service.py::test_observe_event_enriches_and_pops` | BBA-5 в `browser/browser_service.py:528-529` возвращает `{"event": None}` при `_page is None` — **до** разбора очереди `_observed_events`. Тест кладёт событие через `_on_click` и ждёт его извлечение и обогащение. Контракт теста разошёлся с поведением BBA-5. | **✅ ЗАКРЫТ (Boss/BBA).** |
| `test_browser_service.py::test_observe_candidates_end_to_end_via_click_handler` | То же: `req["event"]`/`evt` = None из-за раннего `return` при `_page is None`. | **✅ ЗАКРЫТ (Boss/BBA).** |

Решение принято владельцем BBA (Boss): в `_cmd_observe_event` **сначала отдаются уже накопленные события** (enrich умеет `page=None`), а `connected: False` сообщается **отдельным полем** — liveness-проверка (`page.evaluate("1")`) считает `connected`, не блокируя отдачу очереди. Событие, собранное до отвала CDP, честно доходит до оператора; при отвале `connected: False` + `_page` сбрасывается для будущего reconnect.

**Итог BBA-5 (Boss):** `test_browser_service.py` = 55 passed / 1 skipped; browser-контур без env = 141 passed / 1 skipped; live BBA-6 (CDP Chrome/128) = 1 passed. Red-счёт по этому долгу → **0**.

---

## 4. Остаточный риск (не red, вне дефолтного цикла)

55 skipped — маркеры `heavy`/`lab` (`pytest.ini`) + env-гейты. В дефолтном прогоне не выполняются. Разобраны по причинам в §7. Это не red-долг, а непроверенная зона.

**DoD RC2-5:** red-счёт снижен с 20 fail + 8 collect-error до 2 fail; каждый оставшийся red объяснён (FOLLOW-UP BBA/Boss); collect-errors 0.

---

## 5. Воспроизведение

```powershell
# Полный baseline
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest -q

# Только оставшийся red
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest `
  "orchestrator/tests/test_browser_service.py::test_observe_event_enriches_and_pops" `
  "orchestrator/tests/test_browser_service.py::test_observe_candidates_end_to_end_via_click_handler" -q
```

---

# RC2-6 — Zero-TSC фронтенд + триаж heavy/lab

## 6. Frontend Zero-TSC (typecheck)

Baseline `npm run typecheck` (в `frontend/`): **24 ошибки в 3 файлах → 0**.

| Файл | Ошибок | Правка |
|---|---|---|
| `frontend/src/admin/EvidencePanel.tsx` | 1 | `fontFamily="monospace"` → `sx={{ fontFamily: 'monospace' }}` |
| `frontend/src/results/EvidencePanel.tsx` | 5 | `textAlign`/`p`/`fontWeight`/`style` → `sx={{...}}` (3× `textAlign+p`, `fontWeight+flex`, `fontWeight`) |
| `frontend/src/admin/sections/EvidencePanel.tsx` | 18 | MUI-пропсы `display`/`mb`/`fontWeight` → `sx`; опечатки `pickPrimaryEvidencePack(deploy,…)`→`deploys`; deps `tic`→`tick`; `setTik`→`setTick`; `applicaton_name`→`application_name` (2×); `critcal`→`critical`; `lnegth`→`length` (2×); строки `'unknon'`→`'unknown'`, `'Evidnce'`→`'Evidence'` |

Проверка: `npm run typecheck` → exit 0. Бизнес-логика не менялась.

## 7. Frontend vitest — предсуществующий красный (не регрессия)

`npm run test` (vitest): **36 failed / 1580 passed / 1 unhandled error**.

**Не регрессия RC2-6:** ни один тест не импортирует `EvidencePanel` (grep по `*.test.*` = 0), поэтому правки §6 не могут влиять на счёт. Причины:

| Причина | Зона |
|---|---|
| `TypeError: res.text is not a function` (18) | `frontend/src/studio/browserSession.test.ts` ← незакоммиченный WIP `studio/browserSession.ts` (+12 строк) — **Boss/Flash** |
| `'scanner\|crawl\|$base'` vs `'scanner\|spider_scan\|$base'` | `src/keywords/*` — остаток переименования `crawl`→`spider_scan` |
| `TypeError: context.setLineDash is not a function` | `@antv/g-canvas` под jsdom |
| Прочее | `src/shell/HomePage`, `LoginPage.sso`, `src/ci/importExport`, `src/design-admin/AdminShowcase`, `src/monaco/*`, `src/wired/*`, `src/workbench/*`, `src/studio/Studio` |

**Диспозиция:** FOLLOW-UP владельцам поверхностей (`frontend/src/terminal/*`, `studio/browserSession.ts`). Правка не в lane RC2-6.

## 8. Heavy/lab/docker/integration — триаж

`pytest -m "heavy or lab or docker or integration"` → **12 passed, 8 skipped, 0 failed**.

Root cause падений (4× `test_session_isolation.py::TestParallelSessions`): `docker compose -f services/session-template.yml up` → `failed to read dockerfile: open Dockerfile: no such file or directory` / `pull access denied for pk-api-lab`.

Фикс (только тест): в `orchestrator/tests/test_session_isolation.py` добавлен `_build_contexts_ready()` — проверяет наличие Dockerfile в build-контекстах (`playwright-authoring`, `pk-api-lab`); `_docker_skip` = `not _docker_available() or not _build_contexts_ready()`. 4 failed → 4 skipped с внятной причиной.

### Классификация всех 55 skipped полного suite

| # | Причина | Диспозиция |
|---|---|---|
| 36 | `PostgreSQL not reachable via PK_PG_DSN` | env-гейт: задать `PK_PG_DSN` (prettyk-postgres поднят) |
| 4 | `Docker Engine unavailable or session-template build contexts not built` | см. §9 (`pk-api-lab` источник отсутствует) |
| 4 | `lab proto_pack missing` | см. §9 (`services/pk-api-lab/proto_pack` пуст) |
| 2 | `juice acceptance fixture not available` | lab-стенд (juice/Grid) |
| 2 | `Juice/Grid not up` | lab-стенд |
| 1 | `PK_BROWSER_CDP_ENDPOINT not set` | env-гейт (live BBA) |
| 1 | `lab stack not up` | lab-стенд |
| 1 | `Live server already running on port` | env-гейт |
| 1 | `VP-L1 container-only: host headless Chromium …` | by design (покрыто VP-L2 контейнерно) |
| 1 | `Juice/Grid/scanner demon not up` | lab-стенд |
| 1 | `PK_HAR_SEQUENCE_LIVE not set (IMP-HAR-4 opt-in)` | env-гейт |
| 1 | `Playwright sync API incompatible with active asyncio loop` | self-declared skip, воспроизводится и без `pytest-asyncio`, и в `strict` — средовое, не регрессия |

## 9. pk-api-lab — отсутствующий источник (FOLLOW-UP)

`services/session-template.yml` и `services/docker-compose.api-lab.yml` ссылаются на build-контекст `./pk-api-lab`, но в репо нет ни `Dockerfile`, ни приложения: `services/pk-api-lab/` содержит **пустой** `proto_pack/` и не tracked в git (git-ignored остаток переименования `kdt-api-lab`→`pk-api-lab`, `sanctuary/ALTAR.md:534`). Образ `pk-api-lab:local` не собран.

Следствие: 4 heavy-skip (`session_isolation`) + 4 `lab proto_pack missing`.

**Диспозиция:** FOLLOW-UP — восстановить источник `pk-api-lab` (Dockerfile + proto_pack) или задокументировать как внешне-провижининг. Вне RC2-6.

### Косметический долг: stale `..\prettyk-dev\` в выводе pytest

Skip-location и traceback печатают `..\prettyk-dev\orchestrator\tests\...`, хотя репо — `D:\prettyk-secops`. Репо скопировано с `D:\prettyk-dev` (которого больше нет); stale `__pycache__`/`.pyc` встраивают старый `co_filename`. На логику/счёт не влияет. Диспозиция: разовая чистка `__pycache__`.

## 10. Воспроизведение RC2-6

```powershell
# Frontend
cd frontend; npm run typecheck; npm run test

# Heavy/lab
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest -m "heavy or lab or docker or integration" -q -rs

# Полный suite
& "D:\prettyk-secops\.venv\Scripts\python.exe" -m pytest -q --tb=no -rf -rs
```

**DoD RC2-6:** `npm run typecheck` = 0 ✅; `npm run test` — не 100% green (36 fail, предсуществующие, вне поверхности RC2-6) ⚠️; heavy/lab триажирован (12 passed / 8 skipped, 0 failed) ✅; регрессий основного pytest нет (2235 passed / 55 skipped / 0 failed, exit 0) ✅.

---

# RC2-7 — Frontend Test Parity & Keywords Renaming

## 11. Frontend vitest — динамика

| Срез | Test Files | Tests |
|---|---|---|
| RC2-6 | 11 failed / ~249 passed | 36 failed / 1580 passed + 1 unhandled error |
| RC2-7 | 9 failed / 251 passed (260) | **15 failed / 1601 passed (1616)** |

Закрыто в RC2-7:
- `src/keywords/constructor.test.ts`, `src/keywords/prettyToWire.test.ts` — 4 failed → 0 (§7 RC2-6, «остаток переименования»).
- `context.setLineDash is not a function` (unhandled error из `@antv/g-canvas` в `ProgramOverview.test.tsx`) → 0: общий canvas 2D-полифил в `src/monaco/vitest.monaco-polyfill.ts` + снят неполный локальный мок `getContext`.
- `src/studio/browserSession.test.ts` — починен в параллельном потоке (Boss/Flash), не RC2-7.

## 12. Оставшиеся падающие файлы фронтенда (вне RC2-7, предсуществующие)

`ci/importExport`, `design-admin/AdminShowcase`, `monaco/scriptLanguage.providers`, `shell/HomePage`, `shell/LoginPage.sso`, `studio/Studio`, `wired/wiredDslCodec`, `workbench/workspaceStore` — плюс `src/checks/checksStore.test.ts`.

`checksStore.test.ts` — **время-флейк**: `updateCheck` бампает `updated_at` через `nowIso()` (мс-разрешение); в изолированном прогоне create+updates укладываются в 1 мс и `not.toBe(t0)` падает, в полном suite проходит. Файлы `src/checks/*` не менялись, импортов generated-каталогов нет — к RC2-7 отношения не имеет.

**DoD RC2-7:** `npm run test -- src/keywords/` 100% green ✅ (66 тестов); `ProgramOverview.test.tsx` без unhandled exception ✅; `npm run typecheck` exit 0 ✅; регрессий в `src/admin/`, `src/results/` нет ✅ (падающих файлов в этих каталогах нет).