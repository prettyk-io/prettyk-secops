# Cosmoport portal — Wave 1 UI (settings / notifications / projects)
<!-- compose-request_41 -->


> **Не CANON.** Research wave под эпик **PAL**.  
> Стенд: `portal01.dev.stand.cosmo.cbr.ru` · роль НШР.  
> Коннект: skill `portal01-nshr-cdp` (token → CDP bankvm).  
> Сырые дампы: `C:\cursor-buddy\Space\Temp\portal-dom-*.json` / `portal-tab-*.json`.

## Кто в сессии

Nav: **НШР Рубитех · Администратор НШР · Администратор**.  
Title shell: «Портал управления АС „Космопорт“».

## `/projects` — таблица карточек

Заголовок: **Приложения и сервисы**.

Колонки: НАЗВАНИЕ · КОД · ТИП · ГРУППА · КАПСУЛА (БАЗОВЫЙ УРОВЕНЬ) · ДАТА СОЗДАНИЯ · РЕЛИЗ · ДАТА РЕЛИЗА.

Типы в выборке (примеры): Крейсер (Интегрированное) · Вселенная (Группирующее пространство) · Модуль (Библиотека) · Космостанция (Сервисная подсистема) · Гиперпривод (Сервисное приложение).

Глобальное меню: Обзор · Приложения · Сервисы · Управление · Отчетность ПУ · Настройки · Обратная связь · Пользователи.

## `/projects/new` — новое приложение

Поля/блоки: Название · Код · Категория (уровень: нулевой / первый / второй) · Группирующий уровень · Приоритет запуска · Капсула (базовый уровень) · Описание · Интеграция с Confluence · Использовать профили · Публиковать на ПБП · URL · Репозиторий GitLab (создать новый / подключить существующий).  
CTA: Создать · Отменить.

## `/projects/{uuid}/settings` — карточка `cosmo-SonarQube Checks`

Боковое меню карточки: **Информация · Сборки · Релизы · Команда · Квотирование · Настройки**.

### Вкладка Настройки (снято с body)

Секции (заголовки): Общие · JIRA · таймаут развёртываний · ABAC · Статус · категоризация ПИБ · unit-тесты · многопоточная сборка · безопасная передача секретов · автозапуск сборки · передача исходников/бинарей · **Конфигурация жизненного цикла**.

Блоки ЖЦ:

1. **Статический анализ и сборка** — поле **Кастомный пайплайн сборки**; шаги (вкл/обязательность/условие продолжения): Сборка · Юнит-тестирование · Генерация документации · SonarQube · PTAI · Solar Appscreener · Trivy · CodeScoring · Sandbox · Kaspersky Container Security.  
2. **Развертывание** — **Кастомный пайплайн развертывания**; шаг Развёртывание ПО.  
3. **Динамическое тестирование и автотесты** — Выполнение автотестов · **Blackbox** · **OWASP scanner**.  
4. **Мониторинг** / инициализация исходников — в headings.

### ЖЦ SoT из сети (harness `browser-hands-remote`, 2026-08-12)

Карточка: `Проверка релиза 14.1.1` / `dfd-667` · uuid `4d1113fd-…`.

**Ключ:** `GET /api/projects/{uuid}?include=newest_lc_space_instance_configs,newest_lc_space_default_configs`  
→ `included[]` type **`lcSpaceDefaultConfig`** (на стенде пришли default; instance пусто/не в include count).

| # | stepId | stepName | enabled | required | onFailure |
|---|---|---|---|---|---|
| 1 | `build` | Сборка | ✓ | ✓ | failed |
| 2 | `unit_tests` | Юнит-тестирование | ✓ | | |
| 3 | `docs_generation` | Генерация документации | ✓ | | |
| 4 | `sonar_qube` | SonarQube | ✓ | | |
| 5 | `ptai` | PTAI | ✓ | | |
| 6 | `solar_appscreener` | Solar Appscreener | ✓ | | |
| 7 | `trivy` | Trivy | ✓ | | |
| 8 | `codescoring` | CodeScoring | ✓ | | |
| 9 | `sandbox` | Sandbox | ✓ | | |
| 10 | `kcs` | Kaspersky Container Security | ✗ | | failed |
| 11 | `deployment` | Развёртывание ПО | ✓ | ✓ | failed |
| 12 | `autotests` | Выполнение автотестов | ✓ | | |
| 13 | `blackbox` | Blackbox | ✓ | | |
| 14 | `owasp_dast` | OWASP scanner | ✓ | | |

Соседний конвейер при открытии Настроек: `/integrations` · `/pipelines?include=application_pipeline` · `/resources` · `/runtimes` · `/brokers` · `/env_profiles` (+ notification noise).  
Дампы: `Space/Temp/pal-lc-body.json`, `pal-lc-pain.json`, `pal-settings-walk.json`. Skills: `browser-hands-remote` (всё вместе: traffic · ax · CDP).

Кнопки: много «Сохранить» · Заказать функцию/конвейер/среду/брокер · Создать тему · Подключиться к теме · Заказать ВМ · Добавить профиль · Экспорт · Архивировать · Удалить.

### Боковое меню (клики)

Файлы: `Space\Temp\portal-tab-*.json`.  
**Команда** — клик ок. **Информация** — кликер один раз сматчил весь блок меню (уточнить селектор later). Сборки / Релизы / Квотирование — клик ок.

## Глобальные `/settings/*` — SPA + net (2026-08-12)

Сначала раскрыть submenu **Настройки**, иначе детей нет в DOM. Клики sidebar → API:

| Вкладка | path | XHR |
|---|---|---|
| Общие | `/settings/common` | (кэш / без нового api в окне) |
| Интеграции | `/settings/core-services` | `GET /api/core_services` |
| Сроки действия | `/settings/validities` | `GET /api/validities/categories` · `GET /api/validities?…` |
| Смена паролей ТУЗ | `/settings/passwords` | `GET /api/services?include=resources` · `GET /api/projects/passwords_info?…` |
| Показатели назначения | `/settings/metrics` | `GET /api/metrics` (+ settings/all noise) |
| Оповещения | `/settings/notifications` | `GET /api/common_notifications?…` |
| Метки «Новое» | `/settings/labels-new` | `GET /api/innovation_labels?…` |

## `/settings/notifications` — оповещения

Таблица: ТИП ОПОВЕЩЕНИЯ · ЗАГОЛОВОК · АДРЕСАТЫ · ДАТА НАЧАЛА · ДАТА ОКОНЧАНИЯ · ВКЛЮЧЕНО.

Адресаты в строках: **Все пользователи** · **Персональное** · **Команда** (подтверждает опцию «Команда» в адресатах).

### Create (снято 2026-08-12)

Кнопка: не ant `+`, а `svg-icon-create` / tippy **«Создать оповещение»** (справа от поиска).  
Модалка **«Создание оповещения»** (не отдельный URL; `/create` и `/new` → 404).

Поля в модалке:

| Поле | UI |
|---|---|
| Тип оповещения | select: **Критические оповещения** · **Информационные оповещения** |
| Заголовок | text («Введите содержание») |
| Текст оповещения | («Введите описание») |
| Адресаты | только при **Информационные**: Все пользователи · Только администраторы · Эксплуатационный персонал · **Команда** · Персональное |
| Способ доставки | только при **Информационные**: В GUI + отправка по email · только в GUI (пуш-уведомление в ПУ) · только отправка по email |
| **Приложение** + **Команда** | появляются когда Адресаты = **Команда** |

### Адресаты = Команда (целевое, 2026-08-12)

**Приложение** — список карточек `Название — код` (примеры: `Проверка релиза 14.1.1 — dfd-667`, `cosmo-sod-portl-tst — cosmo-sod`, уровни 0/1/2…).

**Команда** (второй select) — **не** ФИО, а **роли/охваты**:

- IT-лидер · Руководитель разработки · Разработчик · Тестировщик · Администратор КИТС · Релиз менеджер · **Эксперт ИБ** · Все участники проекта

Дамп: `Space\Temp\pal-team-dig.json` · скрины `pal-app-dd.png` / `pal-team-dd.png`.  
Harness: `cdp/dig-notify-team.mjs` (in-place, без nav).
| Включить отображение / рамки дат | checkbox + date |
| CTA | Отменить · Сохранить |

Условность: выбрали **Критические** → поля Адресаты/Способ доставки пропадают. **Информационные** → оба select снова. Owner-скрин адресатов + CDP `pal-notify-dd1.*`.  
CDP note: leftover `Emulation` 1920 ломал клик; align к `outerWidth`. Create = `svg-icon-create`.

## След в скелет (PAL-3)

| UI | Сущность |
|---|---|
| строка `/projects` | Project (name, code, type, group, capsule, release meta) |
| `/projects/new` | ProjectCreate draft + gitlab link mode |
| settings ЖЦ | LcStep { name, enabled, required?, onError } + CustomBuildPipeline / CustomDeployPipeline paths |
| settings side | Team · Builds · Releases · Quotas · Info |
| notifications row | NotificationRule { type, title, audience: all\|personal\|team, window, enabled } |

## Коннект (заметка агенту)

VMware Shared Folders к Flush с VM в этот момент **не** открывался (`сеть не найдена`). Рабочий транспорт файлов: **scp** host↔bankvm → `E:\Infra\password-auth\`. Skill `portal01-nshr-cdp` обновлён.
