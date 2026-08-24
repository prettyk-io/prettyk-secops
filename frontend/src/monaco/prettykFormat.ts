/**
 * PK-TRM-8: PrettyK DSL formatter (pure).
 *
 * Нормализует отступы и пробелы DSL-документа, не трогая строки,
 * которые не являются структурой языка (комментарии, wire).
 */
import { looksLikeLanguageScript } from '../keywords/constructor';

/** Убирает CRLF и хвостовые пробелы на каждой строке. */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Обрезает trailing whitespace и схлопывает множественные пустые строки в одну. */
function trimTrailingWhitespace(lines: string[]): string[] {
  return lines.map((l) => l.replace(/[ \t]+$/g, ''));
}

/** Расставляет canonical отступы для language-блоков `Если / Цикл / Операция { ... }`. */
function indentLanguageBlocks(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  // Кириллица: `\b` не работает — проверяем, что после головы идёт пробел/{/(.
  const blockHeads = ['Если', 'ИначеЕсли', 'Иначе', 'Цикл', 'ДляКаждого', 'Пока', 'Попробовать', 'Перехватить', 'Финализировать', 'Поймать', 'ВКонце', 'Группа', 'Операция'];
  const isBoundary = (ch: string | undefined): boolean =>
    ch === undefined || ch === ' ' || ch === '\t' || ch === '{' || ch === '(';
  const isOpener = (t: string): boolean =>
    blockHeads.some((kw) => t.startsWith(kw) && isBoundary(t[kw.length])) && t.includes('{');
  const isCloser = (t: string): boolean => t === '}';

  let indent = 0;
  const INDENT_UNIT = '  ';

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }

    if (isCloser(trimmed)) {
      indent = Math.max(0, indent - 1);
      out.push(INDENT_UNIT.repeat(indent) + trimmed);
      continue;
    }

    out.push(INDENT_UNIT.repeat(indent) + trimmed);

    if (isOpener(trimmed)) {
      indent += 1;
    }
  }

  return out.join('\n');
}

/** Форматирует PrettyK DSL-документ. Возвращает (formatted, changed). */
export function formatPrettykDocument(text: string): { formatted: string; changed: boolean } {
  const normalized = normalizeLineEndings(text);
  const isLanguage = looksLikeLanguageScript(normalized);

  let formatted: string;
  if (isLanguage) {
    formatted = indentLanguageBlocks(normalized);
  } else {
    // Wire/plain: только обрезка хвостовых пробелов и нормализация концов строк
    formatted = trimTrailingWhitespace(normalized.split('\n')).join('\n');
  }

  return { formatted, changed: formatted !== text };
}