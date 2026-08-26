# Reference-снимок старого Studio + Editor (до перевода на v2)

> **Дата снимка:** 27 августа 2026 года
> **Зачем:** временный filesystem-снимок старого Studio и Editor, пока переводим
> на новые v2. Не удалять — это обращение «как было там».
> **Источник:** `frontend/src/{studio,workbench,terminal,wired}/`
> **Это НЕ компилируемый код и НЕ отдельная ветка.** Просто копия для референса.

## Состав

| Каталог | Что было |
|---|---|
| `studio/` | общий монолит: старый `StudioWorkspace.tsx` (~1500 строк), `StudioLaunchpad`, приватное семейство `studioWorkspace*`, плюс разделяемая инфраструктура и новый `StudioV2.tsx` |
| `workbench/` | старый Editor: `EditorWorkbench.tsx` (монолит ~1248 строк) |
| `terminal/` | старый Editor-слой: `BrowserStage`, `DiscoveryOverlay`, `useCdpRecorder`, `PolicyLens`, `evidenceBridge` и др. |
| `wired/` | `wiredDslCodec.ts` и DSL-кодек |

## Как читать

Старый Studio — роут `#/studio` → `#/checks/:id/studio` (через AppShell).
Старый Editor — `EditorWorkbench` внутри единого check workspace.
Новый Studio — `StudioV2.tsx` на `#/studio-v2` с `BuddyDockController`.

Снимок не участвует в сборке. Удалять только после полного перевода на v2 и
по явной команде Максима.
