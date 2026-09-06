# Discovery, label-failsafe, self-heal

> **CANON** — hub topic. Slice: **12 августа 2026** (HEAL §3: лестница + логи).  
> Не SoT манифеста. DISC карточки — [`../backlog.md`](../backlog.md) § дно.  
> Реестр: [`INDEX.md`](INDEX.md). Stub старого пути: [`../rnd-self-healing-and-discovery.md`](../rnd-self-healing-and-discovery.md).  
> Evidence: [acc 47](../acceptance/47-trials-heal-ab-2026-08-12.md) · [acc 49](../acceptance/49-trials-heal-log-d-2026-08-12.md).

Связь: [`../reference/language.md`](../reference/language.md) · [`admission.md`](admission.md) · [`prettyk-core.md`](prettyk-core.md).

---

## 0. Уже есть (не переизобретать)

| Факт | Где |
|---|---|
| Scenario failsafe `<!>` — допустимый отказ разведки, этап-1 | language + admission |
| Action soft `>?` | language |
| Debug → admission VOID | `debug_mode` |
| Auth production — Studio module / IR | AUTH / auth-module |

---

## 1. Discovery: `АвтоАвторизоваться`

1. MethodId PrettyK, режим **discovery**, не замена Auth-модуля для боевого входа.
2. Рантайм сканирует DOM: форма / password / submit по семантике.
3. Учётки из аргумента / `$var` / секрета; жмёт вход.
4. Провал → hard или `<!>` по флагу; в Live — clue.
5. Боевой банк-вход: Auth module + suite.

Карточка: **DISC-1** (дно).

---

## 2. Label-driven discovery (`Нажать > Лейбл`)

1. PrettyK: `Нажать > Войти`, `ВставитьТекст > Логин value` → wire `webdriver|…|label|…` (алиас `ВставитьЗначение`; SoT не расширяли).
2. Resolve: label`for` / aria / text on control; exact текст оператора, **без** автосинонимов Логин↔Email.
3. Перед act: visible + enabled (+ editable для fill).
4. N>1: **soft** (`>?` / failsafe / heal gate / discovery) → rank + один retry + Live `LABEL_AMBIGUOUS`; **hard** → fail без угадайки.
5. Live/meta `locator_label_last`; Studio «Затвердить локатор» / Results strip — жест оператора, не silent SoT.
6. Сосед HEAL (§3): после label-miss можно fingerprint; diary kinds разные (`LABEL*` ≠ `HEAL*`). Bridge `>#hint` остаётся.

Карточки **DISC-2 / DISC-3** — основа в runtime (не дно). **DISC-1** (`АвтоАвторизоваться`) — дно отдельно.  
Evidence: [acc 54](../acceptance/54-trials-disc-label-2026-08-12.md) · [acc 55](../acceptance/55-trials-disc-juice-field-2026-08-12.md).

---

## 3. Self-heal локаторов

Отдельный кейворд `Heal` в PrettyK **не** вводим. Soft-маркеры открывают путь; heal — слой подстраховки на miss локатора.

```text
soft (<!> / >? / discovery / PK_LOCATOR_HEAL)
  → miss
  → heal (fingerprint → score → кандидат)
  → OK → continue + diary HEAL (info)
  → MISS → failsafe как сейчас (warning, diary HEAL_MISS)
  → soft не спас / hard → ERROR
```

1. Разрешение heal = soft-ось (`<!>` / `>?` / discovery / debug soft / env). Hard без флага — heal не зовём.  
2. Алгоритм: классический weighted attrs (не LLM, не стек Healenium).  
3. Live/лог: **HEAL** (вылечил) · **HEAL_MISS** (не вылечил → failsafe) · **ERROR** только если soft не спас.  
4. Fingerprints вне SoT; принятие нового локатора в PrettyK — жест оператора (Results copy / Studio «Принять в конструктор»), не silent rewrite.  

5. Допуск не маскировать: heal_event ≠ «тест зелёный навсегда».

Карточки **HEAL-1/2** — основа в runtime (не дно). Label hint: env / `heal_label_scope` / маркер `>#текст` (+ soft) — landed; полный DISC-2 — §2.

---

## 4. Явный отказ

| Нет | Почему |
|---|---|
| ZEST → PrettyK | Чужой формат |
| Smart Pre-Run Sanitizer | Тихий фикс врёт акту |
| Intent-to-DOM как продукт | Без утверждения оператора |
| Heal на hard без `<!>` / флага | Врёт допуску |
| Отдельный MethodId Heal на каждую строку | Дубль soft-оси |

Полный void-список: [`INDEX.md`](INDEX.md) § Void.
