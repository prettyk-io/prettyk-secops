# ⚡ Задание для Flash: AUTH-SPIKE — Better Auth Frontend Integration

> **Эпик:** `AUTH-SPIKE` — Production Auth Backend: сохранить UI Profile Drawer, переключить на реальный backend  
> **Роль:** Flash (UI Components, Profile Drawer, Header Sync, Preferences, Locales)  
> **Срок:** ~2.5h  
> **Контекст:** Research Keeper (24 авг), backlog §AUTH-SPIKE  
> **Зависит от:** Boss SPIKE-B-1 (Better Auth развёрнут). Параллельно с Boss SPIKE-B-2…6.

---

## 🎯 Твоя задача

Сохранить текущий **Profile Drawer** и **useProfileStore** как UI-слой, но переключить источник данных с `localStorage` на **серверный Better Auth**. Ты не переписываешь UI — ты меняешь откуда он читает и куда пишет.

---

## 📋 Нарезка задач

### 1. `SPIKE-F-1: Сохранить ProfileDrawer как UI, заменить data source`

**Текущее состояние (что не трогать):**
- `ProfileDrawer.tsx` — 248 lines, 3 вкладки (Profile / Appearance / Tokens), Cyber Dark Glass
- Все визуальные компоненты: аватар с инициалами, TextField, Chip, Select, TokenRow, диалог создания токена, Snackbar
- MUI v7 API (`slotProps.paper`)

**Что изменить:**
- `ProfileDrawer.tsx` — импорт из `useProfileStore` заменить на чтение из Better Auth:
  - `profile.name` → из `authClient.getSession().user.name`
  - `profile.email` → из `authClient.getSession().user.email`
  - `profile.role` → из `authClient.getSession().user.role`
  - `profile.capabilities` → из кастомного поля сессии
  - `profile.preferences` → из `authClient.getSession().user.metadata`
- Сохранение имени/email/dept → `authClient.updateUser()`
- Сохранение preferences → user metadata

**Приёмка:** Profile Drawer открывается и показывает реальные данные из серверной сессии. Смена имени → updateUser → имя в хедере обновилось.

### 2. `SPIKE-F-2: Preferences через Better Auth Metadata`

- Тема (`theme`) → `metadata.theme`
- Шрифт (`font`) → `metadata.font`
- Язык (`locale`) → `metadata.locale`
- При старте: прочитать metadata → применить тему/шрифт/язык.
- При изменении в Drawer: записать в metadata → применить мгновенно.

**Приёмка:** сменил тему в Drawer с Dark на Light → UI переключился → F5 → тема осталась Light.

### 3. `SPIKE-F-3: PAT UI → Better Auth API Key Plugin`

**Текущее (что сохранить):**
- Таблица токенов (TokenRow)
- Диалог создания (Create Token)
- Баннер с сырым токеном и кнопкой Copy
- Маска `pk_live_****3a8f`

**Что изменить:**
- Список токенов → `authClient.apiKey.list()`
- Создание → `authClient.apiKey.create()`:
  - `name` → имя токена
  - `expiresIn` → срок (30/90 дней / null)
  - `metadata` → скоупы как permissions
- Отзыв → `authClient.apiKey.delete()`
- Маска: `pk_live_${key.id.slice(0,4)}****${key.id.slice(-4)}`

**Приёмка:** создал токен → получил `pk_live_<hex>` → баннер с копированием → запись в таблице → отозвал → исчезла.

### 4. `SPIKE-F-4: ShellChrome Header Sync`

- Бейдж профиля (`● Администратор ИБ`) — имя из серверной сессии.
- Клик по бейджу → `openDrawer()`.
- Ховер-анимация (cyan glow) сохраняется.
- После сохранения в Drawer → бейдж обновляется мгновенно (реактивно).

**Приёмка:** сменил имя в Drawer → сохранил → бейдж в хедере обновился без F5.

### 5. `SPIKE-F-5: Locales / i18n через Preferences`

- `cosmo/src/locales/ru.ts` — секция `profile` уже есть ✅
- `cosmo/src/locales/en.ts` — секция `profile` уже есть ✅
- Переключение языка в Drawer → запись в metadata → мгновенное переключение всех строк.
- Не дублировать логику — использовать существующую i18n-систему.

**Приёмка:** сменил язык на English → все надписи в Drawer/Home/Admin переключились → F5 → язык сохранился.

### 6. `SPIKE-F-6: Адаптация adminAuthProvider (помощь Boss)`

- Проверить, что `adminAuthProvider.ts` работает с Better Auth.
- `getIdentity()` → возвращает `{ id, fullName, avatar, email, role, department }`.
- `getPermissions()` → возвращает `UserCapability[]`.
- Если Boss ещё не сделал — сделать заглушку-адаптер к текущему API.

**Приёмка:** открыл `#/admin` → запросил логин → вошёл → Admin загрузился с правильным именем и правами.

---

## 🧪 Критерии приёмки (DoD)

- `tsc --noEmit` — 0 ошибок.
- Profile Drawer показывает данные из серверной сессии, не из localStorage.
- Смена имени в Drawer → мгновенное обновление хедера.
- Preferences (тема/шрифт/язык) сохраняются в metadata, переживают F5.
- PAT создаётся через API Key plugin, отображается в таблице, отзывается.
- Locales переключаются мгновенно при смене языка.
- `#/admin` работает с реальным auth (login → Admin загружается).

## ❌ Что НЕ делаем

- ❌ Не переписываем визуальную часть ProfileDrawer — она уже сдана и принята.
- ❌ Не меняем структуру вкладок (3 таба: Profile, Appearance, Tokens).
- ❌ Не добавляем новые фичи в Drawer (безопасность, аудит, сессии).
- ❌ Не трогаем `useProfileStore` если он не нужен для нового data source.
- ❌ Не ломаем кросс-поверхностную доступность Drawer.