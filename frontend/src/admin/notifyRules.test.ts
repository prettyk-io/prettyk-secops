// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  collectNotifySignals,
  deriveNotifyFirings,
  listNotifyRules,
  setNotifyRuleEnabled,
  upsertNotifyRule,
  type NotifyRule,
} from './notifyRules';
import type { CheckInstance } from '../checks/types';
import type { BankDeploy } from './types';

const getMockDeploy = (overrides?: Partial<BankDeploy>): BankDeploy => ({
  deploy_id: 'dep-1',
  app_group: 'IB',
  project_id: 'IB_WEB',
  application_name: 'Интернет-банк',
  repo: 'ib/web',
  build_id: 'b1',
  deploy_env: 'prod',
  deploy_url: 'http://x',
  deployed_at: '2026-08-12T10:00:00Z',
  status: 'active',
  ...overrides,
});

const getMockCheck = (overrides?: Partial<CheckInstance>): CheckInstance => ({
  check_id: 'chk-1',
  title: 'Проверка ИБ',
  status: 'ready',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  wired: {},
  runs: [],
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('notifyRules domain', () => {
  it('persists rules in localStorage and toggles enabled', () => {
    const rule = upsertNotifyRule({
      kind: 'run_result',
      title: 'Провалы запусков',
      teams: [{ app_code: 'IB_WEB', role: 'Владелец приложения' }],
      channels: ['gui', 'email'],
      window_days: 7,
      enabled: true,
    });
    const all = listNotifyRules();
    expect(all).toHaveLength(1);
    const saved = all[0];
    expect(saved).toBeDefined();
    expect(saved?.id).toBe(rule.id);
    expect(saved?.teams[0]?.app_code).toBe('IB_WEB');

    setNotifyRuleEnabled(rule.id, false);
    expect(listNotifyRules()[0]?.enabled).toBe(false);
  });

  it('collects run_result signals for failed runs only (7/30d window)', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00Z');
    const run = {
      run_id: 'r-fail',
      status: 'success' as const,
      started_at: '2026-08-12T11:00:00Z',
      ended_at: '2026-08-12T11:10:00Z',
      ci_verdict: 'fail',
    };
    const signals = collectNotifySignals({
      checks: [getMockCheck({ runs: [run] })],
      deploys: [getMockDeploy()],
      links: [{ deploy_id: 'dep-1', check_id: 'chk-1', linked_at: '2026-08-01T00:00:00Z' }],
      nowMs,
    });
    const runSignals = signals.filter((s) => s.kind === 'run_result');
    expect(runSignals).toHaveLength(1);
    const sig = runSignals[0];
    expect(sig).toBeDefined();
    expect(sig?.app_code).toBe('IB_WEB');
    expect(sig?.tone).toBe('error');
  });

  it('derives firing rules with app_code team matching', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00Z');
    const rule: NotifyRule = {
      id: 'n-1',
      kind: 'run_result',
      title: 'Только IB_WEB',
      teams: [{ app_code: 'IB_WEB', role: 'SecOps' }],
      channels: ['gui'],
      window_days: 7,
      enabled: true,
      created_at: '2026-08-01T00:00:00Z',
    };
    const signals = collectNotifySignals({
      checks: [
        getMockCheck({
          runs: [
            {
              run_id: 'r-fail',
              status: 'failed',
              started_at: '2026-08-12T11:00:00Z',
              ended_at: '2026-08-12T11:10:00Z',
            },
          ],
        }),
      ],
      deploys: [getMockDeploy()],
      links: [{ deploy_id: 'dep-1', check_id: 'chk-1', linked_at: '2026-08-01T00:00:00Z' }],
      nowMs,
    });
    const firings = deriveNotifyFirings([rule], signals);
    expect(firings).toHaveLength(1);
    const firing = firings[0];
    expect(firing).toBeDefined();
    expect(firing?.signals[0]?.app_code).toBe('IB_WEB');
  });

  it('disabled rules do not fire', () => {
    const rule: NotifyRule = {
      id: 'n-off',
      kind: 'waiver_expiry',
      title: 'off',
      teams: [],
      channels: ['gui'],
      window_days: 7,
      enabled: false,
      created_at: '2026-08-01T00:00:00Z',
    };
    const signals = collectNotifySignals({
      waivers: [
        {
          title: 'WS-1',
          severity: 'critical',
          expires_at: '2026-08-01T00:00:00Z',
        },
      ],
      nowMs: Date.parse('2026-08-12T12:00:00Z'),
    });
    expect(signals.some((s) => s.kind === 'waiver_expiry')).toBe(true);
    expect(deriveNotifyFirings([rule], signals)).toHaveLength(0);
  });

  it('collects dojo_drift signals for C/H findings within window', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00Z');
    const within = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();
    const signals = collectNotifySignals({
      evidence: [
        {
          check_id: 'chk-1',
          source: 'hooks',
          updated_at: within,
          dojo: {
            stats: { critical: 1, high: 3, medium: 0, low: 0, info: 0 },
          },
        },
      ],
      nowMs,
    });
    const drift = signals.filter((s) => s.kind === 'dojo_drift');
    expect(drift).toHaveLength(1);
    const sig = drift[0];
    expect(sig).toBeDefined();
    expect(sig?.tone).toBe('error');
    expect(sig?.title).toContain('C 1 / H 3');
  });

  it('emits no dojo_drift when stats clean', () => {
    const signals = collectNotifySignals({
      evidence: [
        {
          check_id: 'chk-1',
          source: 'hooks',
          updated_at: new Date().toISOString(),
          dojo: { stats: { critical: 0, high: 0 } },
        },
      ],
    });
    expect(signals.some((s) => s.kind === 'dojo_drift')).toBe(false);
  });
});
