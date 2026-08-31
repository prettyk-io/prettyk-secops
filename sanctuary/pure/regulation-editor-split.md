# REGULATION-EDITOR-SPLIT: разделить Регламент и Редактор, выпилить RJSF окончательно

> **CANON** — hub topic. Slice: **20 августа 2026** (2FA sealed: машина готова, плоский JSON работает, legacy-формат со-существует через Pydantic-адаптер).
> Реестр: [`INDEX.md`](INDEX.md). Эпик: [`../../docs/backlog.md`](../../docs/backlog.md) § Эпик RK.

## Тезис

`docs/wired.json` (2729 строк JSON Schema) смешивает две разные сущности:
- **Регламент** — метаданные проверки: `meta`, `infrastructure`, `assessment_purpose`, `base_url`, `scanner_mode`, `gate`
- **Редактор** — содержимое конструктора: PrettyK, auth-модули, цепочки, фаззеры, data-модули

Их разделение даёт:
1. **Pure canon** — минимальный регламент (project_id, assessment_purpose, base_url), редактор полный
2. **Cosmo canon** — расширенный регламент (релизные поля, акты, оси допуска), редактор тот же
3. **RJSF выпиливается полностью** — JSON Schema больше не формат хранения, свой typed JSON (плоский, без `oneOf`/`allOf`/`$ref`)
4. **Pydantic остаётся** в ядре оркестратора — валидация runtime-контракта перед запуском

Это механизм внутри модели [`split-canon.md`](split-canon.md) (CANON BASE vs INTEGRATION):
- `regulation.*` — разное для pure и cosmo
- `editor.*` — общее для обоих контуров

## As-built якорь

- `docs/wired.json` — текущая простыня JSON Schema (2729 строк, смесь регламента и редактора)
- Прямой маппер вместо RJSF, форма ≠ JSON Schema
- JSON-манифест — reference, не генератор формы
- `sanctuary/canon/wired-sot.md` — роли: JSON-манифест → FE маппер, Pydantic → оркестратор
- `sanctuary/canon/split-canon.md` — CANON BASE vs INTEGRATION
- `.opencode/rules/schema-sot.mdc` — «JSON-манифест runtime-контракта, vnext форма = прямой маппер»
- `orchestrator/models/wired.py` — Pydantic-модели исполнения
- `cosmo/src/` — текущий работоспособный фронт с RJSF (легаси-рестор от 14 авг)

## Целевой формат (плоский typed JSON вместо JSON Schema)

```json
{
  "regulation": {
    "project_id": "owasp-scanner-tests",
    "assessment_purpose": "scheduled",
    "base_url_override": "http://runner01.dev.spaceport.ru:8080",
    "scanner_mode": "demon",
    "browser_type": "chrome",
    "gate": {
      "max_critical": 0,
      "max_high": 0
    }
  },
  "editor": {
    "scenario": { "prettyk": "...", "wirek": "..." },
    "modules": {
      "auth": [{ "id": "auth-1", "type": "browser_form", "login_url": "..." }],
      "connectors": [{ "id": "conn-1", "type": "postgres", "host": "..." }],
      "chains": [{ "id": "chain-1", "steps": [...] }],
      "fuzzers": [{ "id": "fz-1", "target": "..." }],
      "data_modules": [{ "id": "dm-1", "source": "..." }]
    }
  }
}
```

## Что именно выпиливается

| Что | Файлов | Причина |
|---|---|---|
| `src/schema/` | 25 | JSON Schema-дрова для RJSF |
| `src/form/` | 47 | RJSF-виджеты, `uiSchema.ts`, `templates.tsx` |
| `@rjsf/core`, `@rjsf/antd`, `@rjsf/validator-ajv*` | npm | RJSF runtime |
| `ajv`, `json-schema`, `json-schema-merge-allof` | npm | Валидация схемы |
| `docs/wired.json` как JSON Schema | 1 | Заменяется на `docs/regulation.schema.json` + `docs/editor-payload.json` |

## Что Pydantic продолжает делать

| Модель | Зачем |
|---|---|
| `Regulation(BaseModel)` | Валидация `regulation.*` перед запуском |
| `EditorModules(BaseModel)` | Валидация `editor.*` перед прогоном |
| `GatePolicy(BaseModel)` | max_critical/max_high, admission rules |
| `model_json_schema()` | Документирование контракта (опционально) |

Оркестратор не меняет логику — принимает тот же контракт, но в плоском typed JSON вместо JSON Schema.

## Честная «не обещаем»

- Legacy wired.json не удаляется — остаётся reference для оркестратора (импорт старых JSON).
- Интерпретатор (`orchestrator/core/controller.py`) не переписывается — только адаптируется к новому формату на входе.
- Pydantic-модели эволюционируют, не переписываются с нуля.
- Wire-парсинг и «чистый степ» — бонус следующего шага, не этого.