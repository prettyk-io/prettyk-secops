# DOMAIN-RBAC-SCOPE: Ролевая модель с областью действия внутри Domain

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md). Канон: [`auth-roles.md`](../../sanctuary/pure/auth-roles.md).

## Тезис

5-ролевая модель (`auth-roles.md`) назначается на Domain с опциональным scope команд (teams). Один пользователь может иметь роль `sec_expert` в домене «Цифровой рубль» и `user` в домене «Розничные платежи». Бэкенд различает роли — в отличие от текущего FE-only состояния.

## Ключевые свойства

- **Роль назначается на Domain**, а не глобально.
- **Scope команд (teams).** `sec_expert` может быть ограничен конкретными группами приложений внутри домена.
- **Переход от FE-only к полному RBAC.** Сейчас `RoleCaps` — только контракт полей формы, бэк не различает роли. Пора.
- **Совместимость с каноном.** 5 ролей (`admin_sec`, `admin_abnormal`, `admin_service`, `sec_expert`, `user`) — не расширяются, не переименовываются.

## Что уже есть

- `sanctuary/pure/auth-roles.md` — канон 5 ролей.
- `RoleContext.tsx` — контракт `RoleCaps`.
- `auth.ts` — 5 учёток.
- Видимость опций «Назначение проверки» по ролям (таблица в каноне).

## Что нужно построить

- Бэкенд-модель: `DomainMembership { user_id, domain_id, role, teams[] }`.
- API: `POST /domains/:id/members`, `GET /domains/:id/members`, `GET /me/memberships`.
- Middleware: проверка роли и scope команд на каждый запрос.
- UI: админка домена — управление членами и ролями.
- Совместимость: `admin_service` и `user` остаются заглушками с `to evolve` (как в каноне).

## Честная «не обещаем»

- Федеративный RBAC (тянуть роли из LDAP/AD доменов) — out of scope первого раунда.
- Полноценная реализация `admin_service` и `user` — остаются заглушками.

## DoD

- Бэкенд-модель `DomainMembership`.
- API для управления членами домена.
- Middleware проверки роли.
- UI админки домена (список членов, назначение ролей).
- Тесты: изоляция ролей между доменами, scope команд ограничивает видимость.