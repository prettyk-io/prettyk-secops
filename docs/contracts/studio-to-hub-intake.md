# Contract A: Studio Outputs to PrettyK Hub Intake Specification

> **Status:** `FROZEN / CANONICAL` (rev 1.0 · 2026-09-04)  
> **Directive:** PK-DIR-008 · Epic **PK-C-009**  
> **Source of Truth (Producer):** PrettyK SecOps (`D:\prettyk-secops`, PO Keeper)  
> **Consumer (Intake & Triage Authority):** PrettyK Hub (`D:\prettyk-hub`, PO Arbiter)  
> **Schema Artifacts:** `orchestrator/contracts/studio_run_output.py`, `studio_run_output.schema.json`

---

## 1. Назначение и границы

Contract A регламентирует передачу фактов исполнения DAST, фаззинга, браузерных сценариев и evidence из **Коробки** (`PrettyK SecOps`) в **Хаб** (`PrettyK Hub`).

### Архитектурное разделение ответственности:
- **Коробка (SecOps):** Производитель фактов. Запускает сканеры, фаззер и Playwright, формирует сырые findings, собирает evidence (HAR, Allure, видео, логи), рассчитывает локальный вердикт (`box_verdict`), генерирует ГОСТ-акт.
- **Хаб (Hub):** Суд и инспекция (Tribunal). Принимает факты через intake, дедуплицирует findings, сверяет с baseline, выполняет триаж, управляет подавлением/исключениями и выносит окончательный вердикт Quality Gate (`clearance`).

**Главный инвариант:**  
*Исполнитель не судья.* Коробка отдаёт факты и evidence, но не выносит межпроектный допуск релиза. Хаб не перевычисляет fingerprint находок Коробки.

---

## 2. Ключевые решения по гэпам (G1–G7 Resolution)

На основе инвентаризации в `docs/research/2026-09-03-studio-outputs-contract-a-inventory.md` в Contract A зафиксированы следующие решения:

| # | Гэп инвентаря | Каноническое решение Contract A |
|---|---|---|
| **G1** | Fuzz `run_id` не был связан с runner `run_id` | Введён блок `fuzz_correlation` с обязательным полем `parent_run_id` (= 12 hex `run_id` раннера). Фабрика `make_fuzz_correlation(run_id, module_id, ...)` жёстко связывает fuzz-сессию с раннером; `parent_run_id` валидируется как 12 hex. |
| **G2** | Акт без стабильного ID в хранилище | Введено поле `act_ref` = `sha256(gost_act)` (формат `sha256:<64hex>`). Канонизация одинакова для `GOSTAct`-модели и сохранённого dict (sorted keys), `attach_gost_act()` персистентно проставляет `act_ref`, `verify_act_ref()` пересчитывает. Акт сохраняется в evidence как `report_html` / `report_json`. |
| **G3** | Несистематизированная схема `artifact://` | Утверждена каноническая URI-схема: `artifact://<file>#alert/<alert_ref>/instance/<n>` для прямых ссылок на фрагменты raw XML/JSON. `canonical_artifact_ref()` схлопывает слэши и нормализует схему; мусор отвергается (`ValueError`). |
| **G4** | Исходящая доставка | Определены два взаимозаменяемых транспорта: HTTP Push (`POST :8200/api/v1/intake`) и Airgap Bundle Exchange (`run_package.zip`). HMAC-подпись конверта (PRD-1). |
| **G5** | Идемпотентность по `scan_id` | `scan_id` строго равен `run_id` раннера (12 hex). Введено поле `idempotency_key` = `sha256(scan_id:contract_version)[:32]` (авто-вывод). Повторный intake того же `scan_id` идемпотентен (обновление Occurrence без дублирования Finding). |
| **G6** | Спецификация scope студийного PASS | Введён блок `provenance`: кортеж comparability `(project_id, wired_hash, target_scope_hash, scan_profile, fingerprint_version)`. `scope_tuple()` / `is_comparable_with()` проверяют сопоставимость с baseline. |
| **G7** | Live API vs Intake API | Hub предоставляет выделенный endpoint `POST /api/v1/intake` (FastAPI :8200). |

---

## 3. Спецификация DTO `StudioRunOutput`

Envelope-модель верхнего уровня:

```typescript
interface StudioRunOutput {
  contract_version: "1.0";               // Версия контракта
  idempotency_key: string;               // G5: sha256(scan_id:contract_version)[:32] (авто-вывод)
  scan_id: string;                       // Канонический ID прогона (12 hex, e.g. "a3f19c2b7e04")
  run_id: string;                        // Равен scan_id (1:1 runner identity)
  session_name: string;                  // Имя сессии, e.g. "juice_smoke"
  project_id: string;                    // Идентификатор проекта, e.g. "exp01-baseline"
  build_id?: string | null;              // CI Build ID
  commit_sha?: string | null;            // Хеш проверяемого коммита
  release_id?: string | null;            // Идентификатор релиза
  scanner: string;                       // "prettyk"
  scanner_version: string;               // "2.4.0"
  ruleset_version: string;               // "2026-08-31"
  box_verdict: "pass" | "fail" | "inconclusive" | "void"; // Локальный вердикт коробки
  exit_code: number;                     // 0 = ok, 1 = execution error, 2 = gate fail
  started_at: string;                    // ISO-8601 UTC
  finished_at?: string | null;           // ISO-8601 UTC
  duration_seconds?: number | null;      // Длительность прогона в секундах
  findings: StudioFinding[];             // Список обнаруженных проблем
  summary: StudioRunSummary;             // Агрегированные счётчики
  evidence_refs: string[];               // Ссылки на тяжеловесные артефакты (S3/MinIO/локальные)
  act_ref?: string | null;               // sha256:<hex64> ГОСТ-акта
  gost_act?: Record<string, any> | null; // Структурированный ГОСТ-акт
  provenance: StudioProvenance;          // Контекст сопоставимости (G6)
  fuzz_correlation?: FuzzCorrelation | null; // Корреляция фаззинга (G1)
}
```

### 3.1 Модель `StudioFinding`

```typescript
interface StudioFinding {
  fingerprint: string;                   // "finding:finding-v1:<sha256[:24]>"
  fingerprint_scheme: "finding-v1";      // Каноническая схема расчета
  title: string;                         // Человекочитаемое название уязвимости
  severity: "critical" | "high" | "medium" | "low" | "info"; // Строго lowercase
  rule_id: string;                       // ID правила (CWE-89, plugin 40012, pk_fuzz_*)
  cwe?: string | null;                   // Идентификатор CWE
  type: "dast" | "fuzz" | "crawler";     // Тип проверки
  location: string;                      // Эндпоинт/URI, e.g. "POST /api/login:password"
  method?: string | null;                // HTTP метод (GET, POST...)
  parameter?: string | null;             // Имя параметра
  component?: string | null;             // Целевой компонент
  description?: string | null;           // Описание уязвимости
  evidence_ref: string;                  // Обязательная ссылка на evidence
  dojo_id?: number | null;               // Display only, НЕ входит в fingerprint!
  qwen_suggestion?: QwenSuggestion | null; // Оценка AI-ассистента
}
```

### 3.2 Формула Fingerprint (`finding-v1`)

```text
raw = source | plugin_id | alert_ref | uppercase(method) | normalize_path(uri) | lowercase(parameter)
fingerprint = "finding:finding-v1:" + sha256(raw)[:24]
```

**Инварианты фингерпринта:**
1. `Dojo ID` **никогда** не входит в фингерпринт.
2. `normalize_path` схлопывает динамические сегменты (`/users/123` → `/users/{id}`).
3. Хаб принимает `fingerprint` как есть и использует его как первичный ключ дедупликации `Finding`.

### 3.3 Модель `StudioProvenance`

```typescript
interface StudioProvenance {
  project_id: string;
  release_domain?: string | null;
  wired_hash: string;                    // Hash манифеста Wired DSL
  target_scope_hash: string;             // Hash целевого скоупа
  scan_profile: string;                  // "standard" | "deep" | "fast"
  fingerprint_version: "finding-v1";
  assessment_purpose?: "scheduled" | "pre_release" | "emergency" | "manual" | null;
  debug_mode: boolean;                   // true -> вердикт принудительно void
  admission_void: boolean;               // true -> ошибки исполнения обесценили допуск
}
```

---

## 4. Транспортный протокол (Hand-off)

### 4.1 Режим Online (HTTP Push)
- **Endpoint:** `POST http://localhost:8200/api/v1/intake` (в проде — хост PrettyK Hub).
- **Headers:**
  - `Content-Type: application/json`
  - `X-PrettyK-Contract-Version: 1.0`
  - `X-PrettyK-Scan-Id: <scan_id>`
  - `X-PrettyK-Signature: <hex64>` (только при включённой HMAC-подписи)
  - `X-PrettyK-Timestamp: <unix-seconds>` (только при включённой HMAC-подписи)
- **Idempotency:** Хаб проверяет `scan_id` / `idempotency_key`. При повторной отправке существующие `Finding` не дублируются, `Occurrence` обновляется, возвращается `200 OK`.
- **Retry Policy:** 3 попытки, exponential backoff: 1s → 2s → 4s, timeout 30s. При неустранимой сетевой ошибке статус прогона в Коробке помечается как `INTAKE_FAILED` (fail-closed, допуск не выдаётся).

#### 4.1.1 HMAC-подпись конверта (PRD-1, G4 follow-up)

При наличии секрета (`PRETTYK_INTAKE_HMAC_SECRET`) тело запроса — подписанный
конверт вместо «сырого» `StudioRunOutput`:

```json
{
  "contract_version": "1.0",
  "scan_id": "a3f19c2b7e04",
  "event_type": "studio.run.output",
  "signature": "<hex64>",
  "ts": 1758102345,
  "payload": { /* StudioRunOutput */ }
}
```

- **Алгоритм:** `hmac-sha256`.
- **Канонизация payload:** JSON с `sort_keys=true`, без пробелов, UTF-8
  (`canonical_payload_bytes`).
- **Подписываемое сообщение:** `"{ts}\n{scan_id}\n{event_type}\n{sha256(canonical_payload)}"`.
  Включение `ts`/`scan_id`/`event_type` не даёт переклеить метаданные конверта.
- **Верификация (Hub):** `verify_envelope(secret, envelope)` — fail-closed,
  `hmac.compare_digest` (constant-time), опционально проверка свежести `ts`
  (`max_age_s`).
- **Секреты:** секрет никогда не логируется и не попадает в `repr` подписанта.
- **Airgap:** при наличии подписанта пакет дополнительно содержит
  `intake_envelope.json`, а `manifest.json` фиксирует `signature`.

### 4.2 Режим Airgap (Artifact Exchange)
- Пакет формируется в виде `run_package_<scan_id>.zip`.
- Состав пакета:
  - `manifest.json` — метаданные пакета (`ArtifactDescriptor`).
  - `intake_payload.json` — полный валидный `StudioRunOutput`.
  - `evidence/` — директория с приложенными артефактами (HAR, ZAP XML, Allure results, GOST Act HTML).
- Импорт в Хаб выполняется через CLI или файловый watcher: `hub-cli intake import run_package_<scan_id>.zip`.

---

## 5. Спецификация ответов Хаба

### 5.1 Успешный прием (200 OK)

```json
{
  "accepted": true,
  "scan_id": "a3f19c2b7e04",
  "findings_processed": 12,
  "new_findings": 2,
  "new_occurrences": 12,
  "rejected_count": 0,
  "errors": []
}
```

### 5.2 Ошибка валидации контракта (422 Unprocessable Entity)

```json
{
  "accepted": false,
  "scan_id": "a3f19c2b7e04",
  "findings_processed": 0,
  "errors": [
    {
      "finding_index": 3,
      "field": "severity",
      "reason": "Value 'CRITICAL' is invalid. Must be lowercase: 'critical'."
    }
  ]
}
```

---

## 6. Эталонный Payload (Reference Example)

```json
{
  "contract_version": "1.0",
  "idempotency_key": "c7a943ce276676ff285967b9fecc4d8c",
  "scan_id": "a3f19c2b7e04",
  "run_id": "a3f19c2b7e04",
  "session_name": "juice_smoke_pipeline",
  "project_id": "exp01-baseline",
  "build_id": "b-20260904-01",
  "commit_sha": "ceb34cc321f5e485f5aec1e73626e68161075fd7",
  "release_id": "rel-2026.3",
  "scanner": "prettyk",
  "scanner_version": "2.4.0",
  "ruleset_version": "2026-08-31",
  "box_verdict": "fail",
  "exit_code": 2,
  "started_at": "2026-09-04T10:00:00Z",
  "finished_at": "2026-09-04T10:03:45Z",
  "duration_seconds": 225.0,
  "findings": [
    {
      "fingerprint": "finding:finding-v1:98a72b3c4d5e6f1011121314",
      "fingerprint_scheme": "finding-v1",
      "title": "Cross Site Scripting (Reflected)",
      "severity": "high",
      "rule_id": "CWE-79",
      "cwe": "CWE-79",
      "type": "dast",
      "location": "http://juice-shop:3000/rest/products/search?q=",
      "method": "GET",
      "parameter": "q",
      "component": "search-service",
      "description": "Reflected XSS via q parameter in search API",
      "evidence_ref": "artifact://scanner.xml#alert/40012/instance/0",
      "dojo_id": 104,
      "qwen_suggestion": {
        "likely_false_positive": 0.05,
        "confidence": 0.95,
        "reason": "XSS payload executed in headless browser DOM context",
        "model_version": "qwen3-1.7b",
        "model_suggestion_ref": "qwen-a3f19c2b7e04-001"
      }
    }
  ],
  "summary": {
    "total": 1,
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0,
    "info": 0,
    "scenarios_passed": 14,
    "scenarios_failed": 1
  },
  "evidence_refs": [
    "s3://prettyk-evidence/a3f19c2b7e04/session.har",
    "s3://prettyk-evidence/a3f19c2b7e04/report.json",
    "s3://prettyk-evidence/a3f19c2b7e04/allure-report.tar.gz"
  ],
  "act_ref": "sha256:b5a8e234c9...64hex",
  "provenance": {
    "project_id": "exp01-baseline",
    "release_domain": "deploydomain-owasp",
    "wired_hash": "w_9a8b7c6d5e4f",
    "target_scope_hash": "t_1a2b3c4d5e6f",
    "scan_profile": "standard",
    "fingerprint_version": "finding-v1",
    "assessment_purpose": "pre_release",
    "debug_mode": false,
    "admission_void": false
  },
  "fuzz_correlation": {
    "parent_run_id": "a3f19c2b7e04",
    "module_id": "juice_search_q",
    "fuzz_run_id": "fuzz-juice_search_q-05d2e9a3be97",
    "anomalies_total": 0
  }
}
```
