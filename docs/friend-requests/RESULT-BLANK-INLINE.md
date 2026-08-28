# RESULT-BLANK-INLINE — Inline-бланк в результатах

`lane: evolve`

От: Keeper / Boss (аудит `to-sanitize/`)  
As-built якорь: `to-sanitize/src-hybrid/results/BlankPanel.tsx` + `blankMarkdown.ts`  
Не дубль INDEX / FRIEND: да  
Честная «не обещаем»: evolve, нужно решение по интеграции

## Тезис

В исторической версии (`to-sanitize/src-hybrid/results/`) есть **`BlankPanel`** — inline-панель бланка в результатах, которой нет в текущем `/results`. Панель показывает:

- Сводку рисков (severity: critical/high/medium/low/info) в описательной карточке
- Вердикт + рекомендации
- Кнопки экспорта JSON, скачать HTML, печать

Вспомогательный **`blankMarkdown.ts`** генерирует полноценный ГОСТ-акт и ТЗ в markdown, который затем конвертируется в HTML.

Текущий `/results` уже умеет генерировать акты и ТЗ через `blankPayload.ts` → `blankHtml.ts` (скачивание наружу), но **не показывает** inline-превью бланка внутри самой страницы результатов. `BlankPanel` решает именно эту задачу — видимый бланк «здесь и сейчас» без скачивания.

## Что в to-sanitize (всё уникальное, не дубликаты)

| Файл | Статус | Комментарий |
|---|---|---|
| `BlankPanel.tsx` + тест | **УНИКАЛЕН** | Inline-панель — НЕТ в текущем |
| `blankMarkdown.ts` | **УНИКАЛЕН** | MD-рендерер ГОСТ-акта/ТЗ — НЕТ в текущем |
| `headerPipelineDisplay.ts` | дубликат | Уже в текущем, байт-в-байт |
| `blankFields.ts`, `blankLetterhead.ts`, `labBlankProfile.ts`, `explorerTree.ts` | дубликаты | Уже в текущем |
| `ResultsWorkspace.tsx`, `ResultsSummaryPanel.tsx`, `resultsHubTiles.tsx`, `resultsPipelineExtras.tsx` | дубликаты | Идентичны текущим (fc /b = identical) |
| Остальные ~40 файлов | дубликаты | Все уже в `cosmo/src/results/` |

## Путь интеграции

1. Перенести `BlankPanel.tsx` → `cosmo/src/results/`
2. Перенести `blankMarkdown.ts` (если не весь, то шаблон `renderActMarkdown`)
3. Добавить `BlankPanel` в `ResultsWorkspace` ниже `ResultsSummaryPanel`
4. Пробросить `run` и `wired` как пропсы (уже есть в `useResultsLivePoll`)

## Риски

- `blankMarkdown.ts` ссылается на `blankFields.ts`, `labBlankProfile.ts` — уже есть в текущем.
- MD-шаблоны завязаны на `BlankViewModel` (типизация в `blankFields`), конфликтов не будет.
- Не ломает honest-contract: чисто дополнение к существующим результатам.