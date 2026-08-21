// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCheck,
  __resetChecksStoreForTests,
  upsertCheckRun,
} from '../checks/checksStore';
import {
  ensureDeploy,
  getDeploy,
  linkCheckToDeploy,
  listAppCodes,
  listDeploys,
  listLinksForDeploy,
  loadAdminPolicies,
  loadConnectors,
  resetAdminStoresForTests,
  saveAdminPolicies,
  saveConnectors,
  syncDeployGatesFromChecks,
  updateDeployGate,
} from './deployStore';

describe('deployStore', () => {
  beforeEach(() => {
    resetAdminStoresForTests();
    __resetChecksStoreForTests();
  });

  it('lists mock deploys with project_id anchor', () => {
    const items = listDeploys();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((d) => d.project_id && d.deploy_url)).toBe(true);
  });

  it('filters by env, project_id and q', () => {
    const stage = listDeploys({ deploy_env: 'stage' });
    expect(stage.every((d) => d.deploy_env === 'stage')).toBe(true);
    const byCode = listDeploys({ project_id: 'ib-web' });
    expect(byCode.length).toBeGreaterThan(0);
    expect(byCode.every((d) => d.project_id === 'ib-web')).toBe(true);
    const q = listDeploys({ q: 'payments' });
    expect(q.some((d) => d.project_id === 'payments-hub')).toBe(true);
  });

  it('listAppCodes + ensureDeploy create then idempotent', () => {
    expect(listAppCodes().some((c) => c.project_id === 'ib-web')).toBe(true);
    const first = ensureDeploy({
      project_id: 'lab-new-app',
      application_name: 'Lab New',
      deploy_env: 'lab',
      deploy_url: 'http://lab-new:3000/',
    });
    expect(first.created).toBe(true);
    expect(getDeploy(first.deploy.deploy_id)?.project_id).toBe('lab-new-app');
    const second = ensureDeploy({
      project_id: 'lab-new-app',
      deploy_env: 'lab',
      deploy_url: 'http://lab-new:3000/',
    });
    expect(second.created).toBe(false);
    expect(second.deploy.deploy_id).toBe(first.deploy.deploy_id);
    expect(listAppCodes().some((a) => a.project_id === 'lab-new-app')).toBe(true);
  });

  it('links check instance to deploy', () => {
    const deploy = listDeploys()[0];
    if (!deploy) {
      throw new Error('нет деплоев');
    }
    linkCheckToDeploy(deploy.deploy_id, 'chk_test_1');
    const links = listLinksForDeploy(deploy.deploy_id);
    expect(links[0]?.check_id).toBe('chk_test_1');
    expect(getDeploy(deploy.deploy_id)?.last_check_id).toBe('chk_test_1');
  });

  it('persists policies and connectors locally', () => {
    const policies = loadAdminPolicies();
    saveAdminPolicies({ ...policies, max_critical: 1, artifact_retention_days: 30 });
    expect(loadAdminPolicies().max_critical).toBe(1);
    expect(loadAdminPolicies().artifact_retention_days).toBe(30);

    const connectors = loadConnectors();
    saveConnectors({
      ...connectors,
      allure_base_url: 'http://allure.lab',
      dojo_token_set: true,
      prom_url: 'http://prom.lab:9090',
    });
    expect(loadConnectors().allure_base_url).toBe('http://allure.lab');
    expect(loadConnectors().dojo_token_set).toBe(true);
    expect(loadConnectors().prom_url).toBe('http://prom.lab:9090');
    expect(loadConnectors().prom_metric_packs).toContain('http_red');
    expect(loadConnectors().db_engine).toBe('PostgreSQL');
  });

  it('syncDeployGatesFromChecks wires last_gate from ci_verdict', () => {
    const deploy = listDeploys()[0];
    if (!deploy) {
      throw new Error('нет деплоев');
    }
    updateDeployGate(deploy.deploy_id, 'unknown');
    const check = createCheck({
      title: 'gate wire',
      wired: {},
      status: 'completed',
    });
    upsertCheckRun(check.check_id, {
      run_id: 'run_gate',
      status: 'failed',
      ended_at: '2026-08-11T01:00:00Z',
      ci_verdict: 'fail_gate',
    });
    linkCheckToDeploy(deploy.deploy_id, check.check_id);
    expect(getDeploy(deploy.deploy_id)?.last_gate).toBe('fail');
    expect(syncDeployGatesFromChecks([deploy.deploy_id])).toBe(0);
  });
});
