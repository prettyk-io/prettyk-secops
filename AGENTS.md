# AGENTS — PrettyK SecOps Router

> **Product:** PrettyK SecOps Lab & Studio (DAST, Fuzzing, Playwright, Editor UI)  
> **Repo:** `prettyk-io/prettyk-secops` (ветка `dev`) · **Owner:** Максим  
> **PO / Guardian:** Keeper (Sanctuary)

---

## 1. Границы и окружение

- **Свой контур (Read/Write):** `D:\prettyk-secops`. Код, тесты, документация, бэклог.
- **Соседи по линейке (Strictly READ-ONLY через `references`):**
  - `airlock`: `D:\prettyk-airlock` (PrettyK Airlock). Не трогать WIP, не коммитить.
  - `hub`: `D:\prettyk-hub` (PrettyK Hub / Findings & QG Tribunal). Не трогать WIP, не коммитить.
  - `board`: `D:\prettyk.io\docs\board\ANNOUNCEMENTS.md` (Директивы линейки PrettyK).

---

## 2. Железобетонные инварианты (Always)

1. **Коммиты и пуши — строго по явной команде Максима.** Никаких авто-коммитов для доков или кода.
2. **Не трогать чужой WIP в git.** Никакого `git stash`, worktree или сноса чужих файлов (`.opencode/rules/no-stash-wip.mdc`).
3. **Проверка портов:** строго `netstat -ano | findstr :PORT` (никогда `Get-NetTCPConnection` — не видит IPv6 на Win11).
4. **Чтение файлов:** большие файлы читать строго чанками (`limit`/`offset`) по правилу `.opencode/rules/gemini-read-chunks.mdc`.
5. **Браузерная автоматизация:** CDP Chrome `:9222` — основной путь (`.opencode/rules/browser-cdp-only.mdc`).
6. **Каноны:** правки канонов Sanctuary — строго через 2FA-ритуал Keeper. Никаких правок «по дороге».

---

## 3. Диспетч и делегирование (PK-DIR-006)

Диспетч воркеров выполняется **строго одной строкой**:
```text
Worker, CARD-ID, D:\prettyk-secops\docs\backlog.md
```
- Один воркер = одна задача = одна строка. Без размытого владения вида «Boss + Luna».
- Воркер начинает сессию с чтения `PROGRESS.md` + `git log --oneline -10`.
- По завершении воркер обновляет статус в `docs/backlog.md` и пишет строку в `PROGRESS.md`.

---

## 4. Карта навигации (Cartography)

Не блуждай по репозиторию — используй карты и реестры:

| Документ | Назначение |
|---|---|
| [`docs/MAP.md`](docs/MAP.md) | **Архитектурная карта:** Mermaid-топология компонентов, порты и контрактные границы |
| [`docs/INDEX.md`](docs/INDEX.md) | **Навигатор:** таблица «какой файл отвечает на какой вопрос» |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md) | **Руководство:** запуск стенда, пульты, тестирование, модели, чеклисты гита |
| [`PROGRESS.md`](PROGRESS.md) | **Журнал репозитория:** текущее состояние, последние действия и следующие шаги |
| [`docs/backlog.md`](docs/backlog.md) | **QUEUE:** оперативный верстак, активные и закрытые карточки задач |
| [`sanctuary/pure/INDEX.md`](sanctuary/pure/INDEX.md) | **Канон Святилища:** запечатанный реестр принятых истин (2FA sealed) |
| [`D:\prettyk\docs\board\ANNOUNCEMENTS.md`](../prettyk/docs/board/ANNOUNCEMENTS.md) | **Доска линейки:** актуальные директивы (PK-DIR-XXX) и межпродуктовый статус |
