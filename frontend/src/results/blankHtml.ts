/**
 * Бланки: Markdown → HTML → скачивание.
 * Стиль: GitHub Markdown preview + лёгкая официальная шапка (лого / реквизиты).
 */

import { FORM_LABEL, LOGO_ALT, ORG_SUBTITLE, ORG_TITLE } from './labBlankProfile';
import { marked } from 'marked';
import { buildBlankViewModel } from './blankFields';
import { renderBlankMarkdown } from './blankMarkdown';
import type { BlankPayload } from './types';

marked.setOptions({
  gfm: true,
  breaks: false,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * База — привычный рендер GFM (как .md на GitHub): воздух, иерархия, мягкие таблицы.
 * Поверх — letterhead без плашек. Печать: те же правила, без «орнамента ОРД».
 */
function printCss(): string {
  return `
    @page { size: A4; margin: 16mm 14mm; }
    :root {
      --ink: #1f2328;
      --ink-mute: #59636e;
      --paper: #ffffff;
      --border: #d1d9e0;
      --border-muted: #e6eaef;
      --code-bg: #f6f8fa;
      --quote-border: #d1d9e0;
      --accent-line: #d1d9e0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--paper);
      color: var(--ink);
    }
    body {
      font-family: "PT Astra Sans", -apple-system, BlinkMacSystemFont, "Segoe UI",
        "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      font-size: 16px;
      line-height: 1.6;
      word-wrap: break-word;
    }
    .page {
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
      padding: 28px 32px 40px;
    }

    /* Шапка: горизонтальный логотип брендбука (D10), без плашки и рамки */
    .doc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin: 0 0 18px;
      padding: 0;
      border: none;
    }
    .doc-head .logo {
      height: 80px;
      width: auto;
      max-width: 340px;
      object-fit: contain;
      display: block;
      border: none;
      outline: none;
      box-shadow: none;
      background: transparent;
    }
    .doc-head .org {
      flex: 1;
      text-align: right;
      font-size: 11pt;
      line-height: 1.35;
      color: var(--ink);
      max-width: 48%;
    }
    .doc-head .org .org-title {
      font-weight: 700;
      font-size: 11pt;
      color: var(--ink);
      margin: 0 0 3px;
    }
    .doc-head .org .form-label {
      display: inline-block;
      margin-top: 8px;
      font-size: 10pt;
      font-weight: 600;
      color: var(--ink-mute);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* Тело = markdown-body (GFM) */
    .markdown-body h1 {
      font-size: 1.75em;
      font-weight: 600;
      line-height: 1.25;
      margin: 0.4em 0 0.4em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--border);
      text-align: center;
      text-transform: none;
      letter-spacing: 0;
    }
    .markdown-body h1 + h2 {
      font-size: 1.15em;
      font-weight: 400;
      color: var(--ink-mute);
      text-align: center;
      margin: -0.2em 0 1.2em;
      padding: 0;
      border: none;
    }
    .markdown-body h2 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 1.4em 0 0.6em;
      padding-bottom: 0.25em;
      border-bottom: 1px solid var(--border-muted);
    }
    .markdown-body h3 {
      font-size: 1.2em;
      font-weight: 600;
      margin: 1.1em 0 0.45em;
      border: none;
      background: none;
      padding: 0;
    }
    .markdown-body h4 {
      font-size: 1.05em;
      font-weight: 600;
      margin: 0.7em 0 0.3em;
    }
    .markdown-body h5 {
      font-size: 1em;
      font-weight: 600;
      margin: 1em 0 0.4em;
    }
    .markdown-body p {
      margin: 0 0 0.85em;
    }
    .markdown-body ul, .markdown-body ol {
      margin: 0 0 0.85em;
      padding-left: 2em;
    }
    .markdown-body li { margin: 0.2em 0; }
    .markdown-body li + li { margin-top: 0.15em; }
    .markdown-body hr {
      height: 1px;
      padding: 0;
      margin: 1.5em 0;
      background: var(--border);
      border: 0;
      width: 100%;
    }
    .markdown-body blockquote {
      margin: 0 0 1em;
      padding: 0 1em;
      color: var(--ink-mute);
      border-left: 0.25em solid var(--quote-border);
      background: none;
      font-style: normal;
    }
    .markdown-body blockquote p { margin: 0.4em 0; }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.6em 0 1em;
      font-size: 0.95em;
      display: table;
    }
    .markdown-body th, .markdown-body td {
      border: 1px solid var(--border);
      padding: 6px 13px;
      vertical-align: top;
      background: transparent;
    }
    .markdown-body th {
      font-weight: 600;
      text-align: center;
      background: var(--code-bg);
    }
    .markdown-body td:nth-child(2) { text-align: center; width: 18%; }
    .markdown-body code {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo,
        Consolas, "Liberation Mono", monospace;
      font-size: 0.875em;
      background: var(--code-bg);
      border: 1px solid var(--border-muted);
      border-radius: 6px;
      padding: 0.15em 0.4em;
    }
    .markdown-body a {
      color: #0969da;
      text-decoration: none;
    }
    .markdown-body a:hover { text-decoration: underline; }
    .markdown-body strong { font-weight: 600; }
    .markdown-body em { font-style: italic; }

    .doc-section {
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      /* не avoid: иначе §7 «Приложение» уезжает на пустую страницу */
      page-break-inside: auto;
    }

    /* Подписи ОРД: должность | линия | расшифровка */
    .sign-block {
      margin: 22pt 0 10pt;
      page-break-inside: avoid;
    }
    .sign-lead {
      font-weight: 600;
      margin: 0 0 14pt;
      text-align: left;
    }
    .sign-lead-next {
      margin-top: 20pt;
    }
    .sign-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18pt;
      margin: 0 0 4pt;
      width: 100%;
    }
    .sign-col {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      min-width: 0;
    }
    .sign-role { flex: 1.55; text-align: left; }
    .sign-mark { flex: 1; text-align: center; }
    .sign-name { flex: 1.1; text-align: right; }
    .sign-value {
      border-bottom: 1px solid var(--ink);
      min-height: 1.15em;
      padding: 0 2pt 2pt;
      font-size: 11pt;
      line-height: 1.25;
    }
    .sign-mark .sign-value { min-width: 90pt; }
    .sign-cap {
      margin-top: 3pt;
      font-size: 9pt;
      line-height: 1.2;
      color: var(--ink-mute);
      font-weight: 400;
      text-align: center;
    }
    .sign-role .sign-cap { text-align: left; }
    .sign-name .sign-cap { text-align: right; }

    /* Приложение — плотнее, без выталкивания на пустой лист */
    .doc-appendix {
      margin-top: 10pt;
      page-break-before: auto;
      page-break-inside: auto;
    }
    .doc-appendix h3 {
      margin-top: 0.55em;
    }
    .doc-appendix p,
    .doc-appendix ul {
      margin-bottom: 0.45em;
    }

    footer.doc-foot {
      margin-top: 12pt;
      padding-top: 6pt;
      border-top: 1px solid var(--border);
      font-size: 10px;
      color: var(--ink-mute);
      line-height: 1.35;
      page-break-before: avoid;
    }

    @media print {
      body { font-size: 11pt; }
      .page { max-width: none; padding: 0; }
      .markdown-body a { color: var(--ink); text-decoration: none; }
      .markdown-body th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-appendix { page-break-before: avoid; }
      footer.doc-foot { page-break-before: avoid; }
    }
  `;
}

function letterheadHtml(logoRef: string): string {
  const logo = logoRef
    ? `<img class="logo" src="${escapeHtml(logoRef)}" alt="${escapeHtml(LOGO_ALT)}" />`
    : '';
  const subtitle = escapeHtml(ORG_SUBTITLE).replace(
    ' и тестирования',
    '<br />и тестирования',
  );
  return `
  <header class="doc-head">
    ${logo}
    <div class="org">
      <div class="org-title">${escapeHtml(ORG_TITLE)}</div>
      ${subtitle}
      <span class="form-label">${escapeHtml(FORM_LABEL)}</span>
    </div>
  </header>`;
}

/** Оборачивает блоки h3…следующий h3 (без визуальных рамок — только разметка). */
export function wrapDocSections(bodyHtml: string): string {
  const parts = bodyHtml.split(/<h3\b/i);
  if (parts.length < 2) {
    return bodyHtml;
  }
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i] ?? '';
    const appendix = /Приложение/i.test(chunk.slice(0, 120));
    const cls = appendix ? 'doc-section doc-appendix' : 'doc-section';
    out += `<section class="${cls}"><h3${chunk}</section>`;
  }
  return out;
}

/** Markdown бланка (для тестов и сборки HTML; отдельной выгрузки .md нет). */
export function blankMarkdownFromPayload(payload: BlankPayload): string {
  return renderBlankMarkdown(buildBlankViewModel(payload));
}

/** Полный HTML: letterhead + GFM-тело. */
export function renderBlankHtml(payload: BlankPayload): string {
  const vm = buildBlankViewModel(payload);
  const md = renderBlankMarkdown(vm);
  const rawBody = marked.parse(md, { async: false }) as string;
  const body = wrapDocSections(rawBody);
  const title =
    vm.kind === 'act'
      ? `Акт № ${vm.document_number}`
      : `Техническое задание № ${vm.document_number}`;
  const kindLabel = vm.kind === 'act' ? 'акт' : 'техническое задание';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${printCss()}</style>
</head>
<body>
  <div class="page">
    ${letterheadHtml(vm.logo_ref)}
    <main class="markdown-body">
${body}
    </main>
    <footer class="doc-foot">
      ${escapeHtml(kindLabel)} · шаблон ${escapeHtml(vm.template_version)}
      · идентификатор задания ${escapeHtml(vm.wired_hash)}
      · ${escapeHtml(vm.generated_at)}
      · рекомендуемый срок хранения не менее 5 лет
    </footer>
  </div>
</body>
</html>
`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadBlankHtml(payload: BlankPayload, filename?: string): void {
  const html = renderBlankHtml(payload);
  const defaultName = payload.kind === 'act' ? 'act.html' : 'regulation.html';
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), filename ?? defaultName);
}

/** @deprecated */
export const renderRegulationHtml = renderBlankHtml;
export const downloadRegulationHtml = (payload: BlankPayload): void => {
  downloadBlankHtml(payload, 'regulation.html');
};
