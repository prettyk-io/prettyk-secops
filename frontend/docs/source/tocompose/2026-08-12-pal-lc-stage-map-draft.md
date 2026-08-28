# PAL — черновик: UI ЖЦ ↔ STAGE/WHEN (BRPO)
<!-- compose-request_47 -->


> **Не CANON.** Свести имена с settings UI и переменные из `lc-test-build-include.yml` / DAST include.  
> Полная 1:1 — после сверки с живой карточкой и актуальным include.

## UI + API `stepId` (снято 2026-08-12 с `lcSpaceDefaultConfig`)

Источник: `GET /api/projects/{uuid}?include=newest_lc_space_*` · type `lcSpaceDefaultConfig`.

| # | stepId (API) | UI шаг | WHEN_* (гипотеза) | STAGE* (гипотеза) | Примечание |
|---|---|---|---|---|---|
| 1 | `build` | Сборка | `WHEN_BUILD` | STAGE5 / build | required; onFailure=failed |
| 2 | `unit_tests` | Юнит-тестирование | `WHEN_UNIT_TESTS` | STAGE8 | |
| 3 | `docs_generation` | Генерация документации | `WHEN_DOCS_GENERATION` | STAGE6 | |
| 4 | `sonar_qube` | SonarQube | `WHEN_SONAR_QUBE` | STAGE7 | |
| 5 | `ptai` | PTAI | `WHEN_PTAI` | STAGE2? | STAGE в include плавает |
| 6 | `solar_appscreener` | Solar Appscreener | `WHEN_SOLAR_APPSCREENER` | | |
| 7 | `trivy` | Trivy | `WHEN_TRIVY` | | |
| 8 | `codescoring` | CodeScoring | `WHEN_CODESCORING` | STAGE9 | |
| 9 | `sandbox` | Sandbox | `WHEN_SANDBOX` | STAGE10 | |
| 10 | `kcs` | Kaspersky Container Security | `WHEN_KCS` | STAGE1? | на стенде **disabled** |
| 11 | `deployment` | Развёртывание ПО | custom deploy | отдельный пайп | required |
| 12 | `autotests` | Выполнение автотестов | | | не = DAST |
| 13 | `blackbox` | Blackbox | `WHEN_BLACKBOX` | dast-include | |
| 14 | `owasp_dast` | OWASP scanner | `WHEN_OWASP_DAST` | dast-include | наш якорь коробки |

`APPCODE` ← `PPOD_PROJECT_NAME` (в build-include).

## Дыра

Порядок `STAGE1…` в закомментированных строках include **не** совпадает один в один с порядком строк UI. Не утверждать таблицу как истину, пока не снимем соответствие с API/запуска.
