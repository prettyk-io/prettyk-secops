import { describe, expect, it } from 'vitest';
import {
  deployGateFromVerdict,
  resolveDeployGateSignal,
} from './deployGateFromVerdict';
import type { CheckInstance } from '../checks/types';

describe('deployGateFromVerdict', () => {
  it('maps admission verdicts', () => {
    expect(deployGateFromVerdict('pass')).toBe('pass');
    expect(deployGateFromVerdict('pass_edge')).toBe('pass');
    expect(deployGateFromVerdict('pass_watch')).toBe('watch');
    expect(deployGateFromVerdict('fail_gate')).toBe('fail');
    expect(deployGateFromVerdict('fail_run')).toBeNull();
    expect(deployGateFromVerdict('running')).toBeNull();
  });

  it('prefers newest ci_verdict over older evidence gate', () => {
    const checks: CheckInstance[] = [
      {
        check_id: 'c1',
        title: 't',
        status: 'completed',
        created_at: 'a',
        updated_at: 'a',
        wired: {},
        runs: [
          {
            run_id: 'old',
            status: 'failed',
            ended_at: '2026-08-01T00:00:00Z',
            ci_verdict: 'fail_gate',
          },
          {
            run_id: 'new',
            status: 'success',
            ended_at: '2026-08-10T00:00:00Z',
            ci_verdict: 'pass',
          },
        ],
      },
    ];
    expect(
      resolveDeployGateSignal({
        checks,
        evidence: [
          {
            check_id: 'c1',
            source: 'hooks',
            history: [
              { at: '2026-08-09T00:00:00Z', check_id: 'c1', gate: 'watch' },
            ],
          },
        ],
      }),
    ).toBe('pass');
  });

  it('falls back to evidence history gate', () => {
    expect(
      resolveDeployGateSignal({
        checks: [],
        evidence: [
          {
            check_id: 'c1',
            source: 'hooks',
            history: [
              { at: '2026-08-01T00:00:00Z', check_id: 'c1', gate: 'pass' },
              { at: '2026-08-09T00:00:00Z', check_id: 'c1', gate: 'fail' },
            ],
          },
        ],
      }),
    ).toBe('fail');
  });
});
