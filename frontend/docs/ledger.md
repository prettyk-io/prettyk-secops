# Docs ledger — cosmoport-secops-lab (INTEGRATION)

> Учётный лист миграции доков legacy → spaceport-secops-lab. Slice: 13 августа 2026.
> Бакеты: `ready` / `smallfix` / `bigfix` / `tocompose` + `drop`.
> Правила поведения: [`../../docs/NEW_AGENT_MANDATORY.md`](../../docs/NEW_AGENT_MANDATORY.md).
> Правило изоляции: CBR-пакет — только локально в `sanctuary/canon/custom/cosmo/cbr-specific/` (rule `cbr-cosmo-only.mdc`).

## ready — скопировано как есть (✓ сделано)

_Пока пусто._ Интеграционные ready-доки не выделены на этом срезе — вся Cosmoport-масса идёт в `tocompose` как сорс.

## smallfix — поправлено на лету (✓ сделано)

_Пока пусто._

## bigfix — полная копия, rewrite НЕ делаем

_Пока пусто._

## tocompose — сорс-материал (тезисы при написании нового)

| Источник | Копия | #якорь | !toCompose |
|---|---|---|---|
| `docs/research/2026-08-12-cosmo-pipe-vs-box.md` | `cosmo-pipe-vs-box.md` | compose-request_40 | Тезисы «коробка vs pipeline» для integration-нарратива (small) |
| `docs/research/2026-08-12-pal-owner-answers-nshr-lincor.md` | `pal-owner-answers-nshr-lincor.md` | compose-request_41 | Голос владельца/заказчика, НШР/Lincor — сорс для PAL-доков (small) |
| `docs/research/2026-08-12-cosmo-portal-settings-wave1.md` | `cosmo-portal-settings-wave1.md` | compose-request_42 | Настройки портала Cosmoport — integration-регламент (small) |
| `docs/research/2026-08-12-pal-release-repo-scanner-anchor.md` | `pal-release-repo-scanner-anchor.md` | compose-request_43 | scanner-якорь релизного репо — integration-контракт (small) |
| `docs/research/2026-08-12-pal-pi-salvage-before-after.md` | `pal-pi-salvage-before-after.md` | compose-request_45 | PI salvage before/after — кейс integration (small) |
| `docs/research/2026-08-12-pal-card-routes-wave.md` | `pal-card-routes-wave.md` | compose-request_46 | Карточные маршруты — integration-UI (small) |
| `docs/research/2026-08-12-pal-lc-stage-map-draft.md` | `pal-lc-stage-map-draft.md` | compose-request_47 | LC stage map — integration-схема (small) |
| `docs/research/2026-08-12-pal-entity-skeleton-draft.md` | `pal-entity-skeleton-draft.md` | compose-request_48 | Скелет сущностей — integration-модель (small) |
| `docs/friend-requests/2026-08-12-cosmoport-app-deploy-ladder.md` | `cosmoport-app-deploy-ladder.md` | compose-request_49 | Лесенка app→deploy→bind — integration (small) |
| `docs/friend-requests/2026-08-12-pal-cosmoport-custom.md` | `pal-cosmoport-custom.md` | compose-request_50 | Пак `cosmoport-custom` — integration-профиль (small) |
| `docs/profiles/cosmoport-custom.md` | `cosmoport-custom.md` | compose-request_51 | Профиль Cosmoport — integration (small) |

## drop — не копируем (purge отдельной сессией)

- CBR-пакет `sanctuary/canon/custom/cosmo/cbr-specific/*` — только локально, в git не коммитить (rule `cbr-cosmo-only.mdc`).
- Остальной `docs/research/*` (не-cosmoport) — RnD-шляпа, остаётся в legacy.
