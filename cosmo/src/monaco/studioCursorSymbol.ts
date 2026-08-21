/**
 * FE-ED-4: символ под курсором для HUD ($var / page.Op / MethodId).
 */
import { resolveMethodIdLabel } from '../keywords/methodIds';
import { methodIdAt } from './prettykHover';

/** Explicit classes — avoid \\w nested class (Sonar S6397 / S8786). */
const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_.]*)\}|\$([A-Za-z_][A-Za-z0-9_.]*)/g;

function isAsciiIdentStart(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}

function isAsciiIdentCont(ch: string): boolean {
  return isAsciiIdentStart(ch) || (ch >= '0' && ch <= '9');
}

function isRuIdentStart(ch: string): boolean {
  return (
    isAsciiIdentStart(ch) ||
    (ch >= 'А' && ch <= 'Я') ||
    (ch >= 'а' && ch <= 'я') ||
    ch === 'Ё' ||
    ch === 'ё'
  );
}

function isRuIdentCont(ch: string): boolean {
  return isRuIdentStart(ch) || (ch >= '0' && ch <= '9');
}

function scanAsciiIdent(lineText: string, start: number): number {
  let i = start;
  while (i < lineText.length && isAsciiIdentCont(lineText[i]!)) {
    i += 1;
  }
  return i;
}

function scanRuIdent(lineText: string, start: number): number {
  let i = start;
  while (i < lineText.length && isRuIdentCont(lineText[i]!)) {
    i += 1;
  }
  return i;
}

/** One `left.right` token starting at leftStart, or null + next index. */
function pageOpTokenAt(
  lineText: string,
  leftStart: number,
): { token: string; next: number } | null {
  const afterLeft = scanAsciiIdent(lineText, leftStart + 1);
  if (lineText[afterLeft] !== '.') {
    return null;
  }
  const rightStart = afterLeft + 1;
  if (rightStart >= lineText.length || !isRuIdentStart(lineText[rightStart]!)) {
    return { token: '', next: rightStart };
  }
  const end = scanRuIdent(lineText, rightStart + 1);
  return { token: lineText.slice(leftStart, end), next: end };
}

/** Linear scan for page.Op under 1-based column — no regex backtracking (S8786). */
function pageOpAtColumn(lineText: string, column: number): string | undefined {
  const focus = column - 1;
  if (focus < 0 || focus >= lineText.length) {
    return undefined;
  }
  let i = 0;
  while (i < lineText.length) {
    if (!isAsciiIdentStart(lineText[i]!)) {
      i += 1;
      continue;
    }
    const leftStart = i;
    const hit = pageOpTokenAt(lineText, leftStart);
    if (!hit) {
      i = scanAsciiIdent(lineText, leftStart + 1);
      continue;
    }
    if (!hit.token) {
      i = hit.next;
      continue;
    }
    const startCol = leftStart + 1;
    const endCol = hit.next;
    if (column >= startCol && column <= endCol) {
      return hit.token;
    }
    i = hit.next;
  }
  return undefined;
}

function matchAtColumn(
  lineText: string,
  column: number,
  re: RegExp,
  pick: (match: RegExpExecArray) => string,
): string | undefined {
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lineText)) !== null) {
    const start = match.index + 1;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return pick(match);
    }
  }
  return undefined;
}

/** Символ под 1-based column; пусто если нечего показать. */
export function symbolAtCursor(lineText: string, column: number): string {
  const varHit = matchAtColumn(lineText, column, VAR_RE, (m) => m[0]!);
  if (varHit) {
    return varHit;
  }
  const pageHit = pageOpAtColumn(lineText, column);
  if (pageHit) {
    return pageHit;
  }
  const token = methodIdAt(lineText, column);
  if (token && resolveMethodIdLabel(token)) {
    return token;
  }
  return '';
}

export function formatCursorHud(line: number, column: number, symbol: string): string {
  const pos = `${String(line)}:${String(column)}`;
  const trimmed = symbol.trim();
  return trimmed ? `${pos} · ${trimmed}` : pos;
}
