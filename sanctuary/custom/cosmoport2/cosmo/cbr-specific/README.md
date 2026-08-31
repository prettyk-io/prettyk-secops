# docs/cbr — отраслевой пакет (только `spaceport`)

Этот каталог существует **только** на ветке [`spaceport`](../../).  
На `dev` / `main` / `frontend` / прочих ветках его не создавать, не коммитить и не переносить через stash/merge.

Канон для агентов: [`.cursor/skills/cbr-spaceport/SKILL.md`](../../.cursor/skills/cbr-spaceport/SKILL.md).

## Состав

| Путь | Назначение |
|---|---|
| [`blanks.md`](blanks.md) | Кнопки UI, конвейер ТЗ/акта, поля, стиль |
| [`example-regulation.html`](example-regulation.html) | Пример выгрузки ТЗ |
| [`example-act.html`](example-act.html) | Пример выгрузки акта |
| [`profile.ts`](profile.ts) | Тексты норм, контур, реквизиты шапки |
| [`letterheadData.ts`](letterheadData.ts) | Data-URI логотипа для HTML-выгрузки |
| [`assets/letterhead-logo.png`](assets/letterhead-logo.png) | Рабочая копия: D10 horizontal RU **gray** |
| [`assets/diameter_10_and_more/.../gray/horizontal/`](assets/diameter_10_and_more/) | Официальный пак брендбука |
| [`_gen_letterhead.py`](_gen_letterhead.py) | Пересборка `letterheadData.ts` из gray D10 |

## Граница

- Сюда — материалы **этого кейса** (бланки, шапка, нормы, ассеты).
- Банкинг / финсектор как область ИБ в коде и доках продукта — отдельно; запрет только на утечку **этого пакета** в общий контур.
