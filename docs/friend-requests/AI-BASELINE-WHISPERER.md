# AI-BASELINE-WHISPERER: Regression Detection & Narrative Delta

> `lane: evolve` · 20 авг 2026. Profile: `secops-lab-pure`.
>
> **Добавлено/поправлено: Luna — архитектурный review, 20 августа 2026.**

## Тезис

После каждого прогона deterministic слой сравнивает canonical findings текущего run-а с замороженным baseline EXP-01, а Qwen3-1.7B необязательно объясняет уже посчитанный delta. Результат — компактные карточки `NEWLY_OBSERVED` / `NOT_OBSERVED` / `CHANGED` и advisory narrative на русском. Никакого ручного diff-а JSON и никаких claims, что исчезнувший finding автоматически исправлен.

## As-built якорь

- EXP-01 baseline fixtures: `orchestrator/tests/fixtures/exp01_reference/` (wired, XML, findings JSON, run_summary)
- llm-server `:8766` — Qwen3-1.7B, endpoints `/api/ai/classify`, `/api/ai/prioritize`
- KDT Live `:8767` — AI proxy (`live_server.py`, `ai_assistant_enabled()`)
- DojoFindingsTable — AI columns, Classify All
- `KDT_AI_ASSISTANT_ENABLED` toggle

### Обязательные архитектурные оговорки

- Dojo database `id` не является cross-run identity и не участвует в сравнении.
- Current input должен быть привязан к `current_run_id`; нельзя сравнивать через безымянный `latest`.
- Сравнение строится по версионированному `finding-v1` fingerprint из scanner-derived данных: `plugin_id + alert_ref + method + normalized_path + parameter`.
- Если текущий run неполный или scope/auth/wired несовместимы с baseline, результат — `incomparable`, а не зелёный `FIXED`.
- `deterministic_delta.json` создаётся всегда. `ai_delta.json` является отдельным optional artifact и не влияет на gate, exit code или findings.

## Архитектура

```
run завершён
  │
  ├─ run_summary.json (текущий run)
  └─ canonical finding-v1 artifact (текущий run)
       │
       ▼
  BaselineDeltaBuilder (детерминированный pre-pass)
  │  ├─ stable fingerprints, not Dojo database IDs
  │  ├─ deterministic diff: newly_observed, not_observed, changed
  │  ├─ числовые метрики: count, severity distribution, новые CWE
  │  ├─ comparability: comparable/incomparable/artifact_incomplete
  │  └─ evidence_refs на конкретные finding-и
       │
       ▼
  deterministic_delta.json (всегда)
        │
        ├─ AI OFF → Results показывает deterministic-only
        │
        └─ optional bounded AI job
             │
             ▼
        POST /api/ai/delta (Qwen3 thinking=on)
        │  вход: compact redacted deterministic delta + provenance
        │  выход: validated ai-delta-v1 или abstain/unavailable
             │
             ▼
        ai_delta.json (optional, advisory)
       │
       ▼
  BaselineDelta.tsx (UI)
  │  ├─ карточки: NEWLY_OBSERVED / NOT_OBSERVED / CHANGED
  │  ├─ narrative-сводка на русском
  │  └─ ссылки на Dojo findings
```

**Два слоя:**
1. **Детерминированный pre-pass** — считает разницу по stable fingerprint и provenance. Всегда работает, даже без AI. Показывает сухие числа и comparability status.
2. **Qwen3 narrative layer** — интерпретирует только компактный deterministic delta, пишет человеческую сводку и bounded verification suggestions. Только при `KDT_AI_ASSISTANT_ENABLED=1`; не является источником фактов.

## Canonical contracts

### Finding identity

Canonical finding record обязан иметь `finding_id`, `fingerprint_version`, `source`, `plugin_id`, `alert_ref`, `method`, `path`, `parameter`, `severity`, `cwe` и `evidence_refs`. `dojo_id` хранится только как ссылка отображения.

### Comparison status

Допустимые статусы:

```text
comparable | incomparable | baseline_missing | current_missing | artifact_incomplete
```

При `incomparable` UI не показывает `FIXED`. Используются нейтральные `NOT_OBSERVED_IN_CURRENT_SCOPE` и `COMPARISON_BLOCKED`.

### AI response

```json
{
  "schema_version": "ai-delta-v1",
  "decision": "narrative_ready",
  "confidence": "low|medium|high",
  "narrative_ru": "...",
  "suggestions": [],
  "unsupported_claims": [],
  "model": {"name": "Qwen3-1.7B", "prompt_version": "delta-v1"}
}
```

Допустимы также `abstain`, `invalid_model_output`, `llm_unavailable`. Модель не создаёт новые finding IDs, не меняет severity/gate и не утверждает root cause без evidence.

## Что делает

### Given: прогон завершён, есть run_summary и dojo_baseline_findings
**When:** система сравнивает текущий прогон с EXP-01 baseline.
**Then:**
- Детерминированно: newly observed 3, not observed 1, severity changed 2.
- Qwen3 (thinking=on): narrative-сводка на русском:

```
Сводка изменений относительно baseline (20.08.2026):

Новые находки (2):
- Information Disclosure — Debug Error Messages (Medium)
  CWE-1295, /api/debug → сервер раскрывает stack trace.
  Рекомендация: отключить debug-режим в production.

Не наблюдаются в текущем scope (1):
- Session ID in URL Rewrite (Medium)
  Больше не обнаруживается в этом run; исправление не доказано.

Изменения severity (1):
- SQL Injection: High → Medium
  Confidence понизился с Certain до Medium.
  Рекомендация: перепроверить вручную.

Без изменений (24):
- 6 systemic header-проблем (CSP, HSTS, X-Frame-Options).
- 18 прочих — без динамики.

AI confidence: medium
Verification suggestion: проверить /api/debug вручную, если evidence этого run-а подтверждает endpoint.
```

### Given: оператор хочет посмотреть delta в любое время
**When:** нажата кнопка «Compare to Baseline» в Results.
**Then:** показывается BaselineDelta с последними закешированными результатами или триггерится новый запрос.

### Given: AI недоступен (toggle off, timeout или llama-server упал)
**When:** прогон завершён.
**Then:** deterministic diff показывает таблицу added/removed/changed. Narrative-секция скрыта. Пайплайн не аффектирован.

## Этапы реализации

### Этап 1: Canonical findings и deterministic pre-pass (Boss, 2–4 часа)
- `orchestrator/utils/baseline_delta.py` — новый модуль
- Функция `compute_deterministic_delta(baseline_findings, current_findings) → DeltaResult`
- Stable `finding-v1` fingerprint; Dojo ID запрещён как cross-run identity
- Сравнение: newly observed, not observed, changed severity по совпавшему fingerprint
- Метрики: count diff, severity distribution shift, новые CWE
- Comparability gate: wired/target/auth/phase/artifact completeness
- Юнит-тесты на fixtures и смену Dojo IDs

**DoD:** `pytest orchestrator/tests/test_baseline_delta.py` — зелёный; несовместимый или неполный run не показывает `FIXED`.

### Этап 2: Qwen3 delta endpoint (Boss, 2–4 часа)
- `orchestrator/lab/llm_server.py` — новый endpoint `POST /api/ai/delta`
- Принимает: `{baseline_id, current_run_id, provenance, compact_redacted_delta}`
- Возвращает строго validated `ai-delta-v1` или explicit error/abstain
- Режим: thinking=on (1–3s, приемлемо для post-run)
- Prompt: evidence-first; raw HTTP bodies, XML и секреты в MVP не передаются
- Confidence: только `low|medium|high`
- AI не меняет deterministic delta, severity, gate, exit code или findings

**DoD:** `curl -X POST /api/ai/delta` → `ai-delta-v1`; malformed output не превращается в HTTP 200 fake default.

### Этап 3: Live-прокси и bounded job (Boss, 1–2 часа)
- `orchestrator/utils/live_server.py` — `POST /api/ai/delta`
- Проверка `ai_assistant_enabled()`
- Проксирование → llm-server `:8766`
- Явно добавить `/api/ai/delta` в route allowlist
- Отдельные статусы: `503 disabled`, `503 unreachable`, `504 timeout`, `422 schema_invalid`, `409 incomparable`
- AI job не блокирует `main.py` и не меняет run exit/gate
- Cache key: run/baseline/input/fingerprint/prompt/model/schema versions

**DoD:** `curl -X POST :8767/api/ai/delta` → validated response или explicit fallback status; toggle OFF не вызывает Qwen.

### Этап 4: Artifact и UI-компонент (Flash, 3–5 часов)
- `cosmo/src/admin/BaselineDelta.tsx` — новый компонент
- `deterministic_delta.json` создаётся всегда; `ai_delta.json` — optional
- Артефакты регистрируются в artifact index/retention/run package
- Карточки: NEWLY_OBSERVED / NOT_OBSERVED / CHANGED
- Каждая карточка: finding name, severity (старый→новый), URL, CWE, recommendation
- Narrative-секция: advisory text, categorical confidence и AI status
- Кнопка «Compare to Baseline» в Results page
- Сначала manual trigger; auto-trigger только после smoke/eval
- `adminApi.ts` — `requestAiDelta(baselineId, currentRunId)`

**DoD:** Results показывает deterministic delta при AI OFF; AI narrative явно помечен advisory; stale response другого run-а отбрасывается.

### Этап 5: Targeted acceptance (Boss + Flash, 2–3 часа)
- same findings in different order → empty delta
- changed Dojo IDs with same fingerprint → not new
- missing artifact/void run → no fake FIXED
- malformed Qwen output/timeout → deterministic result remains
- prompt injection in evidence does not change schema/tool contract
- cache invalidates on model/prompt/schema/fingerprint version
- baseline EXP-01 remains immutable

**DoD:** targeted backend/API/FE tests green; полный цикл run → deterministic artifact → optional AI artifact → UI verified.

## Out of scope

- Сравнение более чем с одним baseline (только EXP-01)
- Real-time delta во время прогона (только post-run)
- Изменение severity/gate на основе AI-вывода
- Автоматическое применение рекомендаций
- Сравнение произвольных двух прогонов (только текущий vs baseline)
- Semantic collapse, canvas telemetry, scenario phase folding
- Root-cause claims и auto-remediation
- Fine-tuning и specialist ensemble

## Технические требования

- llm-server: thinking=on, bounded timeout 10s
- Prompt: строго evidence-first; только compact redacted delta
- Output: `ai-delta-v1`, runtime schema validation, fail-closed
- Narrative: русский, технический стиль, advisory-only
- Confidence: категорийный `low|medium|high`, не число
- Кеш: versioned key с run/baseline/model/prompt/schema/fingerprint versions
- Artifacts: deterministic delta всегда, AI delta отдельно и зарегистрирован
- Graceful degradation: при падении llm-server — только deterministic diff

**Добавлено/поправлено: Luna — архитектурный review, 20 августа 2026.**
