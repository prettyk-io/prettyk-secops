# ⚡ Задание для Flash: AUTH-PROF (Track 2: UI, Profile Drawer & Header Sync)

> **Эпик:** `AUTH-PROF` — Единая система профилей пользователей, Granular RBAC & PAT-токены  
> **Роль:** Flash (UI Components, Profile Drawer, Header Integration, Reactive Sync)  
> **Срок:** ~3.5h  
> **Контекст:** Исследование [`docs/research/2026-08-24-user-profiles-and-rbac.md`](docs/research/2026-08-24-user-profiles-and-rbac.md)

---

## 🎯 Твоя задача

Создать стильный Cyber Glass компонент **Profile Drawer** (боковая шторка профиля) и связать его с хедером (`ShellChrome`) во всех разделах приложения. Пользователь в 1 клик на свой бейдж в правом углу открывает настройки профиля, меняет имя/шрифт/тему и управляет API-токенами.

---

## 📋 Нарезка задач

### 1. `F-1: User Profile Drawer Component` (`cosmo/src/shell/ProfileDrawer.tsx`)
- Боковая шторка (MUI Drawer / Cyber Dark Glass) с 3 вкладками:
  - **Вкладка 1: Профиль (General):**
    - Аватар с градиентом и авто-инициалами (напр. `[ АИ ]`).
    - Редактирование: Имя пользователя, Email, Отдел.
    - Бейдж роли (`Администратор ИБ` и др.) + список активных Capabilities (зелёные бейджи).
    - Кнопка «Сохранить изменения».
  - **Вкладка 2: Внешний вид (Appearance):**
    - Селектор темы: `Meta Dark` / `Meta Light`.
    - Селектор шрифта: `Golos UI (CANON)` / `PT Astra Sans (ГОСТ)` / `Inter (DEFAULT)`.
    - Селектор языка: `Русский` / `English`.
  - **Вкладка 3: API Токены (Access Tokens):**
    - Таблица токенов: Название, Маска `pk_live_****3a8f`, Скоупы, Дата создания, Последнее использование, Кнопка «Отозвать» (Revoke).
    - Кнопка «+ Создать токен доступа».
    - Модалка создания токена: имя + выбор скоупов + срок (30 / 90 дней / бессрочно).
    - Одноразовый баннер с сырым токеном и кнопкой «Скопировать в буфер».

### 2. `F-2: Header Badge & Cross-Surface Wiring` (`cosmo/src/shell/ShellChrome.tsx`, `AppShell.tsx`)
- В правом верхнем углу хедера клик по бейджу профиля (`● Администратор`) открывает `ProfileDrawer`.
- Шторка доступна на всех поверхностях (`#/home`, `#/admin`, `#/studio-v2`, `#/dashboard`, `#/control`).
- Смена имени или внешнего вида в Drawer мгновенно обновляет хедер и тему без перезагрузки страницы (`F5`).

### 3. `F-3: English & Russian Localization Sync` (`cosmo/src/locales/ru.ts`, `en.ts`)
- Добавить секцию `profile` в `ru.ts` и `en.ts`:
  - `profile.title`, `profile.general`, `profile.appearance`, `profile.tokens`, `profile.createToken`, `profile.revokeToken`, `profile.tokenCopied`, `profile.saveSuccess`.
- При переключении языка в профиле все надписи мгновенно переключаются.

---

## 🧪 Критерии приёмки (DoD)
- `npx tsc --noEmit` — 0 ошибок.
- Клик на имя в хедере открывает шторку.
- Смена имени в шторке → сохранение → имя в хедере сразу обновилось.
- Выпуск токена генерирует `pk_live_...` и добавляет запись в таблицу.
- Переключение темы/шрифта из шторки меняет весь UI.
