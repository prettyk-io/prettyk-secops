# FEATURE-ROUTING: единый тоннель продвижения фич (pure / custom / evolve)

`lane: ready` → **принят 16 авг 2026 (2FA одобрен).** Зачислен в hub как `feature-admission.md`. См. `feature-admission.md`.

## Тезис

Любая фича коробки и любой ништяк, дозревший из Cosmo, идут по **одному маршруту** — через явные гейты, а не «по наитию». Полная версия конвейера допуска — в каноне [`feature-admission.md`](../feature-admission.md) (CANON). Здесь — исходная заявка (reference).

Ключевое:
1. **Один вердикт на старте** — `pure` (коробка) / `custom` (только интеграция) / `evolve` (дозревает).
2. **Extract из Cosmo** — ништяк выкорчёвывается через явную extract-карту (исходник → идея без специфики → куда → DoD), не копипастом.
3. **DoD коробки** — специфичные гейты допуска: без утечки заказчика, генерализация, поведение глазами заказчика, точечный smoke, SoT синхронизирован, ничего наружу.

## As-built якорь

- `split-canon.md` — коробка vs интеграция, ветки `dev`→`main`.
- `enterprise-friends-required.md` — планка enterprise (допуск фичи ≠ планка).
- `friend-lifecycle.md` — коридоры идей.
- `docs/feature-routing-backlog.md` — живая очередь тоннеля.
- `.opencode/rules/product-forks.mdc` — `secops-lab-pure` (default) vs `cosmo-custom` (pack).

## Статус

Принят. Канон: [`feature-admission.md`](../feature-admission.md). Живая очередь: [`feature-routing-backlog.md`](../feature-routing-backlog.md).
