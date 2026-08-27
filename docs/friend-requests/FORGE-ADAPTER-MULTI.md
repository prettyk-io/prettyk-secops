# FORGE-ADAPTER-MULTI: Multi-instance ForgeAdapter с Gitea META

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

ForgeAdapter — интерфейс между PrettyK Run Control Plane и Git-форджем. Канонический default — Gitea. Multi-instance: каждый Domain подключается к своему Gitea через отдельный ForgeBinding. Jenkins, GitLab, Forgejo — опциональные адаптеры к тому же интерфейсу.

## Ключевые свойства

- **Gitea META.** Все примеры, доки, dev-стенд и default-конфиг идут с Gitea. Не «женаты навсегда» — «выбрали default, от которого пляшем».
- **Multi-instance.** `ForgeBinding` хранит URL, токен и тип каждого подключённого forge.
- **Минимальный контракт.** Webhooks (push, PR), commit statuses, repo info, resolve user. Без претензии на «полное API форджа».
- **Forge не является security authority.** Статусы коммитов — отражение решений PrettyK, а не источник истины.

## Что уже есть

- Исследование Gitea/Forgejo (Actions, RBAC, backup, security) — Gitea production-ready, Actions stable, runner gRPC-over-HTTP.
- `cosmo-strategy.md` — внешний портал как потребитель коробки.

## Что нужно построить

- Интерфейс `ForgeAdapter` (TypeScript/Python-контракт).
- `ForgeBinding` — модель данных (domain_id, forge_type, url, token, webhook_secret).
- Gitea-реализация: webhook handler, commit status API, repo info.
- Jenkins-реализация (option): тот же контракт.
- Регистрация webhook'ов при создании RepositoryBinding.

## Честная «не обещаем»

- Gitea Actions как CI-движок — **не** часть ForgeAdapter. Это ответственность ExecutionAdapter.
- Полное API Gitea (issues, PRs, wiki) — out of scope. Только то, что нужно Run Control Plane.
- Миграция между форджами — out of scope первого раунда.

## DoD

- Контракт `ForgeAdapter` зафиксирован.
- `ForgeBinding` в модели данных + API.
- Gitea-реализация: webhook → событие в PrettyK, commit status → API Gitea.
- Jenkins-реализация (stub или полная — по приоритету).
- Тесты: регистрация forge, приём webhook, отправка статуса.