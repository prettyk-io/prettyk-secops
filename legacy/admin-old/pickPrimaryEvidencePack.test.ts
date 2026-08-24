// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { __resetChecksStoreForTests, listChecks } from '../checks/checksStore';
import {
  resetEvidenceRegistryForTests,
  upsertEvidence,
} from './evidenceRegistry';
import { pickPrimaryEvidencePack } from './pickPrimaryEvidencePack';
import { demoPackForDeploy } from './mockEvidencePack';
import type { BankDeploy } from './types';

afterEach(() => {
  resetEvidenceRegistryForTests();
  __resetChecksStoreForTests();
});

const deploy: BankDeploy = {
  deploy_id: 'dep_live_1',
  app_group: 'g',
  project_id: 'live-app',
  application_name: 'Live App',
  repo: 'bank/live',
  build_id: 'b1',
  deploy_env: 'lab',
  deploy_url: 'http://example',
  deployed_at: '2026-08-11T00:00:00Z',
  status: 'active',
};

describe('pickPrimaryEvidencePack', () => {
  it('берёт pack из Live check refs, не showcase', () => {
    upsertEvidence({
      check_id: 'chk_live',
      deploy_id: 'dep_live_1',
      source: 'hooks',
      updated_at: '2026-08-11T01:00:00Z',
      allure: {
        allure_project_id: 'chk_live',
        summary: { total: 10, passed: 9, failed: 1, broken: 0, skipped: 0 },
      },
      dojo: { stats: { critical: 0, high: 1, medium: 0, low: 0, info: 0 } },
      history: [
        {
          at: '2026-08-11T01:00:00Z',
          check_id: 'chk_live',
          dojo_stats: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          allure_summary: { total: 10, passed: 9, failed: 1, broken: 0, skipped: 0 },
        },
      ],
    });
    const showcase = demoPackForDeploy('dep_ib_web_2401')!;
    const pick = pickPrimaryEvidencePack([deploy], listChecks(), showcase);
    expect(pick.fromLive).toBe(true);
    expect(pick.caption).toBe('Live App');
    expect(pick.pack.pass_rate_trend[0]?.rate).toBeCloseTo(0.9);
  });

  it('fallback на showcase demo', () => {
    const showcase = demoPackForDeploy('dep_ib_web_2401')!;
    const pick = pickPrimaryEvidencePack([], [], showcase);
    expect(pick.fromLive).toBe(false);
    expect(pick.caption).toMatch(/Showcase/i);
  });
});
