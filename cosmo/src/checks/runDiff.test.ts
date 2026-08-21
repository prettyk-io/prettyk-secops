import { describe, expect, it } from 'vitest';
import { diffCheckRuns, diffLatestRuns } from './runDiff';
import type { CheckRunRef } from './types';

const run = (partial: Partial<CheckRunRef> & { run_id: string }): CheckRunRef => ({
  status: 'success',
  ...partial,
});

describe('diffCheckRuns', () => {
  it('returns null without pair', () => {
    expect(diffCheckRuns(null, run({ run_id: 'a' }))).toBeNull();
    expect(diffLatestRuns([run({ run_id: 'a' })])).toBeNull();
  });

  it('reports status and verdict changes', () => {
    const d = diffCheckRuns(
      run({ run_id: 'n', status: 'failed', ci_verdict: 'fail_gate' }),
      run({ run_id: 'o', status: 'success', ci_verdict: 'pass' }),
    );
    expect(d?.changed).toBe(true);
    expect(d?.summary).toContain('status: success→failed');
    expect(d?.summary).toContain('ci_verdict: pass→fail_gate');
  });

  it('stable summary when equal', () => {
    const d = diffLatestRuns([
      run({ run_id: 'n', status: 'success', ci_verdict: 'pass' }),
      run({ run_id: 'o', status: 'success', ci_verdict: 'pass' }),
    ]);
    expect(d?.changed).toBe(false);
    expect(d?.summary).toContain('без изменений');
  });
});
