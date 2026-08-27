# SECURITY-GATES: Security Gate как явная сущность с решением и подписью

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Security Gate — не «if в скрипте», а явная сущность в durable storage. Gate имеет: входные findings, политику (block/warn/pass), решение (автомат или человек), таймстемп и подпись. Gate — доказательная база для ГОСТ-Акта и аудита. Цепочка гейтов: Build Integrity → Static Severity → Deploy Readiness → Dynamic Severity → Admission.

## Ключевые свойства

- **Gate — durable record.** Не условие в YAML. Запись в PostgreSQL.
- **Типы:** `automatic` (политика решает) или `manual` (человек принимает решение).
- **Политика:** правила вида `{ finding_type: "critical", action: "block" }`, `{ finding_type: "high", action: "warn", max_count: 5 }`.
- **Решение:** `pass | block | manual_required`. Для manual — `decided_by` (user_id) и `decided_at`.
- **Подпись.** Для ГОСТ-Акта: электронная подпись решения (хотя бы хеш).
- **Блокировка.** Если Gate → `block` — весь Pipeline Plan останавливается. Дальнейшие Batches не запускаются.
- **Переопределение на домен.** Политики гейтов можно переопределить на уровне домена (например, банк ЦБ хочет stricter правила).

## Что уже есть

- Логика допуска размазана по коду (admission gate в Run result). Не формализована.

## Что нужно построить

- Модель: `Gate { id, plan_id, type, position, policy, decision, decided_by, decided_at, signature }`.
- Gate state machine.
- Automatic Gate: движок правил — применяет policy к findings → решение.
- Manual Gate: API для принятия решения (`POST /gates/:id/decide { decision: "pass" | "block" }`).
- Интеграция с Plan Compiler: автоматическая вставка гейтов между Batches.

## Честная «не обещаем»

- Полноценная ЭЦП (криптография) — out of scope v1. Подпись = хеш доказательств + user_id + timestamp.
- Кастомные правила на DSL — out of scope. Политика = JSON rules.

## DoD

- Модель `Gate` с durable storage.
- Automatic Gate принимает решение на основе policy + findings.
- Manual Gate принимает решение через API.
- Gate `block` останавливает Pipeline Plan.
- Интеграция с Plan Compiler.
- Тесты: automatic pass, automatic block, manual decision, цепочка гейтов.