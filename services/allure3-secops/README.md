# allure3-secops — Allure 3 Awesome HTTP-сервис (`prettyk-allure3`, :5050)

Контейнерный сервис отчётов SecOps Lab: генерирует и раздаёт Allure 3 отчёты
(dark + ru, канон `http://127.0.0.1:5050/`).

**С 25.09 исходники живут здесь** (AL3-FRESH-REPAIR): до этого код существовал
только внутри образа, репа содержала лишь `docs/friend-requests/…`.

## Layout (важно)

```
/app/allure-results/            # сырые результаты (bind: reports/allure-results)
    *-result.json               #   default-scope (прогон без CHECK_ID)
    <project_id>/…              #   per-check scope (CHECK_ID / проект)
/app/default-reports/           # отчёты (bind: reports/allure3-report)
    default/…                   #   default-отчёт (index.html, full.html, data/, widgets/)
    <project_id>/…              #   per-check отчёты
```

- `report_dir("default")` = `default-reports/default` — **не корень** (AL3-FRESH-REPAIR:
  old default-генерация чистила корень и рекурсивно сносила отчёты чеков).
- `clean-results?project_id=default` чистит **только файлы** корня results,
  подпапки проектов не трогает.

## API

| Endpoint | Назначение |
|---|---|
| `GET /health` | healthcheck |
| `GET /generate-report?project_id=<id>[&async=true]` | генерация отчёта scope |
| `GET /generate-status?project_id=<id>` | статус последней генерации |
| `GET /clean-results?project_id=<id>` | очистка сырых results scope |
| `GET /reports/latest/{index.html,full.html,…}` | **самый свежий** отчёт (default или последний чек) |
| `GET /projects/<id>/reports/latest/…` | канонический URL отчёта чека |
| `GET /apps`, `GET /app/<app_code>` | app-дашборд по runs_index |

## Контракт свежести (AL3-FRESH-REPAIR)

1. Run finalize (`orchestrator/utils/reporter.py` → `trigger_allure_report`)
   генерирует отчёт своего scope (per-check или default).
2. Фоновый watcher (`ALLURE_AUTO_REGEN=1`, `ALLURE_AUTO_REGEN_DEBOUNCE_SEC=8`)
   регенерирует отчёт scope'а, чьи results изменились — даже если пайплайн
   (стаб/smoke) не дёргал generate. При старте «лечит» расхождение
   results↔report по mtime.
3. `/reports/latest/...` отдаёт отчёт scope'а с самым свежим mtime СЫРЫХ
   results (последняя активность прогона), а не по mtime отчёта — иначе
   авто-регенерация старого scope делала бы его «последним» навсегда.

## Build

```powershell
docker compose -f services/docker-compose.yml build prettyk-allure3
docker compose -f services/docker-compose.yml up -d prettyk-allure3
```

Образ: `prettyk-allure3:local`. Dockerfile восстановлен из `docker history`
as-built образа (base `node:22.23.2-bookworm`, fork `packages/kdt-plugin-awesome`).

## Env

| Env | Default | Смысл |
|---|---|---|
| `ALLURE_RESULTS_DIR` | `/app/allure-results` | сырые results |
| `ALLURE_REPORT_DIR` | `/app/default-reports` | корень отчётов |
| `ALLURE_AUTO_REGEN` | `0` (compose: `1`) | watcher авто-регенерации |
| `ALLURE_AUTO_REGEN_DEBOUNCE_SEC` | `8` | окно «устоявшихся» результатов |
| `KEEP_HISTORY` | `1` | копировать history перед пересборкой отчёта |
| `ALLURE_REPORT_NAME` / `ALLURE_THEME` / `ALLURE_LANG` | — | имя/тема/язык отчёта |

## Регресс-тесты

- `orchestrator/tests/test_allure3_service.py` — unit: paths/generate/раздача/резолв свежего.
- `orchestrator/tests/test_allure3_layout_live.py` — live: default-генерация не сносит чеки, URL 200.
