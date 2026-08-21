/**
 * Pretty constructor segment walk for variable harvest (S3776).
 */
import { rootNameFromRefPath, stripRef } from './refs';
import { matchElementDecl, matchPrettyAssign } from './textScan';

function isPrettySegmentBoundary(line: string, i: number): boolean {
  if (i === line.length) {
    return true;
  }
  const ch = line[i]!;
  if (ch === ';') {
    return true;
  }
  return ch === '{' && (i === 0 || line[i - 1] !== '$');
}

/** Сегменты по `;` / `{`, но не ломаем `${…}` (граница `{` только если не `$`). */
export function forEachPrettySegment(text: string, visit: (segment: string) => void): void {
  for (const line of text.split('\n')) {
    let start = 0;
    for (let i = 0; i <= line.length; i += 1) {
      if (!isPrettySegmentBoundary(line, i)) {
        continue;
      }
      if (i > start) {
        visit(line.slice(start, i));
      }
      start = i === line.length ? i : i + 1;
    }
  }
}

function addRootFromLhs(found: Set<string>, raw: string): void {
  const fromRef = stripRef(raw);
  const path = fromRef ?? (raw.startsWith('$') ? raw.slice(1) : raw);
  const root = rootNameFromRefPath(path);
  if (root !== undefined) {
    found.add(root);
  }
}

export function collectNamesFromPrettySegments(text: string, found: Set<string>): void {
  forEachPrettySegment(text, (segment) => {
    const assign = matchPrettyAssign(segment);
    if (assign) {
      addRootFromLhs(found, assign.lhs);
    }
    const el = matchElementDecl(segment);
    if (el) {
      found.add(el);
    }
  });
}
