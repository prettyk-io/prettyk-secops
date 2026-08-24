import { describe, expect, it } from 'vitest';
import { MOCK_DEPLOYS } from './mockDeploys';
import { buildWiredFromDeploy, titleFromDeploy } from './buildWiredFromDeploy';
import type { BankDeploy } from './types';

describe('buildWiredFromDeploy', () => {
  function firstDeploy(): BankDeploy {
    const deploy = MOCK_DEPLOYS[0];
    if (!deploy) {
      throw new Error('MOCK_DEPLOYS[0] отсутствует');
    }
    return deploy;
  }

  it('prefills meta.project_id, pre_release and infrastructure URL from Deploy', () => {
    const deploy = firstDeploy();
    const wired = buildWiredFromDeploy(deploy) as {
      meta: {
        project_id: string;
        assessment_purpose: string;
        app_leader?: string;
        initiator_name?: string;
      };
      infrastructure: { base_url_override: string };
    };

    expect(wired.meta.project_id).toBe(deploy.project_id);
    expect(wired.meta.assessment_purpose).toBe('pre_release');
    expect(wired.meta.app_leader).toBe(deploy.app_leader);
    expect(wired.meta.initiator_name).toBe(deploy.initiator_hint);
    expect(wired.infrastructure.base_url_override).toBe(deploy.deploy_url);
  });

  it('builds a readable check title', () => {
    const deploy = firstDeploy();
    expect(titleFromDeploy(deploy)).toContain(deploy.application_name);
    expect(titleFromDeploy(deploy)).toContain(deploy.deploy_env);
  });

  it('expert blank: assessmentPurpose scheduled', () => {
    const deploy = firstDeploy();
    const wired = buildWiredFromDeploy(deploy, {
      assessmentPurpose: 'scheduled',
    }) as { meta: { assessment_purpose: string } };
    expect(wired.meta.assessment_purpose).toBe('scheduled');
  });
});
