# 🏛️ Cosmoport 2.0: 3-Way Grand Unified Synthesis

> **Date:** 2026-08-29
> **Sources:** Frontend reverse spec (18 HTML + JS bundle), 3 discovery cycles (codebase), cosmo-dump.sql (DDL)
> **Target:** Canonical data model + Pydantic v2 schemas + FastAPI routes for Cosmoport 2.0 (PrettyK)

---

## 1. Сквозная матрица полей (Field Reconciliation Matrix)

### 1.1. Форма создания приложения (Level 1/2)

| # | UI Field (рус) | Field ID | API Param | SQL Column | Table | Type |
|---|---------------|----------|-----------|------------|-------|------|
| 1 | Название | name | `data.attributes.name` | `projects.name` / `meta_projects.name` | varchar | string |
| 2 | Код | code | `data.attributes.code` | `projects.code` / `meta_projects.code` | varchar | string, regex `[a-zA-Z][a-zA-Z0-9\-]*`, max 45, lowercase |
| 3 | Категория (уровень) | level | `data.attributes.level` / kind routing | `projects.level` (0/1/NULL) / `meta_projects.space_kind` (0=app, 1=group) | int | enum: 0/1/2/grouping |
| 4 | Приоритет запуска | priority | `data.attributes.settings.launch_priority` | `projects.settings->>'launch_priority'` | jsonb | int 1-100 |
| 5 | Капсула (Базовый уровень) | its_group_id | `data.attributes.its_group_id` | `projects.its_group_id` (FK→its_groups.id) | uuid | FK |
| 6 | Описание | description | `data.attributes.description` | `projects.description` / `meta_projects.description` | text | string |
| 7 | Интеграция с Confluence | confluence | `data.attributes.confluence` | `projects.confluence` (bool) / confluence_url in settings | bool+string | toggle |
| 8 | Использовать конфигурации | use_configurations | `data.attributes.configuration` | `projects.configuration` (bool, irreversible) | bool | toggle |
| 9 | Использовать профили | use_profiles | `data.attributes.use_profiles` | `projects.use_profiles` (bool) | bool | toggle |
| 10 | Репозиторий GitLab | gitlab_repo | `data.relationships.integrations[gitlab]` | `project_integrations.kind=0` (gitlab) | FK | radio: new/existing |
| 11 | Тип приложения (kind) | — | `data.attributes.kind` | `projects.kind` (int → enum) | int | Линкор=universal_app, etc. |

### 1.2. Настройки приложения — Общие

| # | UI Field (рус) | API Param | SQL Column | Table |
|---|---------------|-----------|------------|-------|
| 1 | JIRA (URL) | `data.attributes.settings.jira_url` | Not a dedicated column — stored in `project_integrations.options` (kind=4, jira) | jsonb |
| 2 | Статус | `data.attributes.status` | `projects.status` | int (enum 0-70) |
| 3 | Категоризация ПИБ (ЕХД) | `data.attributes.settings.data_categorization` | `projects.settings->>'data_categorization'` | jsonb bool |
| 4 | Запускать unit-тесты | `data.attributes.settings.run_unit_tests` | `projects.settings->>'run_unit_tests'` | jsonb bool |
| 5 | Многопоточная сборка | `data.attributes.settings.multithreading_builds` | `projects.settings->>'multithreading_builds'` | jsonb bool |
| 6 | Безопасная передача секретов (Vault) | `data.attributes.settings.use_vault` | `projects.settings->>'use_vault'` | jsonb bool |
| 7 | Автоматический запуск сборки | `data.attributes.settings.auto_build` | `projects.settings->>'auto_build'` | jsonb bool |
| 8 | Передача исходного кода | `data.attributes.settings.transfer_source_code` | `projects.settings->>'transfer_source_code'` | jsonb bool |
| 9 | Передача бинарных файлов | `data.attributes.settings.transfer_binary_files` | `projects.settings->>'transfer_binary_files'` | jsonb bool |
| 10 | Таймаут развертываний (мин) | `data.attributes.settings.application_deploy_time_override` | `projects.settings->>'application_deploy_time_override'` | jsonb int |
| 11 | ABAC | `data.attributes.abac` | `projects.abac` | varchar |

### 1.3. Настройки — Мониторинг

| # | UI Field | API Param | SQL Column | Table |
|---|----------|-----------|------------|-------|
| 1 | Норматив запроса в БД (сек) | `data.attributes.settings.dbaas_execution_limit` | `projects.settings->>'dbaas_execution_limit'` (default 20.0) | jsonb float |
| 2 | Мониторинг доступности | `data.attributes.settings.availability_monitoring` | `projects.settings->>'availability_monitoring'` | jsonb bool |
| 3 | Периодичность опроса | `data.attributes.settings.app_survey_frequency` | `projects.settings->>'app_survey_frequency'` | jsonb string |

### 1.4. Настройки — Конфигурация ЖЦ (LC Steps)

| # | UI Field | API Param | SQL Column | Table |
|---|----------|-----------|------------|-------|
| 1-14 | Шаг ЖЦ (включение/обязательность/on_failure) | `data.attributes.lc_config.steps[]` | `lc_space_instance_configs` (per-project override) or `lc_space_default_configs` (global) | step_id, step_required, step_enabled, step_on_failure |

### 1.5. Форма создания конвейера (Pipeline)

| # | UI Field | API Param | SQL Column | Table | Type |
|---|----------|-----------|------------|-------|------|
| 1 | Название | `data.attributes.name` | `application_pipelines.name` | varchar | string |
| 2 | Код | `data.attributes.code` | `application_pipelines.code` | varchar | string |
| 3 | Тип конвейера | `data.attributes.kind` | `application_pipelines.kind` (0=jenkins, 1=gitlab) | int | enum |
| 4 | Версия | `data.attributes.version` | `application_pipelines.version` | varchar | string |
| 5 | URL-адрес | `data.attributes.url` | `application_pipelines.url` | varchar | string |
| 6 | Логин администратора | `data.attributes.admin_login` | `application_pipelines.admin_login` | varchar | string |
| 7 | Пароль администратора | `data.attributes.admin_password` | `application_pipelines.admin_password` | varchar | string |
| 8 | Приложения (путь) | `data.attributes.applications_folder` | `application_pipelines.applications_folder` | varchar | string |
| 9 | Сервисы (путь) | `data.attributes.services_folder` | `application_pipelines.services_folder` | varchar | string |
| 10 | Сервисный | `data.attributes.service` | `application_pipelines.service` | bool | toggle |
| 11 | Название пайплайна | `data.attributes.pipeline_url` | `application_pipelines.pipeline_url` | varchar | string |
| 12 | Ветка с пайплайном | `data.attributes.pipeline_branch` | `application_pipelines.pipeline_branch` | varchar | string |
| 13 | Креды для пайплайна | `data.attributes.pipeline_credentials` | `application_pipelines.pipeline_credentials` | varchar | string |
| 14 | Путь до пайплайна | `data.attributes.pipeline_filepath` | `application_pipelines.pipeline_filepath` | varchar | string |
| 15 | Job для удаления | `data.attributes.pipeline_cleaner_job` | `application_pipelines.pipeline_cleaner_job` | varchar | string |
| 16 | Файл CI конфигурации | `data.attributes.cicd_configuration_file` | `application_pipelines.cicd_configuration_file` | varchar | string |
| 17 | Файл CI деплоя | `data.attributes.cicd_deployment_configuration_file` | `application_pipelines.cicd_deployment_configuration_file` | varchar | string |
| 18 | Файл CI тестирования | `data.attributes.cicd_test_configuration_file` | `application_pipelines.cicd_test_configuration_file` | varchar | string |
| 19 | Доступность | `data.attributes.availability` | `application_pipelines.availability` (jsonb: groups + kind filter) | jsonb | multi-select |

### 1.6. Форма оповещения

| # | UI Field | API Param | SQL Column | Table |
|---|----------|-----------|------------|-------|
| 1 | Тип | `data.attributes.severity` | `common_notifications.severity` (critical/info) | varchar |
| 2 | Тема | `data.attributes.category` | Not directly — stored as part of title/topic | — |
| 3 | Заголовок | `data.attributes.title` | `common_notifications.title` (max 500) | varchar |
| 4 | Описание | `data.attributes.description` | `common_notifications.description` (max 4000) | text |
| 5 | Ссылка | `data.attributes.link` | Not stored in DB directly | — |
| 6 | Получатели | `data.attributes.recipient_kind` | `common_notifications.recipient_kind` | varchar |
| 7 | Команда | `data.attributes.recipient_data` | `common_notifications.recipient_data` (jsonb) | jsonb |
| 8 | Способ доставки | `data.attributes.delivery_method` | `common_notifications.delivery_method` | varchar |
| 9 | Приоритет | `data.attributes.priority` | Not stored — used by Kafka producer | — |
| 10 | Срок действия | `data.attributes.started_at` / `expired_at` | `common_notifications.started_at` / `expired_at` | timestamp |
| 11 | Показывать постоянно | `data.attributes.infinite` | `common_notifications.available` (bool) | bool |

### 1.7. Таблица: Приложения (Projet List)

| # | UI Column (рус) | API Response Field | SQL Source | Table.Column |
|---|----------------|-------------------|------------|--------------|
| 1 | Название | `attributes.name` | DIRECT | `projects.name` |
| 2 | Код | `attributes.code` | DIRECT | `projects.code` |
| 3 | Тип | `attributes.kind` | ENUM MAP | `projects.kind` → kind label |
| 4 | Группа | `relationships.group` | JOIN | `groups.name` |
| 5 | Капсула (Базовый уровень) | `relationships.its_group` | JOIN | `its_groups.short_name` + `full_name` |
| 6 | Дата создания | `attributes.createdAt` | DIRECT | `projects.created_at` |
| 7 | Релиз | `relationships.releases` | JOIN | `project_releases.tag` where newest |
| 8 | Дата релиза | `attributes.releaseDate` | JOIN | `project_releases.release_date` where newest |

### 1.8. Таблица: Сборки (Build History)

| # | UI Column | API Response | SQL Source |
|---|-----------|-------------|------------|
| 1 | Идентификатор | `id` | `project_builds.id` |
| 2 | Название | `attributes.title` | `project_builds.title` |
| 3 | Статус сборки | `attributes.status` | `project_builds.status` (int→enum) |
| 4 | Домен | `attributes.domain` | `project_builds.domain` |
| 5 | Коммит | `attributes.commit` | `project_builds.commit` (short SHA) |
| 6 | Данные | `attributes.data` | `project_builds.data` (jsonb) |

### 1.9. Таблица: Деплои (Deploy History)

| # | UI Column | API Response | SQL Source |
|---|-----------|-------------|------------|
| 1 | Сегмент | `attributes.segment` | `project_deployments.segment` (0=голый, 1=интеграционный) |
| 2 | Статус | `attributes.status` | `project_deployments.status` (int→enum) |
| 3 | Домен | `attributes.domain` | `project_deployments.domain` |
| 4 | Label | `attributes.label` | `project_deployments.label` |
| 5 | Тег сборки | (through relationships.build.tag) | JOIN `project_builds.title` |
| 6 | Среда исполнения | (through relationships.runtime.name) | JOIN `project_runtimes.name` |
| 7 | Конфигурация | `attributes.config_status` | `project_deployments.config_status` + JOIN `project_configurations.title` |
| 8 | Canary | `attributes.canary_deploy` | `project_deployments.canary_deploy` |

### 1.10. Таблица: Оповещения

| # | UI Column | API Response | SQL Source |
|---|-----------|-------------|------------|
| 1 | Тема | `attributes.title` | `common_notifications.title` |
| 2 | Заголовок | `attributes.description` | `common_notifications.description` |
| 3 | Серьезность | `attributes.severity` | `common_notifications.severity` |
| 4 | Получатели | `attributes.recipient_kind` | `common_notifications.recipient_kind` → label |
| 5 | Дата начала | `attributes.started_at` | `common_notifications.started_at` |
| 6 | Дата окончания | `attributes.expired_at` | `common_notifications.expired_at` |
| 7 | Статус | computed | active if `available=true AND now() BETWEEN started_at AND expired_at` |

---

## 2. Схлопывание 80+ таблиц в 8 канонических сущностей

```
┌─────────────────────────────────────────────────────────────────┐
│                 80+ LEGACY TABLES                               │
│  projects, meta_projects, project_builds, meta_project_builds,  │
│  project_deployments, meta_project_deployments,                 │
│  project_releases, meta_project_releases,                       │
│  project_members, meta_project_members,                         │
│  project_integrations, project_pipelines, project_runtimes,     │
│  project_resources, project_configurations,                     │
│  project_env_profiles, project_env_profile_versions,            │
│  project_limits, project_brokers, broker_topics,                │
│  project_sub_projects, project_sub_project_builds,              │
│  project_sub_project_deployments, project_sub_project_releases, │
│  meta_project_sub_projects, meta_project_group_members,         │
│  meta_project_sub_meta_project_builds,                          │
│  project_scheduled_tasks, project_sanity_tests,                 │
│  project_source_templates, project_vms, project_was_vms,        │
│  project_storages, project_release_routes,                      │
│  application_pipelines, application_runtimes,                   │
│  release_routes, release_route_package_transfers,               │
│  release_transfer_histories, release_events,                    │
│  release_types, release_receptions,                             │
│  transfer_statuses, packages, mzp_transfers, mzp_deliveries,   │
│  services, core_services, externals,                            │
│  notifications, common_notifications,                           │
│  comments, attachments, processing_errors,                      │
│  settings, feature_flags, secret_references,                    │
│  metric_values, metrics, management_events,                     │
│  user_logs, sandbox_processes, sandbox_transactions,            │
│  validities, validity_categories,                               │
│  lc_space_default_configs, lc_space_instance_configs,           │
│  groups, its_groups, users, ldap_users,                         │
│  guides, templates, orders, packages,                           │
│  brokers, message_brokers, broker_topic_orders,                 │
│  artifactory_repositories, service_healthchecks,                │
│  payload_packet, meta_packet, packet_attribute, ...             │
└──────────────────────┬──────────────────────────────────────────┘
                       │  COLLAPSE INTO
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│             8 CANONICAL COSMO 2.0 ENTITIES                      │
│                                                                 │
│  1. cosmo_domains         (ITS / КИТС, teams, RBAC scopes)      │
│  2. cosmo_applications    (Level 0/1/2 + grouping, hierarchy)   │
│  3. cosmo_pipelines       (Bricks, DAG, LC steps, catalog)      │
│  4. cosmo_runs            (Builds, Deploys, Runs)                │
│  5. cosmo_batches         (Step batches within runs)             │
│  6. cosmo_findings        (Security findings + results)          │
│  7. cosmo_evidence_ledger (Audit chain, events, attachments)     │
│  8. cosmo_audit_events    (User logs, management events)         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1. `cosmo_domains` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `its_groups` | КИТС / команда | `id, short_name, full_name, identifier` |
| `groups` | Группа проектов | `id, name` (deprecated — заменяется на its_groups) |
| `users` | Пользователи | `id, email, roles[], approved, name, surname, phone, subdivision` |
| `ldap_users` | LDAP-профили | `email, search_groups` (опциональный кеш) |
| `project_members` | Члены проектов L0/L1 | `access_level`, `project_id`, `user_id` → RBAC |
| `meta_project_members` | Члены проектов L2 | `access_level`, `meta_project_id`, `user_id` → RBAC |

### 2.2. `cosmo_applications` ← Происхождение

| Legacy Table(s) | Назначение | Что берём + тип поля |
|-----------------|------------|---------------------|
| `projects` | Приложения Level 0/1 | `id, name, code, kind(int→enum), level(0/1), status(int→enum), description, url, envs(jsonb→typed JSON), settings(jsonb→ApplicationMetadata), options(jsonb), abac, confluence(bool), configuration(bool), use_profiles(bool), languages(jsonb), option_privilege, its_group_id(FK→cosmo_domains), group_id(deprecated), created_at, updated_at` |
| `meta_projects` | Приложения Level 2 | `id, name, code, status, space_kind(0=app/1=group), settings(jsonb→ApplicationMetadata), options(jsonb), its_group_id(FK), created_at, updated_at` |
| `project_sub_projects` | parent↔sub (L1↔L0) | `parent_project_id, sub_project_id` → `children: UUID[]` in applications |
| `meta_project_sub_projects` | L2↔L0/L1 | `meta_project_id, project_id, build_order, deployment_order` → `children: UUID[]` |
| `meta_project_group_members` | L2↔L2 (grouping) | `parent_meta_project_id, child_meta_project_id` → `parent_id: UUID` (ONE parent only!) |
| `project_integrations` | Интеграции приложения | `kind(0-11), status(AASM), options(jsonb→IntegrationConfig), custom(bool)` |
| `project_resources` | Заказанные сервисы | `service_id(FK), function, vars(jsonb)` → `services: ServiceRef[]` |
| `project_pipelines` | Привязанные конвейеры | `application_pipeline_id(FK), custom_pipelines, params` → `pipeline_refs: UUID[]` |
| `project_runtimes` | Привязанные среды | `application_runtime_id(FK), by_default, params` → `runtime_refs: UUID[]` |
| `project_configurations` | Файлы конфигураций | `title, commit, directory, statuses(jsonb)` → `configurations: ConfigRef[]` |
| `project_env_profiles` | Профили окружения | `name, kind, by_default, transfer` + versions → `env_profiles: EnvProfile[]` |
| `project_limits` | Квоты | `kind, value, applied, unit, group` → `quotas: Quota[]` |
| `project_brokers` | Брокеры сообщений | `message_broker_id(FK), params` → `broker_refs: UUID[]` |
| `project_vms` / `project_was_vms` | Виртуальные машины | — (не нужно для Cosmo 2.0, Docker) |
| `project_scheduled_tasks` | Запланированные задачи | — (переносится в cosmo_runs как scheduled trigger) |
| `project_sanity_tests` | Sanity-тесты | — (переносится в cosmo_pipelines как step) |
| `project_release_routes` | Маршруты релизов | `release_route_id(FK), valid_from, valid_to` → `release_routes: RouteRef[]` |

### 2.3. `cosmo_pipelines` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `application_pipelines` | Каталог конвейеров | `id, name, code, kind(jenkins/gitlab), version, url, pipeline_url/pipeline_branch/pipeline_credentials/pipeline_filepath, cicd_configuration_file, cicd_deployment_configuration_file, cicd_test_configuration_file, availability(jsonb→typed), params(jsonb)` |
| `application_runtimes` | Каталог сред исполнения | `id, name, code, kind(openshift/deckhouse/tsr/universal), domain, endpoint, params(jsonb)` |
| `lc_space_default_configs` | LC шаги по умолчанию | `space_type, step_id, step_order, step_name, step_required, step_enabled, step_on_failure, section, release_type` |
| `lc_space_instance_configs` | LC шаги per-project | `project_id, step_id, ...` (оверрайды) |
| `project_custom_pipelines` | Кастомные конвейеры | `build(deploy) json` → `PipelineDefinition.custom` |

### 2.4. `cosmo_runs` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `project_builds` + `meta_project_builds` | Сборки | `id, status, title, description, commit, commit_id, domain, envs(jsonb), data(jsonb→GitLabPipelineRef), release_id(FK), user_id(FK), started_at, quality(int), security(int), run_quality_analysis(bool), run_security_analysis(bool), protected, auto_build, multithreading, build_destination, manifest, stages(jsonb→typed), lc_steps(jsonb→typed), lc_config_type, lc_config_version, history(jsonb), stop_requested` |
| `project_deployments` + `meta_project_deployments` | Деплои | `id, status, number, segment, domain, label, data(jsonb), runtime_id(FK), build_id(FK), canary_deploy(int), canary_deploy_params(jsonb→typed), custom_url, started_at, stages(jsonb), lc_steps(jsonb), config_status, configuration_id(FK), env_profile_id(FK)` |
| `project_deployment_tests` | Тесты деплоя | `id, branch, cluster, command, status, data(jsonb), kind, auto` → `Run.children[].tests[]` |
| `project_sub_project_builds` | Вложенные сборки | — переносится в `Run.children[]` |
| `project_sub_project_deployments` | Вложенные деплои | — переносится в `Run.children[]` |
| `meta_project_sub_project_builds` / `meta_project_sub_meta_project_builds` | L2→L1/L0 сборки | — переносится в `Run.children[]` |

### 2.5. `cosmo_batches` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `lc_steps` внутри `project_builds` / `project_deployments` | Шаги ЖЦ внутри сборки/деплоя | Типизируем: `Batch {type: BuildBatch|StaticScanBatch|DeployBatch|DynamicTestBatch, steps: StepState[]}` |
| `stages` внутри builds/deployments | GitLab CI stages | Сейчас jsonb — превращаем в типизированные `PipelineStage[]` |

### 2.6. `cosmo_findings` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| Findings intake (внешний) | Агрегатор SARIF | Импорт через внешний хук |
| `sandbox_transactions` | PT Sandbox отчёты | `id, transaction_id, kind, status, stages(jsonb), links(jsonb)` → `Finding.source=Sandbox` |
| `processing_errors` | Ошибки обработки | `message, backtrace, subject_type/id` → `Finding.severity=error` |

### 2.7. `cosmo_evidence_ledger` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `release_events` | События релизов (polymorphic) | `id, release_type, release_id, action(int→enum), runtime_name, its_complex, segment, contour, zone` → `Evidence.event` |
| `attachments` | Файлы (polymorphic: subject) | `id, subject_type, subject_id, payload_*` → `Evidence.attachment` |
| `comments` | Комментарии (polymorphic: commentable) | `id, content, user_id, commentable_type/id` → `Evidence.annotation` |
| `release_transfer_histories` | История трансфера | `id, release_route_package_transfer_id, status, comment, started_at` → `Evidence.transfer` |
| `transfer_statuses` | Статусы трансфера | `status, release_id, message` → `Evidence.transfer_status` |
| `output_artifacts` | Артефакты сборки | `data(jsonb), build_id` → `Evidence.build_artifact` |

### 2.8. `cosmo_audit_events` ← Происхождение

| Legacy Table(s) | Назначение | Что берём |
|-----------------|------------|-----------|
| `user_logs` | Логи действий пользователей | `id, item_type, item_id, event, success, user_id, request_data(jsonb), category, severity, source, src_ip` |
| `management_events` | Массовые операции | `id, kind, status, user_id` + `management_event_operations` |
| `notifications` | Персональные уведомления | `id, topic, message, read, user_id` |
| `common_notifications` | Общие уведомления | `id, title, description, severity, recipient_kind, recipient_data(jsonb), delivery_method, started_at, expired_at, available` |

### Таблицы, которые НЕ ПЕРЕНОСЯТСЯ (инфраструктурные / административные):

| Legacy Table | Причина исключения |
|-------------|-------------------|
| `services` / `core_services` | Каталог адаптеров — заменяется на Brick catalog |
| `externals` | Внешние токены — заменяется на SecretStore |
| `feature_flags` | Заменяется на Cosmo 2.0 feature flags |
| `settings` (polymorphic) | Заменяется на cosmo_settings отдельной таблицей |
| `secret_references` | Заменяется на Vault/SecretStore |
| `validities` / `validity_categories` | Административные сроки действия — P2 |
| `orders` | Заказы функций — P2 |
| `templates` / `guides` | Шаблоны / справки — P2 |
| `changelog_version` | CHANGELOG — P2 |
| `innovation_labels` | Метки «Новое» — P2 |
| `sou_requests` / `sou_templates` | Обратная связь — P2 |
| `artifactory_repositories` / `artifactory_black_lists` | Управление артефактами — P2 |
| `service_healthchecks` | Мониторинг сервисов — P2 |
| `payload_packet` / `meta_packet` / `packet_attribute` | Внешняя система пакетов (не Rails) — не мигрируем |
| `active_storage_*` | Rails internal — заменяется на MinIO/S3 |
| `ar_internal_metadata` / `schema_migrations` / `data_migrations` | Rails internal — не нужно |

---

## 3. Pydantic v2 схемы для Typed JSONB полей

### 3.1. Application (полная сущность)

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from uuid import UUID
from datetime import datetime
from enum import IntEnum, StrEnum
from typing import Optional, Any
import re


# ── Enums ────────────────────────────────────────────────────────

class ProjectKind(StrEnum):
    """BEWS/BELS: 16 типов, level mapped by LEVEL_BY_KIND"""
    # Level 1 приложения
    UNIVERSAL_APP = "universal_app"           # Линкор (Универсальное)
    INTEGRATED = "ppod"                       # Крейсер (Интегрированное)
    SERVICE_SUBSYSTEM = "service_subsystem"   # Космостанция (СПС)
    SERVICE = "service"                       # Гиперпривод (Сервисное)
    EHD = "ehd"                               # Гиперион (ЕХД)
    LEGACY = "legacy"                         # Реликт (Унаследованное — ЕИСПД)
    PIS = "pis"                               # Навигатор (ПИС)
    EPVV_PO = "epvv_po"                       # Харвестер (ПО ВП ЕПВВ)
    EPVV_SPO = "epvv_spo"                     # Харвестер (Инфраструктура ВП ЕПВВ)
    ALLOCATED = "allocated"                   # Выделенное
    # Level 0 библиотеки и шаблоны
    LIBRARY = "library"                       # Модуль (Библиотека)
    REPORT_TEMPLATES = "report_templates"     # Астрокарта (Шаблон отчета)
    CONFIG_TEMPLATES = "configuration_templates" # Орбиты (Шаблоны конфигурации)
    UNIVERSAL_LIB = "universal_lib"           # Карго (Универсальная библиотека)
    DATA_TRANSFER_LIB = "data_transfer_lib"   # Буксир (Вспомогательное пространство)
    # Level 2
    META_PROJECT = "meta_project"             # Вселенная (Группирующее пространство)

class AppLevel(StrEnum):
    ZERO = "zero"        # библиотеки / шаблоны
    FIRST = "first"      # приложения
    SECOND = "second"    # контейнеры (meta_project space_kind=0)
    GROUPING = "grouping" # Вселенная группирующая (meta_project space_kind=1)

class ProjectStatus(StrEnum):
    DRAFT = "draft"
    DEVELOPING = "developing"
    PRELIMINARY_TESTS = "preliminary_tests"
    TRIAL = "trial"
    ACCEPTANCE_TESTS = "acceptance_tests"
    INTERNAL_TESTS = "internal_tests"
    FUNCTIONAL_TESTS = "functional_tests"
    COMMISSIONING = "commissioning"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVING = "archiving"
    ARCHIVED = "archived"
    ARCHIVING_INTERRUPTED = "archiving_interrupted"
    REALLY_DESTROYING = "really_destroying"
    REALLY_DESTROYING_INTERRUPTED = "really_destroying_interrupted"

class PrivilegeMode(StrEnum):
    NONE = "none"
    UNION = "union"           # Объединение прав (merge)
    REPLACEMENT = "replacement" # Замена прав (override)

class LibraryContentType(StrEnum):
    SQL = "sql"
    SCRIPTS = "scripts"
    CONFIG = "config"

class TransferType(StrEnum):
    SOD = "sod"  # Сервис обмена данными
    MZP = "mzp"  # Модуль защищенной передачи

# ── Typed JSONB Sub-models ──────────────────────────────────────

class ApplicationMetadata(BaseModel):
    """projects.settings / meta_projects.settings → typed JSON"""
    # --- Build settings ---
    max_storage_size: Optional[int] = None
    run_unit_tests: bool = False
    multithreading_builds: bool = False
    pseudo_builds: bool = False                  # пропуск реальной сборки
    auto_build: bool = False                     # webhook-триггер
    launch_priority: Optional[int] = Field(None, ge=1, le=100)
    custom_build_pipeline: Optional[str] = None   # URL кастомного build-пайплайна
    custom_deploy_pipeline: Optional[str] = None  # URL кастомного deploy-пайплайна
    # --- Security settings ---
    use_vault: bool = False                      # HashiCorp Vault
    data_categorization: bool = False            # Категоризация ПИБ (ЕХД)
    availability_monitoring: bool = False        # Мониторинг доступности
    app_survey_frequency: Optional[str] = None   # Периодичность опроса
    run_quality_analysis: bool = True            # SonarQube
    run_security_analysis: bool = True           # PTAI + SAST
    # --- Transfer settings ---
    transfer_type: TransferType = TransferType.SOD
    transfer_source_code: bool = False
    transfer_binary_files: bool = False
    # --- Infrastructure ---
    dbaas_execution_limit: float = 20.0          # сек, норматив запроса в БД
    application_deploy_time_override: Optional[int] = None  # минут
    can_order_vm: bool = False
    is_nexus_deploy_available: bool = False
    is_sfera_deploy_available: bool = False
    # --- Library ---
    public_library: bool = False
    library_content_type: Optional[LibraryContentType] = None
    # --- Inheritance ---
    inherited_project_id: Optional[UUID] = None
    # --- Misc ---
    ud_sign: bool = False                        # CodeSign (SOD)

class RepositoryBinding(BaseModel):
    forge_id: str                                # "gitea-digital-ruble"
    repo_path: str                               # "digital-ruble/payment-hub"
    default_branch: str = "main"
    webhook_id: Optional[str] = None

class IntegrationConfig(BaseModel):
    """project_integrations.options → typed"""
    web_url: Optional[str] = None
    ssh_url: Optional[str] = None
    project_id: Optional[int] = None             # GitLab project ID
    project_path: Optional[str] = None
    job_name: Optional[str] = None               # Jenkins job name
    custom: bool = False
    gitlab_project_path: Optional[str] = None

class EnvVariable(BaseModel):
    key: str = Field(pattern=r'^[A-Z][A-Z0-9_]*$')  # uppercase + numbers + underscore
    value: str
    secret: bool = False                         # хранить в Vault?

class EnvProfile(BaseModel):
    id: Optional[UUID] = None
    name: str
    description: str = ""
    kind: int = 0                                # 0=custom, 1=common
    by_default: bool = False
    transfer: bool = False                       # переносить между зонами
    version: int = 1
    data: dict[str, str] = Field(default_factory=dict)  # env vars
    vault_version: Optional[int] = None
    files: dict[str, Any] = Field(default_factory=dict)
    files_metadata: dict[str, Any] = Field(default_factory=dict)

class Quota(BaseModel):
    kind: str                                     # cpu, memory, storage, database, amount, volume, packages_storage, artifacts_storage, repository_storage
    value: int
    applied: bool = True
    unit: str = ""
    group: str = ""                               # cluster, vm, gluster, build_artifacts, broker, autotests, env_profiles, gitlab
    runtime_id: Optional[UUID] = None
    broker_id: Optional[UUID] = None

class ServiceRef(BaseModel):
    service_id: UUID
    function: str
    name: Optional[str] = None
    prefix: Optional[str] = None
    vars: dict[str, Any] = Field(default_factory=dict)

class RouteRef(BaseModel):
    release_route_id: UUID
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None

# ── Main Application Model ──────────────────────────────────────

class ApplicationCreate(BaseModel):
    name: str = Field(..., max_length=255, description="Название")
    code: str = Field(..., max_length=45, description="Код", pattern=r'^[a-zA-Z][a-zA-Z0-9\-]*$')
    kind: ProjectKind
    level: AppLevel
    description: Optional[str] = None
    its_group_id: Optional[UUID] = Field(None, description="Капсула (Базовый уровень)")
    metadata: ApplicationMetadata = Field(default_factory=ApplicationMetadata)
    repository: Optional[RepositoryBinding] = None
    confluence_url: Optional[str] = None

    @field_validator("code")
    @classmethod
    def code_lowercase(cls, v: str) -> str:
        return v.lower()

class ApplicationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    metadata: Optional[ApplicationMetadata] = None
    status: Optional[ProjectStatus] = None
    abac_domain: Optional[str] = None
    confluence_url: Optional[str] = None
    privilege_mode: Optional[PrivilegeMode] = None
    inherited_project_id: Optional[UUID] = None

class ApplicationResponse(BaseModel):
    id: UUID
    name: str
    code: str
    kind: ProjectKind
    level: AppLevel
    status: ProjectStatus
    description: Optional[str] = None
    its_group_id: Optional[UUID] = None
    its_group_name: Optional[str] = None
    metadata: ApplicationMetadata
    repository: Optional[RepositoryBinding] = None
    # --- Hierarchy ---
    parent_id: Optional[UUID] = None             # grouping parent (Level 2 → grouping)
    children: list[UUID] = Field(default_factory=list)  # child app IDs
    # --- Relations ---
    integrations: list[IntegrationConfig] = Field(default_factory=list)
    services: list[ServiceRef] = Field(default_factory=list)
    pipeline_refs: list[UUID] = Field(default_factory=list)
    runtime_refs: list[UUID] = Field(default_factory=list)
    env_profiles: list[EnvProfile] = Field(default_factory=list)
    quotas: list[Quota] = Field(default_factory=list)
    release_routes: list[RouteRef] = Field(default_factory=list)
    # --- Timestamps ---
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

### 3.2. Pipeline (кирпичи + DAG)

```python
class PipelineKind(StrEnum):
    JENKINS = "jenkins"
    GITLAB = "gitlab"

class LcStepSection(StrEnum):
    BUILD = "section_build"
    DEPLOY = "section_deploy"
    DAST_AUTOTEST = "section_dast_autotest"

class LcStepId(StrEnum):
    BUILD = "build"
    UNIT_TESTS = "unit_tests"
    DOCS_GENERATION = "docs_generation"
    SONAR_QUBE = "sonar_qube"
    PTAI = "ptai"
    SOLAR_APPSCREENER = "solar_appscreener"
    TRIVY = "trivy"
    CODESCORING = "codescoring"
    SANDBOX = "sandbox"
    KCS = "kcs"
    DEPLOY = "deploy"
    AUTOTESTS = "autotests"
    BLACKBOX = "blackbox"
    OWASP_ZAP = "owasp_zap"

class LcOnFailure(StrEnum):
    CONTINUE = "continue"
    ABORT = "abort"

_LC_STEP_RU: dict[LcStepId, str] = {
    LcStepId.BUILD: "Сборка",
    LcStepId.UNIT_TESTS: "Юнит-тестирование",
    LcStepId.DOCS_GENERATION: "Генерация документации",
    LcStepId.SONAR_QUBE: "SonarQube",
    LcStepId.PTAI: "PTAI",
    LcStepId.SOLAR_APPSCREENER: "Solar Appscreener",
    LcStepId.TRIVY: "Trivy",
    LcStepId.CODESCORING: "CodeScoring",
    LcStepId.SANDBOX: "Sandbox",
    LcStepId.KCS: "Kaspersky Container Security",
    LcStepId.DEPLOY: "Развёртывание ПО",
    LcStepId.AUTOTESTS: "Выполнение автотестов",
    LcStepId.BLACKBOX: "Blackbox",
    LcStepId.OWASP_ZAP: "OWASP ZAP",
}

class StepDefinition(BaseModel):
    step_id: LcStepId
    step_name_ru: str
    section: LcStepSection
    order: int
    required: bool = False
    enabled: bool = True
    on_failure: LcOnFailure = LcOnFailure.CONTINUE
    locked_position: bool = False  # KCS — нельзя перемещать (BEWS/BELS)
    editor: Optional[str] = None   # sonarqube-scanner, trivy-scanner, etc.

    @model_validator(mode="after")
    def validate_linked_steps(self) -> "StepDefinition":
        """Сборка + Юнит-тестирование — linked (LCBE v2.11)"""
        # linked logic handled at PipelinePlan compile time
        return self

class PipelineAvailability(BaseModel):
    groups: list[str] = Field(default_factory=list)
    kind: Optional[str] = None

class PipelineDefinition(BaseModel):
    """application_pipelines → Brick definition"""
    id: Optional[UUID] = None
    name: str
    code: str
    kind: PipelineKind = PipelineKind.GITLAB
    version: Optional[str] = None
    # --- Connection ---
    url: str
    admin_login: Optional[str] = None
    admin_password: Optional[str] = None
    endpoint: Optional[str] = None
    # --- Paths ---
    applications_folder: Optional[str] = None
    services_folder: Optional[str] = None
    pipeline_url: Optional[str] = None
    pipeline_branch: Optional[str] = None
    pipeline_credentials: Optional[str] = None
    pipeline_filepath: Optional[str] = None
    pipeline_cleaner_job: Optional[str] = None
    # --- CI config files ---
    cicd_configuration_file: Optional[str] = None
    cicd_deployment_configuration_file: Optional[str] = None
    cicd_test_configuration_file: Optional[str] = None
    # --- Steps (LC) ---
    steps: list[StepDefinition] = Field(default_factory=list)
    # --- Availability filter ---
    availability: PipelineAvailability = Field(default_factory=PipelineAvailability)
    # --- Custom override ---
    custom: bool = False
    inheritable_types: list[str] = Field(default_factory=list)  # BEWS/BELS: only БД+ЦУП inherit

    model_config = {"from_attributes": True}

# Default LC steps for Cosmoport 2.0
DEFAULT_BUILD_STEPS = [
    StepDefinition(step_id=LcStepId.BUILD, step_name_ru="Сборка", section=LcStepSection.BUILD, order=1, required=True),
    StepDefinition(step_id=LcStepId.UNIT_TESTS, step_name_ru="Юнит-тестирование", section=LcStepSection.BUILD, order=2),
    StepDefinition(step_id=LcStepId.DOCS_GENERATION, step_name_ru="Генерация документации", section=LcStepSection.BUILD, order=3),
    StepDefinition(step_id=LcStepId.SONAR_QUBE, step_name_ru="SonarQube", section=LcStepSection.BUILD, order=4),
    StepDefinition(step_id=LcStepId.PTAI, step_name_ru="PTAI", section=LcStepSection.BUILD, order=5),
    StepDefinition(step_id=LcStepId.SOLAR_APPSCREENER, step_name_ru="Solar Appscreener", section=LcStepSection.BUILD, order=6),
    StepDefinition(step_id=LcStepId.TRIVY, step_name_ru="Trivy", section=LcStepSection.BUILD, order=7),
    StepDefinition(step_id=LcStepId.CODESCORING, step_name_ru="CodeScoring", section=LcStepSection.BUILD, order=8),
    StepDefinition(step_id=LcStepId.SANDBOX, step_name_ru="Sandbox", section=LcStepSection.BUILD, order=9),
    StepDefinition(step_id=LcStepId.KCS, step_name_ru="Kaspersky Container Security", section=LcStepSection.BUILD, order=10, locked_position=True),
]

DEFAULT_DEPLOY_STEPS = [
    StepDefinition(step_id=LcStepId.DEPLOY, step_name_ru="Развёртывание ПО", section=LcStepSection.DEPLOY, order=1, required=True, on_failure=LcOnFailure.ABORT),
]

DEFAULT_DAST_STEPS = [
    StepDefinition(step_id=LcStepId.AUTOTESTS, step_name_ru="Выполнение автотестов", section=LcStepSection.DAST_AUTOTEST, order=1),
    StepDefinition(step_id=LcStepId.BLACKBOX, step_name_ru="Blackbox", section=LcStepSection.DAST_AUTOTEST, order=2),
    StepDefinition(step_id=LcStepId.OWASP_ZAP, step_name_ru="OWASP ZAP", section=LcStepSection.DAST_AUTOTEST, order=3),
]

DEFAULT_STEPS = DEFAULT_BUILD_STEPS + DEFAULT_DEPLOY_STEPS + DEFAULT_DAST_STEPS
```

### 3.3. RunContext (сборки / деплои)

```python
class RunType(StrEnum):
    BUILD = "build"          # Сборка
    DEPLOY = "deploy"        # Развертывание
    RELEASE_BUILD = "release_build"  # Сборка релиза
    RELEASE_DEPLOY = "release_deploy"
    AUTO_BUILD = "auto_build"

class RunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    ABORTED = "aborted"

class BuildDestination(StrEnum):
    ARTIFACTORY = "artifactory"
    NEXUS = "nexus"
    ARTIFACTORY_NEXUS = "artifactory_nexus"
    SFERA = "sfera"
    NOWHERE = "nowhere"

class StepState(BaseModel):
    step_id: str
    step_name_ru: str
    enabled: bool = True
    status: str = "pending"          # pending|running|success|failed|skipped|error|deleting
    url: Optional[str] = None
    message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

class StageState(BaseModel):
    name: str
    status: str = "pending"
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

class CanaryParams(BaseModel):
    canary_deploy_type: Optional[str] = None
    canary_weight: Optional[int] = None
    main_deployment_id: Optional[UUID] = None

class RunCreate(BaseModel):
    application_id: UUID
    run_type: RunType
    title: Optional[str] = None
    description: Optional[str] = None
    commit: Optional[str] = None          # Git ref
    commit_id: Optional[str] = None       # Full SHA
    domain: Optional[str] = Field(None, max_length=8)
    envs: dict[str, str] = Field(default_factory=dict)
    manifest: Optional[str] = None
    blueprint_id: Optional[str] = None    # URL конфига сборки
    release_id: Optional[UUID] = None     # если release build
    parent_run_id: Optional[UUID] = None  # для sub-project сборок
    # --- Flags ---
    run_unit_tests: bool = True
    run_quality_analysis: bool = True
    run_security_analysis: bool = True
    multithreading: bool = False
    protected: bool = False
    auto_build: bool = False
    # --- Configuration ---
    build_destination: BuildDestination = BuildDestination.NEXUS
    pipeline_id: Optional[UUID] = None
    runtime_id: Optional[UUID] = None
    env_profile_id: Optional[UUID] = None
    meta_project_env_profile_id: Optional[UUID] = None
    parent_project_env_profile_id: Optional[UUID] = None
    # --- Deployment-specific ---
    segment: Optional[int] = None         # 0=голый, 1=интеграционный
    label: Optional[str] = None
    custom_url: Optional[str] = None
    canary: Optional[CanaryParams] = None
    application_deploy_time_override: Optional[int] = None
    config_id: Optional[UUID] = None      # configuration_id
    rollback_revision: Optional[str] = None
    can_undo: bool = False
    sanity_testing: bool = False
    # --- Meta-project (Level 2) ---
    is_meta_project: bool = False
    meta_project_id: Optional[UUID] = None

class RunResponse(BaseModel):
    id: UUID
    application_id: UUID
    run_type: RunType
    status: RunStatus
    title: Optional[str] = None
    description: Optional[str] = None
    commit: Optional[str] = None
    commit_id: Optional[str] = None
    domain: Optional[str] = None
    envs: dict[str, str] = Field(default_factory=dict)
    # --- Steps & Stages (typed, not jsonb blobs) ---
    steps: list[StepState] = Field(default_factory=list)
    stages: list[StageState] = Field(default_factory=list)
    # --- Children (sub-project builds/deploys) ---
    children: list["RunResponse"] = Field(default_factory=list)
    # --- Relations ---
    release_id: Optional[UUID] = None
    pipeline_id: Optional[UUID] = None
    runtime_id: Optional[UUID] = None
    gitlab_pipeline_url: Optional[str] = None   # computed from data.jsonb→typed
    # --- Build result ---
    quality_score: Optional[int] = None
    security_score: Optional[int] = None
    build_destination: Optional[BuildDestination] = None
    # --- Deployment result ---
    segment: Optional[int] = None
    label: Optional[str] = None
    custom_url: Optional[str] = None
    canary: Optional[CanaryParams] = None
    config_status: Optional[str] = None
    # --- Meta ---
    protected: bool = False
    auto_build: bool = False
    manifest: Optional[str] = None
    history: dict[str, Any] = Field(default_factory=dict)
    # --- Timestamps ---
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

### 3.4. Security Settings (gate thresholds)

```python
class SeverityThreshold(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"

class GatePolicy(BaseModel):
    """Security Gate policy (COS-B14)"""
    severity_threshold: SeverityThreshold = SeverityThreshold.HIGH
    cvss_threshold: float = 7.0                    # CVSS 3.1 (ТЗ: < 7.0)
    max_allowed: dict[SeverityThreshold, int] = Field(default_factory=dict)
    auto_block_critical: bool = True
    auto_block_high: bool = False
    auto_block_medium: bool = False
    require_manual_approval: bool = True            # Admission gate manual

class SecuritySettings(BaseModel):
    """Per-application security configuration"""
    gate_policy: GatePolicy = Field(default_factory=GatePolicy)
    required_bricks: list[str] = Field(default_factory=list)  # обязательные bricks (ADR v2.2)
    cvss_version: str = "3.1"
    evidence_retention_days: int = 1095               # 3 года (ТЗ), 1825 для платёжных
    normative_base: list[str] = Field(default_factory=lambda: [
        "ГОСТ Р 56939-2016",
        "ГОСТ Р 58412-2019",
        "ГОСТ Р 71207-2024",
        "ГОСТ Р 2.105-2019",
        "Положение Банка России № 834-П",
        "Положение Банка России № 701-П",
        "Положение Банка России № 644-П",
    ])
```

---

## 4. Спецификация API Cosmo 2.0 (FastAPI routes)

### 4.1. Сводка замены 140 легаси-эндпоинтов

| Legacy Group (40+) | ~140 endpoints | Cosmo 2.0 (8 routes + sub-resources) |
|-------------------|----------------|--------------------------------------|
| `/api/projects/*` (25+) | GET/POST/PATCH/DELETE + custom actions | `GET/POST /applications`, `GET/PUT/PATCH /applications/{id}` |
| `/api/meta_projects/*` (20+) | CRUD + sub-resources | merged into `/applications` (level=second/grouping) |
| `/api/projects/{pid}/builds/*` + `/api/meta_project_builds/*` (20+) | Build CRUD + rerun/stop/deploy/log | `GET/POST /runs` + `POST /runs/{id}/start` + `POST /runs/{id}/stop` |
| `/api/projects/{pid}/releases/*` + `/api/meta_project_releases/*` (20+) | Release CRUD + transfer/package/run/build | `GET/POST /applications/{id}/releases` + `POST /releases/{id}/transfer` |
| `/api/application_pipelines/*` + `/api/application_runtimes/*` (10+) | Catalog CRUD | `GET/POST /pipelines`, `GET/PUT /pipelines/{id}` |
| `/api/services/*` + `/api/core_services/*` + `/api/integrations/*` (15+) | Service catalog + integrations | `GET /adapters`, `PUT /applications/{id}/adapters/{adapter_id}` |
| `/api/notifications/*` + `/api/common_notifications/*` (8+) | Notifications CRUD | `GET/POST /notifications` |
| `/api/users/*` + `/api/members/*` (8+) | Users + RBAC | `GET/PUT /domains/{id}/members` |
| `/api/sandbox/*` + `/api/metrics/*` + `/api/validities/*` + ... (15+) | Utility endpoints | merged or deferred to P2 |

### 4.2. Полные FastAPI route definitions

```python
# ── cosmo_router.py ─────────────────────────────────────────────

from fastapi import APIRouter, Depends, Query, Path, Body, status
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/api/v2", tags=["cosmo"])

# ═══════════════════════════════════════════════════════════════
# 1. APPLICATIONS (projects + meta_projects unified)
# ═══════════════════════════════════════════════════════════════

@router.get("/applications", response_model=list[ApplicationResponse])
async def list_applications(
    q: str | None = Query(None, description="Поиск по названию/коду"),
    kind: ProjectKind | None = Query(None),
    level: AppLevel | None = Query(None, description="Фильтр по уровню"),
    domain_id: UUID | None = Query(None, description="Фильтр по КИТС/домену"),
    status: ProjectStatus | None = Query(None),
    archived: bool = Query(False),
    page: int = Query(1, ge=1),
    per: int = Query(25, ge=1, le=100),
):
    """GET /api/v2/applications — реестр приложений (заменяет /api/projects + /api/meta_projects)"""
    ...

@router.post("/applications", response_model=ApplicationResponse, status_code=201)
async def create_application(body: ApplicationCreate):
    """POST /api/v2/applications — создание приложения (Level 0/1/2/grouping)"""
    ...

@router.get("/applications/{app_id}", response_model=ApplicationResponse)
async def get_application(app_id: UUID):
    """GET /api/v2/applications/{id} — карточка приложения (6 вкладок)"""
    ...

@router.put("/applications/{app_id}", response_model=ApplicationResponse)
async def update_application(app_id: UUID, body: ApplicationUpdate):
    """PUT /api/v2/applications/{id} — обновление карточки (Общие + Мониторинг+ABAC)"""
    ...

@router.patch("/applications/{app_id}/status", response_model=ApplicationResponse)
async def change_status(app_id: UUID, status: ProjectStatus = Body(..., embed=True)):
    """PATCH /api/v2/applications/{id}/status — смена статуса"""
    ...

@router.delete("/applications/{app_id}", status_code=204)
async def archive_application(app_id: UUID):
    """DELETE /api/v2/applications/{id} — архивация (soft delete)"""
    ...

# ── Hierarchy ──────────────────────────────────────────────────

@router.get("/applications/{app_id}/children", response_model=list[ApplicationResponse])
async def list_children(app_id: UUID):
    """GET /api/v2/applications/{id}/children — вложенные пространства (L2→L1→L0)"""
    ...

@router.post("/applications/{app_id}/children", response_model=ApplicationResponse)
async def add_child(app_id: UUID, child_id: UUID = Body(..., embed=True),
                    build_order: int = Body(1), deployment_order: int = Body(1)):
    """POST /api/v2/applications/{id}/children — добавить дочернее (формирование вложенности)"""
    ...

@router.delete("/applications/{app_id}/children/{child_id}", status_code=204)
async def remove_child(app_id: UUID, child_id: UUID):
    """DELETE — убрать из группы"""
    ...

# ── LC Steps ───────────────────────────────────────────────────

@router.get("/applications/{app_id}/lifecycle", response_model=list[StepDefinition])
async def get_lifecycle(app_id: UUID):
    """GET /api/v2/applications/{id}/lifecycle — конфигурация ЖЦ (3 секции)"""
    ...

@router.put("/applications/{app_id}/lifecycle", response_model=list[StepDefinition])
async def update_lifecycle(app_id: UUID, steps: list[StepDefinition]):
    """PUT — сохранить конфигурацию ЖЦ"""
    ...

# ── Team (Members) ──────────────────────────────────────────────

@router.get("/applications/{app_id}/team", response_model=list[TeamMember])
async def list_team(app_id: UUID):
    """GET /api/v2/applications/{id}/team — команда проекта"""
    ...

@router.post("/applications/{app_id}/team", response_model=TeamMember)
async def add_member(app_id: UUID, user_id: UUID = Body(...), role: MemberRole = Body(...)):
    """POST — добавить участника"""
    ...

@router.delete("/applications/{app_id}/team/{user_id}", status_code=204)
async def remove_member(app_id: UUID, user_id: UUID):
    """DELETE — удалить участника"""
    ...

# ═══════════════════════════════════════════════════════════════
# 2. PIPELINES (Bricks catalog + LC steps)
# ═══════════════════════════════════════════════════════════════

@router.get("/pipelines", response_model=list[PipelineDefinition])
async def list_pipelines(q: str | None = Query(None), kind: PipelineKind | None = Query(None)):
    """GET /api/v2/pipelines — каталог конвейеров (заменяет /api/application_pipelines)"""
    ...

@router.post("/pipelines", response_model=PipelineDefinition, status_code=201)
async def create_pipeline(body: PipelineDefinition):
    """POST /api/v2/pipelines — создание конвейера (19 полей)"""
    ...

@router.get("/pipelines/{pipeline_id}", response_model=PipelineDefinition)
async def get_pipeline(pipeline_id: UUID):
    """GET — детали конвейера"""
    ...

@router.put("/pipelines/{pipeline_id}", response_model=PipelineDefinition)
async def update_pipeline(pipeline_id: UUID, body: PipelineDefinition):
    """PUT — обновление"""
    ...

@router.delete("/pipelines/{pipeline_id}", status_code=204)
async def delete_pipeline(pipeline_id: UUID):
    """DELETE — удаление"""
    ...

# ── Runtime Environments ──────────────────────────────────────

@router.get("/runtimes", response_model=list[RuntimeDefinition])
async def list_runtimes(q: str | None = Query(None), kind: RuntimeKind | None = Query(None)):
    """GET /api/v2/runtimes — каталог сред исполнения (заменяет /api/application_runtimes)"""
    ...

@router.post("/runtimes", response_model=RuntimeDefinition, status_code=201)
async def create_runtime(body: RuntimeDefinition):
    """POST — создание среды (10+ полей)"""
    ...

# ═══════════════════════════════════════════════════════════════
# 3. RUNS (builds + deployments unified)
# ═══════════════════════════════════════════════════════════════

@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    application_id: UUID | None = Query(None),
    run_type: RunType | None = Query(None),
    status: RunStatus | None = Query(None),
    active_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per: int = Query(25, ge=1, le=100),
):
    """GET /api/v2/runs — история сборок/деплоев (заменяет /api/builds + /api/deployments)"""
    ...

@router.post("/runs", response_model=RunResponse, status_code=202)
async def create_run(body: RunCreate):
    """POST /api/v2/runs — создание сборки или деплоя"""
    ...

@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: UUID):
    """GET /api/v2/runs/{id} — детали сборки/деплоя + log stream URL"""
    ...

@router.post("/runs/{run_id}/start", response_model=RunResponse)
async def start_run(run_id: UUID):
    """POST /api/v2/runs/{id}/start — запустить сборку/деплой"""
    ...

@router.post("/runs/{run_id}/stop", response_model=RunResponse)
async def stop_run(run_id: UUID):
    """POST /api/v2/runs/{id}/stop — остановить"""
    ...

@router.post("/runs/{run_id}/rerun", response_model=RunResponse, status_code=202)
async def rerun_run(run_id: UUID, envs: dict[str, str] | None = Body(None)):
    """POST /api/v2/runs/{id}/rerun — перезапустить с теми же параметрами"""
    ...

@router.delete("/runs/{run_id}", status_code=204)
async def delete_run(run_id: UUID):
    """DELETE — удалить сборку/деплой"""
    ...

@router.post("/runs/{run_id}/protect", response_model=RunResponse)
async def protect_run(run_id: UUID):
    """POST /api/v2/runs/{id}/protect — защитить от удаления"""
    ...

# ── Log streaming (SSE/WebSocket) ──────────────────────────────

@router.get("/runs/{run_id}/log")
async def stream_run_log(run_id: UUID, start: int = Query(0), mode: str = Query("text")):
    """GET /api/v2/runs/{id}/log — стрим логов сборки/деплоя (SSE)"""
    ...

# ── Deployment-specific ────────────────────────────────────────

@router.post("/runs/{run_id}/deploy", response_model=RunResponse)
async def deploy_from_build(run_id: UUID, body: RunCreate):
    """POST /api/v2/runs/{id}/deploy — создать деплой из сборки"""
    ...

@router.get("/runs/{run_id}/report")
async def get_run_report(run_id: UUID):
    """GET /api/v2/runs/{id}/report — Excel отчёт деплоя"""
    ...

@router.post("/runs/{run_id}/permanent-link", response_model=RunResponse)
async def set_permanent_link(run_id: UUID, event: str = Body(...)):
    """POST — установить постоянную ссылку"""
    ...

@router.get("/runs/{run_id}/canary", response_model=list[RunResponse])
async def get_canary_deployments(run_id: UUID):
    """GET — canary деплои"""
    ...

@router.put("/runs/{run_id}/traffic-weights", response_model=RunResponse)
async def update_traffic_weights(run_id: UUID, weights: dict[str, int] = Body(...)):
    """PUT — обновить веса canary трафика"""
    ...

# ── Tests ──────────────────────────────────────────────────────

@router.get("/runs/{run_id}/tests")
async def list_run_tests(run_id: UUID):
    """GET /api/v2/runs/{id}/tests — тесты деплоя"""
    ...

@router.post("/runs/{run_id}/tests/start", response_model=RunResponse)
async def start_test(run_id: UUID, autotest_data: dict = Body(...), dast_data: dict = Body(...)):
    """POST — запустить тесты деплоя (автотест + DAST)"""
    ...

@router.get("/runs/{run_id}/tests/{test_id}/log")
async def get_test_log(run_id: UUID, test_id: UUID):
    """GET — логи теста"""
    ...

@router.post("/runs/{run_id}/tests/{test_id}/stop")
async def stop_test(run_id: UUID, test_id: UUID):
    """POST — остановить тест"""
    ...

# ═══════════════════════════════════════════════════════════════
# 4. RELEASES
# ═══════════════════════════════════════════════════════════════

@router.get("/applications/{app_id}/releases", response_model=list[ReleaseResponse])
async def list_releases(app_id: UUID, status: ReleaseStatus | None = Query(None)):
    """GET /api/v2/applications/{id}/releases — релизы приложения"""
    ...

@router.post("/applications/{app_id}/releases", response_model=ReleaseResponse, status_code=201)
async def create_release(app_id: UUID, body: ReleaseCreate):
    """POST — создать релиз"""
    ...

@router.get("/releases/{release_id}", response_model=ReleaseResponse)
async def get_release(release_id: UUID):
    """GET /api/v2/releases/{id} — детали релиза + события + трансферы"""
    ...

@router.put("/releases/{release_id}", response_model=ReleaseResponse)
async def update_release(release_id: UUID, body: ReleaseUpdate):
    """PUT — обновить релиз"""
    ...

@router.put("/releases/{release_id}/status", response_model=ReleaseResponse)
async def update_release_status(release_id: UUID, status: ReleaseStatus = Body(..., embed=True)):
    """PUT /api/v2/releases/{id}/status — смена статуса релиза"""
    ...

@router.post("/releases/{release_id}/build", response_model=RunResponse, status_code=202)
async def build_release(release_id: UUID, body: RunCreate):
    """POST /api/v2/releases/{id}/build — создать сборку из релиза"""
    ...

@router.post("/releases/{release_id}/transfer", response_model=TransferResponse)
async def transfer_release(release_id: UUID, target_zone: str = Body(...), route_id: UUID | None = Body(None)):
    """POST /api/v2/releases/{id}/transfer — перенос между зонами (заменяет package + mzp_transfer)"""
    ...

@router.get("/releases/{release_id}/events", response_model=list[ReleaseEvent])
async def get_release_events(release_id: UUID):
    """GET /api/v2/releases/{id}/events — история событий релиза"""
    ...

# ═══════════════════════════════════════════════════════════════
# 5. DOMAINS (ITS / teams / RBAC)
# ═══════════════════════════════════════════════════════════════

@router.get("/domains", response_model=list[DomainResponse])
async def list_domains():
    """GET /api/v2/domains — список КИТС/доменов (заменяет /api/its_groups)"""
    ...

@router.get("/domains/{domain_id}/members", response_model=list[DomainMember])
async def list_domain_members(domain_id: UUID):
    """GET /api/v2/domains/{id}/members — участники домена с ролями"""
    ...

@router.post("/domains/{domain_id}/members", response_model=DomainMember)
async def add_domain_member(domain_id: UUID, user_id: UUID, role: str):
    """POST — назначить роль в домене"""
    ...

# ═══════════════════════════════════════════════════════════════
# 6. NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════

@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    severity: str | None = Query(None),
    user_id: UUID | None = Query(None),
    unread_only: bool = Query(False),
):
    """GET /api/v2/notifications — список оповещений"""
    ...

@router.post("/notifications", response_model=NotificationResponse, status_code=201)
async def create_notification(body: NotificationCreate):
    """POST /api/v2/notifications — создать оповещение (Команда / Критическое)"""
    ...

@router.put("/notifications/{id}", response_model=NotificationResponse)
async def update_notification(id: UUID, body: NotificationUpdate):
    """PUT — обновить"""
    ...

@router.delete("/notifications/{id}", status_code=204)
async def delete_notification(id: UUID):
    """DELETE — удалить"""
    ...

@router.patch("/notifications/read", status_code=204)
async def mark_notifications_read(ids: list[UUID] = Body(...)):
    """PATCH — отметить прочитанными (batch)"""
    ...

# ═══════════════════════════════════════════════════════════════
# 7. EVIDENCE & ATTACHMENTS
# ═══════════════════════════════════════════════════════════════

@router.get("/evidence/{entity_type}/{entity_id}")
async def list_evidence(entity_type: str, entity_id: UUID):
    """GET /api/v2/evidence/{type}/{id} — цепочка доказательств (events + attachments + comments)"""
    ...

@router.post("/evidence/{entity_type}/{entity_id}/attachments")
async def upload_attachment(entity_type: str, entity_id: UUID, file: UploadFile):
    """POST — загрузить вложение"""
    ...

@router.get("/evidence/attachments/{attachment_id}/download")
async def download_attachment(attachment_id: UUID):
    """GET — скачать вложение"""
    ...

# ═══════════════════════════════════════════════════════════════
# 8. FINDINGS (security results from scanners + SARIF intake)
# ═══════════════════════════════════════════════════════════════

@router.get("/findings", response_model=list[FindingResponse])
async def list_findings(
    run_id: UUID | None = Query(None),
    application_id: UUID | None = Query(None),
    severity: SeverityThreshold | None = Query(None),
    source: str | None = Query(None),  # sonarqube, ptai, zap, blackbox, trivy, ...
    page: int = Query(1),
    per: int = Query(25),
):
    """GET /api/v2/findings — реестр находок безопасности"""
    ...

@router.post("/findings/import", response_model=list[FindingResponse])
async def import_findings(
    source: str = Body(...),  # sarif, scan_result, manual
    run_id: UUID = Body(...),
    payload: dict = Body(...),  # SARIF JSON
):
    """POST /api/v2/findings/import — импорт находок из SARIF/scanners"""
    ...

# ═══════════════════════════════════════════════════════════════
# 9. SANDBOX (PT Sandbox file analysis)
# ═══════════════════════════════════════════════════════════════

@router.get("/sandbox", response_model=list[SandboxProcessResponse])
async def list_sandbox():
    """GET /api/v2/sandbox — список процессов sandbox"""
    ...

@router.post("/sandbox/upload", response_model=SandboxProcessResponse)
async def upload_to_sandbox(file: UploadFile):
    """POST /api/v2/sandbox/upload — загрузить файл на анализ"""
    ...

@router.get("/sandbox/size-limit")
async def sandbox_size_limit():
    """GET /api/v2/sandbox/size-limit — лимит размера файла"""
    ...

# ═══════════════════════════════════════════════════════════════
# 10. AUTH (OIDC callback)
# ═══════════════════════════════════════════════════════════════

@router.get("/auth/login")
async def auth_login(redirect_uri: str = Query(...)):
    """GET /api/v2/auth/login — редирект на OIDC provider (Blitz)"""
    ...

@router.get("/auth/callback")
async def auth_callback(code: str, state: str):
    """GET /api/v2/auth/callback — OIDC callback, обмен code→token→session"""
    ...

@router.post("/auth/logout")
async def auth_logout():
    """POST /api/v2/auth/logout — завершение сессии"""
    ...

@router.get("/auth/me")
async def auth_me():
    """GET /api/v2/auth/me — текущий пользователь + его роли"""
    ...
```

### 4.3. Сводка эндпоинтов Cosmo 2.0

| # | Resource | Methods | Count | Legacy Equivalent |
|---|----------|---------|-------|-------------------|
| 1 | `/applications` | GET, POST | 2 | `/api/projects` + `/api/meta_projects` |
| 2 | `/applications/{id}` | GET, PUT, PATCH(status), DELETE | 4 | project/meta CRUD + status + archive |
| 3 | `/applications/{id}/children` | GET, POST, DELETE | 3 | sub_projects + group_members |
| 4 | `/applications/{id}/lifecycle` | GET, PUT | 2 | lc_space_instance_configs |
| 5 | `/applications/{id}/team` | GET, POST, DELETE | 3 | project_members + meta_project_members |
| 6 | `/applications/{id}/releases` | GET, POST | 2 | project_releases + meta_project_releases |
| 7 | `/pipelines` + `/{id}` | GET, POST, PUT, DELETE | 4 | application_pipelines |
| 8 | `/runtimes` | GET, POST | 2 | application_runtimes |
| 9 | `/runs` | GET, POST | 2 | builds + deployments (list) |
| 10 | `/runs/{id}` | GET, POST(start/stop/rerun/deploy/protect), DELETE | 7 | build/deploy actions |
| 11 | `/runs/{id}/log` | GET (SSE) | 1 | build/deployment log |
| 12 | `/runs/{id}/report` | GET | 1 | deployment report (XLS) |
| 13 | `/runs/{id}/canary` + `/traffic-weights` | GET, PUT | 2 | canary management |
| 14 | `/runs/{id}/tests` + `/tests/{tid}` | GET, POST(start/stop), GET(log) | 5 | deployment tests |
| 15 | `/releases/{id}` | GET, PUT, PUT(status), POST(build), POST(transfer) | 5 | release actions |
| 16 | `/releases/{id}/events` | GET | 1 | release_events |
| 17 | `/domains` + `/{id}/members` | GET, POST | 3 | its_groups + members |
| 18 | `/notifications` + `/{id}` | GET, POST, PUT, DELETE, PATCH(read) | 5 | notifications + common_notifications |
| 19 | `/evidence/{type}/{id}` | GET, POST(attachments) | 2 | attachments + comments + events |
| 20 | `/evidence/attachments/{id}/download` | GET | 1 | attachment download |
| 21 | `/findings` + `/import` | GET, POST | 2 | sarif + sandbox results |
| 22 | `/sandbox` + `/upload` + `/size-limit` | GET, POST, GET | 3 | sandbox |
| 23 | `/auth/*` | GET, POST | 4 | oauth + profile |
| | **TOTAL** | | **~66 endpoints** | **~140 legacy → 66 clean** |

---

## 5. Итоговая статистика миграции

| Метрика | Cosmoport 1.0 | Cosmoport 2.0 |
|---------|--------------|---------------|
| Таблиц БД | 80+ | 8 (+ вспомогательные) |
| API эндпоинтов | ~140 | ~66 |
| JSONB blobs (нетипизированных) | ~30 колонок | 0 (все типизированы Pydantic v2) |
| Ролей (плоских) | 4 в коде / 13 в UI | 5 канонических + Domain RBAC |
| LC Steps | hardcoded в YAML | typed StepDefinition[] |
| Pipeline engine | GitLab CI YAML | Plan Compiler + Batch DAG |
| Evidence | polymorphic attachments | cosmo_evidence_ledger (immutable) |
| Нормативная база | отсутствует | SecuritySettings.normative_base |
| ГОСТ-Акт | отсутствует | Evidence chain → auto-generation |