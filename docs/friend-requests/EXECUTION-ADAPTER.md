# EXECUTION-ADAPTER: ExecutionAdapter с Woodpecker META + Jenkins Option

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

ExecutionAdapter — интерфейс между PrettyK Run Control Plane и CI-движком. Канонический default — Woodpecker (лёгкий, server+agents, DAG, labels, ephemeral runners, PostgreSQL). Jenkins — поддерживаемая опция для заказчиков с существующим Jenkins-стеком. Оба через один контракт. PrettyK не пишет свой CI-движок.

## Ключевые свойства

- **Woodpecker META.** Все примеры, доки, dev-стенд и default-конфиг идут с Woodpecker.
- **Jenkins Option.** Тот же контракт. «Мало ебли»: не лезем в plugin-зоопарк, не используем Jenkins как security authority.
- **Минимальный контракт.** `submitJob(job_spec)`, `getJobStatus()`, `streamLogs()`, `cancelJob()`, `listCapabilities()`.
- **Capability labels.** ExecutionAdapter сообщает, какие capability доступны (docker, kubernetes, host, network, gpu). Plan Compiler сопоставляет требования кирпичей с capability.
- **Один Batch → N Jobs.** Batch компилируется в набор JobSpec'ов, ExecutionAdapter исполняет их.

## Что уже есть

- Исследование Woodpecker (server + agents, Docker/K8s/local, gRPC, labels, one-shot agents, PostgreSQL, external forge).
- Исследование Jenkins (Pipeline, shared libraries, durability modes, security caveats).

## Что нужно построить

- Интерфейс `ExecutionAdapter` (TypeScript/Python-контракт).
- Woodpecker-реализация: запуск workflow, стриминг логов, статус.
- Jenkins-реализация (stub или полная — по приоритету).
- Преобразование Batch → JobSpec[].
- API: `GET /capabilities` — список доступных capability от ExecutionAdapter.

## Честная «не обещаем»

- Gitea Actions как CI-движок — out of scope v1 (можно добавить позже как ещё один адаптер).
- Миграция между CI-движками — out of scope.
- Полное управление Woodpecker/Jenkins из PrettyK (админка CI) — out of scope.

## DoD

- Контракт `ExecutionAdapter`.
- Woodpecker-реализация: submit → статус → логи → cancel.
- Jenkins-реализация (stub или MVP).
- Batch → JobSpec[] трансформация.
- Тесты: Woodpecker job lifecycle, Jenkins job lifecycle.