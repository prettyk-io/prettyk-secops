# SPIKE-B-10: Better Auth vs Keycloak — Сравнительный отчёт

> **Дата:** 24 августа 2026 г.  
> **Исполнитель:** Boss (Architecture Spike)  
> **Статус:** Рекомендация принята. Пересмотрена 25 августа 2026: PostgreSQL-only, Keycloak в архив.

---

## 1. Что тестировали

Оба решения развёрнуты локально, протестированы на полном цикле:
регистрация → логин → сессия → профиль → RBAC → API-токены → логаут.

| | Better Auth v1.7.1 | Keycloak 26.1 |
|---|---|---|
| **Тип** | Библиотека (npm) | Платформа (Java/Quarkus) |
| **База** | SQLite (spike) / Postgres (prod) | PostgreSQL |
| **Размер** | ~200 KB bundled | ~400 MB Docker image |
| **Порты** | :3001 (Express) | :8082 (Admin + API) |

---

## 2. Сравнительная матрица

| Критерий | Better Auth | Keycloak | Оценка |
|---|---|---|---|
| **Время развёртывания** | 30 мин (с миграциями) | 15 мин (Docker pull) | Keycloak ⚡ |
| **Сложность настройки** | Схема БД вручную, path-to-regexp конфликт | 1 YAML, 1 REST-скрипт | Keycloak 🟢 |
| **Интеграция с Vite** | Прокси `/api/auth` → :3001 | keycloak-js (redirect-based) | Better Auth 🟢 |
| **Профиль / Preferences** | customSession + additionalFields | Realm attributes | Better Auth 🟢 |
| **RBAC → Capabilities** | customSession → `computeCapabilities()` | `hasRealmRole()` → ручной маппинг | Better Auth 🟢 |
| **PAT / API Keys** | `@better-auth/api-key` (pk_live_) | Встроено (service accounts) | Ничья |
| **Admin панель** | Better Auth admin plugin (встроенная) | Keycloak Admin Console (богатая) | Keycloak 🟢 |
| **Реакция на F5** | Cookie-based, мгновенно | Token-based, мгновенно | Ничья |
| **Bundle size impact** | ~15 KB (client) | ~120 KB (keycloak-js) | Better Auth 🟢 |
| **Pure Box пригодность** | ❌ Требует Docker + PostgreSQL (решение: Compose) | ❌ Docker + PostgreSQL | Keycloak 🟢 |
| **Enterprise (LDAP/SAML)** | Требует кастомного плагина | ✅ Встроено | Keycloak 🟢 |
| **Developer Experience** | TypeScript-first, чисто | REST API, Web UI, громоздко | Better Auth 🟢 |
| **RFC-совместимость** | OAuth2 + сессии | OIDC, SAML, полный спектр | Keycloak 🟢 |

---

## 3. Ключевые выводы

### Better Auth — побеждает. PostgreSQL — безальтернативно

1. **TypeScript-native.** Схема, хуки, типы — всё из коробки. `customSession` маппит роли на capabilities без лишнего кода.
2. **API Keys с префиксом `pk_live_`.** Родной плагин, CLI-совместимость.
3. **Bundle size.** 15 KB клиент vs 120 KB keycloak-js.
4. **PostgreSQL через Compose.** Pure Box поднимает PostgreSQL как часть docker-compose стека — тот же подход, что и для DefectDojo, SonarQube. Никакого SQLite в production. Никакого второго auth-провайдера «на всякий случай».

### Keycloak — в архив

1. 400 MB Docker image, Java, отдельный admin — неоправданно для нашего стека.
2. OIDC/SAML/LDAP — не требуется на текущем этапе. Если потребуется — Better Auth поддерживает OIDC federation через плагины.
3. Два auth-провайдера = две поверхности атаки, две схемы миграций, два пути отладки.

### Что не делаем (пока)

- ❌ OIDC/SAML Federation (нужен отдельный плагин или Enterprise Edition)
- ❌ LDAP/Active Directory синхронизация
- ❌ Мульти-тенантность (realm'ы)

---

## 4. Рекомендация (пересмотрена 25 августа 2026)

**Принятое решение: Better Auth + PostgreSQL — единый стек. Keycloak в архив.**

### Аргументы:

1. **PostgreSQL — единый source of truth.** Pure Box поднимает PostgreSQL через Docker Compose. DefectDojo и SonarQube уже на нём — не плодим зоопарк. SQLite не нужен.
2. **Один auth-провайдер.** Better Auth покрывает всё. Два провайдера = две схемы миграций, два пути отладки, две поверхности атаки. Неоправданно.
3. **Keycloak (400 MB, Java, Quarkus) — в архив.** Docker Compose и скрипты настройки удалены из репо. OIDC/SAML — когда потребуется, Better Auth поддерживает OIDC federation через плагины, без поднятия отдельного IdP-сервера.
4. **Enterprise-сценарии (Банки) — отложенный слот.** Не через Keycloak, а через OIDC-плагин Better Auth.

---

## 5. Дорожная карта

| Фаза | Что | Когда |
|---|---|---|
| **Alpha (сейчас)** | Better Auth embedded в Vite dev | ✅ Готово |
| **Beta** | Миграция `auth.ts` → `BetterAuthProvider` | Следующий спринт |
| **RC** | Production Postgres, email-верификация, 2FA | Перед v1.0 |
| **Enterprise** | OIDC-плагин Better Auth (не Keycloak) | По запросу клиента |

---

## 6. Файлы spike

| Файл | Назначение |
|---|---|
| `src/auth/server/betterAuth.ts` | Better Auth конфигурация (SQLite, плагины) |
| `src/auth/server/db/index.ts` | Drizzle ORM + SQLite |
| `auth-server.ts` | Node.js HTTP сервер (entry point) |
| `scripts/migrate-db.ts` | SQL schema (5 таблиц) |
| `scripts/create-admin.ts` | Создание admin-пользователя |
| `scripts/test-auth.ts` | Smoke test (sign-up → sign-in → session → sign-out) |
| `src/auth/clientAuth.ts` | Better Auth frontend client |
| `src/auth/BetterAuthProvider.tsx` | React Context Provider |
| `src/auth/adminAuthProvider.ts` | React Admin authProvider → Better Auth |
| `src/auth/apiKeyClient.ts` | API Key management (create/list/revoke) |
| `src/auth/keycloakAuth.ts` | Keycloak client (архив) |
| `src/auth/keycloakAdminAuthProvider.ts` | React Admin → Keycloak bridge (архив) |
| `docker-compose.keycloak.yml` | Keycloak + PostgreSQL (архив) |
| `scripts/setup-keycloak.ts` | Keycloak realm, client, roles (архив) |
| `scripts/assign-keycloak-roles.ts` | Role assignment (архив) |