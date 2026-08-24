/**
 * FE-12: DocumentSemanticTokens — узкий слой поверх monarch.
 * slice1: Секрет + MethodId root
 * slice2: Пусть + locator strategies (css|xpath|id|name)
 */
import { resolveMethodIdLabel } from '../keywords/methodIds';

export const PRETTYK_SEMANTIC_TOKEN_TYPES = [
  'keyword',
  'function',
  'parameter',
] as const;

export type PrettykSemanticKind = 'secret' | 'let' | 'method' | 'locator';

export type PrettykSemanticSpan = {
  line: number; // 0-based
  start: number; // 0-based UTF-16
  length: number;
  kind: PrettykSemanticKind;
};

const ROOT_WORD =
  /^(\s*)([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)/;

const LOCATOR_RE = /\b(css|xpath|id|name)\b/gi;

const KIND_TYPE_INDEX: Record<PrettykSemanticKind, number> = {
  secret: 0,
  let: 0,
  method: 1,
  locator: 2,
};

/** Pure classifier for vitest / provider. */
export function collectPrettykSemanticSpans(text: string): PrettykSemanticSpan[] {
  const out: PrettykSemanticSpan[] = [];
  const lines = (text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.trimStart().startsWith('#')) {
      continue;
    }
    const m = ROOT_WORD.exec(line);
    if (m) {
      const indent = m[1]?.length ?? 0;
      const word = m[2];
      if (word === undefined) {
        continue;
      }
      if (word === 'Секрет') {
        out.push({ line: i, start: indent, length: word.length, kind: 'secret' });
      } else if (word === 'Пусть') {
        out.push({ line: i, start: indent, length: word.length, kind: 'let' });
      } else if (resolveMethodIdLabel(word)) {
        out.push({ line: i, start: indent, length: word.length, kind: 'method' });
      }
    }
    LOCATOR_RE.lastIndex = 0;
    let loc: RegExpExecArray | null;
    while ((loc = LOCATOR_RE.exec(line)) !== null) {
      out.push({
        line: i,
        start: loc.index,
        length: loc[0].length,
        kind: 'locator',
      });
    }
  }
  return out;
}

/** Encode spans → Monaco semantic tokens Int32Array (delta line/char). */
export function encodePrettykSemanticTokens(spans: PrettykSemanticSpan[]): Uint32Array {
  const sorted = [...spans].sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.start - b.start,
  );
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const span of sorted) {
    const typeIdx = KIND_TYPE_INDEX[span.kind];
    const deltaLine = span.line - prevLine;
    const deltaStart = deltaLine === 0 ? span.start - prevChar : span.start;
    data.push(deltaLine, deltaStart, span.length, typeIdx, 0);
    prevLine = span.line;
    prevChar = span.start;
  }
  return new Uint32Array(data);
}
