// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRunRefFromLiveMeta,
  checkRunStatusFromLiveMeta,
  syncActiveCheckRunFromLive,
} from './checkRunFromLive';
import {
  __resetChecksStoreForTests,
  createCheck,
  getCheck,
  setActiveCheckId,
  upsertCheckRun,
} from './checksStore';

afterEach(() => {
  __resetChecksStoreForTests();
});

describe('checkRunFromLive', () => {
  it('maps running session', () => {
    const ref = checkRunRefFromLiveMeta({
      session_name: 'lab-42',
      status: 'running',
      ci_phase: 'in_progress',
      ci_verdict: 'running',
    });
    expect(ref?.run_id).toBe('lab-42');
    expect(ref?.status).toBe('running');
  });

  it('prefers last_export_run_id after finish', () => {
    const ref = checkRunRefFromLiveMeta({
      session_name: 'idle',
      status: 'waiting',
      last_export_run_id: 'pack-9',
      last_export_at: 1_700_000_000,
      ci_exit_code: 2,
      ci_verdict: 'fail_gate',
      ci_gate: 'fail',
      ci_phase: 'completed',
      ci_conclusion: 'success',
    });
    expect(ref?.run_id).toBe('pack-9');
    expect(ref?.status).toBe('failed');
    expect(ref?.ended_at).toBeTruthy();
  });

  it('ignores idle without export', () => {
    expect(
      checkRunRefFromLiveMeta({ session_name: 'idle', status: 'waiting' }),
    ).toBeNull();
  });

  it('syncActiveCheckRunFromLive upserts active check', () => {
    const item = createCheck({ wired: { meta: { name: 'R' } }, status: 'ready' });
    setActiveCheckId(item.check_id);
    syncActiveCheckRunFromLive({
      session_name: 'run-a',
      status: 'running',
      ci_phase: 'in_progress',
      ci_verdict: 'running',
    });
    const got = getCheck(item.check_id);
    expect(got?.runs).toHaveLength(1);
    expect(got?.runs[0]?.run_id).toBe('run-a');
    expect(got?.status).toBe('running');
  });

  it('syncActiveCheckRunFromLive respects meta.check_id even if other check is active', () => {
    const itemA = createCheck({ wired: { meta: { name: 'A' } }, status: 'ready' });
    const itemB = createCheck({ wired: { meta: { name: 'B' } }, status: 'ready' });
    setActiveCheckId(itemB.check_id);

    syncActiveCheckRunFromLive({
      check_id: itemA.check_id,
      session_name: 'run-for-a',
      status: 'running',
      ci_phase: 'in_progress',
      ci_verdict: 'running',
    });

    const gotA = getCheck(itemA.check_id);
    const gotB = getCheck(itemB.check_id);
    expect(gotA?.runs).toHaveLength(1);
    expect(gotA?.runs[0]?.run_id).toBe('run-for-a');
    expect(gotB?.runs).toHaveLength(0);
  });
});

describe('upsertCheckRun', () => {
  it('merges same run_id and caps list', () => {
    const item = createCheck({ wired: {}, status: 'draft' });
    upsertCheckRun(item.check_id, {
      run_id: 'r1',
      status: 'running',
      started_at: '2026-01-01T00:00:00.000Z',
    });
    upsertCheckRun(item.check_id, {
      run_id: 'r1',
      status: 'success',
      ci_verdict: 'pass',
    });
    const runs = getCheck(item.check_id)?.runs ?? [];
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('success');
    expect(runs[0]?.started_at).toBe('2026-01-01T00:00:00.000Z');
    expect(getCheck(item.check_id)?.status).toBe('completed');
  });
});

describe('checkRunStatusFromLiveMeta', () => {
  it('maps pass_watch → success', () => {
    expect(
      checkRunStatusFromLiveMeta({
        ci_phase: 'completed',
        ci_conclusion: 'success',
        ci_exit_code: 0,
        ci_verdict: 'pass_watch',
        ci_risk_hints: { highest_severity: 'medium' },
      }),
    ).toBe('success');
  });
});
