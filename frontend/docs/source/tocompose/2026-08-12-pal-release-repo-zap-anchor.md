# PAL-5 — якорь: scanner/расходники в репозитории проекта (релизный контур)
<!-- compose-request_50 -->


> **Не CANON.** Факты из CI-артефактов salvage/опциона + UI quota.  
> Не путать с GitLab **job artifacts** (срок жизни) — речь про файлы **в дереве репо**.

## Что видно в пайпе

В `gitlab-ci-dast-custom-scanner.yml` / родственных include job `scanner_universal_ci`:

- `scanner_DIR` = `${CI_PROJECT_DIR}/scanner`
- перед сканом: `git fetch` / `checkout` ветки репо карточки
- если есть `${scanner_DIR}/scanner.yaml` или alt autorun — **не** генерировать сценарий, взять файл из репо
- script-auth: `${CI_PROJECT_DIR}/scanner/scripts/auth.js`
- targets: `${CI_PROJECT_DIR}/scanner/targets/…`

То есть рабочий контур DAST **ожидает** каталог `scanner/` (планы, скрипты, targets) **внутри репозитория приложения**, который живёт в ЖЦ portal (сборка/релиз/артефакты).

Это согласуется с narrative: автотесты/файлы под scanner «подкладывают в репу релиза» — не как метафора, а как способ доставить AF/script до job.

## Что видно в UI

`/projects/{uuid}/quota`: блоки **«Отчеты автотестирования»** и **«Защита от автоматического удаления артефактов сборок»** — портал мыслит отчёты автотестов и retention артефактов сборок как квоты/ресурсы карточки. Отдельного «операторского хранилища проверки» нет.

## Следствие для роли ИБ

Носитель сценария проверки = **файлы в git проекта** + merge + job.  
Пока так — ИБ либо пишет в чужой репо, либо ждёт, пока положат. Сток находок (findings intake) при этом отдельный и уже «взрослый».

## Open

- Кто именно commit’ит `scanner/` (job автотестов vs ручной MR) — вопрос владельцу (эпик §C).  
- Связь «релиз» portal vs tag/raw repo (`PPOD_RELEASE_TAG` в build.yml) — later.
