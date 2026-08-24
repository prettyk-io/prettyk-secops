// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deriveProgramKpi } from './deriveProgramKpi';
import type { CheckEvidenceRefs } from './evidenceTypes';
import type { BankDeploy } from './types';
import type { CheckInstance } from '../checks/types';

function deploy(partial: Partial<BankDeploy> & Pick<BankDeploy, 'deploy_id'>): BankDeploy {
  return {
    app_group: 'g',
    project_id: partial.deploy_id,
    application_name: partial.deploy_id,
    repo: 'r',
    build_id: 'b',
    deploy_env: 'stage',
    deploy_url: 'http://x',
    deployed_at: '2026-08-01T00:00:00Z',
    status: 'active',
    ...partial,
  };
}

describe('deriveProgramKpi', () => {
  it('aggregates coverage, semaphore, pass rate, open C/H, checks·7d', () => {
    const now = Date.parse('2026-08-11T12:00:00Z');
    const deploys = [
      deploy({ deploy_id: 'd1', last_gate: 'pass' }),
      deploy({ deploy_id: 'd2', last_gate: 'fail' }),
      deploy({ deploy_id: 'd3', last_gate: 'watch' }),
      deploy({ deploy_id: 'd4', last_gate: 'unknown' }),
    ];
    const checks: CheckInstance[] = [
      {
        check_id: 'c1',
        title: 't',
        status: 'completed',
        created_at: '2026-08-10T00:00:00Z',
        updated_at: '2026-08-10T00:00:00Z',
        wired: {},
        runs: [
          {
            run_id: 'r1',
            status: 'success',
            started_at: '2026-08-10T10:00:00Z',
            ci_verdict: 'pass',
          },
        ],
      },
    ];
    const evidence: CheckEvidenceRefs[] = [
      {
        check_id: 'c1',
        deploy_id: 'd1',
        source: 'hooks',
        dojo: { stats: { critical: 2, high: 5 } },
        history: [
          {
            at: '2026-08-09T00:00:00Z',
            check_id: 'c1',
            dojo_stats: { critical: 3 },
          },
          {
            at: '2026-08-10T00:00:00Z',
            check_id: 'c1',
            dojo_stats: { critical: 2 },
          },
        ],
      },
    ];
    const links = new Map<string, string[]>([['d1', ['c1']]]);
    const kpi = deriveProgramKpi({
      deploys,
      checks,
      evidence,
      linksByDeploy: links,
      nowMs: now,
    });
    expect(kpi.apps_total).toBe(4);
    expect(kpi.apps_covered).toBe(1);
    expect(kpi.gate_pass).toBe(1);
    expect(kpi.gate_fail).toBe(1);
    expect(kpi.gate_watch).toBe(1);
    expect(kpi.gate_unknown).toBe(1);
    expect(kpi.gate_pass_rate).toBeCloseTo(1 / 3);
    expect(kpi.open_critical).toBe(2);
    expect(kpi.open_high).toBe(5);
    expect(kpi.checks_last_7d).toBe(1);
    expect(kpi.trend_critical_delta).toBe(-1);

    const kpi30 = deriveProgramKpi({
      deploys,
      checks,
      evidence,
      linksByDeploy: links,
      nowMs: now,
      windowDays: 30,
    });
    expect(kpi30.checks_last_7d).toBe(1);
  });
});
