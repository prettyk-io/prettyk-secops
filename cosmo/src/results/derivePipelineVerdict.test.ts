import { describe, expect, it } from 'vitest';
import { computePipelineVerdict } from './derivePipelineVerdict';

describe('computePipelineVerdict', () => {
  it('maps fail/pass/watch', () => {
    expect(computePipelineVerdict({ phase: 'in_progress' })).toBe('running');
    expect(computePipelineVerdict({ conclusion: 'failure' })).toBe('fail_run');
    expect(computePipelineVerdict({ gate: 'fail' })).toBe('fail_gate');
    expect(
      computePipelineVerdict({
        phase: 'completed',
        conclusion: 'success',
        risk_hints: { highest_severity: 'medium' },
      }),
    ).toBe('pass_watch');
  });
});
