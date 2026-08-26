import { describe, it, expect } from 'vitest';
import {
  computeFindingCanonicalKey,
  computeDeltaLedger,
  calculateRiskScore,
} from './deltaLedger';
import type { FindingRecord } from './types';

describe('PK-BL-4: Baseline Delta Ledger Engine', () => {
  it('computes standardized canonical key', () => {
    const key = computeFindingCanonicalKey({
      checkType: 'sqli-detector',
      method: 'GET',
      endpointPath: 'api/v1/search',
      paramName: 'q',
    });
    expect(key).toBe('finding:sqli-detector:GET:/api/v1/search:q');
  });

  it('calculates risk score weighted by severity', () => {
    const findings: FindingRecord[] = [
      { id: '1', canonicalKey: 'k1', severity: 'CRITICAL', title: 'RCE', description: '', endpointPath: '', method: 'POST', checkType: 'rce' },
      { id: '2', canonicalKey: 'k2', severity: 'HIGH', title: 'SQLi', description: '', endpointPath: '', method: 'GET', checkType: 'sqli' },
      { id: '3', canonicalKey: 'k3', severity: 'MEDIUM', title: 'XSS', description: '', endpointPath: '', method: 'GET', checkType: 'xss' },
    ];
    // CRITICAL (10) + HIGH (5) + MEDIUM (2) = 17
    expect(calculateRiskScore(findings)).toBe(17);
  });

  it('computes new, resolved, persistent, and regressed delta items accurately', () => {
    const fndA: FindingRecord = { id: 'a', canonicalKey: 'fnd:auth-bypass:GET:/admin', severity: 'CRITICAL', title: 'A', description: '', endpointPath: '/admin', method: 'GET', checkType: 'auth' };
    const fndB: FindingRecord = { id: 'b', canonicalKey: 'fnd:sqli:GET:/search:q', severity: 'HIGH', title: 'B', description: '', endpointPath: '/search', method: 'GET', checkType: 'sqli' };
    const fndC: FindingRecord = { id: 'c', canonicalKey: 'fnd:cors:POST:/data', severity: 'MEDIUM', title: 'C', description: '', endpointPath: '/data', method: 'POST', checkType: 'cors' };
    const fndD_reappeared: FindingRecord = { id: 'd', canonicalKey: 'fnd:xss:GET:/profile:name', severity: 'LOW', title: 'D', description: '', endpointPath: '/profile', method: 'GET', checkType: 'xss' };

    // Previous run (N-1) had fndA, fndB
    const prevRun = {
      runId: 'run_N_minus_1',
      findings: [fndA, fndB],
      timestamp: '2026-08-25T10:00:00Z',
    };

    // Historical run (N-2) had fndD
    const historyChain = [
      {
        runId: 'run_N_minus_2',
        findings: [fndD_reappeared],
        timestamp: '2026-08-25T09:00:00Z',
      },
    ];

    // Current run (N) has fndA (persistent), fndC (new), and fndD (regressed - was in N-2, resolved in N-1, back in N)
    const currentRunId = 'run_N';
    const currentFindings = [fndA, fndC, fndD_reappeared];

    const ledger = computeDeltaLedger(currentRunId, currentFindings, prevRun, historyChain);

    expect(ledger.runId).toBe(currentRunId);
    expect(ledger.baselineRunId).toBe('run_N_minus_1');

    const itemA = ledger.items.find((i) => i.canonicalKey === fndA.canonicalKey);
    expect(itemA?.status).toBe('persistent');

    const itemB = ledger.items.find((i) => i.canonicalKey === fndB.canonicalKey);
    expect(itemB?.status).toBe('resolved');

    const itemC = ledger.items.find((i) => i.canonicalKey === fndC.canonicalKey);
    expect(itemC?.status).toBe('new');

    const itemD = ledger.items.find((i) => i.canonicalKey === fndD_reappeared.canonicalKey);
    expect(itemD?.status).toBe('regressed');

    expect(ledger.summary.newCount).toBe(1);
    expect(ledger.summary.resolvedCount).toBe(1);
    expect(ledger.summary.persistentCount).toBe(1);
    expect(ledger.summary.regressedCount).toBe(1);
  });
});
