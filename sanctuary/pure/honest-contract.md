# Честный контракт — слот ≠ runtime

> **CANON** — hub topic. Slice: **11 августа 2026** (зачисление AUTH / CONN thin / hold·secrets).  
> Утренний долг (QUEUE): [`../agent-suggested-not-tested.md`](../agent-suggested-not-tested.md).  
> Реестр: [`INDEX.md`](INDEX.md).

## Правило

| Состояние | Как говорим |
|---|---|
| Runtime есть | «Работает» — только с тестом / lab evidence |
| Authoring есть, runtime нет | «В модели есть; исполнение — этап N; с вас X» |
| Нужен артефакт банка | Чеклист на входе, не фейковый success |
| Отказ | Стена в [`walls.md`](walls.md) |

Заглушка в схеме допустима как слот. Называть её «готово к прогону» — нельзя.

## Тезисы долга (не «done»)

1. **Auth** — lab основа: [`auth-module.md`](auth-module.md); gaps / deep SSO: [`auth-slots.md`](auth-slots.md) · matrix [`../internal/auth-matrix.md`](../internal/auth-matrix.md). Residual UI/harden — QUEUE.
2. **Connectors** — activate + **thin MethodId**: [`connectors.md`](connectors.md); Admin secrets: [`admin-integrations.md`](admin-integrations.md); толстый SQL/MQ protocol — later.
3. **NAV / History / artifacts** — lab file-bus / localStorage; **не** multi-tenant. Soft `legal_hold` + purge refuse — ops рычаг, не WORM/legal archive ([`nav-check.md`](nav-check.md)).
4. **Package secrets** — high-confidence plaintext gate при zip; report type+path, не значение; escape `PK_PACKAGE_ALLOW_SECRETS=1`. **Не** замена DLP банку.
5. **QG-AF / admission** — lab ripe; банку — осторожно ([`admission.md`](admission.md) §4).
6. **PrettyK PK-M*** — ядро [`prettyk-core.md`](prettyk-core.md); workbench — future-plans, не done.
7. **Data modules** — только реализованный export в stream ([`data-modules.md`](data-modules.md)).
