# PLAN-COMPILER: Компилятор Pipeline Plan из App Graph + Brick Catalog

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Plan Compiler — это «мозг» PrettyK, который берёт Application (или Group / Group of Groups), определяет набор Pipeline Bricks из каталога (с учётом переопределений домена), разрешает зависимости `depends_on`, группирует кирпичи в Batches и строит DAG с Security Gates между Batches. Результат — `PipelinePlan` (иммутабельный snapshot с хешом).

## Ключевые свойства

- **Вход:** Application (или Group/Group-of-Groups) + триггер (scheduled / pre_release / emergency / manual).
- **Разрешение кирпичей:** сначала `domain:{id}`, потом `core`. Учитывает политику домена и группы.
- **DAG из depends_on:** топологическая сортировка кирпичей, детект циклов, параллельные ветки.
- **Группировка в Batches:** все build → Build Batch, все sast/sca → Static Scan Batch, все deploy → Deploy Batch, все dast/autotest → Dynamic Test Batch.
- **Вставка Gates:** между Batches автоматически вставляются Security Gates (Static Severity, Deploy Readiness, Dynamic Severity, Admission).
- **Иммутабельный результат.** `PipelinePlan` — snapshot с хешом. Не меняется после компиляции.
- **Идемпотентность.** Одинаковые inputs → одинаковый `compiled_hash`.

## Что уже есть

- Mock-лесенка Cosmoport: app → build → deploy → URL, без компиляции.
- Никакого Plan Compiler нет.

## Что нужно построить

- Модель: `PipelinePlan { id, application_id, bricks[], batches[], gates[], compiled_hash }`.
- Compiler engine: вход (app + trigger) → разрешение кирпичей → DAG → Batches → Gates → Plan.
- API: `POST /plans/compile { application_id, trigger }` → `PipelinePlan`.
- Детект циклов в `depends_on`.
- Кэширование: если `compiled_hash` не изменился — вернуть существующий Plan.

## Честная «не обещаем»

- Инкрементальная компиляция (только изменившиеся кирпичи) — out of scope v1.
- Пользовательский редактор плана (ручная перестановка Batches/Gates) — out of scope v1.

## DoD

- Compiler принимает Application + trigger → выдаёт PipelinePlan.
- DAG корректен: зависимости разрешены, циклы детектятся.
- Batches сгруппированы по типам, Gates вставлены.
- Идемпотентность: повторная компиляция с теми же inputs даёт тот же `compiled_hash`.
- Тесты: компиляция app, компиляция group-of-groups, переопределение кирпича в домене, цикл = ошибка.