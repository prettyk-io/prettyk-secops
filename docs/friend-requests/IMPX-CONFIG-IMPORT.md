# FRIEND-REQUEST: IMPX — Импорт конфигурации между проверками

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка)

---

## 1. Проблема и Ценность

При создании новой проверки оператор часто хочет переиспользовать страницы, сценарии, модули или фаззеры из **другой существующей проверки** — не набирать заново. Ручное копирование через `localStorage` или `manifest.json` — источник ошибок и дублирования.

Требовалось: кнопка «Импорт» в Studio, которая показывает список проверок с их блоками, позволяет выбрать типы (страницы/сценарии/модули/фаззеры/ресурсы) и **честно вливает** выбранные блоки в текущую конфигурацию.

---

## 2. Реализованный скоуп (As-Built: IMPX-3…IMPX-6)

| ID | Компонент | Файлы | Что сделано |
|---|---|---|---|
| **IMPX-3** | Диалог импорта | `cosmo/src/studio/StudioImportDialog.tsx` | Модалка Ant Design: список проверок (`listChecks()` минус текущая), счётчик блоков (`countBlocks`) с русской плюрализацией, чекбоксы типов (все включены по умолчанию), `extractEditorBlocks` + `selectBlocks` → `ImportBlocksPayload`. |
| **IMPX-4** | Кнопка «Импорт» | `cosmo/src/studio/StudioWorkspace.tsx` | `ImportOutlined` в хедере PrettyK-панели, рядом с «Новая вкладка». Локальный стейт `showImportDialog`. |
| **IMPX-5** | Merge handleImportBlocks | `cosmo/src/studio/StudioWorkspace.tsx` | `mergeEditorBlocks(formDataRef.current, payload.blocks)` → `onFormDataChange`; `resourceContents` → `onResourceContentsChange`. Dirty-guard/persist на существующем дебаунсе. |
| **IMPX-6** | Тесты + SMOKE | `cosmo/src/studio/StudioImportDialog.test.tsx` | 4 теста: рендер списка, исключение текущей проверки, выбор типов, пустое состояние, содержимое ресурсов. |

### Flash (60%):
- IMPX-3, IMPX-4, IMPX-5 — диалог, кнопка, merge.

### Bro (40%):
- IMPX-6 — тесты, `tsc --noEmit`, `npm run build`.

---

## 3. Верификация и Тесты

- **Всего тестов:** **4 passed** (vitest).
- `StudioImportDialog.test.tsx` — 4/4.
- `tsc --noEmit` — 0 ошибок.
- `npm run build` — зелёный.

---

## 4. Стены и ограничения

- `App.tsx` не трогали — `checkId` не прокидывается в `StudioWorkspace`, диалог берёт текущую проверку через `getActiveCheckId()` из `localStorage`.
- Проверку-источник не открываем — только читаем manifest из `localStorage`.
- `test_suites` руками не меняем — всё через `mergeEditorBlocks`/`selectBlocks`.
- `docs/manifest.json` не менялся.