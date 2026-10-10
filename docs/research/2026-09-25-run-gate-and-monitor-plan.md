# RUN-GATE + MONITOR — план: почему «запуск не работает» и как топить

> **Дата:** 2026-09-25 · **Автор:** Keeper (Strategy) · **Статус:** план до исполнения (Ш0 — немедленно, карточки после Ш0)
> **Симптомы (Максим):**
> 1. `http://localhost:5173/#/checks/114a306c-…/results` → Run показывает **«В редакторе есть ошибки синтаксиса или безопасности.»** — «всё еще не работает запуск» (рецидив).
> 2. `http://127.0.0.1:8767/?run_id=run-456c5bf7b06f&check_id=114a306c-…` — **не показывает ничего**.

---

## 1. Факты (собрано сегодня, без гаданий)

### 1.1. Гейт запуска (FE)
- Блок даёт `App.tsx` → `gateConstructorsOrPenguin` → **`collectAllMonacoDiagnostics(monaco)`** (`frontend/src/monaco/penguinDiagnosticsGate.ts`): если есть **любой маркер** (severity ≥ 4 — warning/error) от owners **`prettyk-diagnostics` / `security-diagnostics` / `pk-constructor`** — **по ЛЮБОЙ открытой модели** — Run блокируется модалкой «Ошибки в редакторе» (+ samples «Строка N: …»), сообщение в тосте: «В редакторе есть ошибки синтаксиса или безопасности.».
- Источники маркеров:
  - `prettyk-diagnostics` (`monaco/prettykDiagnostics.ts`): синтаксис pipe (`|`), `ОткрытьПоURL` без URL, `Нажать`/`Ввод` без аргументов (warning), устаревшие `Утвердить*` (warning), незакрытые `${…}` (error).
  - `security-diagnostics` (`monaco/securityDiagnostics.ts`): правила по тексту+formData; **все hint/info, кроме `SEC-REDIRECT-001` (error: внешний URL вне `allowed_extra_domains`)**.
  - `pk-constructor` (`monaco/constructorLanguage.ts` → `analyzeConstructor` из `keywords/constructor.ts` на **`keywords/catalog`**).
- **Каталог FE устарел:** `frontend/src/generated/keywords.json` — **28.08**, `keywords.json` **не содержит** новых методов SCAN-волны (`harden_active_scan`, `get_alerts_by_baseurl`), а адаптеры правились **25.09**. `export_keywords.py` тоже от 28.08. `constructorLanguage`/`signatureHelp`/penguin-гейт (`appConstructorGate`) едят этот каталог.
- Ручной разбор DSL-документа чека (3 конструктора выгружены в `D:\Infra\Temp\opencode\check114a_constructors.txt`): грубых нарушений (баланс `${}`, `|`, `ОткрытьПоURL`) не видно; `<!>` — поддержан FE (`constructorLanguageDetect`/`prettyWireLine`); внешних URL в тексте нет (только относительные `/…`). Точный маркер — снять живьём (Ш0).

### 1.2. Ссылка монитора и пустая страница
- `frontend/src/results/monitorLink.ts` `buildMonitorUrl(checkId)`: `runs.find(status==='running') ?? runs[0]` → `?run_id=…&check_id=…`.
- У чека `114a…` в `runs[]` реестра **~25 записей с вечным `status:'running'`** (снапшоты никогда не закрывались терминально; среди них раны BOX-LIVE-1, `run-1af0becf7a1f` и др.).
- Выбранная ссылкой `run-456c5bf7b06f`: по `runs_index.ndjson` — ран от **2026-09-23**, `check_id: autotest-mt4ipsbt-7mbdyo` (чужой чек!), событий в `diary` нет → страница монитора пустая (SSE по run_id + таймлайн пусты).
- Сейчас `:8767` `/api/meta` вообще показывает остаток другого прогона: `validate-only-ok` (`run-afb2a2f9b24c`, `ci_verdict fail_run`, fault «DefectDojo configured but import unsuccessful») — то есть мета тоже не про наш чек.
- Живой контур поднят заново сегодня (`lab_ensure_ui.ps1`), порты 5173/8765/8767 Listen.

## 2. Гипотезы (ранжированные, до Ш0)

| # | Гипотеза | Проверка |
|---|---|---|
| H1 | `pk-constructor`/`prettyk-diagnostics` даёт маркер на конкретной строке документа (метод/арность из устаревшего каталога или правило) | Ш0: снять маркеры (owner+line+message+model) |
| H2 | Маркер висит на НЕ-активной модели/старой вкладке (гейт = все модели) — stale-маркеры не чистятся | Ш0: перечень моделей+маркеров; закрыть/переоткрыть документ |
| H3 | Стухший `keywords.json` → следующий гейт (penguin `analyzeConstructor` по keywordCatalog) упадёт иначе («неизвестное действие») даже после H1 | переэкспорт `export_keywords.py` + прогон penguin-гейта |
| H4 | `security-diagnostics` warning из другого контекста (маловероятно — все правила кроме REDIRECT = hint/info; внешних URL нет) | Ш0 (owner=I покажет) |

## 3. План

- **Ш0 · Диагностика (Keeper, сейчас; 0.5–1ч).** Поднять CDP Chrome (`reload-cdp.ps1`) → открыть чек (editor→results) → снять `monaco.editor.getModelMarkers` по owners {prettyk-diagnostics, security-diagnostics, pk-constructor} с каждой модели (uri/owner/line/message); заодно вытащить текст моделей-нарушителей. Зафиксировать снимок как факт в карточке. Если `monaco` не глобальный — клик по Run: модалка не пустит (маркеры есть) и покажет samples; читаем DOM модалки + маркеры через отладочный путь.
- **Ш1 · Фикс гейта (зона по корню Ш0: Flash — FE / Boss — данные-каталог; 0.5–2 дня).** По корню: правило-фикс и/или гигиена гейта (напр.: смотреть только активную/релевантную модель, чистить stale-маркеры при смене документа/закрытии, порог severity). Если корень = каталог: переэкспорт `keywords.json` + правило «каталог обновлять при правке адаптеров» (пайплайн `export_keywords.py` — желательно в тесты/чеклист). Регресс-тесты на гейт по реальному документу чека.
- **Ш2 · Монитор (Flash FE + Boss BE; 0.5–1 день).**
  - `buildMonitorUrl`: выбирать **свежий** ран — `running` только если «живой» (по времени/updated_at), иначе последний терминальный; валидировать `runs_index` (не чужой чек); fallback — Live home. Никаких «первых из массива».
  - Гигиена `runs[]` в реестре: синхронизировать `status` из `runs_index` (или derive при чтении) — вечные `running`-зомби уходят; закрыть непарные записи.
  - `:8767` page: при неизвестном/вычищенном run — **честный empty-state** («события прогона недоступны/вычищены»), не тишина.
- **Ш3 · E2E-приёмка (Keeper + глазами Максима).** Реальный прогон `juice_shop_test_1` (114a) из редактора: гейт пройден (без модалок) → ран стартует → ссылка монитора ведёт на **свежий** ран → монитор показывает шаги/статус живьём (≤N сек, без перезагрузки) → финал честный (verdict/gate).

## 4. Почему «ранее не взлетело» (гипотеза процесса)
Гейт-цепочка «Monaco-маркеры → penguin-каталог» и deep-link монитора проверялись по частям (LIVE-MON-REWORK/VERIFY, BOX-LIVE), но **не было E2E-прогона «из редактора → монитор» после каждой волны**: каталог/маркеры/реестр-статусы дрейфовали между волнами незаметно. Ш3 фиксирует это как постоянную приёмку запуска.

## 5. Артефакты для карточек (после Ш0)
Предварительно: `RUN-GATE-MARKERS` (по корню Ш0), `MONITOR-DEEPLINK-FRESH`, `REGISTRY-RUN-STATUS-HYGIENE` (+ empty-state в `:8767`). Точные зоны/исполнители — по факту Ш0.
