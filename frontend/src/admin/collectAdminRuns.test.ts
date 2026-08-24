// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  collectAdminRuns,
  filterAdminRuns,
  countAdminRunsLast7d,
} from './collectAdminRuns';
import type { CheckEvidenceRefs } from './evidenceTypes';
import type { DeployCheckLink } from './types';
import type { CheckInstance } from '../checks/types';

function check(
  partial: Partial<CheckInstance> & Pick<CheckInstance, 'check_id' | 'runs'>,
): CheckInstance {
  return {
    title: partial.title ?? partial.check_id,
    status: 'completed',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-10T00:00:00Z',
    wired: {},
    ...partial,
  };
}

describe('collectAdminRuns', () => {
  it('flattens 2 checks × runs, newest first', () => {
    const checks: CheckInstance[] = [
      check({
        check_id: 'c1',
        title: 'Alpha',
        runs: [
          {
            run_id: 'r-old',
            status: 'success',
            started_at: '2026-08-01T10:00:00Z',
            ci_verdict: 'pass',
          },
          {
            run_id: 'r-new',
            status: 'failed',
            started_at: '2026-08-11T10:00:00Z',
            ci_verdict: 'fail_gate',
          },
        ],
      }),
      check({
        check_id: 'c2',
        title: 'Beta',
        runs: [
          {
            run_id: 'r-mid',
            status: 'success',
            started_at: '2026-08-05T12:00:00Z',
            ci_verdict: 'pass',
          },
        ],
      }),
    ];
    const rows = collectAdminRuns({ checks });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.run_id)).toEqual(['r-new', 'r-mid', 'r-old']);
    expect(rows[0]?.check_title).toBe('Alpha');
    expect(rows[0]?.ci_verdict).toBe('fail_gate');
  });

  it('joins evidence URLs and deploy link; empty registry → no urls', () => {
    const checks = [
      check({
        check_id: 'c1',
        runs: [
          {
            run_id: 'r1',
            status: 'success',
            started_at: '2026-08-10T10:00:00Z',
          },
        ],
      }),
    ];
    const links: DeployCheckLink[] = [
      { deploy_id: 'dep1', check_id: 'c1', linked_at: '2026-08-10T00:00:00Z' },
    ];
    const evidence: CheckEvidenceRefs[] = [
      {
        check_id: 'c1',
        deploy_id: 'dep1',
        source: 'hooks',
        allure: { allure_project_id: 'p1', report_url: 'http://allure/r1' },
        dojo: { engagement_url: 'http://dojo/e1' },
      },
    ];
    const withEv = collectAdminRuns({ checks, evidence, links });
    expect(withEv[0]?.deploy_id).toBe('dep1');
    expect(withEv[0]?.allure_url).toBe('http://allure/r1');
    expect(withEv[0]?.dojo_url).toBe('http://dojo/e1');

    const empty = collectAdminRuns({ checks, evidence: [], links });
    expect(empty[0]?.deploy_id).toBe('dep1');
    expect(empty[0]?.allure_url).toBeUndefined();
    expect(empty[0]?.dojo_url).toBeUndefined();
  });

  it('filter last7d / verdict / deployId', () => {
    const nowMs = Date.parse('2026-08-12T12:00:00Z');
    const checks = [
      check({
        check_id: 'c1',
        runs: [
          {
            run_id: 'recent',
            status: 'success',
            started_at: '2026-08-11T10:00:00Z',
            ci_verdict: 'pass',
          },
          {
            run_id: 'old',
            status: 'success',
            started_at: '2026-07-01T10:00:00Z',
            ci_verdict: 'fail_gate',
          },
        ],
      }),
      check({
        check_id: 'c2',
        runs: [
          {
            run_id: 'other',
            status: 'failed',
            started_at: '2026-08-10T10:00:00Z',
            ci_verdict: 'fail_gate',
          },
        ],
      }),
    ];
    const links: DeployCheckLink[] = [
      { deploy_id: 'depA', check_id: 'c1', linked_at: '2026-08-01T00:00:00Z' },
      { deploy_id: 'depB', check_id: 'c2', linked_at: '2026-08-01T00:00:00Z' },
    ];
    const all = collectAdminRuns({ checks, links });
    expect(filterAdminRuns(all, { last7d: true, nowMs })).toHaveLength(2);
    expect(countAdminRunsLast7d(all, nowMs)).toBe(2);
    expect(
      filterAdminRuns(all, { verdict: 'fail', nowMs }).map((r) => r.run_id),
    ).toEqual(['other', 'old']);
    expect(
      filterAdminRuns(all, { deployId: 'depA', last7d: true, nowMs }).map(
        (r) => r.run_id,
      ),
    ).toEqual(['recent']);
  });
});
