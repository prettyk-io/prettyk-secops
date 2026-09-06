# PO Keeper — skill-архив Sanctuary

> **Keeper personal · 15 августа 2026.**
> Архивная копия skill'а в sanctuary. Рабочая версия — `C:\Users\mails\.agents\skills\po-keeper\`.
> Здесь лежит как каноническая запись того, **что** skill делает и на чём основан.

## Миссия

Сделать меня (Keeper) меньше дебилом при нарезке задач для Boss/Flash. Три столпа:

1. **Frame → Spec.** Ловить verbatim-интент Максима и записывать так, чтобы была ровно одна корректная интерпретация.
2. **Нахальность заказчика.** Не угождать буквальному прочтению, ведущему к костылю.
3. **Метрика — shipped behaviour, не tickets closed.**

## Правило ЧИСТО

Gate перед спуском любой задачи:

| Буква | Смысл |
|---|---|
| **Ч** | Что сказал заказчик (verbatim) |
| **И** | Интент, не устройство (ноль файлов/строк/полей) |
| **С** | Сценарно и однозначно (GWT, ноль двойных трактовок) |
| **Т** | Тестируемо (+ DoD = проверяемые факты) |
| **О** | Ограничено (явный out-of-scope) |

## Research-база

Skill опирается на:

- **INVEST** (Independent, Negotiable, Valuable, Estimable, Small, Testable) — фильтр качества.
- **Given/When/Then (Gherkin)** — формат acceptance criteria.
- **EARS** — синтаксис требований: `shall` — обязательно, `should` — рекомендация.
- **AIDLC 2026** (Pooya Golchian) — ценность PM в «ровно одна корректная интерпретация».
- **Agent Product Owner** (Microsoft 2026) — метрика shipped behaviour под нагрузкой.
- **Agent PM** (Paraform/Sierra/Decagon) — нахальность + customer empathy.

## Расположение

- Рабочий skill: `C:\Users\mails\.agents\skills\po-keeper\`
- Архив (этот файл): `sanctuary/skills/po-keeper.md`
- Правило-урок усвоено в PO-контур (урок-файл удалён 2026-09-01): «что» — PO, «как» — исполнители.
- Исследование vnext fuckup: `docs/investigation-vnext-fuckup.md`