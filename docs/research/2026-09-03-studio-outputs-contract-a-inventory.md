# Studio Outputs — инвентаризация для Contract A (PK-BRIDGE-1/2)

> **Research-док.** Карточки: PK-BRIDGE-1 (инвентаризация форм), PK-BRIDGE-2 (airgap-транспорт) — `docs/backlog.md`.
> Бриф-источник: `D:\prettyk-airlock\docs\research\2026-09-02-cross-product-contract-bridge.md` §9.
> Всё ниже — реальные формы из кода и артефактов `D:\prettyk-secops`. Ничего не выдумано; там, где примера нет — так и сказано.

---

## TL;DR

- **Формы есть и они устойчивы:** файл `current.json` от runner'а, `run_summary.json` (G-20, вердикт + gate), PG-запись `RunRecord`, манифест `wired.json` с релизным `Meta`, сырой ZAP XML, fuzz-тройка JSON.
- **Акт** — формируемая сущность (Pydantic-модель GOST → HTML `act/act.html` в zip), включается по `meta.generate_act` по осям допуска. Стабильного `act_ref`/ID у акта **нет** — гэп.
- **Evidence двухслойный:** стабильные object refs (файлы + sha256 + PG `EvidenceRecord`/MinIO presigned) vs лёгкие метаданные, безопасные для инлайна в события. `artifact://` URI-схема существует, но с одним местом использования.
- **Фингерпринтов три схемы** (scanner finding-v1 SHA-256, Dojo-sync FNV-1a/pk-SHA256, fuzzer SHA-1) + comparability-кортеж из DeltaProvenance — он же естественный scope студийного PASS.
- **Airgap:** файловый пакетный обмен и Live API/SSE — **можем сейчас**; исходящий подписанный webhook/REST-отдача соседям — **нужно строить** (HMAC-механика в коде есть, но только на входящие).

---

## 1. Формы run/result (Q1)

### 1.1 Прогонный файл runner'а — `reports/runs/current.json`

Реальная форма (`reports/runs/current.json`; набор полей — из реального файла, значения в примере иллюстративные, кроме путей `D:\prettyk-dev` — они реальны из артефакта):

```json
{
  "phase": "idle",
  "run_id": "a3f19c2b7e04",
  "pid": 12345,
  "exit_code": 0,
  "session_name": "juice_smoke",
  "wired_path": "D:\\prettyk-dev\\reports\\wired.json",
  "log_path": "D:\\prettyk-dev\\reports\\runner.log",
  "started_at": 1756900000.123,
  "finished_at": 1756900360.456,
  "error": null,
  "stub": false
}
```

Факты:
- `run_id` — **12 hex** (uuid4().hex[:12]); это канонический ID прогона студии.
- Пути в артефакте — `D:\prettyk-dev\...`: файл создан **до** переименования репо (01.09.2026). Это исторический артефакт, не баг контракта.
- Семантика exit-кода (канон допуска `sanctuary/pure/admission.md`): **0** — ok; **1** — сбой исполнения (`fail_run` → admission VOID); **2** — security gate fail (`fail_gate`). Сбой исполнения не даёт авторитетного pass/fail допуска.

### 1.2 `run_summary.json` (G-20) — вердикт и gate

Строится в `orchestrator/utils/reporter.py` (`build_run_summary`, `write_run_summary_from_controller`, `persist/read_live_run_summary`). Реальная форма (набор полей из кода; значения в примере иллюстративные):

```json
{
  "exit_code": 2,
  "gate": "fail",
  "scenarios": { "ok": 4, "fail": 1, "fail_allowed": 0, "skip": 0 },
  "paths": {
    "allure_results": "reports/allure-results",
    "allure_report": "reports/allure-report",
    "allure_project_id": "secops",
    "scanner_html": "reports/scanner-results/report.html",
    "scanner_xml": "reports/scanner-results/juice_dojo.xml",
    "live": null
  },
  "scanner_mode": "demon",
  "scanner_api_port": 8080,
  "scanner_proxy_port": 8090,
  "honest_contract_notes": ["..."],
  "admission_void": false,
  "debug_mode": false,
  "dojo_stats": { "critical": 0, "high": 2 },
  "finding_collapse": null,
  "executive": null,
  "executive_class": null,
  "allure_summary": { "passed": 4, "failed": 1 },
  "built_at": "2026-09-03T10:00:00"
}
```

Факты:
- `gate` ∈ `pass | fail | error | void`. `void` — при `admission_void` или `debug_mode=true`; `error` — при qsum error; `fail` — при `quality_gate_failed` (политика `PK_QUALITY_GATE_ON_ALERT_ERROR=closed` — fail-closed).
- Необязательные поля (`scanner_html`, `scanner_xml`, `live`, `dojo_stats`, `finding_collapse`, `executive*`, `allure_summary`) — опциональные, зависят от режима/профиля.

### 1.3 Персистентная запись прогона — PG `RunRecord`

`orchestrator/models/run_record.py` (PERS-B1, SQLAlchemy, таблица `run_records`):

| Поле | Тип/значения |
|---|---|
| `id` | uuid **hex12** — совпадает с `run_id` |
| `check_id` | строка |
| `session_name` | строка |
| `status` | `queued \| running \| succeeded \| failed \| cancelled` |
| `profile` | строка |
| `target_url` | строка |
| `findings_count` | int |
| `duration_seconds` | float |
| `exit_code` | int (0/1/2) |
| `verdict` | `pass \| fail \| error \| gate_fail` |
| `started_at` / `finished_at` / `created_at` | datetime |
| `error_message` | text? |
| `wired_path` / `log_path` | строки |
| `owner_user_id` | FK |

Параллельная Pydantic-модель COS-L4 (`orchestrator/models/run_model.py`) — слой Cosmoport: `Run {id, plan_id, trigger: scheduled|pre_release|emergency|manual, initiator, domain_id, status: pending|running|passed|failed|blocked, started_at…}`, `Batch {id, plan_id, type, status, bricks[], artifacts[], evidence[]}`. Это **проекция/обёртка**, не замена RunRecord.

### 1.4 Манифест `wired.json` — Meta с релизным контекстом

`orchestrator/models/wired.py` (StrictModel `extra="ignore"`, `strip_legacy_wired_dict`). Реальный пример Meta — `orchestrator/tests/fixtures/exp01_reference/manifest.json`:

```json
{
  "meta": {
    "project_id": "exp01-baseline",
    "initiator_name": "ss7developer@dev.spaceport.ru Космопорт Разработчик",
    "app_leader": "ss7leader-itlead@dev.spaceport.ru Космопорт ИТ-Лидер",
    "assessment_purpose": "emergency",
    "generate_act": false,
    "emergency_reason": "Daddy, chill!",
    "release_domain": "deploydomain-builddomain-owasp-scanner-tests",
    "compliance_requirements": "",
    "release_manager": "ss7rel-manager@dev.spaceport.ru Космопорт Релиз-Менеджер",
    "app_type": "web"
  },
  "infrastructure": {
    "base_url_override": "http://juice-shop:3000",
    "allowed_extra_domains": "https://rkn.gov.ru|auth.dev.spaceport.ru|*.internal.bank|google.com",
    "scanner_mode": "demon",
    "browser_type": "chrome-headless",
    "debug_mode": true,
    "additional_local_server_port": 8085,
    "scanner_work_timeout_min": 60,
    "webswing_session_timeout_min": 60,
    "idle_timeout_min": 10,
    "start_with_webswing": false
  },
  "security_configuration": {
    "scan_policy": "custom_policy",
    "auth_type": "Без авторизации",
    "app_architecture": "Не указано"
  }
}
```

Факты:
- `meta.assessment_purpose` ∈ `scheduled | pre_release | emergency | manual` — ось допуска.
- `meta.generate_act`: `manual → false` (скрыто), `pre_release → true` (readOnly), `scheduled`/`emergency` — опционально (канон admission.md §3, SoT allOf).
- `project_id` default — `"owasp-scanner-tests"`.

### 1.5 Сырой ZAP XML — `reports/scanner-results/*.xml`

Реальный файл `reports/scanner-results/juice_dojo.xml` — формат **OWASPZAPReport v2.17.0**: `site → alertitem` с полями `pluginid, alertRef, riskcode, confidence, instances {uri, method, param, attack, evidence}`. Распarsed-вид — fixture `orchestrator/tests/fixtures/exp01_reference/zap_raw_alerts_from_xml.json`:

```json
{
  "alerts": [{
    "name": "Cross Site Scripting (Reflected)",
    "risk": "High", "riskcode": "3", "confidence": "2",
    "pluginid": "40012", "alertRef": "40012", "cwe": "79",
    "count": 3, "site": "http://juice-shop:3000",
    "instances": [{ "uri": "...", "param": "q", "method": "GET",
                    "attack": "<script>", "evidence": "..." }]
  }]
}
```

### 1.6 Fuzz-тройка — `reports/fuzz/`

На модуль — три файла `fuzz-<module>-<hash>.{json,findings.json,digest.json}`:

1. **Полный отчёт** `fuzz-<module>-<hash>.json`: `baseline {body_bytes, body_sha256, latency_ms, status}` + `cases[] {case_id, i, payload_length, payload_sha256, request_url_sha256, deltas[], anomaly_reasons[], response{...}, status, status_changed, transport_error}`.
2. **Findings pack** `*.findings.json` (реальный `fuzz-juice_search_q-05d2e9a3be97.findings.json`):
```json
{
  "kind": "kdt_fuzz_findings_pack",
  "module_id": "juice_search_q",
  "run_id": "fuzz-juice_search_q-05d2e9a3be97",
  "target_origin": "http://127.0.0.1:3000",
  "anomalies_total": 0,
  "reason_counts": {},
  "dojo_note": "...",
  "evidence_path": "...", "digest_path": "...",
  "zap_alerts": []
}
```
3. **Digest** `*.digest.json`: `anomalies[] {case_id, status, latency_ms, body_bytes, payload_sha256_prefix (12 hex), reasons[]}`.

**Расхождение ID:** fuzz `run_id` = `fuzz-<module>-<hash>` ≠ runner `run_id` (12 hex из `current.json`). Связи fuzz-сессии с runner-прогоном в артефакте нет — гэп (см. §7).

---

## 2. Акт (Q2)

Модель — `orchestrator/reports/__init__.py` (COS-L13, Pydantic v2, `extra="ignore"`). Обязательные поля помечены `*`:

```python
GOSTSignature  { role*, name*, date* (YYYY-MM-DD), status="signed" }
GOSTFinding    { severity*, title*, description, cwe, evidence_refs[], recommendation }
GOSTActHeader  { act_number="", project_name*, organization="Центральный Банк РФ",
                 methodology="OWASP Top 10:2021 / ASVS 4.0" }
GOSTActObject  { name*, url, domain, version, platform="Web Application" }
GOSTAct        { header*, object*, findings_table[], signatures[] }
```

Факты:
- Акт — **формируемая сущность**: JSON-модель → HTML (`render_gost_act_html`), артефакт `act/act.html` внутри run_package zip. По канону `sanctuary/pure/admission.md` §3: кнопка «Сохранить акт» и `act/act.html` в zip — **только** при `generate_act=true` **и** готовой оси допуска; при OFF — `"act": "omitted"` + reason.
- Второй вид — «Акт проверки (пакет прогона)» HTML внутри `run_package.py` (пакет артефактов).
- `debug_mode=true` → admission **VOID** всегда, акт не имеет силы допуска.
- Реального сохранённого JSON/HTML акта в `reports/` **нет** — рендер on-demand, персистентного `act_ref`/ID не существует (гэп, §7).
- Тесты: `orchestrator/tests/test_gost_model.py`, `test_e2e_cosmo.py` импортируют GOSTAct из `orchestrator.reports`.
- Смежное: `orchestrator/tools/trial_act_gates_pipe.py` — trial-пайп актов и гейтов.

---

## 3. Evidence (Q3)

### 3.1 Object refs (стабильные, тяжёлые)

PG-реестр `orchestrator/models/evidence_record.py` (PERS-B2, таблица `evidence_records`):

| Поле | Значения |
|---|---|
| `artifact_type` | `video \| screenshot \| har \| log \| report_html \| report_xml \| report_json` |
| `sha256` / `size_bytes` / `content_type` | дедупликация и целостность |
| `storage_backend` | `local \| minio` |
| `local_path` | путь |
| `presigned_url` / `presigned_expires_at` | TTL **1h** |
| `uploaded_at`, `artifact_name`, `run_id`, `id` (hex12) | привязка к прогону |

Стабильные объектные ссылки на диске (мета-файлы целостности из `integrity.py`): `wired.json`, `runner.log`, `run_summary.json`, `evidence_refs.json` + всё перечисленное в §1 (scanner XML/HTML, Allure results/report, HAR, видео, скриншоты, fuzz-тройка) + экспортные пакеты (§5.1).

### 3.2 Метаданные (лёгкие, безопасно инлайнить в события)

Counts и summaries: `findings_count` (RunRecord), `scenarios {ok, fail, fail_allowed, skip}` и `dojo_stats` (run_summary), `anomalies_total` / `reason_counts` (fuzz findings pack), severity-снапшоты, таймстампы. Это то, что соседям можно получать без вытаскивания тяжёлых артефактов.

### 3.3 Цепочка и URI-схема

- `orchestrator/evidence/__init__.py` (COS-L11): `EvidenceEntry {index, timestamp, type, content, provenance, prev_hash, hash}` (frozen dataclass); `EvidenceLedger` — append-only SHA-256-цепочка, genesis `"0"*64`, `verify_chain()`, `to_dict() → {entries, length, verified, last_hash}`. Ре-экспорт в `evidence_chain.py`.
- URI-схема `artifact://` существует в **одном** месте: `artifact://scanner.xml#alert/{alert_ref}/instance/{n}` (`orchestrator/utils/finding_identity.py:138`) — ref на конкретный инстанс алерта внутри XML. Схема молодая, несистематизированная (гэп, §7).
- Каталог `evidence_artifacts/` пуст (заготовка).

---

## 4. Фингерпринты и scope PASS (Q4)

### 4.1 Три схемы фингерпринтов

| Схема | Файл | Формула | Где живёт |
|---|---|---|---|
| **finding-v1** (каноническая) | `orchestrator/utils/finding_identity.py` | `finding:{FINGERPRINT_VERSION}:{sha256(source\|plugin_id\|alert_ref\|method\|normalized_path\|normalized_parameter)[:24]}` | `CanonicalFinding` (`orchestrator/models/finding.py`): finding_id, fingerprint_version, source="scanner", plugin_id, alert_ref, title, severity, cwe, method, path, parameter, evidence_refs[], dojo_id (только display), dojo_url |
| **Dojo-sync / UI** | `orchestrator/services/dojo_sync.py` | UI-hash: `fnv1a_32(kind\|title.lower\|sev\|cwe\|param.lower\|endpoint.lower\|attack_type.lower)` → 8 hex (паритет с FE `manifestContentHash`); Dojo `unique_id_from_tool`: `"pk-"+sha256(тот же ключ)[:16]` | дедуп в DefectDojo |
| **Fuzzer** | `orchestrator/corpus/fuzz_reporter.py` | `sha1(kind\|title.lower\|severity\|cwe\|param)[:16]` | `Finding.fingerprint()` |

Факты:
- `normalize_path` в finding-v1 схлопывает динамические сегменты (`{id}`, `{uuid}`, `{hash}`); Dojo DB id **никогда** не входит в фингерпринт.
- Fuzzer ведёт свою идентичность: `rule_id = pk_fuzz_{kind}`, `confidence` 1–4, `tags[]`.
- ZAP `scan_id` (spider/ascan) — внутренний числовой ID ZAP, **не** глобальная идентичность (scanner_adapter.py).

### 4.2 Scope студийного PASS — точный кортеж

Студийный вердикт (`gate=pass` в run_summary / `verdict=pass` в RunRecord / exit 0) имеет смысл **только** в рамках контекста, который проверяет comparability-gate (`orchestrator/models/delta.py`, `orchestrator/utils/baseline_delta.py`, `DeltaProvenance`):

```
(project_id, release_domain, wired_hash, target_scope_hash,
 scan_profile, finding_schema_version = "finding-v1")
```

- Comparability: прогон сравним с базлайном **только** при совпадении `fingerprint_version` + `wired_hash` + `target_scope_hash` + `scan_profile` **и** полноте artifact sets. Несравнимость — явный статус (`incomparable | baseline_missing | current_missing | artifact_incomplete`), `FIXED` молча не ставится. `DeltaResult` имеет `schema_version="delta-v1"`.
- К PASS дополнительно привязаны: `exit_code` (ось исполнения), `gate` (ось допуска), `assessment_purpose` + `generate_act` (Meta), `check_id` / `session_name` / `run_id` (RunRecord), `debug_mode` (→ VOID).
- **Про artifact_digest образов:** студия digest сборки артефактов **не производит** — это зона CP/сборки. Гэп для Contract A (см. §7).

---

## 5. Airgap-транспорт (Q5)

### 5.1 МОЖЕМ сейчас

| Механизм | Файл | Что даёт |
|---|---|---|
| **Файловый пакетный обмен** | `orchestrator/infra/artifact_exchange.py` | `ArtifactFormat` = `SBOM_CYCLONEDX \| SBOM_SPDX \| SARIF \| OCI_BUNDLE \| RUN_SUMMARY \| RUN_PACKAGE`; `ArtifactDescriptor {run_id, session_id, format, path, size_bytes, sha256, created_at, labels}`; `RunArtifactManifest`. Инвариант: секреты в артефакты не попадают. Это drop-точка для передачи пакета соседям |
| **Live HTTP API + SSE** | `orchestrator/utils/live_server.py` | Loopback REST: `/api/meta`, `/api/log/anomalies`, `/api/ai/status`, `/api/gate/policy`, `/api/admin/retention/status`, `/api/lab/intruder/*`, `/api/dojo/severity`, `/api/dojo/findings`, `/api/ci/status`, `/api/checks/{checkId}/draft` (draft_store.py). **4** SSE-канала `text/event-stream` (строки 2228/2281/2395/2574) — живая телеметрия прогона |
| **Исходящий REST (только Dojo)** | `orchestrator/services/dojo_sync.py` | `requests.post` с retry=3, backoff=2.0, timeout=120 — импорт находок в DefectDojo. Паттерн retry/timeout в коде отработан |
| **HMAC-механика (входящая)** | `orchestrator/.../forge_gitea.py` | Верификация подписи webhook (sha256). `auth_module.py` — HMAC-SHA1. bind-токен HMAC из монитора выпилен (commit `7d421a4`, unified PW-AIRGAP) |
| **Идемпотентность запуска** | `orchestrator/infra/run_idempotency.py` | dedup-key = sha256, TTL 30с, check active run (InMemory/Valkey) |
| **Профили развёртывания** | `orchestrator/infra/profiles.py` | `PK_DEPLOY_PROFILE` = `pure-box` (single process, без PG/Valkey/очередей) \| `enterprise` |
| **Fail-closed** | `docs/security.md`, admission.md | `PK_QUALITY_GATE_ON_ALERT_ERROR=closed` → exit 2; timeout → не PASS; `debug_mode` → VOID; `allowed_extra_domains` — декларативные, не enforcement |

### 5.2 ПОТРЕБУЕТСЯ строить (для Contract A)

1. **Исходящий подписанный webhook/событие соседям.** Сегодня исходящих колбэков нет вообще: студия только принимает (webhook Gitea) и пушит в Dojo. HMAC-верификация есть, но на входе — для исходящей доставки нужен подписывающий клиент (envelope + signature + timestamp).
2. **Delivery-id / replay-safety / retry-журнал** на исходящие события (внутри студии retry есть только в Dojo-клиенте).
3. **Idempotency по scan_id на приёмнике.** Глобального `scan_id` как сквозного идентичности сканирования **нет**: есть `run_id` (12 hex), fuzz `run_id` другого формата, ZAP scan_id внутренний. Нужно зафиксировать в контракте: scan_id = `run_id` студии (+ отдельная идентичность fuzz-сессий), и идемпотентность приёма по нему.
4. **REST pull API для соседей** (сейчас Live API — loopback-инструментарий UI, не контрактная отдача).
5. **Стабильный `act_ref`** (см. §7).
6. **`contract_version` в envelope** — сейчас нигде нет (у DeltaResult есть свой `schema_version="delta-v1"` — паттерн для переноса).
7. Airgap-инварианты из `docs/security.md`: alpha-профиль **не** airgap-ready (latest-теги и пр.); переносом prod на airgap занимается волна AIRGAP-PROD (Buddy) — студийная часть готова, поставка образов/реестр — нет.

### 5.3 Аутентификация/подпись/таймауты — текущее состояние

- Подпись исходящих: **нет**. Входящая верификация: forge_gitea (HMAC-sha256). API-key: scanner demon (industrial-профиль), auth_vault.
- Retry/timeout: Dojo — 3×2.0s/120s; run_idempotency TTL 30с; Live — loopback, без внешних таймаутов контракта.
- Semantics отказов: error/timeout/недоступность сканера → `gate=error`/`void`, exit 1/2 — никогда PASS (fail-closed, `UNAVAILABLE`/`INCOMPLETE` не превращаются в pass).

---

## 6. Негативные случаи — что студия НЕ отдаёт

1. **Подписанных исходящих вебхуков/колбэков нет** — только pull-файловый обмен и Dojo-push.
2. **Глобального scan_id нет** — только `run_id` 12 hex; fuzz-сессии имеют свой формат ID и **не связаны** с runner-прогоном в артефактах.
3. **Стабильного ID/файла акта нет** — акт рендерится по требованию, персистентного `act_ref` не существует.
4. **artifact:// URI не систематизирован** — одно место использования (finding → instance алерта в scanner.xml).
5. **Digest сборки артефактов (образов) студия не производит** — зона CP.
6. **Dojo DB id не участвует в идентичности находок** — только display-поле (dojo_id/dojo_url).
7. **`admission void`/`debug`-прогоны не дают допуска** — PASS из debug_mode невозможен by design.
8. **Молчаливого FIXED нет** — сравнение с базлайном при неполноте артефактов даёт явный incomparable-статус.
9. Артефакты до 01.09.2026 содержат пути `D:\prettyk-dev` — исторический артефакт переименования репо, для Contract A брать формы, не литералы путей.

---

## 7. Гэпы и решения для Максима

| # | Гэп | Предложение |
|---|---|---|
| G1 | Fuzz `run_id` (`fuzz-<module>-<hash>`) ≠ runner `run_id` (12 hex); связи нет | В контракте: scan_id = runner run_id; fuzz-pack добавить поле `parent_run_id` (или начать корреляцию в findings pack) |
| G2 | Акт без стабильного ID/артефакта | Ввести `act_ref` = sha256 модели акта, класть `act/act.html` + `act.json` в evidence-реестр как `report_html` |
| G3 | `artifact://` несистематизирован | Принять URI-схему как канон Contract A (host = scanner.xml, fragment = alert/instance), добавить реестр scheme-target'ов |
| G4 | Нет исходящей подписанной доставки | Карточка: outbound envelope {contract_version, scan_id, event_type, payload_ref, signature, ts} + HMAC-клиент (механика уже есть на входе) |
| G5 | Нет идемпотентности приёма по scan_id | Расширить run_idempotency-паттерн на входящие у соседей; scan_id зафиксировать = run_id |
| G6 | PASS scope (§4.2) не опубликован как контракт | Взять кортеж из DeltaProvenance как официальный scope PASS в Contract A |
| G7 | Live API — loopback/UI-инструментарий | Решить: Contract A использует pull-эндпоинты Live API или строит отдельный contract-API профиль |

---

## 8. Источники

- Артефакты: `reports/runs/current.json`, `reports/scanner-results/juice_dojo.xml`, `reports/fuzz/fuzz-juice_search_q-05d2e9a3be97.*`, `orchestrator/tests/fixtures/exp01_reference/` (manifest.json, zap_raw_alerts_from_xml.json, zap_raw_report.xml, dojo_baseline_findings.json, spider_urls.json).
- Код: `orchestrator/utils/reporter.py`, `orchestrator/models/run_record.py`, `orchestrator/models/run_model.py`, `orchestrator/models/wired.py`, `orchestrator/reports/__init__.py`, `orchestrator/models/evidence_record.py`, `orchestrator/evidence/__init__.py`, `orchestrator/utils/finding_identity.py`, `orchestrator/models/finding.py`, `orchestrator/models/delta.py`, `orchestrator/utils/baseline_delta.py`, `orchestrator/services/dojo_sync.py`, `orchestrator/corpus/fuzz_reporter.py`, `orchestrator/infra/artifact_exchange.py`, `orchestrator/utils/live_server.py`, `orchestrator/infra/profiles.py`, `orchestrator/infra/run_idempotency.py`, `orchestrator/tools/run_package.py`, `orchestrator/tools/trial_act_gates_pipe.py`.
- Канон: `sanctuary/pure/admission.md`, `docs/security.md`.
- Бриф: `D:\prettyk-airlock\docs\research\2026-09-02-cross-product-contract-bridge.md` §9.
