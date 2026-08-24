// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getEvidence,
  listEvidenceForDeploy,
  resetEvidenceRegistryForTests,
  resolveDeployEvidenceStrip,
  seedDemoEvidenceIfEmpty,
  upsertEvidence,
} from './evidenceRegistry';

describe('evidenceRegistry', () => {
  beforeEach(() => {
    resetEvidenceRegistryForTests();
  });

  it('upserts by check_id and lists by deploy', () => {
    upsertEvidence({
      check_id: 'chk_1',
      deploy_id: 'dep_1',
      source: 'finalize',
      allure: {
        allure_project_id: 'chk_1',
        report_url: 'http://allure/projects/chk_1/reports/latest/',
        status: 'ok',
      },
    });
    expect(getEvidence('chk_1')?.allure?.allure_project_id).toBe('chk_1');
    expect(listEvidenceForDeploy('dep_1')).toHaveLength(1);
  });

  it('falls back to deploy hooks when registry empty', () => {
    const strip = resolveDeployEvidenceStrip('dep_x', [], {
      allure_report_url: 'http://allure/default',
      dojo_engagement_url: 'http://dojo/engagement/1',
    });
    expect(strip).toHaveLength(1);
    const first = strip[0];
    expect(first?.allure?.report_url).toContain('allure');
    expect(first?.dojo?.engagement_url).toContain('dojo');
  });

  it('seeds rich demo evidence with history', () => {
    seedDemoEvidenceIfEmpty();
    seedDemoEvidenceIfEmpty();
    expect(listEvidenceForDeploy('dep_ib_web_2401')).toHaveLength(1);
    const demo = getEvidence('chk_demo_ib_web');
    expect(demo?.allure?.allure_project_id).toBe('chk_demo_ib_web');
    expect(demo?.history?.length).toBeGreaterThanOrEqual(3);
    expect(demo?.allure?.summary?.passed).toBeGreaterThan(0);
  });
});
