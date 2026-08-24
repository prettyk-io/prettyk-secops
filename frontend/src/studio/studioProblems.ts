/**
 * Problems strip helpers (ED6): сортировка маркеров и «к следующей проблеме».
 */
import type { editor } from 'monaco-editor';

export type ProblemMarker = Pick<
  editor.IMarker,
  'severity' | 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn' | 'message'
>;

export function compareProblemMarkers(a: ProblemMarker, b: ProblemMarker): number {
  if (a.startLineNumber !== b.startLineNumber) {
    return a.startLineNumber - b.startLineNumber;
  }
  return a.startColumn - b.startColumn;
}

export function countProblemSeverities(
  markers: readonly ProblemMarker[],
  errorSeverity: number,
  warningSeverity: number,
): { errors: number; warnings: number; total: number } {
  let errors = 0;
  let warnings = 0;
  for (const m of markers) {
    if (m.severity === errorSeverity) {
      errors += 1;
    } else if (m.severity === warningSeverity) {
      warnings += 1;
    }
  }
  return { errors, warnings, total: errors + warnings };
}

/** Индекс следующего маркера после позиции; wrap к 0. */
export function nextProblemIndex(
  markers: readonly ProblemMarker[],
  line: number,
  column: number,
): number {
  if (markers.length === 0) {
    return -1;
  }
  const sorted = [...markers].sort(compareProblemMarkers);
  for (let i = 0; i < sorted.length; i += 1) {
    const m = sorted[i]!;
    if (
      m.startLineNumber > line ||
      (m.startLineNumber === line && m.startColumn > column)
    ) {
      return i;
    }
  }
  return 0;
}
