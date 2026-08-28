# PrettyK Native Workspace Storage — финальный концепт

> **Статус:** `research / concept` — согласован Keeper + Luna, не канон, не backlog  
> **Дата:** 27 августа 2026  
> **Контекст:** Результат дискуссии: «VCS, Git, `.pk` или нативный storage»
> **Итог:** Native-first, Git не входит в DAST-контур, `.pk` — только export/import surface при появлении потребности

---

## 0. Главный тезис (о чём договорились)

```text
Версионирование ≠ Git.
PrettyK нужна история, откат и воспроизводимый прогон.
Git для этого не нужен.
```

**PrettyK DAST — закрытая коробка.** Для проверки, созданной в UI или QWEN, не нужны ни внешний code review, ни branch/merge, ни коммиты в репозиторий, ни файловая атомизация, ни custom file extensions.

**Git появится только в Cosmoport 2.0** как инструмент оркестрации приложений, доменов, исходников и build/deploy-контуров. Даже там Git будет принадлежать Cosmoport orchestration layer, а не DAST execution layer. DAST получает уже развёрнутую цель (`deployed target → Playwright / scanner / Fuzzer → findings → evidence`) и не зависит от Git вообще.

**Luna подтвердила:** концепт здравый, граница между DAST и Cosmoport чёткая, native revisions достаточны для текущего продукта.

---

## 1. Иерархия идентичностей (железобетон)

Разные идентификаторы для разных смыслов. Не смешивать:

```text
entity_id   — постоянная логическая сущность (Check / Scenario / PageModel)
revision_id — конкретная неизменяемая версия определения
run_id      — конкретный запуск
instance_id — выделенный runtime-контур SecOps Lab
```

```text
Check / Scenario
      │
      ▼
  Revision         ← immutable snapshot + content_hash
      │
      ▼
Compiled plan      ← скомпилированный DAG батчей
      │
      ▼
    Run             ← run_id, revision_id, initiator, status
      │
      ▼
instance_id        ← арендованный execution-контур
```

**Правила:**

1. `instance_id` НЕ переносится вместе со сценарием и НЕ может быть его ID.
2. Старый Run всегда ссылается на свой immutable revision и compiled plan.
3. Изменение сценария после запуска НЕ переписывает прошлый результат.

---

## 2. Модель хранения: нативные ревизии

### 2.1. PrettyK Space (внутренняя модель, не файловая система)

```text
Account
  ├── Personal Workspace
  ├── Team Space
  ├── Domain Space
  └── Main / Shared Space
```

Space — граница владения, видимости, RBAC, квот и публикации между внутренними уровнями PrettyK. Это НЕ Git main, НЕ Git branch и НЕ выгрузка во внешний репозиторий.

### 2.2. Структура Check и Revision

```text
check
  id
  workspace_id
  space_id
  current_revision_id
  owner_id
  created_at

check_revision
  id
  check_id
  revision_number
  definition_json      ← самодостаточное определение проверки
  content_hash         ← sha256(definition_json)
  parent_revision_id
  created_by
  created_at
```

`definition_json` содержит связанные определения:

```json
{
  "pages": {},
  "scenarios": {},
  "modules": {},
  "fuzzers": {},
  "auth": {},
  "policies": {},
  "links": []
}
```

Для поиска и RBAC — нормализованные проекции или индексы. Пользователь не обязан мыслить файлами.

### 2.3. Жизненный цикл версии

```text
Revision 1 — создана проверка
Revision 2 — добавлена авторизация
Revision 3 — добавлен негативный сценарий
Revision 4 — изменена политика запуска
```

Каждое значимое сохранение создаёт **immutable revision**:

- список всех revisions;
- structural diff между версиями;
- restore/copy из старой версии;
- автор и время изменения;
- hash определения (`content_hash`);
- audit trail.

Запуск фиксирует точную revision:

```text
Run 42
  revision_id: rev_3
  content_hash: sha256:abc...
  compiled_plan_hash: sha256:def...
  instance_id: lab-...
```

Это даёт **воспроизводимость без веток, merge-конфликтов и искусственных commit'ов**.

---

## 3. Публикация: не Git, а промоушен между Spaces

```text
Personal Workspace
        │ publish
        ▼
Team Space
        │ approve / promote
        ▼
Domain Space
        │ release
        ▼
Main / Shared Space
```

Операции:

| Операция | Что делает |
|---|---|
| `save_draft` | сохранить личный черновик (без создания revision) |
| `publish` | опубликовать revision в целевой Space |
| `promote` | поднять revision между уровнями |
| `clone` | создать независимую копию |
| `share` | дать доступ без копирования |
| `archive` | убрать из активного каталога |

Реализация — нормальная операция базы и API, не требующая Git-ритуала.

---

## 4. Импорт и экспорт: Package JSON

### 4.1. Формат

```json
{
  "format": "prettyk-check",
  "schema_version": 1,
  "source": {
    "workspace_name": "Juice Shop smoke",
    "exported_at": "..."
  },
  "definition": {
    "pages": {},
    "scenarios": {},
    "modules": {},
    "fuzzers": {},
    "auth": {},
    "policies": {},
    "links": []
  },
  "dependencies": [],
  "attachments": []
}
```

### 4.2. Процесс импорта

```text
upload → validate → preview → resolve conflicts → confirm → atomic create
```

**Обязательные решения при импорте:**

- сохранить исходные IDs или выдать новые;
- что делать при конфликте имён;
- как переписать ссылки при clone/import;
- какие зависимости включить;
- какие секреты нужно привязать заново;
- какая миграция schema требуется.

**Что НЕ попадает в пакет:** `instance_id`, runtime tokens, фактические значения секретов.

Если агрегат станет слишком большим — можно добавить ZIP с JSON и вложениями. Это оптимизация, не исходная архитектурная обязанность.

---

## 5. Атомизация: по потребности, не по числу UI-карточек

**Логические типы** нужны (PageModel, Scenario, DataModule, Fuzzer, AuthProfile, Connector — разные роли и связи).

**Файловая атомизация — нет.** Не нужно заранее делать:

```text
scenario-step-001.pk
scenario-step-002.pk
page-locator-001.json
module-variable-001.yaml
```

Это перекладывание UI-карточек в файловую систему, а не архитектура.

**Когда атомизация оправдана:**

- объект переиспользуется в нескольких проверках;
- имеет отдельного владельца и права;
- импортируется отдельно;
- имеет самостоятельную историю;
- распространяется как reusable package.

До этого сценарий хранится одним агрегатом, внутри которого — page models, modules и steps.

---

## 6. DSL и `.pk`

Внутренний canonical storage хранит PrettyK DSL как строковые поля внутри `definition_json`. Monaco продолжает редактировать DSL и использовать существующую подсветку (`frontend/src/monaco/prettykLanguage.ts`, `pk-dark`/`pk-light` темы).

**`.pk` — не обязательное расширение для хранения.**

При появлении реальной потребности в переносимом DSL-представлении можно добавить:

- экспорт сценария в `scenario.pk`;
- импорт `.pk` в сущность;
- пакетный экспорт workspace.

**Не нужно делать отдельные расширения для каждого типа сущности.** `.pk` — один возможный формат для PrettyK DSL, если он даёт пользу. Не файловая религия.

---

## 7. Что явно решили НЕ делать

| Решение | Причина |
|---|---|
| ❌ Git в DAST | Закрытая коробка. Git — только в Cosmoport 2.0 для оркестрации приложений |
| ❌ `.pk` как обязательный internal storage | DSL хранится строковым полем в definition JSON |
| ❌ Файл на каждый шаг | Атомизация — по реальной потребности переиспользования |
| ❌ META forge сейчас | Gitea ждёт Cosmoport 2.0 |
| ❌ 10 репозиториев на workspace | PrettyK Space — внутренняя модель, не файловая фабрика |

---

## 8. Граница первой реализации (MVP storage)

```text
1. Account → Space → Workspace → Check
2. Check имеет draft и immutable revisions
3. Revision хранит самодостаточный definition JSON
4. Связи внутри definition используют logical IDs
5. Run всегда фиксирует revision и compiled plan
6. History хранит Run и instance_id отдельно
7. Import/export — один package JSON
8. Publish/promote — перемещение revision между PrettyK Spaces
9. Git отсутствует в DAST happy path
```

---

## Итоговый тезис

> **PrettyK версионирует проверки нативно: account-bound workspace, immutable revisions, PrettyK Spaces.**
>
> Git не нужен DAST вообще. Он появится только в Cosmoport 2.0 как инструмент оркестрации приложений.
>
> `.pk` — возможный export/import surface, не обязательный internal storage.
>
> `instance_id` принадлежит runtime. `revision_id` — это версия. `entity_id` — это сущность.
> Не смешивать.

---

## Связанные документы

- `docs/research/2026-08-27-cosmoport-domain-model.md` — доменная модель (уровни, приложения, пайплайны)
- `docs/research/2026-08-26-cosmoport-improved-concept.md` — QWEN Domain Factory
- `sanctuary/cosmo-strategy.md` — стратегия Cosmoport
- `sanctuary/pure/auth-roles.md` — 5-ролевая модель RBAC