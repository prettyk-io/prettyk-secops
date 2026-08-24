import { describe, expect, it } from 'vitest';
import {
  buildDemoEvidenceRefs,
  demoPackForDeploy,
  packFromRefs,
} from './mockEvidencePack';

describe('mockEvidencePack', () => {
  it('builds demo refs with history and summaries', () => {
    const refs = buildDemoEvidenceRefs();
    expect(refs.history?.length).toBeGreaterThanOrEqual(3);
    expect(refs.allure?.summary?.total).toBeGreaterThan(0);
    expect(refs.dojo?.stats?.high).toBeDefined();
    expect(refs.allure?.allure_project_id).not.toBe(refs.dojo?.product_name);
  });

  it('packs severity and pass-rate trends for deploy card', () => {
    const refs = buildDemoEvidenceRefs();
    const pack = packFromRefs('dep_ib_web_2401', 'IB', 'ib-web', [refs]);
    expect(pack.severity_trend).toHaveLength(refs.history!.length);
    expect(pack.pass_rate_trend.every((p) => p.rate >= 0 && p.rate <= 1)).toBe(true);
    expect(demoPackForDeploy('dep_ib_web_2401')?.dojo?.engagement_id).toBe(12);
  });

  it('returns graceful empty pack for registry without refs (not throw)', () => {
    const pack = packFromRefs('dep_lab_new', 'Lab New', 'lab-new-app', []);
    expect(pack.history).toEqual([]);
    expect(pack.severity_trend).toEqual([]);
    expect(pack.pass_rate_trend).toEqual([]);
    expect(pack.allure).toBeNull();
    expect(pack.dojo).toBeNull();
  });
});
