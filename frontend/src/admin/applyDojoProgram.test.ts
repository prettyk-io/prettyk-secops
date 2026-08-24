// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyDojoProgramToDeploys } from './applyDojoProgram';
import { getEvidence, resetEvidenceRegistryForTests } from './evidenceRegistry';
import { normalizeDojoProgramPayload } from './fetchDojoProgram';
import type { BankDeploy } from './types';

const deploy = (id: string, project_id: string): BankDeploy =>
  ({
    deploy_id: id,
    project_id,
    application_name: project_id,
    status: 'active',
  }) as BankDeploy;

describe('applyDojoProgram', () => {
  beforeEach(() => {
    resetEvidenceRegistryForTests();
  });

  it('normalizes Live payload', () => {
    const p = normalizeDojoProgramPayload({
      ok: true,
      status: 'ok',
      items: {
        'ib-web': {
          ok: true,
          status: 'ok',
          project_id: 'ib-web',
          stats: { critical: 2, high: 1 },
        },
      },
    });
    expect(p.ok).toBe(true);
    expect(p.items['ib-web']?.stats?.critical).toBe(2);
  });

  it('applies ok stats onto synthetic evidence; skips unconfigured zeros', () => {
    const payload = normalizeDojoProgramPayload({
      ok: false,
      status: 'partial',
      items: {
        'ib-web': {
          ok: true,
          status: 'ok',
          project_id: 'ib-web',
          stats: { critical: 3, high: 0, medium: 0, low: 0, info: 0 },
          engagement_url: 'http://dojo/engagement/1',
        },
        ghost: {
          ok: false,
          status: 'unconfigured',
          project_id: 'ghost',
          stats: null,
        },
      },
    });
    const result = applyDojoProgramToDeploys(
      payload,
      [deploy('dep1', 'ib-web'), deploy('dep2', 'ghost')],
      new Map(),
    );
    expect(result.applied).toBe(1);
    const refs = getEvidence('dojo-prog:dep1');
    expect(refs?.dojo?.stats?.critical).toBe(3);
    expect(refs?.history?.length).toBe(1);
    expect(getEvidence('dojo-prog:dep2')).toBeUndefined();
  });
});


