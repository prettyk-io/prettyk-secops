# 🔴 Задание для Boss: AUTH-SPIKE — Better Auth Production Backend

> **Эпик:** `AUTH-SPIKE` — Production Auth Backend: развернуть Better Auth, подключить к Vite-фронту  
> **Роль:** Boss (Архитектура, Backend, Сравнение с Keycloak)  
> **Срок:** ~4h  
> **Контекст:** Research Keeper (24 авг), backlog §AUTH-SPIKE  
> **Важно:** текущий `profileStore.ts` — UI PoC на localStorage. Не расширяем, не углубляем. Подключаем реальный backend.

---

## 🎯 Твоя задача

Развернуть **Better Auth** как production auth backend и подключить к нашему Vite-фронту. Параллельно сравнить с развёрнутым **Keycloak**. К концу дня — **принятое решение**: что используем для production.

---

## 📋 Нарезка задач

### Волна 1 — Better Auth Standalone

#### 1. `SPIKE-B-1: Развернуть Better Auth service`

- Установить Better Auth в `cosmo/` или отдельном сервисе.
- Настроить Postgres.
- Email/password auth, sessions, admin plugin.
- Создать первого admin-пользователя через CLI.
- Миграции применены, сервис отвечает.

**Приёмка:** `curl /api/auth/get-session` возвращает `null` (нет сессии). `curl /api/auth/sign-in/email` с правильным телом возвращает cookies.

#### 2. `SPIKE-B-2: Подключить Vite-фронт к Better Auth`

- Заменить заглушку `auth.ts` (readSession/roleOf/capsForRole/displayNameOf) на вызовы Better Auth client.
- `ShellChrome` при старте вызывает `authClient.getSession()`.
- Профиль (имя/email/роль) из серверной сессии, не из localStorage.
- Logout через `authClient.signOut()`.

**Приёмка:** логин → имя в хедере из серверной сессии. F5 → сессия сохранена. Logout → хедер пустой.

#### 3. `SPIKE-B-3: Preferences через User Metadata`

- Сохранять theme/font/locale через Better Auth user metadata.
- При старте читать metadata → восстанавливать preferences.
- Profile Drawer → Appearance tab → сохраняет в metadata.

**Приёмка:** сменил тему в Drawer → F5 → тема сохранилась.

#### 4. `SPIKE-B-4: Roles → Capabilities Mapping`

- Настроить роли в Better Auth: `admin_sec`, `admin_service`, `sec_expert`, `user`.
- В конфиге Better Auth (или middleware) добавить маппинг ролей → PrettyK `UserCapability[]`.
- Фронт читает capabilities из кастомного поля сессии (customSession plugin).

**Приёмка:** пользователь с ролью `admin_sec` → массив capabilities содержит `admin:access`, `checks:create`... UI гварды работают.

#### 5. `SPIKE-B-5: PAT / API Keys через API Key Plugin`

- Включить `@better-auth/api-key` plugin.
- Создать конфигурацию API key: prefix `pk_live_`, scopes = capabilities.
- Frontend: создание токена → серверный `createApiKey()`.
- Frontend: список токенов → `listApiKeys()`.
- Frontend: отзыв → `deleteApiKey()`.
- Верификация токена через `verifyApiKey()`.

**Приёмка:** создал токен в Drawer → получил `pk_live_<hex>` → отобразился в таблице → отозвал → исчез.

#### 6. `SPIKE-B-6: React Admin authProvider Bridge`

- Заменить текущий `adminAuthProvider.ts` (заглушка на localStorage) на вызовы Better Auth.
- `login()` → Better Auth email/password sign-in.
- `logout()` → Better Auth sign-out.
- `checkAuth()` → `getSession()`.
- `checkError()` → HTTP 401 → logout.
- `getIdentity()` → профиль из сессии.
- `getPermissions()` → `UserCapability[]` из кастомного поля сессии.

**Приёмка:** открыл `#/admin` → запросил логин → вошёл → Admin загрузился с правильными правами.

---

### Волна 2 — Keycloak Comparison

#### 7. `SPIKE-B-7: Развернуть Keycloak`

- Docker Compose: Keycloak + PostgreSQL.
- Создать realm `prettyk-dev`.
- Создать client `prettyk-editor` (public, PKCE).
- Создать роли: `admin_sec`, `admin_service`, `sec_expert`, `user`.
- Создать тестовых пользователей.

**Приёмка:** Keycloak Admin Console открывается, пользователи созданы.

#### 8. `SPIKE-B-8: Keycloak + Vite Frontend`

- Установить `keycloak-js`.
- `keycloak.init({ onLoad: 'login-required' })`.
- `keycloak.loadUserProfile()` → профиль.
- `keycloak.hasRealmRole('admin_sec')` → capabilities.
- Logout через `keycloak.logout()`.

**Приёмка:** открыл приложение → редирект на Keycloak login → вошёл → профиль в хедере.

#### 9. `SPIKE-B-9: Keycloak React Admin`

- `authProvider.login()` → Keycloak login.
- `authProvider.checkAuth()` → `keycloak.authenticated`.
- `authProvider.getIdentity()` → `keycloak.loadUserProfile()`.
- `authProvider.getPermissions()` → маппинг realm roles.

**Приёмка:** Admin работает через Keycloak auth.

---

### Волна 3 — Сравнительный отчёт

#### 10. `SPIKE-B-10: Better Auth vs Keycloak Comparison Report`

Задокументировать в `docs/spike/2026-08-25-auth-comparison.md`:

| Критерий | Better Auth | Keycloak |
|---|---|---|
| Время развёртывания | | |
| Сложность настройки | | |
| Интеграция с Vite | | |
| Профиль / Preferences | | |
| RBAC → Capabilities | | |
| PAT / API Keys | | |
| Admin панель | | |
| Реакция на F5 (сохранение сессии) | | |
| Bundle size impact | | |
| Пригодность для Pure Box | | |
| Пригодность для Enterprise (LDAP/SAML) | | |
| Developer Experience (DX) | | |

**Рекомендация:** выбрать один backend для production-миграции.

---

## 🧪 Критерии приёмки (DoD)

- Better Auth развёрнут локально, login/logout через сервер.
- Имя пользователя в `ShellChrome` из серверной сессии, не из localStorage.
- Preferences (тема/шрифт/язык) сохраняются в Better Auth metadata, переживают F5.
- Роли Better Auth маппятся на `UserCapability[]`.
- PAT создаётся/отзывается через API Key plugin.
- React Admin `authProvider` работает с Better Auth.
- Keycloak развёрнут и альтернативно проверен.
- Сравнительный отчёт написан, решение принято.

## ❌ Что НЕ делаем

- ❌ Не расширяем `profileStore.ts` / `tokenEngine.ts` — они в статусе view-model.
- ❌ Не добавляем OIDC/SAML/LDAP к Better Auth.
- ❌ Не настраиваем production-окружение (только локальный spike).
- ❌ Не мигрируем существующих пользователей из `localStorage`.
- ❌ Не пишем production auth до принятия решения.