# RUN-CONTROL-PLANE: Run Control Plane — durable state machine для Run/Batch/Gate

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Run Control Plane — durable state machine, которая ведёт Run от создания до финального решения. PostgreSQL — durable truth (состояния Run, Batch, Gate, Findings). Valkey — transport/coordination (события, SSE в Studio/Monitor). Capability-aware runners с differentiated health (liveness, readiness, execution readiness, draining, degraded).

## Ключевые свойства

- **Durable state в PostgreSQL.** Каждый переход состояния — транзакция. Никаких «потерянных» Run'ов.
- **Состояния Run:** `pending → compiling → compiled → running → gating → passed | failed | blocked`.
- **Состояния Batch:** `pending → queued → running → passed | failed | blocked`.
- **Состояния Gate:** `pending → evaluating → passed | blocked | manual_required → decided`.
- **Valkey transport.** События: `run.state_changed`, `batch.state_changed`, `gate.decided`, `finding.created`. SSE → Studio/Monitor.
- **Health checking.** Раннеры регулярно отчитываются: `liveness`, `readiness`, `draining`, `degraded`. Control Plane учитывает health при назначении Jobs.
- **Graceful degradation.** Если раннер уходит в `draining` — новые Jobs не назначаются, текущие завершаются. Если `degraded` — reduced capacity.

## Что уже есть

- Исследование system layers (2026-08-27): PostgreSQL durable truth, Valkey transport, capability-aware runners, differentiated health.
- Monitor :8767 — SSE data source.
- Studio Execution View — в разработке (Major 1).

## Что нужно построить

- Модель: `Run { id, plan_id, trigger, initiator, domain_id, status, batches[], gates[], findings[], started_at, finished_at }`.
- State machine движок (transition validation, side effects).
- Valkey event bus: publish events на каждое изменение состояния.
- Health-check protocol: раннер → heartbeat → Control Plane.
- API: `POST /runs`, `GET /runs/:id`, `GET /runs/:id/events` (SSE).

## Честная «не обещаем»

- Distributed tracing (OpenTelemetry) — out of scope v1.
- Автоматическое переключение на backup раннер — out of scope v1.
- Полная реализация draining/degraded — v1: базовый health check, полная модель позже.

## DoD

- Run state machine в PostgreSQL.
- Valkey events на каждое изменение состояния.
- SSE endpoint для Studio/Monitor.
- Health check протокол.
- Тесты: полный lifecycle Run, переходы состояний, параллельные Batches, block через Gate.