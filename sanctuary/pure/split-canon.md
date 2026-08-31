# Split CANON — BASE vs INTEGRATION

> **CANON** — hub topic. Slice: **15 августа 2026** (REGULATION-EDITOR-SPLIT зачислен как SEEKER).
> Определяет разделение кода и документации между коробкой (`prettyk-pure`) и
> интеграцией для банка (`cosmo`). Без этого — каша.
> Реестр: [`INDEX.md`](INDEX.md). Механизм разделения регламента/редактора: [`regulation-editor-split.md`](regulation-editor-split.md) (CANON SEEKER).

## 1. Две сущности

| ID | Продукт | Назначение | Где живёт | CI/Пайплайн |
|---|---|---|---|---|
| `prettyk-pure` | **CANON BASE** | Коробка для отрасли. Без кастомизации под конкретный банк. | `dev` (работа) → `main` (stable срез) | **Нет спецификации** — коробка поддерживает любой рантайм (GitHub Actions, GitLab CI, Jenkins). |
| `cosmo` | **INTEGRATION** | Пилот для банка (ЦБ). Кастомизация поверх коробки. | каталоги `cosmo/` + `sanctuary/canon/custom/cosmo/` (не ветка) | **GitLab CI** (на базе DjiGit — РФ-approved форк GitLab, далее по тексту «GitLab»). |

**Правило:** CANON-код никогда не импортирует из INTEGRATION. INTEGRATION может импортировать из CANON.

## 1.5. REGULATION-EDITOR-SPLIT — механизм внутри сплита

> `CANON SEEKER` — полный 2FA получен 15 авг 2026. Мясо дозревает: парсер, typed JSON, удаление schema/form/ — эпик RK в backlog.

Манифест (`docs/wired.json`, 2729 строк JSON Schema) разделяется на две части:

| Часть | Что содержит | CANON BASE | INTEGRATION |
|---|---|---|---|
| `regulation.*` | meta, assessment_purpose, base_url, scanner_mode, gate, act, оси допуска | **Минимальный** (project_id + assessment_purpose + base_url) | **Расширенный** (+ релизные поля, акты, оси) |
| `editor.*` | PrettyK, auth-модули, цепочки, фаззеры, data-модули | **Полный** (все модули) | **Тот же** (общий редактор) |

**Формат хранения:** плоский typed JSON (без `oneOf`/`allOf`/`$ref`). JSON Schema выпиливается как формат — заменяется на `docs/regulation.schema.json` + `docs/editor-payload.json`.

**Что это значит для матрицы ниже:**
- Регламент (форма) из §2 «INTEGRATION» — это `regulation.*` разной полноты
- Editor / Monaco / keywords / каталог из §2 «CANON BASE» — это `editor.*` общий
- Form templates из §2 «Спорные» — больше не актуально, заменяется прямым маппером

Подробности, целевой формат, что выпиливается: [`regulation-editor-split.md`](regulation-editor-split.md).

## 2. Матрица принадлежности

### CANON BASE — всегда общее

| Зона | Файлы | Примечание |
|---|---|---|
| Editor (Monaco, PrettyK, WireK) | `frontend/src/monaco/` | Авторский интерфейс |
| Keywords / каталог | `frontend/src/keywords/`, `frontend/src/generated/` | Авто-генерится из адаптеров |
| Shell (без Admin) | `frontend/src/shell/LoginPage.tsx`, `HomePage.tsx`, `HistoryPage.tsx`, `AppShell.tsx`, `auth.ts` | Навигация, логин |
| Theme | `frontend/src/theme/` | Токены, палитры, Provider |
| Стили | `frontend/src/styles.css` | Глобальные |
| Orchestrator | `orchestrator/` целиком | Бэкенд пайплайна |
| Docs CANON | `docs/canon/`, `docs/canon-requests/`, `docs/friend-requests/` | Истина |
| Docs profiles | `docs/profiles/` | Профили продуктов |
| Allure (оба) | `services/allure-light-secops/`, `services/allure3-secops/` | Отчёты |
| Lab скрипты | `orchestrator/tools/lab_*.ps1` | Стенд |

### INTEGRATION — только на cosmo

| Зона | Файлы | Почему здесь |
|---|---|---|
| Регламент (форма) | `frontend/src/form/CosmoLadderFields*` | Банковская лесенка |
| Ролевая модель | `frontend/src/form/applyRoleFormCaps.ts` | Роли банка (admin_ib, nshr, expert_ib) |
| Blank-форма | `frontend/src/results/blankPayload.ts`, `blankHtml.ts` | Init проверки по deploy |
| App code → deploy chain | `frontend/src/admin/appCode.ts`, `buildWiredFromDeploy.ts` | Специфика ЦБ |
| Deploy registry | `frontend/src/admin/deployStore.ts` | Банковские деплои |
| Admin page | `frontend/src/shell/AdminPage.tsx` | Частично общее см. ниже |
| Docs ЦБ | `sanctuary/canon/custom/cosmo/cbr-specific/` | Только локально, не в git |
| Wired demo | `docs/wired.json` | Демо под банк |

### Спорные — частично общее

| Зона | Что в CANON | Что в INTEGRATION |
|---|---|---|
| Admin shell | React Admin + MUI Core + Data Grid (общая лицензия для Pure Box Admin и Cosmoport Control Station) | EvidencePanel (Dojo-брендинг), PoliciesPanel (шаблоны ЦБ) |
| Admin integrations | Типы, fetchDojo* | liveFetchHeaders (auth токены банка) |
| Form templates | `templates.tsx` (базовые) | `CosmoLadderFields*` (банковский регламент) |

## 2.5. CI / Пайплайны (канон)

| Продукт | CI | Почему |
|---|---|---|
| `prettyk-pure` | **Без спецификации.** Коробка не привязывается к конкретному CI — поддерживает GitHub Actions, GitLab CI, Jenkins. | Коробку ведут и поддерживают все; навязывание одного вендора не нужно. |
| `cosmo` | **GitLab CI** (на базе DjiGit — РФ-approved форк GitLab; далее по тексту репозитория — «GitLab»). | Стек заказчика — GitLab-совместимый пайп. |

> **Alias-примечание:** в ТЗ и каноне стек интеграции зовётся **GitLab**. Упомянание DjiGit — ровно один раз (этот раздел) как Alias реального продукта.

## 3. Ветки и merge

```text
dev ─────────────────────────> main (FF)
 │
 ├── ihadtodothisbefore (vnext, активная)
 │
 └── merge ──> cosmo (интеграция ЦБ)
```

**Порядок:** CANON правится в `dev` → FF в `main` по вехам. Версии фиксируются тегами на `main` (`vX.Y`), не отдельными ветками. Отдельных `release-vX` / `stable` / `hotfix` веток нет.

**Интеграция Cosmo** — не ветка, а каталоги в дереве (`cosmo/`, `sanctuary/canon/custom/cosmo/`). Кастомизация правится в `dev` поверх коробки; ништяки дозревают до коробки по маршруту feature-routing (см. отдельный backlog).

## 4. Что запрещено

- `git push` в `cosmo` без проверки: не тащить CBR-пакет (`sanctuary/canon/custom/cosmo/cbr-specific/`) в git.
- Импорт из `Cosmo*` в общий код.
- CBR-пакет — только локально, не в git (rule `cbr-cosmo-only.mdc`).
- Упоминание конкретного банка в CANON BASE.
- Дублирование CANON-кода в cosmo «для удобства».