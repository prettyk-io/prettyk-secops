/**
 * EPIC-REPLAY-DIFF A: compare two CheckRunRef (newest vs previous).
 */

import type { CheckRunRef } from './types';

export type RunDiffField = 'status' | 'ci_verdict';

export type RunDiffChange = {
  field: RunDiffField;
  from: string;
  to: string;
};

export type RunDiffResult = {
  newer_run_id: string;
  older_run_id: string;
  changed: boolean;
  changes: RunDiffChange[];
  /** One-line RU for History / Results. */
  summary: string;
};

function norm(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Diff newest vs previous; runs[0] assumed newest. */
export function diffCheckRuns(
  newer: CheckRunRef | null | undefined,
  older: CheckRunRef | null | undefined,
): RunDiffResult | null {
  if (!newer?.run_id || !older?.run_id) {
    return null;
  }
  if (newer.run_id === older.run_id) {
    return null;
  }
  const changes: RunDiffChange[] = [];
  const ns = newer.status || 'unknown';
  const os = older.status || 'unknown';
  if (ns !== os) {
    changes.push({ field: 'status', from: os, to: ns });
  }
  const nv = norm(newer.ci_verdict) || '—';
  const ov = norm(older.ci_verdict) || '—';
  if (nv !== ov) {
    changes.push({ field: 'ci_verdict', from: ov, to: nv });
  }
  const bits = changes.map((c) => `${c.field}: ${c.from}→${c.to}`);
  const summary = changes.length
    ? `vs prev: ${bits.join('; ')}`
    : 'vs prev: без изменений (status/verdict)';
  return {
    newer_run_id: newer.run_id,
    older_run_id: older.run_id,
    changed: changes.length > 0,
    changes,
    summary,
  };
}

/** Convenience: first two entries of runs[] (newest-first). */
export function diffLatestRuns(
  runs: readonly CheckRunRef[] | null | undefined,
): RunDiffResult | null {
  if (!runs || runs.length < 2) {
    return null;
  }
  return diffCheckRuns(runs[0], runs[1]);
}
