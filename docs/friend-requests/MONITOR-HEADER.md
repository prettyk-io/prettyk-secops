# MONITOR-HEADER: унификация бренда SecOps Lab в хедере Monitor

`lane: ready` → **принят 15 авг 2026 (2FA одобрен).** Зачислен в hub как `CANON`. См. `monitor-header.md`.

## Тезис

Заменить текущий хардкод-хедер `orchestrator/static/live/index.html` на тот же wordmark, что используется в семействе SecOps Lab (HomePage, Login, Admin, History). Единый визуальный стиль: скобка SVG + цветокодированный «SecOps Lab» + measure‑bar. Margin перед «Lab» — 6px (канон из `Wordmark.tsx` `.kdt-secops-mark-lab` `margin-left: 6px`).

## As-built якорь

### Текущее состояние Monitor (что есть)
- Файл: `orchestrator/static/live/index.html` (строки 579–580)
- Хедер рендерится ванильным HTML + inline CSS:
  ```html
  <h1>
    <span class="kdt-secops-mark">
      <svg class="target-bracket" viewBox="0 0 12 12" width="11" height="11">…</svg>
      <span class="sec">Sec</span><span class="ops">Ops</span>
      <span class="lab"> Lab</span>
      <span class="measure-bar"></span>
    </span>
    Automation Monitoring
  </h1>
  ```
- CSS: строки 146–178 (`.kdt-secops-mark`, `.target-bracket`, `.sec`, `.ops`, `.lab`, `.measure-bar`).
- Нет `margin-left` перед `.lab` — только пробел в HTML-тексте.

### Эталон (React-фронт)
- Файл: `cosmo/src/shell/Wordmark.tsx`
- Компонент: `<Wordmark>` — SVG bracket (width=20, height=20), `<span className="kdt-secops-mark-sec">Sec</span>`, `<span className="kdt-secops-mark-ops">Ops</span>`, `<span className="kdt-secops-mark-lab">Lab</span>`, measure‑bar.
- CSS (из `cosmo/src/styles.css`):
  ```css
  .kdt-secops-mark-lab {
    color: var(--kdt-text, #f8fafc);
    margin-left: 6px;
  }
  ```
- Тёмная тема: bracket stroke/fill = `#8ab4f8`, `.sec` = `#f8fafc`, `.ops` = `#8ab4f8`, `.lab` = `#f8fafc`.
- Полоска: `linear-gradient(90deg, #8ab4f8 0%, #8ab4f8 65%, #334155 65%, #334155 80%, #8ab4f8 80%, #8ab4f8 100%)`.

## Что сделать
1. Заменить inline SVG bracket в `index.html` на размер 20×20 (как в `Wordmark.tsx`).
2. Зеркалировать цвета bracket и текста из `Wordmark.tsx` (`#8ab4f8` / `#f8fafc`).
3. Добавить `margin-left: 6px` для `.lab` в CSS.
4. Заголовок: «SecOps Lab» (wordmark) + «Monitor» / «Automation Monitoring» после него, без разрыва бренда.

## К какому FRIEND дозреет

К FRIEND «Коробочный бренд» (Wordmark — столп identity). Возможно, отдельный тонкий FRIEND `MONITOR-BRAND` когда Monitor получит больше кастомных экранов.

## Честная «не обещаем»

- Monitor — ванильный HTML/CSS/JS, не React. Решение: копирование CSS/HTML-фрагментов из эталона, не шаринг компонента.
- Light-тема пока не применяется к Monitor (всегда тёмная).
- Иконка `secops-monitor-icon.svg` не трогается — только хедер.