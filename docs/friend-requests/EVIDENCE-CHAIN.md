# EVIDENCE-CHAIN: Иммутабельный Evidence Ledger с provenance

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Каждая запись evidence (скриншот, RAW request/response, лог, алерт, решение) — иммутабельна и привязана к цепочке: Run → Batch → Job → Step. Хеш evidence + provenance гарантируют, что findings относятся именно к этой версии кода, этому раннеру и этому моменту времени. Evidence Chain — основа для Smooth Rewind (Studio Forensics) и ГОСТ-Акта.

## Ключевые свойства

- **Иммутабельность.** Evidence запись создаётся один раз и никогда не меняется.
- **Provenance.** Каждая запись содержит: `run_id`, `batch_id`, `job_id`, `step_id`, `capability`, `timestamp`, `hash`.
- **Типы evidence:** `screenshot`, `raw_request`, `raw_response`, `log_line`, `scanner_alert`, `fuzzer_payload`, `gate_decision`, `finding`.
- **Хеширование.** Контент хешируется (sha256). Хеш — часть provenance.
- **Связь с Findings.** Каждый Finding ссылается на одно или несколько Evidence — «почему мы считаем это уязвимостью».
- **Основа для Smooth Rewind.** Evidence Chain позволяет восстановить полную картину атаки: запрос → ответ → алерт → скриншот → решение оператора.

## Что уже есть

- Monitor пишет evidence (screenshots, raw requests/responses, logs).
- Smooth Rewind — концепт (master slider, синхронизация fuzzer payloads, lasers, telemetry, video, logs, scanner findings, Buddy).
- Signature Rewind — PoC major.

## Что нужно построить

- Модель: `Evidence { id, run_id, batch_id, job_id, step_id, type, content_ref, content_hash, timestamp }`.
- Иммутабельное хранилище (artifact store: файлы + метаданные в PostgreSQL).
- API: `POST /runs/:id/evidence`, `GET /runs/:id/evidence`, `GET /runs/:id/evidence/timeline`.
- Интеграция с SecurityCapabilityBroker: scanner/Playwright/Fuzzer пишут evidence с правильным provenance.
- API для Smooth Rewind: `GET /runs/:id/evidence/timeline?from=T1&to=T2`.

## Честная «не обещаем»

- Полноценное content-addressable storage (как IPFS) — out of scope. Файлы на диске + метаданные в PG.
- WORM-хранилище (Write Once Read Many на уровне файловой системы) — out of scope v1.

## DoD

- Модель `Evidence` с иммутабельностью.
- Artifact store: запись и чтение evidence.
- Provenance: каждая запись содержит полную цепочку run → batch → job → step.
- API временной шкалы для Smooth Rewind.
- Тесты: иммутабельность, полнота provenance, timeline-запросы.