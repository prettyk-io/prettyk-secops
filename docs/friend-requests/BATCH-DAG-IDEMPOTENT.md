# BATCH-DAG-IDEMPOTENT: Batch как логическая единица с DAG и идемпотентностью

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Batch — логическая единица PrettyK: «все SAST-сканеры для этого приложения» или «все деплои в stage». Batch ≠ Job: один Batch порождает несколько Jobs в Execution Engine. PrettyK оперирует Batches и их DAG-зависимостями, не давая execution engine диктовать семантику. Batch идемпотентен: одинаковые inputs → одинаковые артефакты.

## Ключевые свойства

- **Batch — логическая группировка.** Build Batch содержит все build-кирпичи, Static Scan Batch — все sast/sca, и т.д.
- **Batch ≠ Job.** Batch порождает N Jobs (SonarQube + Trivy + KCS = 3 jobs в одном Static Scan Batch). Execution engine управляет Jobs, PrettyK управляет Batches.
- **DAG между Batches.** Batches связаны зависимостями: Static Scan Batch ждёт все Build Batches. Deploy Batch ждёт Gate после Static Scan. Компилятор строит DAG.
- **Идемпотентность.** `batch_inputs_hash` = хеш всех inputs (git ref, версии образов, конфиг). При совпадении хеша можно переиспользовать артефакты. Без этого evidence chain рассыпается.
- **Статусы:** `pending → running → passed | failed | blocked`.

## Что уже есть

- Ничего. Batches как сущность отсутствуют.

## Что нужно построить

- Модель: `Batch { id, plan_id, type, bricks[], status, artifacts[], evidence[], inputs_hash, started_at, finished_at }`.
- Batch lifecycle state machine.
- API: `GET /plans/:id/batches`, `GET /batches/:id`, `GET /batches/:id/artifacts`.
- Переиспользование артефактов по `inputs_hash`.
- Связь Batch → Jobs (когда ExecutionAdapter создаёт jobs).

## Честная «не обещаем»

- Ручное управление Batches (перезапуск одного Batch'а из середины DAG) — out of scope v1.
- Cross-plan переиспользование артефактов — out of scope v1.

## DoD

- Модель `Batch` с lifecycle.
- DAG между Batches компилируется Plan Compiler'ом.
- Идемпотентность: одинаковый `inputs_hash` → переиспользование артефактов.
- Тесты: DAG-зависимости, статусная машина, идемпотентный повтор.