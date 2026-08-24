import { describe, expect, it } from 'vitest';
import {
  derivePipelineVerdict,
  pipelineStatusFromMeta,
  verdictToExecutiveClass,
} from './pipelineVerdict';

describe('derivePipelineVerdict', () => {
  it('maps in_progress / queued → running', () => {
    expect(derivePipelineVerdict({ phase: 'in_progress' })).toBe('running');
    expect(derivePipelineVerdict({ phase: 'queued' })).toBe('running');
  });

  it('maps exit 0 + gate pass → pass', () => {
    expect(
      derivePipelineVerdict({ phase: 'completed', exit_code: 0, gate: 'pass' }),
    ).toBe('pass');
  });

  it('maps soft findings → pass_watch', () => {
    expect(
      derivePipelineVerdict({
        phase: 'completed',
        exit_code: 0,
        gate: 'pass',
        risk_hints: { highest_severity: 'Medium' },
      }),
    ).toBe('pass_watch');
  });

  it('maps elevated → pass_edge', () => {
    expect(
      derivePipelineVerdict({
        phase: 'completed',
        exit_code: 0,
        risk_hints: { elevated: true },
      }),
    ).toBe('pass_edge');
  });

  it('maps exit 2 / gate fail → fail_gate', () => {
    expect(derivePipelineVerdict({ exit_code: 2 })).toBe('fail_gate');
    expect(derivePipelineVerdict({ gate: 'fail' })).toBe('fail_gate');
  });

  it('maps exit 1 / GHA failure → fail_run', () => {
    expect(derivePipelineVerdict({ exit_code: 1 })).toBe('fail_run');
    expect(derivePipelineVerdict({ conclusion: 'failure' })).toBe('fail_run');
    expect(derivePipelineVerdict({ conclusion: 'cancelled' })).toBe('fail_run');
    expect(derivePipelineVerdict({ gate: 'void' })).toBe('fail_run');
  });

  it('debug void + exit 0 is not fail_run', () => {
    expect(
      derivePipelineVerdict({
        phase: 'completed',
        conclusion: 'success',
        exit_code: 0,
        gate: 'void',
        risk_hints: { admission_void: true, debug_mode: true },
      }),
    ).toBe('pass');
  });

  it('maps empty → idle', () => {
    expect(derivePipelineVerdict({})).toBe('idle');
  });
});

describe('verdictToExecutiveClass', () => {
  it('bridges RES-5 classes', () => {
    expect(verdictToExecutiveClass('pass')).toBe('Pass');
    expect(verdictToExecutiveClass('pass_watch')).toBe('Watch');
    expect(verdictToExecutiveClass('fail_gate')).toBe('High');
    expect(verdictToExecutiveClass('fail_run')).toBeUndefined();
  });
});

describe('pipelineStatusFromMeta', () => {
  it('idle without ci fields', () => {
    expect(pipelineStatusFromMeta({ status: 'waiting' }).verdict).toBe('idle');
  });

  it('derives from ci_* meta', () => {
    const st = pipelineStatusFromMeta({
      ci_phase: 'completed',
      ci_exit_code: 2,
      ci_job_name: 'orchestrator',
      ci_job_url: 'https://github.com/x/y/actions/runs/1',
    });
    expect(st.verdict).toBe('fail_gate');
    expect(st.job_name).toBe('orchestrator');
    expect(st.job_url).toContain('actions/runs');
  });
});
