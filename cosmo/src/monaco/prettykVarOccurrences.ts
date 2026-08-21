/**
 * PrettyK `$name` / Пусть·Секрет declarations harvest (S3776).
 * Объявления ищем по сегментам (`;`, `{`) — внутри Цикл / Если / Операция.
 */
import { findRefsInText, stripRef } from '../keywords/refs';
import { forEachPrettySegment } from '../keywords/variablesPrettySegments';
import { matchPrettyAssign } from '../keywords/textScan';

export interface VarOccurrence {
  name: string;
  line: number;
  startColumn: number;
  endColumn: number;
  isDeclaration: boolean;
}

function declLhsName(raw: string): { name: string; full: string } | undefined {
  const assign = matchPrettyAssign(raw);
  if (!assign) {
    return undefined;
  }
  const kind = assign.kind.toLowerCase();
  if (kind !== 'пусть' && kind !== 'секрет') {
    return undefined;
  }
  const full = assign.lhs.trim();
  if (!full) {
    return undefined;
  }
  const name = stripRef(full) ?? (full.startsWith('$') ? full.slice(1) : full);
  return { name, full };
}

/** Все Пусть/Секрет на строке (сегменты), start — 0-based индекс в строке. */
function declarationsOnLine(raw: string): { name: string; full: string; start: number }[] {
  const out: { name: string; full: string; start: number }[] = [];
  forEachPrettySegment(raw, (segment) => {
    const decl = declLhsName(segment);
    if (!decl) {
      return;
    }
    const segAt = raw.indexOf(segment);
    const local = segment.indexOf(decl.full);
    if (segAt < 0 || local < 0) {
      return;
    }
    out.push({ name: decl.name, full: decl.full, start: segAt + local });
  });
  return out;
}

export function collectVarOccurrences(text: string): VarOccurrence[] {
  const lines = text.split(/\r?\n/);
  const out: VarOccurrence[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = i + 1;
    const decls = declarationsOnLine(raw);
    const seenDeclKeys = new Set<string>();

    for (const ref of findRefsInText(raw)) {
      const name = ref.path;
      if (!name) {
        continue;
      }
      const startColumn = ref.start + 1;
      const isDeclaration = decls.some((d) => d.name === name && d.start === ref.start);
      if (isDeclaration) {
        seenDeclKeys.add(`${name}@${String(ref.start)}`);
      }
      out.push({
        name,
        line,
        startColumn,
        endColumn: startColumn + ref.token.length,
        isDeclaration,
      });
    }

    for (const decl of decls) {
      const key = `${decl.name}@${String(decl.start)}`;
      if (seenDeclKeys.has(key)) {
        continue;
      }
      out.push({
        name: decl.name,
        line,
        startColumn: decl.start + 1,
        endColumn: decl.start + 1 + decl.full.length,
        isDeclaration: true,
      });
    }
  }
  return out;
}

export function findVarDefinition(text: string, name: string): VarOccurrence | undefined {
  return collectVarOccurrences(text).find((o) => o.isDeclaration && o.name === name);
}

export function findVarReferences(text: string, name: string): VarOccurrence[] {
  return collectVarOccurrences(text).filter((o) => o.name === name);
}
