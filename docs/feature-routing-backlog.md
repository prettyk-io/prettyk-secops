# Feature-routing backlog — живая очередь тоннеля

> **Путь:** `docs/feature-routing-backlog.md`
> **Правила конвейера:** [`feature-admission.md`](../feature-admission.md) (CANON) · заявка [`docs/canon-requests/FEATURE-ROUTING.md`](canon-requests/FEATURE-ROUTING.md).
> **Это НЕ hub и НЕ machine SoT.** Это живая очередь движения фич. Канон по-прежнему через 2FA.
> Правило git: [`split-canon.md`](../split-canon.md) — ветки `dev`→`main`, интеграция = каталоги, не ветка.

## Статусы

| Статус | Смысл |
|---|---|
| `route: pure` | Вердикт дан, идёт в коробку (`dev`) |
| `route: custom` | Вердикт дан, идёт в cosmo-каталог |
| `route: evolve` | Дозревает, в тоннель не вошёл |

## В тоннеле

_Пусто — первая фича войдёт после route-вердикта._

## Extract-кандидаты (Cosmo → Pure)

_Сюда попадают ништяки из `cosmo/` и `sanctuary/custom/cosmoport2/cosmo/`, дозревшие до генерализации._

| ID | Исходник | Что генерализовать | Вердикт | Статус |
|---|---|---|---|---|
| — | — | — | — | — |

## Сырое / evolve

_Идеи без route-вердикта. Не в тоннель, пока не дозреют._

- —

## Как двигается

1. Идея → route-вердикт (`pure` / `custom` / `evolve`) — ставит Максим или Keeper по `FEATURE-ROUTING.md`.
2. `pure`/`custom` → карта в секции «В тоннеле» → код в `dev`/cosmo → DoD-гейты → land.
3. Ништяк из Cosmo → extract-карта → секция «Extract-кандидаты».
4. `evolve` → лежит в «Сырое / evolve», периодически пересматривается.
