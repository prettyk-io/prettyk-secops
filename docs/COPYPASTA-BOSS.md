# 🔴 Задание для Boss: AUTH-PROF (Track 1: Core Engine & React Admin Bridge)

> **Эпик:** `AUTH-PROF` — Единая система профилей пользователей, Granular RBAC & PAT-токены  
> **Роль:** Boss (Архитектура, Domain Store, authProvider Bridge, Token Engine)  
> **Срок:** ~3.5h  
> **Контекст:** Исследование [`docs/research/2026-08-24-user-profiles-and-rbac.md`](docs/research/2026-08-24-user-profiles-and-rbac.md)

---

## 🎯 Твоя задача

Построить фундамент профилей пользователей и шлюз авторизации для React Admin (forward-compatible с будущим React Admin Enterprise Edition `ra-rbac` за €145/мес). Никаких хардкодных строк ролей — только типизированный контракт и чистый стор.

---

## 📋 Нарезка задач

### 1. `B-1: Domain Models & Unified Profile Store` (`cosmo/src/auth/profileStore.ts`)
- **Контракт:** Типы `UserProfile`, `UserCapability`, `UserPreferences`, `PersonalAccessToken` (из research doc).
- **Матрица Capabilities:** Функция вычисления прав `computeCapabilities(role: LabRole): UserCapability[]`.
  - `admin_sec` → `['admin:access', 'control:access', 'checks:create', 'checks:import', 'checks:delete', 'fuzzer:execute', 'policies:manage', 'retention:clean', 'tokens:manage']`
  - `sec_expert` → `['checks:create', 'checks:import', 'fuzzer:execute', 'tokens:manage']`
  - `admin_service` → `['control:access', 'retention:clean', 'tokens:manage']`
  - `user` → `['checks:create']`
- **Store (`useUserProfile`):**
  - Чтение текущего профиля из `localStorage` (`pk.user.profile.v1`) с fallback на сессию.
  - Методы: `getProfile()`, `updateProfile(patch)`, `updatePreferences(prefs)`, `hasCapability(cap)`.
  - Реактивное уведомление слушателей (через Zustand или CustomEvent) без перезагрузки страницы.

### 2. `B-2: Forward-Compatible React Admin authProvider` (`cosmo/src/auth/adminAuthProvider.ts`)
- Реализовать стандартный контракт React Admin `authProvider`:
  - `login: ({ username, password }) => ...`
  - `logout: () => ...`
  - `checkAuth: () => ...`
  - `checkError: (error) => ...`
  - `getIdentity: () => ({ id, fullName, avatar, email, role, department })`
  - `getPermissions: () => UserCapability[]`
- **Forward-совместимость:** Когда мы подключим `ra-rbac` (React Admin EE), он сразу прочитает массив прав из `getPermissions()` без правок бэкенда!

### 3. `B-3: Personal Access Token (PAT) Engine` (`cosmo/src/auth/tokenEngine.ts`)
- Генерация токенов доступа для CI/CD:
  - `createToken(name: string, scopes: UserCapability[], ttlDays: number | null): { token: string; record: PersonalAccessToken }`
  - Префикс токена: `pk_live_<32 hex chars>` (напр. `pk_live_9f8a3c4b...`).
  - Маскированное представление для UI: `pk_live_****3a8f`.
  - Методы: `listTokens()`, `revokeToken(id)`, `validateToken(rawToken)`.
  - Хранение в защищённом `localStorage` (`pk.user.tokens.v1`).

---

## 🧪 Критерии приёмки (DoD)
- `npx tsc --noEmit` — 0 ошибок.
- Написан юнит-тест `profileStore.test.ts` (проверка прав, обновление профиля, генерация и отзыв токенов).
- `authProvider.getPermissions()` возвращает честный массив прав.
