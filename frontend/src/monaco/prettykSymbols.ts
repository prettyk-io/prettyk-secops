/**
 * DocumentSymbol / Outline для PrettyK (ED1): Пусть, вызовы, грубые блоки.
 */
import type * as monacoNs from 'monaco-editor';

export type PrettykSymbolKind = 'variable' | 'call' | 'block' | 'pageCall';

export interface PrettykSymbol {
  name: string;
  kind: PrettykSymbolKind;
  /** 1-based line */
  line: number;
  /** 1-based start column */
  column: number;
  endLine: number;
  endColumn: number;
  detail?: string;
}

const LET_RE = /^\s*(Пусть|Секрет)\s+(\$[A-Za-z_][\w.]*)/;
const PAGE_CALL_RE = /^\s*([A-Za-z_]\w*)\.([\p{L}_][\p{L}\w]*)/u;
/** `\b` не работает для кириллицы — граница = пробел / конец / не-идентификатор. */
const BLOCK_RE =
  /^\s*(Если|ИначеЕсли|Иначе|Цикл|Пока|Попытка|Лови|Наконец)(?=[\s#]|$|[^\wА-Яа-яЁё])/;
/** MethodId / языковой вызов в начале строки (грубо). */
const CALL_RE = /^\s*([A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*)/;

const SKIP_CALL = new Set([
  'Если',
  'ИначеЕсли',
  'Иначе',
  'Цикл',
  'Пока',
  'Попытка',
  'Лови',
  'Наконец',
  'Пусть',
  'Секрет',
  'Объект',
  'Операция',
]);

function lineRange(line: number, text: string): Pick<PrettykSymbol, 'line' | 'column' | 'endLine' | 'endColumn'> {
  const indent = text.match(/^\s*/)?.[0].length ?? 0;
  return {
    line,
    column: indent + 1,
    endLine: line,
    endColumn: Math.max(indent + 2, text.length + 1),
  };
}

/** Чистый extract — без Monaco (unit ED1). */
export function extractPrettykSymbols(text: string): PrettykSymbol[] {
  const lines = text.split(/\r?\n/);
  const out: PrettykSymbol[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = i + 1;
    if (!raw.trim() || raw.trimStart().startsWith('#')) {
      continue;
    }

    const letMatch = LET_RE.exec(raw);
    if (letMatch) {
      const name = letMatch[2] ?? '';
      const col = (letMatch.index ?? 0) + letMatch[0].indexOf(name) + 1;
      out.push({
        name,
        kind: 'variable',
        detail: letMatch[1],
        line,
        column: col,
        endLine: line,
        endColumn: col + name.length,
      });
      continue;
    }

    const pageMatch = PAGE_CALL_RE.exec(raw);
    if (pageMatch) {
      const pageId = pageMatch[1] ?? '';
      const op = pageMatch[2] ?? '';
      out.push({
        name: `${pageId}.${op}`,
        kind: 'pageCall',
        detail: 'page',
        ...lineRange(line, raw),
      });
      continue;
    }

    const blockMatch = BLOCK_RE.exec(raw);
    if (blockMatch) {
      out.push({
        name: blockMatch[1] ?? 'блок',
        kind: 'block',
        ...lineRange(line, raw),
      });
      continue;
    }

    const callMatch = CALL_RE.exec(raw);
    if (callMatch) {
      const name = callMatch[1] ?? '';
      if (SKIP_CALL.has(name)) {
        continue;
      }
      const col = (callMatch.index ?? 0) + callMatch[0].indexOf(name) + 1;
      out.push({
        name,
        kind: 'call',
        line,
        column: col,
        endLine: line,
        endColumn: col + name.length,
      });
    }
  }
  return out;
}

function monacoKind(
  monaco: typeof monacoNs,
  kind: PrettykSymbolKind,
): monacoNs.languages.SymbolKind {
  switch (kind) {
    case 'variable':
      return monaco.languages.SymbolKind.Variable;
    case 'pageCall':
      return monaco.languages.SymbolKind.Object;
    case 'block':
      return monaco.languages.SymbolKind.Namespace;
    default:
      return monaco.languages.SymbolKind.Function;
  }
}

export function createPrettykDocumentSymbolProvider(
  monaco: typeof monacoNs,
): monacoNs.languages.DocumentSymbolProvider {
  return {
    provideDocumentSymbols(model) {
      return extractPrettykSymbols(model.getValue()).map((sym) => {
        const range = {
          startLineNumber: sym.line,
          startColumn: sym.column,
          endLineNumber: sym.endLine,
          endColumn: sym.endColumn,
        };
        return {
          name: sym.name,
          detail: sym.detail ?? '',
          kind: monacoKind(monaco, sym.kind),
          tags: [],
          range,
          selectionRange: range,
        } satisfies monacoNs.languages.DocumentSymbol;
      });
    },
  };
}
