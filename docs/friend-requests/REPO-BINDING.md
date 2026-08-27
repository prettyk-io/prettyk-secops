# REPO-BINDING: RepositoryBinding как мост между Forge и Application

> `lane: ready` · 27 авг 2026. Research: [`cosmoport-domain-model.md`](../research/2026-08-27-cosmoport-domain-model.md).

## Тезис

RepositoryBinding связывает Application (Level 1) с конкретным Git-репозиторием в конкретном Forge. Один Application = один RepositoryBinding. Через Binding PrettyK знает: из какого Gitea тянуть код, на какой webhook подписан, какой ref считать каноническим.

## Ключевые свойства

- **1:1 с Application.** Каждый app уровня 1 имеет ровно один RepositoryBinding.
- **Связь с Domain через Forge.** Binding ссылается на `ForgeBinding` домена (какой Gitea instance).
- **Webhook management.** При создании Binding'а PrettyK регистрирует webhook в Gitea.
- **Default branch.** Канонический ref для сборок (если не указан явно).
- **Статусы коммитов.** PrettyK отправляет commit status через ForgeAdapter — Binding знает, куда.

## Что уже есть

- `cosmoportLadderMock.ts` — app → builds[] → deploys[], без привязки к репозиториям.
- Исследование Gitea: webhooks поддерживаются, API commit statuses работает.

## Что нужно построить

- Модель: `RepositoryBinding { id, forge_binding_id, repo_path, default_branch, webhook_id }`.
- API: создать/удалить/обновить Binding.
- Webhook-регистрация при создании Binding'а (через ForgeAdapter).
- Валидация: репозиторий существует и доступен.

## Честная «не обещаем»

- Несколько репозиториев на одно приложение — out of scope (Level 0 библиотеки подключаются иначе — через Brick-зависимости).
- Авто-обнаружение репозиториев — out of scope v1.

## DoD

- Модель `RepositoryBinding`.
- API создания/чтения Binding.
- Webhook регистрируется в Gitea при создании Binding.
- Связь Application → RepositoryBinding в UI лесенки.
- Тесты: создание Binding, привязка к Application, приём webhook с привязкой к app.