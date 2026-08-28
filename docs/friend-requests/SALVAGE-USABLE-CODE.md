# FRIEND-REQUEST: SALVAGE — Добор годноты из `to-sanitize`

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка)

---

## 1. Проблема и Ценность

После рефакторинга VNEXT в `to-sanitize/` осталось ~3–5% функционально ценного кода, который не был портирован в vnext:
- **Декларативный конфиг полей формы** (вместо 650+ строк хардкода в `WiredForm.tsx`).
- **Валидация перед Submit** (URL, порты, таймауты, обязательные поля по `assessment_purpose`).
- **Декларативный RBAC** (`RoleContext` + `RoleGuard` — вместо хардкода `readOnly`).
- **Cosmoport Ladder** (каскад App → Build → Deploy для интеграции в портал Cosmo).

Цель — не тащить код слепо, а **осознанно портировать только функционально зрелые модули** с тестами, без RJSF-хвостов.

---

## 2. Реализованный скоуп (As-Built: SALV-1…SALV-4)

| ID | Компонент | Файлы | Что сделано |
|---|---|---|---|
| **SALV-1** | Декларативный конфиг полей | `cosmo/src/wired/WiredForm.tsx`, `fields.ts` | Сокращение с ~491 до 251 строки: все JSX-условия вынесены в data-driven `SECTIONS`-маппинг с `visibleIf`, `lockedIf`, `helpIf`, `required`, `defaultValue`. Рендер через единый `switch` по `kind`. |
| **SALV-2** | Валидация перед Submit | `cosmo/src/wired/validateWiredFields.ts`, `App.tsx` | `validateWiredFields(rawFormData)` конвертирует `FieldError` → `WiredIssue` для пигвин-дровера и тостов, `fieldErrors` проброшены в `WiredForm` (подсветка `validateStatus="error"`). |
| **SALV-3** | Декларативный RBAC | `cosmo/src/roles/RoleContext.tsx`, `RoleGuard.tsx` | `RoleContext` с `RoleCaps`, `RoleGuard` HOC для условного рендеринга по политикам, `CanAccessAdmin` / `CanUseDebugMode` хелперы. |
| **SALV-4** | Cosmoport Ladder Mock | `cosmo/src/integrations/cosmoportLadderMock.ts` | Интерфейсы `CosmoApp`, `CosmoBuild`, `CosmoDeploy`, мок-данные `MOCK_COSMO_APPS`, `findCosmoApp()` / `findDeployUrl()`. Интеграционный слой для портала Cosmo (ЦБ). |

### Flash (60%):
- **SALV-1**: декларативный конфиг полей (WiredForm → data-driven).
- **SALV-2**: валидация перед Submit (validateWiredFields + App.tsx).

### Bro (40%):
- **SALV-3**: декларативный RBAC (RoleContext + RoleGuard).
- **SALV-4**: Cosmoport Ladder Mock (интеграция).

---

## 3. Верификация и Тесты

- **Всего тестов по эпику:** **37 passed** (vitest).
- `WiredForm` + `fields` + `validateWiredFields` + `path` — 19 тестов.
- `RoleContext.test.tsx` — 5 тестов (satisfied/unsatisfied policies, helpers).
- `cosmoportLadderMock.test.ts` — 4 теста (lookup, unknown app/env).
- `StudioFuzzPanel` + `studioFuzzEngine` — 9 тестов (из CD-9b, SALV-4 использует ту же интеграцию).
- `tsc --noEmit` — 0 ошибок.
- `npm run build` — зелёный.

---

## 4. Стены и ограничения

- Из `to-sanitize/` портированы **только функционально зрелые модули** (не свёрстанные макеты, не заготовки).
- RJSF / JSON Schema / `schema` / `formData` — не тащили. Всё на прямом React-маппере.
- `App.tsx` не трогали (кроме прокидывания `fieldErrors` для SALV-2).
- `docs/wired.json` не менялся.
- `cosmoportLadderMock` — заглушка для интеграции в портал Cosmo, не коробочный функционал.