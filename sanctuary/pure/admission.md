# Допуск ИБ и опциональный акт

> **CANON** — hub topic. Slice: **11 августа 2026**.  
> Развёртка для ИБ: [`../admission-act-ib.md`](../admission-act-ib.md) (QUEUE/PUBLIC detail).  
> Реестр: [`INDEX.md`](INDEX.md).

---

## 1. Две оси

| Ось | Вопрос | Типичный исход |
|---|---|---|
| **Исполнение** | Прогон и evidence есть? | crash / fatal → exit **1** / `fail_run` / `ci_gate=void` |
| **Допуск** | ACTIVE Critical/High в политике? | сверх порога → exit **2** / `fail_gate`; soft → `pass_watch` |

Сбой исполнения **не** раздувает security-класс и **не** даёт авторитетный pass/fail допуска: `admission_void`, в UI/акте — «Допуск: недействителен».

---

## 2. Этап-1 → этап-2

1. Suites до терминала без hard-fail → `suites_complete`.
2. ИБ-gate только после этапа-1.
3. `<!>` (scenario failsafe) не валит этап-1; `>?` — шаг. `debug_mode` → admission **VOID** всегда.

---

## 3. Опциональный акт (`meta.generate_act`)

1. Акт / кнопка «Сохранить акт» / `act/act.html` в zip — **только** при `generate_act=true` **и** готовой оси допуска.
2. OFF → кнопки нет в DOM; zip: `"act": "omitted"` + reason.
3. SoT allOf: `manual` → false (скрыто); `pre_release` → true readOnly; `scheduled`/`emergency` — опционально.
4. Evidence: acceptance 10–11.

---

## 4. Банку нельзя врать

Нельзя: waivers «как процесс банка», промышленный runner, полный DLP diary, подмена exit 1 формулировкой «критический риск ИБ» без ACTIVE Critical.

Честный слот/lab: [`honest-contract.md`](honest-contract.md).
