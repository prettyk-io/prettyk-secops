# MONITOR-HEADER: унификация бренда SecOps Lab в хедере Monitor

> **CANON** — hub topic. Slice: **15 августа 2026** (2FA: зачисление из friend-request).
> As-built: `orchestrator/static/live/index.html` (строки 146–178, 579–580 — эталон: `cosmo/src/shell/Wordmark.tsx`).
> Реестр: [`INDEX.md`](INDEX.md).
> **Оговорка:** дозреет до общего FRIEND «Коробочный бренд» — тогда 2FA-update.

## Тезис

Хедер Monitor (`orchestrator/static/live/index.html`) использует тот же wordmark, что и всё семейство SecOps Lab: скобка SVG + цветокодированный «Sec/Ops/Lab» + measure‑bar. Единый визуальный стиль через копирование CSS/HTML-фрагментов из React-эталона (`Wordmark.tsx`), поскольку Monitor — ванильный HTML/CSS/JS.

## As-built якорь (что меняется в `index.html`)

1. SVG bracket: 20×20 (как в `Wordmark.tsx`), цвета `#8ab4f8`.
2. Текст: `.sec` = `#f8fafc`, `.ops` = `#8ab4f8`, `.lab` = `#f8fafc`.
3. `margin-left: 6px` для `.lab` (CSS), убрать пробел из HTML.
4. Measure-bar: `linear-gradient(90deg, #8ab4f8 0%, #8ab4f8 65%, #334155 65%, #334155 80%, #8ab4f8 80%, #8ab4f8 100%)`.
5. Заголовок: wordmark + «Monitor» после него, без разрыва бренда.

## Честная «не обещаем»

- Monitor — не React, поэтому не шарим компонент — копируем CSS/HTML.
- Light-тема пока не применяется к Monitor (всегда тёмная).
- Дозреет до FRIEND «Коробочный бренд» — тогда обновим 2FA.