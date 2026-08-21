# Манифест — machine контракт проверки

> **CANON** — hub topic. Slice: **13 августа 2026** (vnext: форма = прямой маппер, не JSON Schema).  
> JSON: [`../manifest.json`](../manifest.json). Narrative: [`../manifest.md`](../manifest.md).  
> Rule: [`schema-sot`](../../.opencode/rules/schema-sot.mdc). Реестр: [`INDEX.md`](INDEX.md).

## 1. Роли

```mermaid
flowchart LR
  Json[docs_manifest_json] --> Mapper[FE_manifest_mapper]
  Pyd[Pydantic_runtime] --> Orch[Orchestrator]
  Json -.->|not_generated_from| Mapper
  Mapper -.->|not_writes_back| Json
```

| Слой | Роль |
|---|---|
| **`docs/manifest.json`** | machine-контракт проверки (в vnext — не генератор формы) |
| **FE маппер** (`ManifestForm.tsx`) | прямой React-рендер manifest → UI (без JSON Schema) |
| **Pydantic** (`orchestrator/models/manifest.py`) | контракт **исполнения**, не генератор анкеты |
| **Legacy fields в Pydantic** | импорт старых JSON — не повод писать обратно в манифест |

## 2. Тезисы

1. Менять JSON-манифест — только по явной воле владельца.  
2. При расхождении код/docs/UI ↔ манифест — **перестраивать от JSON**, не наоборот.  
3. Чего нет в манифесте — можно резать в runtime/docs; **нельзя** возвращать в манифест без приказа.  
4. Порядок смены поля: манифест (если разрешили) → при нужде Pydantic → тесты → `manifest.md` → FE маппер.
5. В vnext форма **не** производится из JSON Schema — рендерится прямым маппером (решения #1/#2 [`fe-vnext-architecture.md`](fe-vnext-architecture.md)).

## 3. Граница с hub

Создание сущностей в UI — [`studio-hub.md`](studio-hub.md); содержимое конструкторов — PrettyK / auth / conn / wave. Этот топик — **только** граница runtime-контракта манифеста.
