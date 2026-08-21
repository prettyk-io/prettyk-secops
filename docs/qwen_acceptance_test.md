# Qwen3 Acceptance Test — приёмка AI Co-Pilot

> **Дата:** 21 августа 2026
> **Контур:** EXP-01 baseline + EXP-02 с AI toggle ON
> **Модели:** Qwen3-1.7B (classify/hint) + Qwen3-4B (delta/semantic/preflight)

---

## 0. Подготовка контура (setup)

### 0.1 Docker — весь стек (порядок важен)

```powershell
# 1) Основной стек: Grid, Chrome/Firefox, Allure, llama 1.7B + 4B, llm-server wrapper
docker compose -f services/docker-compose.yml up -d

# 2) DefectDojo (отдельный compose)
docker compose -f services/docker-compose.defectdojo.yml up -d

# 3) Пересобрать llm-server (если менялся llm_server.py или Dockerfile)
docker compose -f services/docker-compose.yml build llm-server
docker compose -f services/docker-compose.yml up -d llm-server
```

**Важно:** Базовый compose поднимает Juice Shop, ZAP, Grid, Chrome, Firefox, Allure, llama 1.7B (`:8768`), llama 4B (`:8769`) и llm-server (`:8766`). DefectDojo — отдельным файлом. После первого `git pull` с новым `llm_server.py` нужен `build llm-server`.

### 0.2 Host-процессы (Python, вне Docker)

```powershell
# Все три — из корня репозитория, в отдельных терминалах или через Start-Process:

# Live idle (:8767) — монитор + AI proxy
$env:KDT_AI_ASSISTANT_ENABLED = '1'
$env:KDT_LIVE = '1'
$env:KDT_LIVE_PORT = '8767'
.venv\Scripts\python.exe orchestrator/tools/run_live_idle.py

# Playground API (:8765) — Editor validate + /api/run/start
.venv\Scripts\python.exe orchestrator/tools/data_playground.py

# Vite dev (:5173) — фронтенд Студии
cd cosmo
npm run dev
```

**Ключевой env для AI:** `KDT_AI_ASSISTANT_ENABLED=1` должен быть установлен **до старта Live idle**. Без него `/api/ai/*` возвращает 503. Если надо без AI — `=0`, потом перезапустить Live idle.

### 0.3 Проверка всех 10 портов

```powershell
$ports = 3000,8080,8081,4444,8765,8766,8767,8768,8769,5173
foreach ($p in $ports) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$p/" -TimeoutSec 5; "$p LIVE $($r.StatusCode)" }
  catch { "$p DEAD" }
}
```

### 0.4 AI smoke test (до реального прогона)

```powershell
# Статус AI toggle
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8767/api/ai/status'
# → {"ok": true, "enabled": true}

# Быстрый classify (1.7B)
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8767/api/ai/classify' `
  -Method Post -ContentType 'application/json' `
  -Body '{"alert":{"name":"SQL Injection","description":"Potential SQLi","risk":"High","confidence":"Medium"}}'
# → {"severity": "high", ...}
```

### 0.5 Полная остановка (когда всё)

```powershell
docker compose -f services/docker-compose.yml down
docker compose -f services/docker-compose.defectdojo.yml down
# Host-процессы: убить python и npm run dev
```

### 0.6 Карта портов

| Порт | Сервис | Где | Env |
|---|---|---|---|
| `:3000` | Juice Shop | Docker compose базовый | — |
| `:8080` | ZAP demon | Docker compose базовый | — |
| `:8081` | DefectDojo | Docker compose defectdojo | — |
| `:4444` | Selenium Grid + Chrome | Docker compose базовый | — |
| `:8765` | Playground API | Host: `data_playground.py` | — |
| `:8766` | llm-server wrapper | Docker compose базовый (пересобрать!) | `LLAMA_HOST/LLAMA_REASONING_HOST` |
| `:8767` | Live idle + AI proxy | Host: `run_live_idle.py` | `KDT_AI_ASSISTANT_ENABLED=1` |
| `:8768` | llama-server 1.7B | Docker compose базовый | — |
| `:8769` | llama-server 4B | Docker compose базовый | — |
| `:5173` | Vite Studio (Editor) | Host: `npm run dev` | — |

---

## 1. Smoke: прогон без AI (`KDT_AI_ASSISTANT_ENABLED=0`)

**Цель:** снять референс без AI-разметки. Доказать что система без Qwen работает идентично.

- [ ] Выставить `KDT_AI_ASSISTANT_ENABLED=0`
- [ ] Перезапустить Live idle
- [ ] Открыть Студию `http://localhost:5173`
- [ ] Загрузить `exp01_reference/manifest.json`
- [ ] Нажать «Запустить пайплайн»
- [ ] Убедиться что прогон завершён без AI-колонок в DojoFindingsTable
- [ ] Убедиться что `/api/ai/status` → `{"enabled": false}`
- [ ] Убедиться что `/api/ai/classify` → 503 `ai_assistant_disabled`
- [ ] Зафиксировать количество находок в Dojo
- [ ] Зафиксировать `run_summary.json` как baseline без AI

**Ожидание:** прогон зелёный, AI UI скрыт, AI API заблокирован.

---

## 2. Smoke: прогон с AI (`KDT_AI_ASSISTANT_ENABLED=1`)

**Цель:** AI-разметка работает сквозным образом от модели до UI.

- [ ] Выставить `KDT_AI_ASSISTANT_ENABLED=1`
- [ ] Перезапустить Live idle
- [ ] Новый check в Студии с тем же манифестом (или replay из истории)
- [ ] Нажать «Запустить пайплайн»

### 2.1 Classify (1.7B)

- [ ] `/api/ai/status` → `{"enabled": true}`
- [ ] Вкладка «Находки» в Admin — колонка AI видна
- [ ] Нажать «Classify All» — для каждой находки появляется AI severity и FP confidence
- [ ] Severity от Qwen совпадает с ZAP severity минимум на 90% (калибровка показала 100%)
- [ ] Кнопка «AI Diff» открывает reasoning в модалке
- [ ] Latency на classify: ~4-5s на finding

### 2.2 Semantic Collapse (4B)

- [ ] Нажать «Collapse» в DojoFindingsTable
- [ ] Находки группируются в кластеры (не 0 кластеров как на 1.7B)
- [ ] Каждый кластер содержит `member_indices` + `member_ids`
- [ ] Ни одна находка не потеряна — все присутствуют либо в кластерах, либо как `unclustered`
- [ ] `root_cause_hypothesis` и `systemic_remediation` заполнены
- [ ] Кнопка «Grid» возвращает табличный вид

### 2.3 Baseline Delta (4B)

- [ ] Вкладка «Delta» в Admin показывает карточки NEW/GONE/CHANGED
- [ ] Нажать «Generate AI Summary» — появляется русский narrative
- [ ] `decision = "narrative_ready"`, `confidence = "low"|"medium"|"high"`
- [ ] `model.name = "Qwen3-4B-Instruct-2507"`
- [ ] Narrative на русском, осмысленный, не пустой

### 2.4 Preflight (4B)

- [ ] В Студии перед графом видна плашка «Preflight Advisory»
- [ ] Нажать «Pre-flight Check» — появляются amber warnings
- [ ] Warnings содержат коды `AUTH_NOT_APPLIED`/`ORPHAN_FUZZER`/`TIMEOUT_SUGGESTION`
- [ ] Warnings можно закрыть (dismiss)
- [ ] Кнопка «Re-run» обновляет проверку

---

## 3. Canvas Telemetry

**Цель:** во время прогона граф показывает LED, photon trails, HUD.

- [ ] При запуске сценария загораются `step.started` события в diary.ndjson
- [ ] `edge.pulse` события между шагами
- [ ] В Студии ноды графа показывают LED-фонари (running — cyan pulse)
- [ ] Рёбра графа показывают photon trails (бегущие точки по SVG)
- [ ] HUD чип над активной нодой (240×48)
- [ ] Grid Resonance + Corner Reticles на активной категории

---

## 4. GBNF Grammar Enforcement

**Цель:** ответы модели строго соответствуют JSON-схеме.

- [ ] В логах `llm_server.py` нет ошибок JSON decode
- [ ] Все ответы delta/semantic/preflight парсятся без `_extract_json` (pure `json.loads`)
- [ ] Нет `invalid_model_output` в delta-ответах
- [ ] Нет кластеров с невалидными `member_indices` (отрицательные, дубли, за границами)

---

## 5. Fail-Closed & Degradation

**Цель:** при отказе AI система не падает.

- [ ] Остановить `llama-server-reasoning` (4B) — semantic/preflight/delta возвращают ошибку, classify продолжает работать на 1.7B
- [ ] Остановить оба llama-server — AI UI скрывается, прогон продолжается
- [ ] Отправить мусорный JSON в `/api/ai/delta` — ответ `abstain` или `invalid_model_output`, не 200 с fake narrative
- [ ] `KDT_AI_ASSISTANT_ENABLED=0` — все AI endpoints возвращают 503

---

## 6. Scenario Phase Folder

**Цель:** конструктор сценария показывает макро-фазы.

- [ ] Открыть сценарий в Студии в режиме Редактора
- [ ] Нажать «Macro Phases» — 32 строки сворачиваются в 3-5 фаз
- [ ] Фазы раскрываются/скрываются по клику
- [ ] «Micro Steps» возвращает плоский вид
- [ ] Переключение языка (RU/EN) меняет названия фаз

---

## 7. Локализация (RU/EN)

**Цель:** Вера видит английский интерфейс.

- [ ] Переключатель языка в UI работает
- [ ] Home Page — все тексты на EN
- [ ] Admin — все секции и заголовки на EN
- [ ] DojoFindingsTable — колонки, кнопки, плейсхолдеры на EN
- [ ] RunsPage — колонки таблицы на EN
- [ ] Студия — категории графа на EN

---

## 8. Производительность

- [ ] Classify 20 findings: < 2 мин (4.5s × 20)
- [ ] Semantic group 20 findings: < 2 мин
- [ ] Delta narrative: < 1 мин
- [ ] Preflight: < 1 мин
- [ ] RAM: llama 1.7B ~1.7GB, 4B ~2.7GB, total < 5GB

---

## Приёмочный лист

| # | Тест | Кто | Результат |
|---|------|-----|-----------|
| 1 | Smoke без AI | | |
| 2 | Classify 1.7B | | |
| 3 | Collapse 4B | | |
| 4 | Delta 4B | | |
| 5 | Preflight 4B | | |
| 6 | Canvas LED | | |
| 7 | Canvas Photon | | |
| 8 | HUD Whisperer | | |
| 9 | GBNF grammar | | |
| 10 | Fail-closed | | |
| 11 | Scenario Phases | | |
| 12 | i18n RU/EN | | |
| 13 | Perf latency | | |
| 14 | Perf RAM | | |

**Подписи:** Максим ________ | Gemini/Keeper ________ | DeepSeek/Boss ________