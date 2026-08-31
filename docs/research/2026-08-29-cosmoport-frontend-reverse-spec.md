# 🏛️ Cosmoport 1.0 Frontend Reverse-Engineering Specification

> **Source:** `D:\cosmo\cosmo-frontend-to-scrape` — 18 HTML-снапшотов + `app-5e2d9864.js` (8.16 MB React-бандл)
> **Portal URL:** `portal.dev.spaceport.cbr.ru` (ЗР — dev environment)
> **Build:** `release-1.2.9-hotfix-20+1787914150`
> **Framework:** React 18 + Ant Design + MobX + emotion CSS + datx-jsonapi + react-router
> **User context:** `s7ttest-anshr` (Администратор НШР / abnormal)
> **Дата:** 2026-08-29

---

## 1. Реестр сущностей и иерархия (Domain Map)

```
ITS (Капсула / Базовый уровень) — `its_groups`
  │  Принадлежность команды разработки (КИТС)
  │
  ├── Level 0 (Нулевой уровень) — библиотеки и шаблоны
  │     ├── Модуль (Библиотека) — library
  │     ├── Астрокарта (Шаблон отчета) — report_templates
  │     ├── Орбиты (Шаблоны конфигурации) — configuration_templates
  │     ├── Карго (Универсальная библиотека) — universal_lib
  │     └── Буксир (Вспомогательное пространство) — data_transfer_lib
  │
  ├── Level 1 (Первый уровень) — приложения
  │     ├── Крейсер (Интегрированное) — ppod
  │     ├── Линкор (Универсальное) — universal_app
  │     ├── Космостанция (Сервисная подсистема) — service_subsystem
  │     ├── Гиперпривод (Сервисное приложение) — service
  │     ├── Гиперион (ЕХД) — ehd
  │     ├── Реликт (Унаследованное — ЕИСПД) — legacy
  │     ├── Навигатор (ПИС) — pis
  │     └── Харвестер (ЕПВВ) — epvv_po / epvv_spo
  │
  ├── Level 2 (Второй уровень) — контейнеры
  │     └── Вселенная тип «app» — meta_project (space_kind=0)
  │
  └── Группирующий уровень — группировка Level 2
        └── Вселенная тип «group» — meta_project (space_kind=1)
              └── Вложенные Level 2 (Вложенные пространства)
                    └── Вложенные Level 1 (Дочерние карточки)
                          └── Вложенные Level 0 (Модули / библиотеки)
```

### Иерархия в UI (из вкладки формирования вложенности):
- **Капсула (Базовый уровень)** → фильтр наверху
- **Группирующая вселенная** → содержит Level 2 пространства
- **Level 2 пространство** (`Вселенная — приложение`) → содержит Level 1 + Level 0
- **Level 1 приложение** → содержит Level 0 модули
- **Level 0 модуль/библиотека** → конечный элемент

---

## 2. Каталог экранов и спецификации форм

### 2.1. Sidebar (боковое меню портала) — 30 пунктов

```
Обзор (Главная)
Приложения
  ├── Приложения и сервисы (реестр)
  └── Архивные приложения
Сервисы
Управление
  ├── Развертывания
  └── Пакеты
Шаблоны
Брокеры сообщений
Капсулы (базовый уровень)
Среды исполнения
Типы релизов
Список конвейеров
Показатели конвейера
Загрузка артефактов
Отчетность ПУ
Настройки
Общие
Интеграции
Сроки действия
Смена паролей ТУЗ
Показатели назначения
Оповещения
Метки «Новое»
Обратная связь
  ├── Запросы
  └── Шаблоны писем
Пользователи
  ├── Список пользователей
  └── Аудит
```

### 2.2. Форма создания приложения (Level 1 & Level 2)

#### Универсальные поля (обе формы)

| # | Field ID | Label (рус) | Type | Required | Options / Default | Validation |
|---|----------|-------------|------|----------|-------------------|------------|
| 1 | name | Название | input | ✅ Yes | placeholder: «Введите название» | — |
| 2 | code | Код | input | ✅ Yes | placeholder: «Введите код» | Regex: `[a-zA-Z][a-zA-Z0-9\-]*`, max 45 символов, lowercase |
| 3 | level | Категория (уровень) | radio | ✅ Yes | Нулевой / Первый / Второй / Группирующий | — |
| 4 | priority | Приоритет запуска | input | No | placeholder: «Введите приоритет» | visible only for Level 1/2 |
| 5 | its_group_id | Капсула (Базовый уровень) | select | No | autocomplete из its_groups | visible only for Level 1/2 |
| 6 | description | Описание | textarea | No | placeholder: «Введите описание» | — |
| 7 | confluence | Интеграция с Confluence | input | No | URL | — |
| 8 | use_configurations | Использовать конфигурации | toggle | No | default: Выкл | ⚠️ irreversible after ON |
| 9 | use_profiles | Использовать профили | toggle | No | auto-ON for Линкор | ⚠️ irreversible for some types |
| 10 | gitlab_repo | Репозиторий GitLab | radio | No | Создать новый / Подключить существующий | — |

#### Условная видимость (conditional_rules):
| Условие | Показывает |
|----------|------------|
| Категория = Первый/Второй уровень | Приоритет запуска, Капсула (Базовый уровень), Использовать профили |
| Категория = Группирующий уровень | Вложенные пространства (таблица выбора) |
| Использовать конфигурации = Вкл | ⚠️ Alert: «отключить невозможно» |
| GitLab = Подключить существующий | Поле выбора существующего репозитория |

#### CTA Buttons: «Создать», «Отменить»

---

### 2.3. Карточка приложения (6 вкладок)

#### Вкладка «Информация» — Общие данные (readonly display)

| Label | Значение (пример: zond-ppod-deploy) |
|-------|-------------------------------------|
| Статус | Планируется к реализации |
| Дата создания | 2026.06.25 в 18:21 |
| Код | zond-ppod-deploy |
| Тип приложения | Линкор (Универсальное) |
| Входит в состав карточки 2-го уровня | regressVselennaya |
| Использование конфигураций | Нет |
| Использование профилей | Да |
| Доступно на ПБП | Да |
| Используемые инструменты | html 15.78%, java 33.19%, python 12.41%, dockerfile 0.48%, javaScript 38.15% |
| Способ наследования прав | Нет |
| Приоритет запуска | 100 |

#### Вкладка «Информация» — Интеграции (readonly list)

| Label | Default Status |
|-------|---------------|
| Gitlab | Установлена |
| Openshift | Установлена |
| Jenkins | Установлена |
| JIRA | Установлена |
| Nexus | Установлена |
| Sfera | Установлена |
| Artifactory | Установлена |
| Confluence | Установлена |
| ЦУП | Установлена |
| Звездочет (Findings) | Установлена |

#### Вкладка «Команда» — участники проекта

| Роль (рус) | Role code |
|------------|-----------|
| IT-лидер | owner |
| Руководитель разработки | master |
| Разработчик | developer |
| Тестировщик | tester |
| Администратор КИТС | app_admin |
| Релиз менеджер | release_manager |
| Эксперт ИБ | sec_expert |

#### CTA Buttons: «Редактировать» (3-dot menu), «Создать» (на вкладке Сборки/Релизы)

---

### 2.4. Настройки карточки (Settings page)

#### Секция «Общие»

| # | Label | Type | Default | Options |
|---|-------|------|---------|---------|
| 1 | JIRA (URL) | input | — | — |
| 2 | Статус | select | Планируется к реализации | 5 статусов: Планируется / В разработке / Эксплуатируется / Выводится из эксплуатации / Выведен из эксплуатации |
| 3 | Использование категоризации ПИБ (ЕХД) | toggle | Выкл | Выкл/Вкл |
| 4 | Запускать unit-тесты | toggle | Выкл | Выкл/Вкл |
| 5 | Многопоточная сборка | toggle | Выкл | Выкл/Вкл |
| 6 | Использование безопасной передачи секретов (Vault) | toggle | Выкл | Выкл/Вкл |
| 7 | Автоматический запуск сборки | toggle | Выкл | Выкл/Вкл |
| 8 | Передача исходного кода | toggle | Выкл | Выкл/Вкл |
| 9 | Передача бинарных файлов | toggle | Выкл | Выкл/Вкл |
| 10 | Установка таймаута для развертываний (минут) | input | — | число |
| 11 | ABAC (для портала Бизнес пользователей) | select | Не указан | список значений |

#### Секция «Мониторинг»

| # | Label | Type | Default |
|---|-------|------|---------|
| 1 | Норматив выполнения запроса в БД (сек) | input | — |
| 2 | Мониторинг доступности сервисов АС «Космопорт» | toggle | Выкл |
| 3 | Периодичность опроса сервисов | input | — (visible when monitoring=On) |

#### Секция «Конфигурация жизненного цикла» (LC Steps)

**3 аккордеона (collapsible sections):**

##### Статический анализ и сборка (10 шагов)

| # | Шаг жизненного цикла | Обязательность | Включение | Условие продолжения ЖЦ |
|---|---------------------|----------------|-----------|----------------------|
| 1 | Сборка | ✅ required | toggle | Продолжить / Завершить при ошибке |
| 2 | Юнит-тестирование | not required | toggle | Продолжить / Завершить при ошибке |
| 3 | Генерация документации | not required | toggle | Продолжить / Завершить при ошибке |
| 4 | SonarQube | not required | toggle | Продолжить / Завершить при ошибке |
| 5 | PTAI | not required | toggle | Продолжить / Завершить при ошибке |
| 6 | Solar Appscreener | not required | toggle | Продолжить / Завершить при ошибке |
| 7 | Trivy | not required | toggle | Продолжить / Завершить при ошибке |
| 8 | CodeScoring | not required | toggle | Продолжить / Завершить при ошибке |
| 9 | Sandbox | not required | toggle | Продолжить / Завершить при ошибке |
| 10 | Kaspersky Container Security | not required | toggle | Продолжить / Завершить при ошибке |

##### Развертывание (1 шаг)

| # | Шаг | Обязательность | Условие |
|---|-----|----------------|---------|
| 1 | Развёртывание ПО | ✅ required | Завершить при ошибке |

##### Динамическое тестирование и автотесты (3 шага)

| # | Шаг | Обязательность | Условие |
|---|-----|----------------|---------|
| 1 | Выполнение автотестов | not required | Продолжить / Завершить при ошибке |
| 2 | Blackbox | not required | Продолжить / Завершить при ошибке |
| 3 | OWASP ZAP | not required | Продолжить / Завершить при ошибке |

---

### 2.5. Форма создания конвейера (Pipeline Create — 19 полей)

| # | Label | Type | Required | Detail |
|---|-------|------|----------|--------|
| 1 | Название | input | ✅ Yes | human-readable name |
| 2 | Код | input | ✅ Yes | unique slug |
| 3 | Тип конвейера | select | ✅ Yes | Jenkins / Gitlab CI/CD |
| 4 | Версия | input | No | |
| 5 | URL-адрес для подключения | input | ✅ Yes | endpoint URL |
| 6 | Логин администратора | input | No | admin credentials |
| 7 | Пароль администратора | input | No | admin password |
| 8 | Приложения (путь к папке) | input | No | apps folder path |
| 9 | Сервисы (путь к папке) | input | No | services folder path |
| 10 | Сервисный | switch | No | service flag |
| 11 | Название пайплайна по умолчанию | input | No | pipeline path |
| 12 | Ветка с пайплайном | input | No | pipeline branch |
| 13 | Креды для пайплайна | input | No | pipeline credentials |
| 14 | Путь до пайплайна | input | No | pipeline filepath |
| 15 | Job для удаления | input | No | cleaner job name |
| 16 | Файл конфигурации CI | input | No | CI config filename |
| 17 | Файл конфигурации CI для деплоя | input | No | deploy CI config |
| 18 | Файл конфигурации CI для тестирования | input | No | test CI config |
| 19 | Доступность (группы + типы приложений) | multi-select | No | availability filters |

---

### 2.6. Форма создания среды исполнения (Runtime Create — 10 полей)

| # | Label | Type | Required | Detail |
|---|-------|------|----------|--------|
| 1 | Название | input | ✅ Yes | |
| 2 | Код | input | ✅ Yes | |
| 3 | Тип | select | ✅ Yes | Openshift / Deckhouse / ТСР / Универсальная |
| 4 | Путь приложений | input | No | project path |
| 5 | По-умолчанию | switch | No | default flag |
| 6 | URL | input | No | console URL |
| 7 | Домен | input | No | cluster domain |
| 8 | Endpoint адрес | input | No | API endpoint |
| 9 | Токен | input | No | auth token |
| 10 | Параметры | input | No | JSON params |
| 11 | Версия | input | No | |
| 12 | Дополнительный домен | input | No | secondary domain |
| 13 | Системный мониторинг | switch | No | prometheus monitoring |
| 14 | Тип подключения | select | No | HTTP-запросы / Artemis Queue Broker |
| 15 | Параметры подключения | input | No | connection config |
| 16 | Weight | input | No | sorting weight |
| 17 | Доступность | multi-select | No | groups + kinds filter |

---

### 2.7. Форма оповещения — Команда (Notification Team)

**Conditional form — раскрывает блоки по мере заполнения.**

| # | Label | Type | Required | Options |
|---|-------|------|----------|---------|
| 1 | Тип | select | ✅ Yes | Информационное / Критическое |
| 2 | Тема | select | ✅ Yes | Доступ / Сборки и развертывания / Интеграции и инфраструктура / Перенос данных / Документация и безопасность / Рабочее пространство / Ресурсы / Другое |
| 3 | Заголовок | input | ✅ Yes | max 500 chars |
| 4 | Описание | textarea | No | max 4000 chars |
| 5 | Ссылка | input | No | URL, max 2000 chars |
| 6 | Получатели | select | ✅ Yes | Все пользователи / Только администраторы / Эксплуатационный персонал / **Команда** / Персональное |
| 7 | Выбор команды (visible when Получатели=Команда) | select | No | searchable team list |
| 8 | Способ доставки | radio | ✅ Yes | В GUI + email / только в GUI (пуш) / только email |
| 9 | Приоритет | select | No | HIGHEST / HIGH / MEDIUM / LOW / LOWEST |
| 10 | Срок действия | datepicker | No | start date + end date |
| 11 | Показывать постоянно | switch | No | infinite vs date-bounded |
| 12 | Выбор персон (visible when Получатели=Персональное) | multi-select | No | user search |

#### CTA Buttons: «Создать», «Отменить»

---

## 3. Таблицы данных (MUI X Data Grid Blueprints)

### 3.1. Реестр приложений (Приложения.html)

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Название | text + link → /projects/:id | ✅ | text search |
| 2 | Код | text (slug) | — | — |
| 3 | Тип | badge (Цветной тег) | ✅ | dropdown |
| 4 | Группа | text | — | — |
| 5 | Капсула (Базовый уровень) | text | — | — |
| 6 | Дата создания | datetime | ✅ | — |
| 7 | Релиз | text/link | — | — |
| 8 | Дата релиза | datetime | — | — |

**Row Actions:** «Перейти в карточку» (navigate), «Редактировать» (edit), «Удалить» (delete — soft archive)
**CTA:** «Создать» → модалка формы создания

---

### 3.2. Список конвейеров (конвейеры)

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Название | text + link | ✅ | text search |
| 2 | Код | text | — | — |
| 3 | Тип конвейера | badge | ✅ | dropdown |
| 4 | Версия | text | — | — |
| 5 | Статус | badge (цветной) | ✅ | dropdown |
| 6 | Адрес | text | — | — |

**Row Actions:** «Редактировать», «Удалить»
**CTA:** «Создать конвейер»

---

### 3.3. Список сред исполнения (Runtimes)

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Название | text + link | ✅ | text search |
| 2 | Код | text | — | — |
| 3 | Тип | badge | ✅ | dropdown |
| 4 | Статус | badge (активный/неактивный) | ✅ | dropdown |
| 5 | Версия | text | — | — |
| 6 | Путь приложений | text | — | — |

**Row Actions:** «Редактировать», «Удалить»
**CTA:** «Создать среду исполнения»

---

### 3.4. Сборки (Build History)

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Идентификатор | text | — | — |
| 2 | Название | text + link | ✅ | text search |
| 3 | Статус сборки | badge (pending/running/success/failed/aborted) | ✅ | dropdown |
| 4 | Домен | text | — | — |
| 5 | Коммит | text (short SHA) | — | — |
| 6 | Данные | expandable row (jsonb) | — | — |

**Row Actions:** «Остановить», «Развернуть», «Удалить», «Защитить», «Создать деплой»
**Filter:** Активные деплои («Только с активными»)
**CTA:** «Создать сборку»

---

### 3.5. Развертывания (Deploy History)

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Сегмент | badge (голый/интеграционный) | ✅ | — |
| 2 | Статус | badge (цветной map: см. deployment_status) | ✅ | dropdown |
| 3 | Домен | text + link | ✅ | text |
| 4 | Label | text | — | — |
| 5 | Тег сборки | text | — | — |
| 6 | Среда исполнения | text | — | — |
| 7 | Конфигурация | text | — | — |
| 8 | Canary | badge | — | — |

**Row Actions:** «Перезапустить», «Остановить», «Удалить», «Настроить», «Тест», «Постоянная ссылка», «Управление трафиком»
**Bulk Actions:** «Массовая остановка», «Массовый запуск» (management_events)

---

### 3.6. Таблица оповещений

| # | Колонка | Тип | Sort | Filter |
|---|---------|-----|------|--------|
| 1 | Тема | text | ✅ | text |
| 2 | Заголовок | text + expand | ✅ | text |
| 3 | Серьезность | badge (Критическое / Информационное) | ✅ | dropdown |
| 4 | Получатели | badge | — | — |
| 5 | Дата начала | datetime | ✅ | — |
| 6 | Дата окончания | datetime | ✅ | — |
| 7 | Статус | badge (активно/истекло) | ✅ | dropdown |

**Row Actions:** «Редактировать», «Удалить»
**CTA:** «Новое оповещение» (2 варианта: Команда / Критическое)

---

### 3.7. Интеграции (GitLab example)

| # | Колонка | Тип |
|---|---------|-----|
| 1 | Название | text |
| 2 | Код | text |
| 3 | Статус | badge (В ожидании / В процессе / Ошибка / Установлена / Не активна) |
| 4 | Вид | badge (Gitlab, Jenkins, Openshift, Jira, Confluence, Artifactory, Nexus, ЦУП, Sfera, Findings, Pis, Vault) |

**Форма деталей интеграции** (GitLab example fields):
- Web URL, SSH URL, project_id, project_path, имя ветки, джоба очистки, профиль артифактори

---

### 3.8. Формирование вложенности (группирующая вселенная)

**Структура таблицы:**
| Колонка | Описание |
|---------|----------|
| Название | Имя вложенного пространства |
| Тип карточки приложения | badge типа |
| Порядок сборки | drag-reorder |
| Порядок развертывания | drag-reorder |

**Row Actions:** «Удалить из группы», «Изменить порядок» (drag)
**CTA:** «Добавить пространство» (модалка выбора)

---

## 4. Карта REST API эндпоинтов (из JS бандла)

### Полный каталог (~140 unique endpoints)

| Entity | Endpoints |
|--------|-----------|
| **oauth** | `POST /api/oauth`, `GET /api/oauth/new`, `DELETE /api/oauth` |
| **debug** | `POST /api/debug/login` |
| **settings** | `GET /api/settings`, `POST /api/settings`, `GET /api/settings/all`, `GET /api/settings/calculator`, `GET /api/settings/default_domain?kind={kind}` |
| **projects** | `GET /api/projects` (?level=0 filter), `GET /api/projects/{id}`, `POST /api/projects/{id}/upload_icon`, `GET /api/projects/{id}/active_deployments`, `GET /api/projects/{id}/has_transmitted_release`, `GET /api/projects/{id}/abac_realm_codes`, `GET /api/projects/{id}/parent_projects`, `GET /api/projects/{id}/meta_projects`, `GET /api/projects/{id}/ordered_leibniz_public_full`, `GET /api/projects/{id}/runtimes/production`, `GET /api/projects/{id}/pipelines`, `GET /api/projects/{id}/resources`, `GET /api/projects/{id}/resources/inherited`, `GET /api/projects/{id}/services`, `GET /api/projects/{id}/configurations`, `GET /api/projects/{id}/vm`, `GET /api/projects/{id}/was_vms`, `GET /api/projects/{id}/topic_orders`, `GET /api/projects/{id}/broker_topics`, `GET /api/projects/{id}/broker_topic_permissions`, `GET /api/projects/{id}/security_events`, `GET /api/projects/{id}/passwords_info`, `GET /api/projects/{id}/scheduled_tasks`, `GET /api/projects/{id}/env_profiles`, `GET /api/projects/{id}/env_profiles/default_profile`, `GET /api/projects/{id}/env_profile_quotas`, `GET /api/projects/{id}/webhooks?build_id={bid}`, `GET /api/projects/export_passwords_info` |
| **projects/builds** | `GET /api/projects/{pid}/builds`, `GET /api/projects/{pid}/builds/{bid}/sub_project_builds` |
| **projects/releases** | `GET /api/projects/{pid}/releases/{rid}/deployments`, `GET /api/projects/{pid}/releases/meta_release_releases` |
| **meta_projects** | `GET /api/meta_projects`, `GET /api/meta_projects/{id}`, `POST /api/meta_projects/{id}/upload_icon`, `GET /api/meta_projects/{id}/runtimes/production`, `GET /api/meta_projects/{id}/pipelines`, `GET /api/meta_projects/{id}/active_deployments`, `GET /api/meta_projects/{id}/has_transmitted_release`, `GET /api/meta_projects/{id}/abac_realm_codes`, `GET /api/meta_projects/{id}/resources`, `GET /api/meta_projects/{id}/env_profiles`, `GET /api/meta_projects/{id}/services`, `POST /api/meta_projects/{id}/meta_project_releases/import_config`, `GET /api/meta_projects/{id}/sub_projects`, `GET /api/meta_projects/{id}/limit`, `GET /api/meta_projects/{id}/topic_orders`, `GET /api/meta_projects/{id}/broker_topics`, `GET /api/meta_projects/{id}/broker_topic_permissions`, `GET /api/meta_projects/{id}/passwords_info`, `GET /api/meta_projects/{id}/scheduled_tasks` |
| **builds** | `GET /api/builds`, `GET /api/builds/{id}/gitlab_pipeline_page`, `GET /api/builds/{id}/deployments`, `GET /api/builds/{id}/sub_project_builds`, `GET /api/builds/{id}/sub_meta_project_builds`, `GET /api/builds/{id}/build_documentation` |
| **deployments** | `GET /api/deployments`, `GET /api/deployments/{id}`, `GET /api/deployments/{id}/report`, `GET /api/deployments/{id}/tests`, `GET /api/deployments/{id}/canary_main_deployments`, `GET /api/deployments/{id}/sanity_tests` |
| **releases** | `GET /api/releases`, `GET /api/releases/{id}`, `GET /api/releases/{id}/report`, `GET /api/releases/{id}/release_commit_message`, `GET /api/releases/{id}/sub_project_releases`, `GET /api/releases/{id}/events` |
| **meta_project_releases** | `GET /api/meta_project_releases`, `GET /api/meta_project_releases/{id}/report`, `GET /api/meta_project_releases/{id}/export_config`, `GET /api/meta_project_releases/{id}/sub_project_releases`, `GET /api/meta_project_releases/{id}/sub_meta_project_releases`, `GET /api/meta_project_releases/{id}/events` |
| **group_releases** | `GET /api/group_releases`, `GET /api/group_releases/{id}/report`, `GET /api/group_releases/{id}/sub_project_releases`, `GET /api/group_releases/{id}/sub_meta_project_releases`, `GET /api/group_releases/{id}/events` |
| **services** | `GET /api/services`, `GET /api/services/orderable`, `GET /api/services/report`, `GET /api/services/using_statistics`, `GET /api/services/{id}`, `GET /api/services/{id}/healthchecks/lc_services`, `GET /api/services/{id}/core_services` |
| **application_runtimes** | `GET /api/application_runtimes`, `GET /api/application_runtimes/can_order`, `GET /api/application_runtimes/{id}`, `GET /api/application_runtimes/{id}/tsr_stands` |
| **application_pipelines** | `GET /api/application_pipelines`, `GET /api/application_pipelines/can_order`, `GET /api/application_pipelines/{id}` |
| **brokers** | `GET /api/brokers`, `GET /api/brokers/{id}`, `GET /api/message_brokers`, `GET /api/message_brokers/report`, `GET /api/message_brokers/orderable`, `GET /api/broker_topics`, `GET /api/broker_topic_orders` |
| **packages** | `GET /api/packages`, `POST /api/packages/upload`, `GET /api/packages/{id}/download` |
| **transfers** | `GET /api/transfer_package_logs`, `GET /api/transfer_statuses`, `GET /api/release_routes`, `POST /api/mzp_transfers`, `GET /api/mzp_deliveries` |
| **sandbox** | `GET /api/sandbox`, `GET /api/sandbox/size_limit`, `GET /api/sandbox/report`, `POST /api/sandbox/upload`, `GET /api/sandbox_transactions` |
| **metrics** | `GET /api/metrics`, `GET /api/metric_values`, `GET /api/metric_values/report` |
| **validities** | `GET /api/validities`, `GET /api/validities/categories`, `GET /api/validity_categories` |
| **notifications** | `GET /api/notifications`, `GET /api/common_notifications`, `GET /api/common_notifications/critical`, `GET /api/common_notifications/info` |
| **users** | `GET /api/users`, `GET /api/users/access_levels`, `GET /api/users/{id}`, `GET /api/logs`, `GET /api/ldap_users` |
| **attachments** | `GET /api/project_attachments/{id}/download`, `GET /api/release_attachments/{id}/download`, `GET /api/service_attachments/{id}/download`, `GET /api/meta_project_attachments/{id}/download`, `GET /api/meta_release_attachments/{id}/download`, `GET /api/templates/{id}/download`, `POST /api/project_attachments`, `POST /api/release_attachments`, `POST /api/meta_project_attachments`, `POST /api/meta_release_attachments`, `POST /api/service_attachments` |
| **other** | `GET /api/groups`, `GET /api/group_members`, `GET /api/its_groups`, `GET /api/integrations`, `GET /api/externals`, `GET /api/sou_requests`, `GET /api/sou_template`, `GET /api/orders`, `GET /api/members`, `GET /api/contacts`, `GET /api/vms`, `GET /api/vms/catalog_items`, `GET /api/was_vms`, `GET /api/release_types`, `GET /api/changelog_version`, `GET /api/guides`, `GET /api/innovation_labels`, `GET /api/limits`, `GET /api/source_templates`, `GET /api/gateway/notification_service`, `GET /api/pib/generate_report`, `GET /api/management_events`, `GET /api/configurations`, `GET /api/security_events` |

---

## 5. Словарь Enums и терминологии (для Pydantic / TypeScript)

### 5.1. Типы приложений (ProjectKind)

| Код (backend) | Название (рус, UI) | Level |
|---------------|-------------------|-------|
| `universal_app` | Линкор (Универсальное) | 1 |
| `ppod` | Крейсер (Интегрированное) | 1 |
| `service_subsystem` | Космостанция (Сервисная подсистема) | 1 |
| `service` | Гиперпривод (Сервисное приложение) | 1 |
| `ehd` | Гиперион (ЕХД) | 1 |
| `legacy` | Реликт (Унаследованное — ЕИСПД) | 1 |
| `pis` | Навигатор (ПИС) | 1 |
| `epvv_po` | ПО ВП Харвестер (ЕПВВ) | 1 |
| `epvv_spo` | Инфраструктура ВП Харвестер (ЕПВВ) | 1 |
| `allocated` | Выделенное | 1 |
| `library` | Модуль (Библиотека) | 0 |
| `report_templates` | Астрокарта (Шаблон отчета) | 0 |
| `configuration_templates` | Орбиты (Шаблоны конфигурации) | 0 |
| `universal_lib` | Карго (Универсальная библиотека) | 0 |
| `data_transfer_lib` | Буксир (Вспомогательное пространство) | 0 |
| `meta_project` | Вселенная (Группирующее пространство) | 2 |

### 5.2. Роли (User Roles — 13 ролей)

| Role (рус) | Code | Описание |
|------------|------|----------|
| Администратор | `admin` | Full access |
| Администратор НШР | `abnormal` | Emergency access |
| IT-лидер | `manager` | Team leader |
| Руководитель разработки | `head` | Dev lead |
| Разработчик | `developer` | Developer |
| Тестировщик | `tester` | QA |
| Оператор | `operator` | Operator |
| Администратор ИБ | `sec_admin` | InfoSec admin |
| Контролер эксплуатации | `sec_control` | Ops controller |
| Администратор КИТС | `app_admin` | ITS admin |
| Сервисный инженер | `service` | Service engineer |
| Релиз менеджер | `release_manager` | Release manager |
| Эксперт ИБ | `sec_expert` | Security expert |

### 5.3. Роли участников проекта (Member Access Level — 7 ролей)

| Role (рус) | Code | GitLab role |
|------------|------|-------------|
| IT-лидер | `owner` | 40 (Owner) |
| Руководитель разработки | `master` | 40 (Maintainer) |
| Разработчик | `developer` | 30 (Developer) |
| Тестировщик | `tester` | 10 (Guest) |
| Администратор КИТС | `app_admin` | 10 |
| Релиз менеджер | `release_manager` | 10 |
| Эксперт ИБ | `sec_expert` | 10 |

### 5.4. LC Steps (14 шагов × 3 секции)

| Section | Step code | Step name (рус) |
|---------|-----------|-----------------|
| `section_build` | `build` | Сборка |
| `section_build` | `unit_tests` | Юнит-тестирование |
| `section_build` | `docs_generation` | Генерация документации |
| `section_build` | `sonar_qube` | SonarQube |
| `section_build` | `ptai` | PTAI |
| `section_build` | `solar_appscreener` | Solar Appscreener |
| `section_build` | `trivy` | Trivy |
| `section_build` | `codescoring` | CodeScoring |
| `section_build` | `sandbox` | Sandbox |
| `section_build` | `kcs` | Kaspersky Container Security |
| `section_deploy` | `deploy` | Развёртывание ПО |
| `section_dast_autotest` | `autotests` | Выполнение автотестов |
| `section_dast_autotest` | `blackbox` | Blackbox |
| `section_dast_autotest` | `owasp_zap` | OWASP ZAP |

### 5.5. Статусы (Key Status Enums)

#### Project Status (15 значений)
| Код | Русский |
|-----|---------|
| `draft` | Планируется к реализации |
| `developing` | В разработке |
| `preliminary_tests` | Предварительные испытания |
| `trial` | Опытная эксплуатация |
| `acceptance_tests` | Приемочные испытания |
| `internal_tests` | Внутреннее тестирование |
| `functional_tests` | Функциональное тестирование |
| `commissioning` | Ввод в эксплуатацию |
| `active` | В эксплуатации |
| `inactive` | Выведено из эксплуатации |
| `archiving` | Архивируется |
| `archived` | В архиве |
| `archiving_interrupted` | Архивация прервана |
| `really_destroying` | В процессе полного удаления |
| `really_destroying_interrupted` | Полное удаление прервано |

#### Release Status (18 значений)
| Код | Русский |
|-----|---------|
| `draft` | Запланирован |
| `developing` | В разработке |
| `developed` | Разработан |
| `testing` | Тестирование |
| `tested` | Протестирован |
| `testing_failed` | Ошибка при тестировании |
| `production` | В эксплуатации |
| `archived` | Выведен из эксплуатации |
| `canceled` | Отменен |
| `build_failed_dev` | Ошибка сборки в ЗР |
| `build_deploy_failed_dev` | Ошибка сборки/развертывания в ЗР |
| `build_deploy_failed_test` | Ошибка сборки/развертывания в ЗТ |
| `build_deploy_failed_prod` | Ошибка развертывания в ЗПЭ |
| `transferred_to_test` | Перенесен в ЗТ |
| `transferred_to_prod` | Перенесен в ЗПЭ |
| `partial_transferred_to_test` | Частично перенесен в ЗТ |
| `partial_transferred_to_prod` | Частично перенесен в ЗПЭ |
| `deleting` | Удаление |

#### Build Status (5 значений)
| Код | Русский |
|-----|---------|
| `pending` | Ожидание |
| `running` | В процессе |
| `success` | Успешно |
| `failed` | Ошибка |
| `aborted` | Прервано |

#### Deployment Status (20 значений)
| Код | Meaning |
|-----|---------|
| `pending` | Ожидание |
| `running` | В процессе |
| `deleting` | Удаление |
| `deleted` | Удален |
| `failed` | Ошибка |
| `failed_to_stop` | Ошибка остановки |
| `failed_to_deploy` | Ошибка развертывания |
| `failed_to_delete` | Ошибка удаления |
| `success` | Успешно |
| `stopped` | Остановлен |
| `stopping` | Останавливается |
| `deployed` | Развернуто |
| `deploy_fail` | Ошибка деплоя |
| `undeploy_fail` | Ошибка развертывания |
| `start_fail` | Ошибка запуска |
| `stop_fail` | Ошибка остановки |
| `launched` | Запущен |
| `warning` | Предупреждение |
| `interrupted_by_operation` | Прервано операцией |
| `pause` | Пауза |
| `completed` | Завершено |

### 5.6. Категории уведомлений (8 категорий)

| Код | Русский |
|-----|---------|
| `access` | Доступ |
| `ci_cd` | Сборки и развертывания |
| `integration_and_infrastructure` | Интеграции и инфраструктура |
| `data_transfer` | Перенос данных |
| `documentation_and_safety` | Документация и безопасность |
| `workspaces` | Рабочее пространство |
| `recourses` | Ресурсы |
| `other` | Другое |

### 5.7. Получатели уведомлений

| Код | Русский |
|-----|---------|
| `everybody` | Все пользователи |
| `admins` | Только администраторы |
| `maintenance_personnel` | Эксплуатационный персонал (Админ + Админ КИТС + Админ ИБ) |
| `project_command` | Команда |
| `personal` | Персональное |

### 5.8. Способ доставки уведомлений

| Код | Русский |
|-----|---------|
| `all_channels` | В GUI + отправка по email |
| `push` | только в GUI (пуш-уведомление в ПУ) |
| `email` | только отправка по email |

### 5.9. Интеграции (12 видов)

| Код | Название |
|-----|----------|
| `gitlab` | Gitlab |
| `jenkins` | Jenkins |
| `openshift` | Openshift |
| `confluence` | Confluence |
| `jira` | Jira |
| `artifactory` | Artifactory |
| `vault` | Vault |
| `nexus` | Nexus |
| `tsup` | ЦУП (TSUP) |
| `findings` | Звездочет (Findings) |
| `sfera` | Sfera |
| `pis` | ПИС (PIS) |

### 5.10. Статусы интеграций

| Код | Русский |
|-----|---------|
| `pending` | В ожидании |
| `running` | В процессе |
| `failed` | Ошибка |
| `success` | Установлена |
| `not_active` | Не активна |

### 5.11. Типы сред исполнения (Runtimes)

| Код | Название |
|-----|----------|
| `openshift` | Openshift |
| `deckhouse` | Deckhouse |
| `tsr` | ТСР |
| `universal` | Универсальная среда исполнения |

### 5.12. Типы конвейеров (Pipelines)

| Код | Название |
|-----|----------|
| `jenkins` | Jenkins |
| `gitlab` | Gitlab CI/CD |

---

## 6. Pydantic v2 & TypeScript Ready Interfaces

### 6.1. Application (Project) — Pydantic v2

```python
from pydantic import BaseModel, Field, field_validator
from uuid import UUID
from datetime import datetime
from enum import StrEnum
from typing import Optional

class ProjectKind(StrEnum):
    UNIVERSAL_APP = "universal_app"         # Линкор
    INTEGRATED = "ppod"                     # Крейсер
    SERVICE_SUBSYSTEM = "service_subsystem" # Космостанция
    SERVICE = "service"                     # Гиперпривод
    EHD = "ehd"                             # Гиперион
    LEGACY = "legacy"                       # Реликт
    PIS = "pis"                             # Навигатор
    EPVV_PO = "epvv_po"                     # Харвестер (ПО)
    EPVV_SPO = "epvv_spo"                   # Харвестер (Инфра)
    ALLOCATED = "allocated"                 # Выделенное
    LIBRARY = "library"                     # Модуль
    REPORT_TEMPLATES = "report_templates"   # Астрокарта
    CONFIG_TEMPLATES = "configuration_templates" # Орбиты
    UNIVERSAL_LIB = "universal_lib"          # Карго
    DATA_TRANSFER_LIB = "data_transfer_lib"  # Буксир
    META_PROJECT = "meta_project"            # Вселенная

class ProjectLevel(StrEnum):
    ZERO = "0"        # библиотеки, шаблоны
    FIRST = "1"       # приложения
    SECOND = "2"      # контейнеры (meta_project app)
    GROUPING = "grouping"  # группирующая вселенная (meta_project group)

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

class ApplicationCreate(BaseModel):
    name: str = Field(..., description="Название")
    code: str = Field(..., description="Код", pattern=r'^[a-zA-Z][a-zA-Z0-9\-]{0,44}$')
    kind: ProjectKind = Field(..., description="Тип приложения")
    level: ProjectLevel = Field(..., description="Категория (уровень)")
    priority: Optional[int] = Field(None, description="Приоритет запуска [21..100]")
    its_group_id: Optional[UUID] = Field(None, description="Капсула (Базовый уровень)")
    description: Optional[str] = Field(None, description="Описание")
    confluence_url: Optional[str] = Field(None, description="Интеграция с Confluence")
    use_configurations: bool = False
    use_profiles: bool = False
    gitlab_new_repo: bool = True  # Создать новый vs Подключить существующий

    @field_validator("code")
    @classmethod
    def code_lowercase(cls, v: str) -> str:
        return v.lower()

class ApplicationResponse(BaseModel):
    id: UUID
    name: str
    code: str
    kind: ProjectKind
    level: ProjectLevel
    status: ProjectStatus
    its_group_name: Optional[str]
    created_at: datetime
    settings: dict

    class Config:
        from_attributes = True
```

### 6.2. LC Step Configuration — Pydantic v2

```python
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

class StepDefinition(BaseModel):
    step_id: LcStepId
    step_name_ru: str
    section: LcStepSection
    order: int
    required: bool = False
    enabled: bool = True
    on_failure: LcOnFailure = LcOnFailure.CONTINUE

BUILD_SECTION_STEPS = [
    StepDefinition(step_id=LcStepId.BUILD, step_name_ru="Сборка", section=LcStepSection.BUILD, order=1, required=True),
    StepDefinition(step_id=LcStepId.UNIT_TESTS, step_name_ru="Юнит-тестирование", section=LcStepSection.BUILD, order=2),
    StepDefinition(step_id=LcStepId.DOCS_GENERATION, step_name_ru="Генерация документации", section=LcStepSection.BUILD, order=3),
    StepDefinition(step_id=LcStepId.SONAR_QUBE, step_name_ru="SonarQube", section=LcStepSection.BUILD, order=4),
    StepDefinition(step_id=LcStepId.PTAI, step_name_ru="PTAI", section=LcStepSection.BUILD, order=5),
    StepDefinition(step_id=LcStepId.SOLAR_APPSCREENER, step_name_ru="Solar Appscreener", section=LcStepSection.BUILD, order=6),
    StepDefinition(step_id=LcStepId.TRIVY, step_name_ru="Trivy", section=LcStepSection.BUILD, order=7),
    StepDefinition(step_id=LcStepId.CODESCORING, step_name_ru="CodeScoring", section=LcStepSection.BUILD, order=8),
    StepDefinition(step_id=LcStepId.SANDBOX, step_name_ru="Sandbox", section=LcStepSection.BUILD, order=9),
    StepDefinition(step_id=LcStepId.KCS, step_name_ru="Kaspersky Container Security", section=LcStepSection.BUILD, order=10),
]

DEPLOY_SECTION_STEPS = [
    StepDefinition(step_id=LcStepId.DEPLOY, step_name_ru="Развёртывание ПО", section=LcStepSection.DEPLOY, order=1, required=True, on_failure=LcOnFailure.ABORT),
]

DAST_SECTION_STEPS = [
    StepDefinition(step_id=LcStepId.AUTOTESTS, step_name_ru="Выполнение автотестов", section=LcStepSection.DAST_AUTOTEST, order=1),
    StepDefinition(step_id=LcStepId.BLACKBOX, step_name_ru="Blackbox", section=LcStepSection.DAST_AUTOTEST, order=2),
    StepDefinition(step_id=LcStepId.OWASP_ZAP, step_name_ru="OWASP ZAP", section=LcStepSection.DAST_AUTOTEST, order=3),
]
```

### 6.3. Member & RBAC — Pydantic v2

```python
class MemberRole(StrEnum):
    OWNER = "owner"             # IT-лидер
    MASTER = "master"           # Руководитель разработки
    DEVELOPER = "developer"     # Разработчик
    TESTER = "tester"           # Тестировщик
    APP_ADMIN = "app_admin"     # Администратор КИТС
    RELEASE_MANAGER = "release_manager"  # Релиз менеджер
    SEC_EXPERT = "sec_expert"   # Эксперт ИБ

class TeamMember(BaseModel):
    user_id: UUID
    role: MemberRole
    project_id: Optional[UUID] = None
    meta_project_id: Optional[UUID] = None
```

### 6.4. Notification — Pydantic v2

```python
class NotificationSeverity(StrEnum):
    INFO = "info"
    CRITICAL = "critical"

class NotificationCategory(StrEnum):
    ACCESS = "access"
    CI_CD = "ci_cd"
    INTEGRATION = "integration_and_infrastructure"
    DATA_TRANSFER = "data_transfer"
    DOCS_SAFETY = "documentation_and_safety"
    WORKSPACES = "workspaces"
    RESOURCES = "recourses"
    OTHER = "other"

class RecipientKind(StrEnum):
    EVERYBODY = "everybody"
    ADMINS = "admins"
    MAINTENANCE = "maintenance_personnel"
    PROJECT_COMMAND = "project_command"
    PERSONAL = "personal"

class DeliveryMethod(StrEnum):
    ALL = "all_channels"
    PUSH = "push"
    EMAIL = "email"

class NotificationCreate(BaseModel):
    severity: NotificationSeverity
    topic: NotificationCategory
    title: str = Field(..., max_length=500)
    description: str | None = Field(None, max_length=4000)
    link: str | None = Field(None, max_length=2000)
    recipient_kind: RecipientKind
    team_id: UUID | None = None
    user_ids: list[UUID] | None = None
    delivery_method: DeliveryMethod
    priority: int = 3  # 1=HIGHEST..5=LOWEST
    started_at: datetime | None = None
    expired_at: datetime | None = None
    infinite: bool = False
```

### 6.5. TypeScript Interfaces (для MUI X Data Grid)

```typescript
// === Domain Map ===
type ProjectLevel = 0 | 1 | 2 | 'grouping';

interface ProjectKindInfo {
  code: string;
  label: string;
  level: ProjectLevel;
}

const PROJECT_KINDS: Record<string, ProjectKindInfo> = {
  universal_app:       { code: 'universal_app',       label: 'Линкор (Универсальное)',                      level: 1 },
  ppod:               { code: 'ppod',                  label: 'Крейсер (Интегрированное)',                  level: 1 },
  service_subsystem:  { code: 'service_subsystem',     label: 'Космостанция (Сервисная подсистема)',        level: 1 },
  service:             { code: 'service',              label: 'Гиперпривод (Сервисное приложение)',          level: 1 },
  ehd:                { code: 'ehd',                   label: 'Гиперион (ЕХД)',                             level: 1 },
  legacy:             { code: 'legacy',                label: 'Реликт (Унаследованное — ЕИСПД)',            level: 1 },
  pis:                { code: 'pis',                   label: 'Навигатор (ПИС)',                             level: 1 },
  library:            { code: 'library',               label: 'Модуль (Библиотека)',                         level: 0 },
  report_templates:   { code: 'report_templates',      label: 'Астрокарта (Шаблон отчета)',                  level: 0 },
  configuration_templates: { code: 'configuration_templates', label: 'Орбиты (Шаблоны конфигурации)',         level: 0 },
  universal_lib:      { code: 'universal_lib',          label: 'Карго (Универсальная библиотека)',            level: 0 },
  data_transfer_lib:  { code: 'data_transfer_lib',     label: 'Буксир (Вспомогательное пространство)',       level: 0 },
  meta_project:       { code: 'meta_project',           label: 'Вселенная (Группирующее пространство)',      level: 2 },
};

// === Table Column Definitions (MUI X Data Grid) ===
interface GridColumn {
  field: string;
  headerName: string;
  width: number;
  type: 'string' | 'number' | 'date' | 'singleSelect' | 'actions';
  sortable: boolean;
  filterable: boolean;
  valueOptions?: string[];
  renderCell?: string; // 'badge', 'link', 'datetime', 'progress', 'avatar'
}

const PROJECT_LIST_COLUMNS: GridColumn[] = [
  { field: 'name',           headerName: 'Название',           width: 250, type: 'string',  sortable: true,  filterable: true,  renderCell: 'link' },
  { field: 'code',           headerName: 'Код',                width: 180, type: 'string',  sortable: false, filterable: false },
  { field: 'kind',           headerName: 'Тип',                width: 220, type: 'singleSelect', sortable: true, filterable: true, renderCell: 'badge', valueOptions: Object.keys(PROJECT_KINDS) },
  { field: 'group_name',     headerName: 'Группа',             width: 180, type: 'string',  sortable: false, filterable: false },
  { field: 'its_group_name', headerName: 'Капсула (Базовый уровень)', width: 200, type: 'string', sortable: false, filterable: false },
  { field: 'created_at',     headerName: 'Дата создания',      width: 160, type: 'date',    sortable: true,  filterable: false, renderCell: 'datetime' },
  { field: 'release_tag',    headerName: 'Релиз',              width: 140, type: 'string',  sortable: false, filterable: false, renderCell: 'link' },
  { field: 'release_date',   headerName: 'Дата релиза',        width: 160, type: 'date',    sortable: true,  filterable: false, renderCell: 'datetime' },
];

const BUILD_LIST_COLUMNS: GridColumn[] = [
  { field: 'id',             headerName: 'Идентификатор',      width: 140, type: 'string',  sortable: false, filterable: false },
  { field: 'title',          headerName: 'Название',           width: 220, type: 'string',  sortable: true,  filterable: true,  renderCell: 'link' },
  { field: 'status',         headerName: 'Статус сборки',      width: 140, type: 'singleSelect', sortable: true, filterable: true, renderCell: 'badge', valueOptions: ['pending','running','success','failed','aborted'] },
  { field: 'domain',         headerName: 'Домен',              width: 140, type: 'string',  sortable: false, filterable: false },
  { field: 'commit',         headerName: 'Коммит',             width: 140, type: 'string',  sortable: false, filterable: false },
  { field: 'data',           headerName: 'Данные',             width: 100, type: 'string',  sortable: false, filterable: false },
];

const DEPLOYMENT_LIST_COLUMNS: GridColumn[] = [
  { field: 'segment',        headerName: 'Сегмент',            width: 100, type: 'singleSelect', sortable: true, filterable: false, renderCell: 'badge' },
  { field: 'status',         headerName: 'Статус',             width: 140, type: 'singleSelect', sortable: true, filterable: true, renderCell: 'badge' },
  { field: 'domain',         headerName: 'Домен',              width: 180, type: 'string',  sortable: true,  filterable: true,  renderCell: 'link' },
  { field: 'label',          headerName: 'Label',              width: 140, type: 'string',  sortable: false, filterable: false },
  { field: 'build_tag',      headerName: 'Тег сборки',         width: 140, type: 'string',  sortable: false, filterable: false },
  { field: 'runtime_name',   headerName: 'Среда исполнения',   width: 160, type: 'string',  sortable: false, filterable: false },
  { field: 'config_name',    headerName: 'Конфигурация',       width: 160, type: 'string',  sortable: false, filterable: false },
  { field: 'canary',         headerName: 'Canary',             width: 110, type: 'string',  sortable: false, filterable: false, renderCell: 'badge' },
];

// === Status Badge Color Maps ===
const BUILD_STATUS_COLORS: Record<string, string> = {
  pending:  'default', running:  'processing',  success:  'success',  failed:  'error',  aborted: 'warning'
};

const DEPLOYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'default',  running: 'processing',  success: 'success',  failed: 'error',
  stopped: 'warning',  deleted: 'default',  launched: 'success',  warning: 'warning'
};

const INTEGRATION_STATUS_COLORS: Record<string, string> = {
  pending: 'default',  running: 'processing',  failed: 'error',  success: 'success',  not_active: 'default'
};

const RELEASE_STATUS_COLORS: Record<string, string> = {
  draft: 'default',  developing: 'processing',  developed: 'success',  testing: 'processing',
  tested: 'success',  testing_failed: 'error',  production: 'success',  archived: 'default',
  canceled: 'warning',  build_failed_dev: 'error',  build_deploy_failed_dev: 'error',
  build_deploy_failed_test: 'error',  build_deploy_failed_prod: 'error',
  transferred_to_test: 'processing',  transferred_to_prod: 'processing',  deleting: 'error'
};
```

### 6.6. LC Steps — TypeScript MUI X Accordion Table

```typescript
interface LcStepRow {
  id: string;
  stepId: LcStepId;
  name: string;
  section: 'build' | 'deploy' | 'dast';
  required: boolean;
  enabled: boolean;
  onFailure: 'continue' | 'abort';
  order: number;
}

const DEFAULT_LC_STEPS: Record<string, LcStepRow[]> = {
  build: [
    { id: '1',  stepId: 'build',              name: 'Сборка',                          section: 'build', required: true,  enabled: true,  onFailure: 'continue', order: 1 },
    { id: '2',  stepId: 'unit_tests',         name: 'Юнит-тестирование',                section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 2 },
    { id: '3',  stepId: 'docs_generation',    name: 'Генерация документации',           section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 3 },
    { id: '4',  stepId: 'sonar_qube',         name: 'SonarQube',                        section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 4 },
    { id: '5',  stepId: 'ptai',               name: 'PTAI',                             section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 5 },
    { id: '6',  stepId: 'solar_appscreener',  name: 'Solar Appscreener',                 section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 6 },
    { id: '7',  stepId: 'trivy',              name: 'Trivy',                            section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 7 },
    { id: '8',  stepId: 'codescoring',        name: 'CodeScoring',                      section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 8 },
    { id: '9',  stepId: 'sandbox',            name: 'Sandbox',                          section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 9 },
    { id: '10', stepId: 'kcs',                name: 'Kaspersky Container Security',     section: 'build', required: false, enabled: true,  onFailure: 'continue', order: 10 },
  ],
  deploy: [
    { id: '11', stepId: 'deploy',             name: 'Развёртывание ПО',                  section: 'deploy', required: true,  enabled: true,  onFailure: 'abort',    order: 1 },
  ],
  dast: [
    { id: '12', stepId: 'autotests',          name: 'Выполнение автотестов',             section: 'dast',   required: false, enabled: true,  onFailure: 'continue', order: 1 },
    { id: '13', stepId: 'blackbox',           name: 'Blackbox',                          section: 'dast',   required: false, enabled: true,  onFailure: 'continue', order: 2 },
    { id: '14', stepId: 'owasp_zap',          name: 'OWASP ZAP',                         section: 'dast',   required: false, enabled: true,  onFailure: 'continue', order: 3 },
  ],
};
```

---

## 7. Карта навигации (React Router Paths)

| Путь | Экран |
|------|-------|
| `/` | Главная (Обзор) |
| `/projects` | Реестр приложений |
| `/projects/new` | Создание приложения |
| `/projects/:id` | Карточка приложения (Инфо) |
| `/projects/:id/settings` | Настройки приложения |
| `/projects/:id/builds` | Вкладка Сборки |
| `/projects/:id/releases` | Вкладка Релизы |
| `/projects/:id/team` | Вкладка Команда |
| `/projects/:id/quotas` | Вкладка Квотирование |
| `/meta_projects` | Реестр суперпроектов |
| `/meta_projects/:id` | Карточка суперпроекта |
| `/meta_projects/:id/nesting` | Формирование вложенности |
| `/services` | Сервисы |
| `/services/:id` | Карточка сервиса |
| `/pipelines` | Список конвейеров |
| `/runtimes` | Список сред исполнения |
| `/integrations` | Интеграции |
| `/integrations/:id` | Детали интеграции |
| `/notifications` | Таблица оповещений |
| `/notifications/new/team` | Новое оповещение (Команда) |
| `/notifications/new/critical` | Новое оповещение (Критическое) |
| `/settings` | Настройки портала |
| `/users` | Пользователи |
| `/sandbox` | Sandbox |
| `/releases` | Все релизы |
| `/deployments` | Все развертывания |
| `/metrics` | Показатели конвейера |
| `/management` | Управление (массовые операции) |
| `/validities` | Сроки действия |
| `/changelog` | Changelog |
| `/feedback` | Обратная связь |
| `/guides` | Справки |
| `/templates` | Шаблоны |
| `/brokers` | Брокеры сообщений |
| `/release_types` | Типы релизов |
| `/packages` | Пакеты |
| `/artifacts` | Загрузка артефактов |
| `/security` | Security events |
| `/reports` | Отчетность ПУ |
| `/login` | Страница входа |

---

## 8. SVG-иконки (из sprite)

Извлечено **~80 SVG-иконок** из `__SVG_SPRITE_NODE__`. Ключевые:

**Инфраструктура:** abac, findings, artifactory, ansible, allure, sonarqube, gitlab, jira, cbr-logo, security-shield, confluence, nexus, vault, sfera, openshift-vm, deckhouse, тср, universal

**Статусы:** статусные маркеры (success, failed, pending, running, warning), стрелки навигации

**Действия:** create, edit, delete, restart, stop, start, deploy, build, release, download, upload, search, filter

**Навигация:** sidebar иконки для каждого пункта меню (приложения, сервисы, настройки, пользователи, ...)

Файлы сохранены в: `D:\cosmo\cosmo-frontend-to-scrape\_icons\` (~80 .svg файлов + `_sprite.svg`)

---

## 9. Валидационные правила (из JS бандла)

| Правило | Паттерн / Ограничение |
|---------|----------------------|
| Код проекта | `^[a-zA-Z][a-zA-Z0-9\-]*$`, max 45 символов, lowercase |
| URL эндпоинта | `^https?://.*$` |
| Selenoid URL | Custom regex |
| Тег релиза | SemVer-like pattern |
| Телефон | Custom regex |
| Имя каталога | Custom pattern |
| Env variable key | `^[A-Z][A-Z0-9_]*$` (uppercase + numbers + underscore) |
| Domain | max 8 символов, lowercase alphanumeric + hyphen |
| Notification title | max 500 символов |
| Notification description | max 4000 символов |
| Notification link | max 2000 символов |
| Приоритет запуска | 21..100 (ppod/app), 1..20 (service_subsystem) |
| Reserved env vars | 80+ PPOD_/WP_/WS_/SFAS_ префиксов запрещены для пользовательских переменных |

---

## 10. 64 datx-jsonapi модели (из JS бандла)

```text
ApplicationPipeline, ApplicationRuntime, Attachment, BrokerCluster, BrokerTopic,
Build, BuildDocumentation, CanarySettings, ChangelogVersion, CommonDeployment,
CommonNotifications, CommonProject, Config, Contact, ConveyorMetrics, CoreService,
Deployment, DeploymentTest, EnvsProfile, ExpectationMetric, External, Feedback,
Group, Guide, InnovationLabel, Integration, ITSGroup, LdapUser, Limit,
ManagementEvent, Member, MessageBroker, MetaProject, MetaProjectBuild,
MetaProjectDeployment, MetaProjectEnvsProfile, MetaProjectGroupMember,
MetaProjectGroupRelease, MetaProjectRelease, Metric, MzpDelivery, MzpTransfer,
Notification, Order, Package, Password, Pipeline, ProcessingErrors, Project,
ProjectComposition, ProjectCompositionBuild, ProjectCompositionRelease,
ProjectMetrics, ProjectSubProjectDeployment, Release, ReleaseDetailsItem,
ReleaseEvent, ReleaseRoute, ReleaseType, Resource, Runtime, Sandbox,
SandboxTransaction, SanityTest, SchedulerTask, SecurityEvents, Service,
ServiceHealth, SouTemplate, SourceTemplate, SubMetaProjectBuild,
SubMetaProjectDeployment, SubMetaProjectRelease, SubProject, SubProjectBuild,
SubProjectDeployment, SubProjectRelease, Template, TopicConnection,
TopicPermission, Transfer, TransferStatus, TsrStand, User, UserLog,
UserRoleAssignment, Validity, ValidityCategory, VM, VraCatalogItem, WASVM, Webhook
```

---

## 11. MUI X Data Grid → Cosmoport 2.0 рекомендации

### Миграция с Ant Design Table на MUI X Data Grid:

| Ant Design Pattern | MUI X Equivalent |
|-------------------|------------------|
| `<Table>` | `<DataGridPro>` |
| `pagination` | `paginationModel` |
| `sorter` | `sortModel` |
| `filters` | `filterModel` |
| `expandedRowRender` | `getDetailPanelContent` |
| `rowSelection` | `checkboxSelection` + `selectionModel` |
| `columns[].render` → badges/links | `renderCell` → MUI `<Chip>`, `<Link>` |
| `columns[].filters` | `valueOptions` + `type: 'singleSelect'` |
| Table actions column | `type: 'actions'` with `getActions` |
| Tree data (children) | `treeData` + `getTreeDataPath` |
| Drag-reorder | `<DataGridPro>` with `rowReordering` |
| Conditional row styling | `getRowClassName` |
| Expand/collapse groups | `rowGroupingModel` |

### Рекомендуемые компоненты для замены Ant Design:

| Ant Design | MUI Replacement |
|-----------|-----------------|
| `<Form>` + `<Form.Item>` | React Hook Form + MUI `<TextField>`, `<Select>`, `<Switch>` |
| `<Modal>` | MUI `<Dialog>` |
| `<Tabs>` | MUI `<Tabs>` + `<TabPanel>` |
| `<Button>` | MUI `<Button>` |
| `<Select mode="multiple">` | MUI `<Autocomplete multiple>` |
| `<Collapse>` | MUI `<Accordion>` |
| `<Tooltip>` | MUI `<Tooltip>` |
| `<Badge>` | MUI `<Chip>` |
| `<Tag>` | MUI `<Chip>` |
| `<Menu>` | MUI `<Drawer>` + `<ListItemButton>` |
| `<Breadcrumb>` | MUI `<Breadcrumbs>` |
| `<Spin>` | MUI `<CircularProgress>` / `<Skeleton>` |
| `<Popconfirm>` | MUI `<Dialog>` + `<DialogActions>` |