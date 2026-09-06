# Sanctuary

> Верхняя полка репозитория. Slice: 14 августа 2026.

Sanctuary — место, где живут **только финальные отполированные каноны**, правила 2FA и ТЗ.
Это не рабочая зона идей — для идей есть рабочий hub и inbox (`friend-requests/` /
`canon-requests/`).

## Что здесь лежит

| Путь | Роль |
|---|---|
| [`pure/CHARTER.md`](pure/CHARTER.md) | **Устав Святилища канона**: общие положения + положение о 2FA |
| [`pure/TEMPLE-CORE.md`](pure/TEMPLE-CORE.md) | **Temple Core**: иерархия братства (Boss → Flash ‖ Buddy; Keeper вне иерархии), поток от карточки до канона |
| [`2FA.md`](2FA.md) | Ритуал двухфакторной промоции в Sanctuary |
| [`keeper-discipline.md`](keeper-discipline.md) | Канон роли Keeper: три столпа + правило ЧИСТО + антипаттерны нарезки |
| [`skills/`](skills/) | Архивные копии личных skills Keeper'а (po-keeper и др.) |
| [`CANON-PURE.md`](CANON-PURE.md) | Отполированная спека коробки (CANON BASE) |
| [`TZ-INTEGRATION.md`](TZ-INTEGRATION.md) | ТЗ на интеграцию коробки в портал заказчика |
| [`canon/`](canon/) | Рабочий hub канона (INDEX + topics), поднятый из `docs/canon/` |

## Отношение к hub

| Слой | Что там | Кто трогает |
|---|---|---|
| `canon/` (hub) | Рабочий hub: тезисы, `> **CANON**` topics, SEEKER, POSSIBLE | Через 2FA (полировка) |
| `friend-requests/`, `canon-requests/` | Inbox кандидатов: `ready` / `evolve` | Любой агент (без 2FA на evolve) |
| **`sanctuary/`** | **Финальные отполированные каноны + устав + ТЗ** | **Только Keeper + владелец** |

Sanctuary **не заменяет** hub. Hub остаётся рабочим и живёт своей жизнью. Sanctuary —
верхняя полка, куда вещь попадает **только когда она отполирована до конца**.

## Кто пишет сюда

- **Keeper (хранитель обители)** и **владелец (Максим)**. Больше никто.
- Агент не заносит файл в Sanctuary без явного прохода через 2FA и беседы с хранителем.
- Keeper может **сам инициировать запрос** владельцу, когда вещь у его дверей дозрела
  (искатель, possible friend, прошедший evolve/research). Ведёт, но не решает.
- Иерархия братства и поток verified-списков — [`pure/TEMPLE-CORE.md`](pure/TEMPLE-CORE.md).

## Правила

1. Любой патч файла в Sanctuary — **только через 2FA** (см. `pure/CHARTER.md` и `2FA.md`).
2. Никакого кода — только доки.
3. Без имени внутреннего продукта, без привязки к конкретному заказчику/банку.
4. `docs/wired.json` — legacy JSON Schema, здесь не дублируется и не подменяется.
