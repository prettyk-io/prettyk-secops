# DOMAIN-MULTI-TENANT: Domain как сущность первого класса

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

Domain (КИТС) — boundary изоляции, внутри которого живут свой forge (Gitea instance), своя иерархия приложений Level 0–3, своя RBAC-матрица и свои pipeline-кирпичи. Один PrettyK оркестрирует поверх множества Domain'ов. Multi-Gitea — архитектурное требование, не опция.

## Ключевые свойства

- **Domain — boundary изоляции.** Репозитории, команды, роли и политики одного домена не видны другому.
- **Свой forge на каждый Domain.** Каждый Domain регистрирует свой Gitea instance через ForgeBinding. Multi-instance.
- **Свой каталог кирпичей.** Pipeline Bricks наследуются из общего каталога коробки (`prettyk-pure`) и переопределяются на уровне домена (`cosmo-custom`).
- **Своя RBAC.** `admin_sec` домена «Цифровой рубль» ≠ `admin_sec` домена «Розничные платежи». Роль назначается на домен + опциональный scope команд.
- **Своя квота.** Лимиты на run/batch/storage/CPU на домен.

## Что уже есть

- `cosmo-strategy.md` — стратегия интеграции коробки в портал Cosmo.
- `auth-roles.md` — 5-ролевая модель (канон).
- `cosmoportLadderMock.ts` — mock-лесенка с 2 приложениями.

## Что нужно построить

- `Domain` как сущность первого класса в модели данных.
- `DomainConfig` (forge binding, RBAC, quota, brick overrides).
- Multi-instance `ForgeAdapter` с регистрацией доменов.
- API: CRUD Domain, список доменов, переключение контекста.

## Честная «не обещаем»

- Domain ≠ отдельный инстанс PrettyK. PrettyK один, доменов много. Это multi-tenant в рамках одного инстанса.
- Междоменное взаимодействие — out of scope первого раунда.

## DoD

- Сущность `Domain` в модели данных.
- `ForgeBinding` с регистрацией Gitea instance.
- API: `POST /domains`, `GET /domains`, `GET /domains/:id`.
- UI: переключение доменов, лесенка Cosmoport фильтруется по активному домену.
- Тесты: создание домена, регистрация forge, изоляция данных между доменами.