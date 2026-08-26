import { describe, it, expect } from 'vitest';
import { SmartBaselinePipelineStore, executePassiveAnalysis } from './smartPipeline';
import { buildAttackSurfaceGraph } from './intakeParser';

describe('PK-BL-2: Smart Baseline Pipeline Store & Engine', () => {
  it('creates run and enforces idempotency key', () => {
    const store = new SmartBaselinePipelineStore();
    const target = { targetUrl: 'https://demo.secops.local/api/v1' };

    const { run: run1, isNew: isNew1 } = store.createRun(target, {}, 'idem_key_123');
    expect(isNew1).toBe(true);
    expect(run1.status).toBe('pending');
    expect(run1.idempotencyKey).toBe('idem_key_123');

    // Second call with same idempotency key
    run1.status = 'running';
    const { run: run2, isNew: isNew2 } = store.createRun(target, {}, 'idem_key_123');
    expect(isNew2).toBe(false);
    expect(run2.runId).toBe(run1.runId);
  });

  it('manages lease renewal and stale recovery', () => {
    const store = new SmartBaselinePipelineStore();
    const { run } = store.createRun({ targetUrl: 'https://test.local' }, {}, 'idem_stale', 'worker-1');
    run.status = 'running';

    // Renew lease successfully
    const renewed = store.renewLease(run.runId, 'worker-1', 60000);
    expect(renewed).toBe(true);
    expect(run.leaseExpiresAt).toBeGreaterThan(Date.now());

    // Another worker fails to renew active lease
    const rogueRenew = store.renewLease(run.runId, 'worker-2');
    expect(rogueRenew).toBe(false);

    // Simulate expired lease and run stale recovery
    run.leaseExpiresAt = Date.now() - 5000;
    const recovered = store.recoverStaleRuns();
    expect(recovered).toContain(run.runId);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('lease expired');
  });

  it('executes passive analysis and detects cleartext transport and unprotected sensitive endpoints', () => {
    const graph = buildAttackSurfaceGraph({
      targetUrl: 'http://insecure-api.test.local/admin/metrics',
    });

    const findings = executePassiveAnalysis(graph);
    expect(findings.length).toBeGreaterThanOrEqual(1);

    const transportFnd = findings.find((f) => f.checkType === 'passive-transport-security');
    expect(transportFnd).toBeDefined();
    expect(transportFnd?.severity).toBe('MEDIUM');

    const adminFnd = findings.find((f) => f.checkType === 'passive-auth-policy');
    expect(adminFnd).toBeDefined();
    expect(adminFnd?.severity).toBe('HIGH');
  });
});
