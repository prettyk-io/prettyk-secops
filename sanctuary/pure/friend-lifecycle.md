# FRIEND lifecycle — коридоры и переходы

> **CANON** — hub topic. Slice: **13 августа 2026**.
> Определяет все возможные состояния идеи/фичи в продукте и правила перехода между ними.
> Реестр: [`INDEX.md`](INDEX.md). Входящие: [`../friend-requests/`](../friend-requests/), [`../canon-requests/`](../canon-requests/).

## 1. Карта состояний

```text
                   ┌── reject ──→ POSSIBLE ────→ (ждёт возрождения)
                   │
  ИДЕЯ ──→ friend-request ──┤
                   │
                   └── evolve ──→ backlog § evolve ──→ доработка
                           │
                           └── ready ──→ canon-request ──→ 2FA
                                               │
                                        ┌──────┴──────┐
                                   approved       отклонено
                                       │              │
                                  CANON seeker    POSSIBLE
                                       │
                                  (статус в INDEX:
                                   "на птичьих правах")
                                       │
                                  доработка до мяса
                                       │
                                  полный 2FA promote
                                       │
                                  CANON member
                                       │
                                  (полноценный FRIEND)
```

## 2. Статусы — определения

| Статус | Где лежит | Что значит | Badge |
|---|---|---|---|
| **friend-request** | `docs/friend-requests/` | Заявка. Не канон. | `lane: evolve | ready` |
| **POSSIBLE** | `docs/canon/POSSIBLE-FRIEND.md` | Отклонено владельцем, но «может когда-нибудь». Или junk. | `POSSIBLE-FRIEND` |
| **evolve** | friend-request + backlog § evolve | Точно про продукт, почти наверняка FRIEND, но сыро. | `lane: evolve` |
| **ready** | canon-request или friend-request | Тезис ясен, as-built якорь есть, можно паковать в 2FA. | `lane: ready` |
| **seeker** | `docs/canon/<topic>.md` + строка в INDEX | Зачислен в канон на птичьих правах. Тезис канонизирован, но не дозрело до member. Требует доработки. | `> **CANON SEEKER**` |
| **member** | `docs/canon/<topic>.md` + строка в INDEX | Полноценный FRIEND. Мясо есть, код есть, тесты есть, границы ясны. | `> **CANON**` |
| **VOID** | INDEX § Void | Устарело, заменено, удалено. Не воскрешать. | `void` |

## 3. Правила перехода

### Вход: идея → friend-request

Агент пишет файл в `docs/friend-requests/`. Бар «не дичь?» — см. rule [`docs-canon.mdc`](../../.opencode/rules/docs-canon.mdc) § Friend-requests. **2FA не нужен на inbox.**

### friend-request → evolve

- Владелец сказал «это продукт, но рано» или агент видит что сыро.
- Карточка получает `lane: evolve`.
- Добавляется строка в backlog § «Сырое / evolve».
- **Плюс рекомендации как evolve** — что именно дорастить, какие acceptance закрыть.

### friend-request → ready

- Тезис ясен, as-built якорь есть, границы очерчены.
- Готов к упаковке в 2FA.

### friend-request → POSSIBLE

- Владелец сказал «нет» / «может когда-нибудь».
- Не дичь, но не сейчас.
- Попадает в `POSSIBLE-FRIEND.md`.

### ready → 2FA → CANON seeker

1. Агент пакует canon-request.
2. Полный 2FA: лист тезисов → ответ владельца → валидация → «да, полируй канон».
3. Создаётся `docs/canon/<topic>.md` с badge **`CANON SEEKER`**.
4. Строка в INDEX с пометкой «seeker».
5. В backlog — карточка доработки до member.

**Seeker** — это канон, но на птичьих правах. Тезис зафиксирован, истина признана, **но мясо (код/acceptance/границы) ещё не полное.** Агенты ориентируются на тезис, но знают что зона дозревает.

### seeker → member

1. Закрыты acceptance по зоне.
2. Код есть, тесты зелёные.
3. Границы очерчены, honest-contract не нарушен.
4. Полный 2FA promote: лист «что достроено» → ответ владельца → «да, promote в member».
5. Badge меняется с **`CANON SEEKER`** на **`CANON`**.

### member → VOID

- Тезис устарел, заменён новым CANON.
- 2FA на retire.
- Без 2FA — не двигать.

## 4. Что НЕ FRIEND никогда

| Категория | Где лежит | Почему |
|---|---|---|
| CDP Harness, bankvm, Cursor-навыки | `C:\cursor-buddy` | Инструмент агента, не продукт |
| Playwright, скриншоттер | global skills | Инструмент, не продукт |
| `.opencode/rules/` | Репо | Agent config |
| `services/` (allure3, etc) | Репо | Runtime инфра |
| internal docs | `docs/internal/` | Рабочие заметки |

## 5. Схема для агента

```text
Вижу идею →
  Это про продукт? Нет → стоп.
  Дичь? Да → отклонить, не писать.
  Сыро, но про продукт? → friend-request + lane: evolve + backlog строка + рекомендации.
  Готово (as-built + тезис)? → friend-request + lane: ready.
  Отклонено владельцем? → POSSIBLE.
  Пройден 2FA? → CANON seeker (или member если мясо полное).
  Seeker дозрел? → 2FA promote → member.
  Устарело? → 2FA retire → VOID.
```