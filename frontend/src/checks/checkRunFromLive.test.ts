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
import { buildMonitorUrl } from '../results/monitorLink';

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

  it('MONITOR-DEEPLINK-LIVE-CLIENT: unscoped ран НЕ приписывается активному чеку', () => {
    const itemA = createCheck({ wired: { meta: { name: 'A' } }, status: 'ready' });
    const itemB = createCheck({ wired: { meta: { name: 'B' } }, status: 'ready' });
    setActiveCheckId(itemB.check_id);
    syncActiveCheckRunFromLive({
      session_name: 'run-unscoped',
      status: 'running',
      ci_phase: 'in_progress',
      ci_verdict: 'running',
    });
    // Принадлежность не доказана: ни активный B, ни кто-либо ещё запись не получает.
    expect(getCheck(itemA.check_id)?.runs).toHaveLength(0);
    expect(getCheck(itemB.check_id)?.runs).toHaveLength(0);
  });

  it('unscoped meta обновляет ран в его чеке (update-only), не трогая активный', () => {
    const itemA = createCheck({ wired: { meta: { name: 'A' } }, status: 'ready' });
    const itemB = createCheck({ wired: { meta: { name: 'B' } }, status: 'ready' });
    setActiveCheckId(itemB.check_id);
    upsertCheckRun(itemA.check_id, {
      run_id: 'run-owned',
      status: 'running',
      check_id: itemA.check_id,
      started_at: '2026-01-01T00:00:00.000Z',
    });
    syncActiveCheckRunFromLive({
      session_name: 'run-owned',
      status: 'running',
      ci_verdict: 'running',
    });
    expect(getCheck(itemA.check_id)?.runs).toHaveLength(1);
    expect(getCheck(itemB.check_id)?.runs).toHaveLength(0);
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

  it('MONITOR-FRESH-STAMP: merge не затирает started_at/ended_at пустыми полями', () => {
    const item = createCheck({ wired: {}, status: 'draft' });
    upsertCheckRun(item.check_id, {
      run_id: 'r2',
      status: 'running',
      started_at: '2026-01-01T00:00:00.000Z',
    });
    upsertCheckRun(item.check_id, {
      run_id: 'r2',
      status: 'success',
      ended_at: '2026-01-01T00:10:00.000Z',
    });
    // Синк из meta приходит с явными undefined — не должен обнулять штампы.
    upsertCheckRun(item.check_id, {
      run_id: 'r2',
      status: 'success',
      started_at: undefined,
      ended_at: undefined,
    });
    const run = getCheck(item.check_id)?.runs[0];
    expect(run?.started_at).toBe('2026-01-01T00:00:00.000Z');
    expect(run?.ended_at).toBe('2026-01-01T00:10:00.000Z');
  });
});

describe('MONITOR-FRESH-STAMP: времена жизненного цикла рана', () => {
  it('sync штампует started_at живому рану без времени и не сдвигает его', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    syncActiveCheckRunFromLive({
      check_id: item.check_id,
      session_name: 'run-stamp',
      status: 'running',
      ci_verdict: 'running',
    });
    const first = getCheck(item.check_id)?.runs[0]?.started_at;
    expect(first).toBeTruthy();
    syncActiveCheckRunFromLive({
      check_id: item.check_id,
      session_name: 'run-stamp',
      status: 'running',
      ci_verdict: 'running',
    });
    expect(getCheck(item.check_id)?.runs[0]?.started_at).toBe(first);
  });

  it('sync не перезатирает started_at, выставленный стартом из FE (update-only)', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    setActiveCheckId(item.check_id);
    const feTime = '2026-09-25T20:00:00.000Z';
    upsertCheckRun(item.check_id, {
      run_id: 'run-fe',
      status: 'running',
      started_at: feTime,
      check_id: item.check_id,
    });
    syncActiveCheckRunFromLive({
      session_name: 'run-fe',
      status: 'running',
      ci_verdict: 'running',
    });
    expect(getCheck(item.check_id)?.runs[0]?.started_at).toBe(feTime);
  });

  it('sync штампует ended_at терминалу без времени из meta', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    syncActiveCheckRunFromLive({
      check_id: item.check_id,
      session_name: 'run-done',
      status: 'waiting',
      ci_phase: 'completed',
      ci_conclusion: 'failure',
      ci_exit_code: 1,
      ci_verdict: 'fail_run',
    });
    const run = getCheck(item.check_id)?.runs[0];
    expect(run?.status).toBe('failed');
    expect(run?.ended_at).toBeTruthy();
  });

  it('после sync свежий ран выбирается ссылкой монитора', () => {
    const item = createCheck({ wired: {}, status: 'ready' });
    syncActiveCheckRunFromLive({
      check_id: item.check_id,
      session_name: 'run-live',
      status: 'running',
      ci_verdict: 'running',
    });
    expect(buildMonitorUrl(item.check_id)).toContain('run_id=run-live');
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
