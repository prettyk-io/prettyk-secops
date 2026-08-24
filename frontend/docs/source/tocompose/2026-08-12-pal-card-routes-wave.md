# PAL — маршруты карточки + Команда/Сборки/Релизы (факт UI)
<!-- compose-request_44 -->


> **Не CANON.** Кейс: `cosmo-SonarQube Checks` · uuid `eff04327-c288-466c-9c8a-9896437eebac`.  
> Дампы: `Space\Temp\pal-{members,builds,releases,info,quota}.json`.

## Боковое меню → URL

| Пункт UI | Path |
|---|---|
| (корень карточки) | `/projects/{uuid}` |
| Информация | `/projects/{uuid}/info` |
| Сборки | `/projects/{uuid}/builds` |
| Релизы | `/projects/{uuid}/releases` |
| Команда | `/projects/{uuid}/members` |
| Квотирование | `/projects/{uuid}/quota` |
| Настройки | `/projects/{uuid}/settings` |

Клики по тексту на `/settings` **не** меняют route — нужны эти path.

## Команда (`/members`)

Заголовок: **Участники**.  
Колонки: ПОЛЬЗОВАТЕЛЬ · ФИО ПОЛЬЗОВАТЕЛЯ · РОЛЬ · РЕГИСТРАЦИЯ · ПОСЛЕДНИЙ ВХОД.  
CTA: **Добавление участников**.  
На этой карточке: «Нет данных» (пустой состав; видимость списка apps при этом у НШР есть — права шире, чем membership строки).

## Сборки (`/builds`)

Колонки: НАЗНАЧЕНИЕ · КОММИТ · СТАТУС · ДОМЕН · СОЗДАНИЕ · МЕСТО СОХРАНЕНИЯ · ПОСЛЕДНИЙ ЗАПУСК.  
Фильтры/кнопки: Защищенные · Активные.  
Пример строки: SonarQube Test · main · … · домен SonarQube · даты.

## Релизы (`/releases`)

Колонки: НАЗВАНИЕ · СТАТУС · ДАТА ВЫПУСКА · ТИП РЕЛИЗА.  
На карточке: нет данных.

## Информация (`/info`)

Общие данные: код `cosmo-sonarqube-checks`, тип **Линкор (Универсальное)**, профили Да, ПБП Да, URL стенда, приоритет запуска, языки (go/shell/makefile), вложенные пространства / вложения / контакты.

## Квотирование (`/quota`)

Блоки (headings): ВМ/среды · Хранилище · **Защита от автоматического удаления артефактов сборок** · **Отчеты автотестирования** · профили env · Gitlab.  
Связь с болью релиза/артефактов — не доказывать происхождение файлов ZAP, но UI явно знает «отчёты автотестов» и retention артефактов сборок.

## Оповещения — хвост

Таблица на `/settings/notifications` есть; кнопка с текстом «Создать» **не найдена** кликером (иконка/другое label — later). Адресат **Команда** в строках таблицы подтверждён ранее.

## След в скелет

- `TeamMember { user, fio, role, registeredAt, lastLogin }` + action add  
- `Build { purpose, commit, status, domain, createdAt, storage, lastRun }`  
- `Release { name, status, releasedAt, type }`  
- `ProjectInfo` (code, type enum включая Линкор/Крейсер/…)  
- `QuotaBucket` (name, value, status) + autotest reports / build artifact retention
