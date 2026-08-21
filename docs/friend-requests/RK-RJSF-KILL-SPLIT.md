# FRIEND-REQUEST: RK — RJSF-KILL & REGULATION-EDITOR-SPLIT

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка)

---

## 1. Проблема и Ценность

Исторически форма анкеты проверки рендерилась через **React JSON Schema Form (RJSF)** — тяжёлый фреймворк, который генерировал форму из JSON Schema. Это создавало жёсткую связку: манифест → JSON Schema → RJSF-форма → данные. Минусы:

- **Стеклянный потолок кастомизации** — любое нестандартное поле требовало хаков.
- **Раздутый бандл** — RJSF тянул зависимости, которые не использовались.
- **Двойная правда** — манифест и схема расходились, форма жила своей жизнью.

Цель: **выпилить RJSF полностью** и заменить прямым React-маппером, а также **разделить манифест** на `regulation.*` (pure = минимальный, cosmo = расширенный) и `editor.*` (общий).

---

## 2. Реализованный скоуп (As-Built)

| Изменение | Что было | Что стало |
|---|---|---|
| **RJSF** | `react-jsonschema-form`, `@rjsf/*`, генерация формы из JSON Schema | **Удалён полностью.** `ManifestForm` — прямой React-маппер по `kind` (text/number/select/boolean). |
| **JSON Schema** | `generate:schema` скрипт, `manifest-schema.json` | **Удалён.** Форма рендерится из typed-конфига, не из JSON Schema. |
| **REGULATION-EDITOR-SPLIT** | Единый манифест | Разделён на `regulation.*` (pure = минимальный, cosmo = расширенный) и `editor.*` (общий). Формат хранения — плоский typed JSON, не JSON Schema. |
| **Манифест SoT** | `docs/manifest.json` | **Истина.** Pydantic = контракт исполнения, не генератор формы. Канон: [`schema-sot.mdc`](../../.opencode/rules/schema-sot.mdc). |

### Flash (60%):
- Прямой React-маппер `ManifestForm` (switch по `kind`, data-driven секции).
- Выпиливание RJSF-зависимостей из `package.json` и импортов.
- `REGULATION-EDITOR-SPLIT`: разделение манифеста на чистые typed-модули.

### Bro (40%):
- Синхронизация Pydantic с новым контрактом.
- Тесты на регресс формы (валидация, рендеринг, блокировка полей).
- `tsc --noEmit` по всему vnext.

---

## 3. Верификация

- `tsc --noEmit` — 0 ошибок.
- `npm run build` — зелёный (без RJSF в бандле).
- Все существующие тесты формы — зелёные (ManifestForm, fields, path, validateManifestFields).
- `docs/manifest.json` — SoT, не менялся в процессе.

---

## 4. Стены и ограничения

- RJSF удалён полностью — обратной совместимости нет.
- `REGULATION-EDITOR-SPLIT` — формат хранения плоский typed JSON, не вложенная JSON Schema.
- Pydantic (`orchestrator/models/manifest.py`) — контракт исполнения, не генератор формы.
- `docs/manifest.json` — бетон, меняется только по приказу владельца.