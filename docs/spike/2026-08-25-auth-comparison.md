# SPIKE-B-10: Better Auth vs Keycloak — Сравнительный отчёт

> **Дата:** 24 августа 2026 г.  
> **Исполнитель:** Boss (Architecture Spike)  
> **Статус:** Рекомендация принята

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
| **Pure Box пригодность** | ✅ Один процесс, SQLite | ❌ Docker + PostgreSQL | Better Auth 🟢 |
| **Enterprise (LDAP/SAML)** | Требует кастомного плагина | ✅ Встроено | Keycloak 🟢 |
| **Developer Experience** | TypeScript-first, чисто | REST API, Web UI, громоздко | Better Auth 🟢 |
| **RFC-совместимость** | OAuth2 + сессии | OIDC, SAML, полный спектр | Keycloak 🟢 |

---

## 3. Ключевые выводы

### Better Auth — побеждает по всем критериям Pure Box

1. **Zero infrastructure overhead.** Один Node.js процесс. SQLite в коробке. Никакого Docker, Java, отдельной БД.
2. **TypeScript-native.** Схема, хуки, типы — всё из коробки. `customSession` маппит роли на capabilities без лишнего кода.
3. **API Keys с префиксом `pk_live_`.** Родной плагин, CLI-совместимость.
4. **Bundle size.** 15 KB клиент vs 120 KB keycloak-js.

### Keycloak — для Enterprise (Банки, Госсектор)

1. **OIDC/SAML 2.0 Federation.** Готово из коробки. LDAP, Active Directory, социальные провайдеры.
2. **Admin Console.** Полноценная Web UI для управления пользователями, клиентами, realm'ами.
3. **Production-grade.** Миллионы пользователей, кластеризация, аудит.

### Что не делаем в Better Auth (пока)

- ❌ OIDC/SAML Federation (нужен отдельный плагин или Enterprise Edition)
- ❌ LDAP/Active Directory синхронизация
- ❌ Мульти-тенантность (realm'ы)

---

## 4. Рекомендация

**Принятое решение: Better Auth как основной auth-провайдер.**

### Аргументы:

1. **Pure Box — наш главный продукт.** Better Auth идеально ложится в коробочную модель: SQLite, один процесс, TypeScript.
2. **Enterprise-сценарии (Банки) — отложенный слот.** Когда потребуется OIDC/SAML, добавим Keycloak как внешний IdP (Better Auth поддерживает OIDC federation через плагины).
3. **Скорость разработки.** Better Auth интегрирован в наш код (монорепо), не требует отдельного сервиса и DevOps-поддержки.
4. **Keycloak остаётся как запасной вариант.** Docker Compose и скрипты настройки сохранены в репо. При необходимости Enterprise-деплоя — поднимаем за 15 минут.

---

## 5. Дорожная карта

| Фаза | Что | Когда |
|---|---|---|
| **Alpha (сейчас)** | Better Auth embedded в Vite dev | ✅ Готово |
| **Beta** | Миграция `auth.ts` → `BetterAuthProvider` | Следующий спринт |
| **RC** | Production Postgres, email-верификация, 2FA | Перед v1.0 |
| **Enterprise** | Keycloak как OIDC-провайдер для Better Auth | По запросу клиента |

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
| `src/auth/keycloakAuth.ts` | Keycloak client (keycloak-js) |
| `src/auth/keycloakAdminAuthProvider.ts` | React Admin → Keycloak bridge |
| `docker-compose.keycloak.yml` | Keycloak + PostgreSQL |
| `scripts/setup-keycloak.ts` | Keycloak realm, client, roles, users |
| `scripts/assign-keycloak-roles.ts` | Role assignment для существующих пользователей |