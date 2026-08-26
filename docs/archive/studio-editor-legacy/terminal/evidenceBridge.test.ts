/**
 * PK-WB-E5 — Evidence Bridge Tests.
 */

import { describe, it, expect } from 'vitest';
import {
  getStepFindings,
  getStepEvidence,
  buildEvidenceChain,
  buildStepEvidenceSummary,
  buildPolicyLens,
  countFindingsBySeverity,
  getTestedStepIds,
} from './evidenceBridge';
import type { FindingRecord, EvidenceRecord, RunRecord } from '../ci/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubPipelineDef(id = 'pipe-1', name = 'Pipe'): RunRecord['pipelineSnapshot'] {
  return {
    id,
    irVersion: '1.0',
    name,
    target: { id: 'tgt-1', name: 'api.stage.internal' },
    scope: { rules: [{ allowedHosts: ['api.stage.internal'] }] },
    policy: { id: 'pol-1', name: 'Default', version: '1.0' },
    requiredCapabilities: ['checks:create'],
    steps: [],
    edges: [],
  };
}

function makeFinding(
  overrides: Partial<FindingRecord> & { dedupKey: string; runId: string },
): FindingRecord {
  return {
    payload: {},
    observedAt: '2026-08-25T10:00:00Z',
    ...overrides,
  };
}

function makeEvidence(
  overrides: Partial<EvidenceRecord> & { dedupKey: string; runId: string },
): EvidenceRecord {
  return {
    payload: {},
    observedAt: '2026-08-25T10:00:00Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunRecord> & { id: string }): RunRecord {
  return {
    id: overrides.id,
    correlationId: overrides.correlationId || `corr-${overrides.id}`,
    pipelineId: overrides.pipelineId || 'pipe-1',
    pipelineSnapshot: overrides.pipelineSnapshot || stubPipelineDef(),
    policySnapshot: overrides.policySnapshot || { id: 'pol-1', name: 'Default', version: '1.0' },
    state: overrides.state || 'succeeded',
    idempotencyKey: overrides.idempotencyKey || `idem-${overrides.id}`,
    attemptNumber: overrides.attemptNumber || 1,
    actor: overrides.actor || 'auto',
    createdAt: overrides.createdAt || '2026-08-25T10:00:00Z',
    updatedAt: overrides.updatedAt || '2026-08-25T10:00:00Z',
    timeline: overrides.timeline || [],
    toolVersions: overrides.toolVersions || {},
  };
}

// ---------------------------------------------------------------------------
// getStepFindings
// ---------------------------------------------------------------------------

describe('getStepFindings', () => {
  const findings: FindingRecord[] = [
    makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth' }),
    makeFinding({ dedupKey: 'fp:2', runId: 'run-1', stepId: 'step-auth' }),
    makeFinding({ dedupKey: 'fp:3', runId: 'run-1', stepId: 'step-scan' }),
    makeFinding({ dedupKey: 'fp:4', runId: 'run-1' }), // no stepId
  ];

  it('returns findings for a given stepId', () => {
    const result = getStepFindings('step-auth', findings);
    expect(result).toHaveLength(2);
    expect(result[0]!.dedupKey).toBe('fp:1');
    expect(result[1]!.dedupKey).toBe('fp:2');
  });

  it('returns empty for unmatched stepId', () => {
    const result = getStepFindings('step-unknown', findings);
    expect(result).toHaveLength(0);
  });

  it('does not include findings with no stepId', () => {
    const result = getStepFindings('step-auth', findings);
    expect(result.every((f) => f.stepId === 'step-auth')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getStepEvidence
// ---------------------------------------------------------------------------

describe('getStepEvidence', () => {
  const evidence: EvidenceRecord[] = [
    makeEvidence({ dedupKey: 'ev:1', runId: 'run-1', stepId: 'step-auth', kind: 'screenshot' }),
    makeEvidence({ dedupKey: 'ev:2', runId: 'run-1', stepId: 'step-scan', kind: 'log' }),
    makeEvidence({ dedupKey: 'ev:3', runId: 'run-2' }), // no stepId
  ];

  it('returns evidence for a given stepId', () => {
    const result = getStepEvidence('step-auth', evidence);
    expect(result).toHaveLength(1);
    expect(result[0]!.dedupKey).toBe('ev:1');
    expect(result[0]!.kind).toBe('screenshot');
  });

  it('returns empty for unmatched stepId', () => {
    const result = getStepEvidence('step-unknown', evidence);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildEvidenceChain
// ---------------------------------------------------------------------------

describe('buildEvidenceChain', () => {
  const runs: RunRecord[] = [
    makeRun({ id: 'run-1', state: 'succeeded', createdAt: '2026-08-25T10:00:00Z' }),
    makeRun({ id: 'run-2', state: 'failed', createdAt: '2026-08-26T10:00:00Z' }),
  ];

  const findings: FindingRecord[] = [
    makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth', severity: 'HIGH', title: 'SQL Injection' }),
    makeFinding({ dedupKey: 'fp:2', runId: 'run-2', stepId: 'step-auth', severity: 'CRITICAL', title: 'Auth Bypass' }),
    makeFinding({ dedupKey: 'fp:3', runId: 'run-1', stepId: 'step-scan', severity: 'MEDIUM' }),
  ];

  const evidence: EvidenceRecord[] = [
    makeEvidence({ dedupKey: 'ev:1', runId: 'run-1', stepId: 'step-auth', kind: 'screenshot', checksum: 'abc123' }),
  ];

  it('builds a full chain for a step with findings and evidence', () => {
    const chain = buildEvidenceChain('step-auth', 'Auth Step', '/scenarios/0/steps/0', runs, findings, evidence);

    expect(chain.stepId).toBe('step-auth');
    expect(chain.stepLabel).toBe('Auth Step');
    expect(chain.dslPath).toBe('/scenarios/0/steps/0');
    expect(chain.runs).toHaveLength(2);

    // Run-2 should be first (newer)
    expect(chain.runs[0]!.runId).toBe('run-2');
    expect(chain.runs[0]!.findings).toHaveLength(1);
    expect(chain.runs[0]!.findings[0]!.severity).toBe('CRITICAL');

    // Run-1 has both finding and evidence
    expect(chain.runs[1]!.runId).toBe('run-1');
    expect(chain.runs[1]!.findings).toHaveLength(1);
    expect(chain.runs[1]!.artifacts).toHaveLength(1);
    expect(chain.runs[1]!.artifacts[0]!.kind).toBe('screenshot');
  });

  it('returns empty runs for step with no findings or evidence', () => {
    const chain = buildEvidenceChain('step-unknown', 'Unknown', '/path', runs, findings, evidence);

    expect(chain.runs).toHaveLength(0);
  });

  it('handles step with findings but no evidence', () => {
    const chain = buildEvidenceChain('step-scan', 'Scan Step', '/scenarios/1/steps/0', runs, findings, evidence);

    expect(chain.runs).toHaveLength(1);
    expect(chain.runs[0]!.findings).toHaveLength(1);
    expect(chain.runs[0]!.artifacts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildStepEvidenceSummary
// ---------------------------------------------------------------------------

describe('buildStepEvidenceSummary', () => {
  const runs: RunRecord[] = [
    makeRun({ id: 'run-1', state: 'succeeded', createdAt: '2026-08-25T10:00:00Z' }),
  ];

  it('summary: untested when no runs', () => {
    const findings: FindingRecord[] = [];
    const evidence: EvidenceRecord[] = [];
    const chain = buildEvidenceChain('step-auth', 'Auth', '/path', [], findings, evidence);
    const summary = buildStepEvidenceSummary(chain);

    expect(summary.worstVerdict).toBe('untested');
    expect(summary.totalRuns).toBe(0);
    expect(summary.totalFindings).toBe(0);
    expect(summary.hasArtifacts).toBe(false);
  });

  it('summary: clean when no findings', () => {
    const findings: FindingRecord[] = [];
    const evidence: EvidenceRecord[] = [
      makeEvidence({ dedupKey: 'ev:1', runId: 'run-1', stepId: 'step-auth' }),
    ];
    const chain = buildEvidenceChain('step-auth', 'Auth', '/path', runs, findings, evidence);
    const summary = buildStepEvidenceSummary(chain);

    expect(summary.worstVerdict).toBe('clean');
    expect(summary.totalRuns).toBe(1);
    expect(summary.hasArtifacts).toBe(true);
  });

  it('summary: failed when CRITICAL finding', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth', severity: 'CRITICAL' }),
    ];
    const chain = buildEvidenceChain('step-auth', 'Auth', '/path', runs, findings, []);
    const summary = buildStepEvidenceSummary(chain);

    expect(summary.worstVerdict).toBe('failed');
    expect(summary.totalFindings).toBe(1);
    expect(summary.severityBreakdown.CRITICAL).toBe(1);
  });

  it('summary: warning when HIGH finding', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth', severity: 'HIGH' }),
    ];
    const chain = buildEvidenceChain('step-auth', 'Auth', '/path', runs, findings, []);
    const summary = buildStepEvidenceSummary(chain);

    expect(summary.worstVerdict).toBe('warning');
  });

  it('summary: clean when MEDIUM finding', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth', severity: 'MEDIUM' }),
    ];
    const chain = buildEvidenceChain('step-auth', 'Auth', '/path', runs, findings, []);
    const summary = buildStepEvidenceSummary(chain);

    expect(summary.worstVerdict).toBe('clean');
    expect(summary.severityBreakdown.MEDIUM).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildPolicyLens
// ---------------------------------------------------------------------------

describe('buildPolicyLens', () => {
  it('inactive policy — bypassed', () => {
    const lens = buildPolicyLens('Default', false, [
      { severity: 'CRITICAL', maxAllowed: 0 },
      { severity: 'HIGH', maxAllowed: 5 },
    ], { CRITICAL: 3, HIGH: 2 });

    expect(lens.verdict).toBe('passed');
    expect(lens.policyActive).toBe(false);
    expect(lens.reason).toContain('inactive');
    expect(lens.rules.every((r) => r.actualCount === 0)).toBe(true);
  });

  it('failed when severity threshold exceeded', () => {
    const lens = buildPolicyLens('Strict', true, [
      { severity: 'CRITICAL', maxAllowed: 0 },
      { severity: 'HIGH', maxAllowed: 5 },
    ], { CRITICAL: 2, HIGH: 1 });

    expect(lens.verdict).toBe('failed');
    expect(lens.reason).toContain('CRITICAL');
    expect(lens.reason).toContain('2');
    expect(lens.rules[0]!.exceeded).toBe(true);
    expect(lens.rules[0]!.actualCount).toBe(2);
  });

  it('warning when CRITICAL within threshold', () => {
    const lens = buildPolicyLens('Relaxed', true, [
      { severity: 'CRITICAL', maxAllowed: 5 },
      { severity: 'HIGH', maxAllowed: 10 },
    ], { CRITICAL: 2 });

    expect(lens.verdict).toBe('warning');
    expect(lens.reason).toContain('CRITICAL');
    expect(lens.rules[0]!.exceeded).toBe(false);
  });

  it('passed when all thresholds met + no critical', () => {
    const lens = buildPolicyLens('Clean', true, [
      { severity: 'CRITICAL', maxAllowed: 0 },
      { severity: 'HIGH', maxAllowed: 10 },
    ], { MEDIUM: 3 });

    expect(lens.verdict).toBe('passed');
    expect(lens.totalActiveFindings).toBe(3);
    expect(lens.rules.every((r) => !r.exceeded)).toBe(true);
  });

  it('counts multiple severity levels', () => {
    const lens = buildPolicyLens('Multi', true, [
      { severity: 'CRITICAL', maxAllowed: 1 },
      { severity: 'HIGH', maxAllowed: 5 },
      { severity: 'MEDIUM', maxAllowed: 10 },
    ], { CRITICAL: 2, HIGH: 3, MEDIUM: 7 });

    expect(lens.verdict).toBe('failed');
    expect(lens.rules[0]!.exceeded).toBe(true);
    expect(lens.rules[1]!.exceeded).toBe(false);
    expect(lens.rules[2]!.exceeded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countFindingsBySeverity
// ---------------------------------------------------------------------------

describe('countFindingsBySeverity', () => {
  it('counts findings by severity', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1', severity: 'CRITICAL' }),
      makeFinding({ dedupKey: 'fp:2', runId: 'run-1', severity: 'CRITICAL' }),
      makeFinding({ dedupKey: 'fp:3', runId: 'run-1', severity: 'HIGH' }),
      makeFinding({ dedupKey: 'fp:4', runId: 'run-1' }), // no severity
    ];

    const result = countFindingsBySeverity(findings);
    expect(result.CRITICAL).toBe(2);
    expect(result.HIGH).toBe(1);
    expect(result.UNKNOWN).toBe(1);
  });

  it('returns empty for no findings', () => {
    const result = countFindingsBySeverity([]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTestedStepIds
// ---------------------------------------------------------------------------

describe('getTestedStepIds', () => {
  it('collects unique stepIds from findings and evidence', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1', stepId: 'step-auth' }),
      makeFinding({ dedupKey: 'fp:2', runId: 'run-1', stepId: 'step-scan' }),
    ];
    const evidence: EvidenceRecord[] = [
      makeEvidence({ dedupKey: 'ev:1', runId: 'run-1', stepId: 'step-auth' }),
      makeEvidence({ dedupKey: 'ev:2', runId: 'run-1', stepId: 'step-fuzz' }),
    ];

    const ids = getTestedStepIds(findings, evidence);
    expect(ids.size).toBe(3);
    expect(ids.has('step-auth')).toBe(true);
    expect(ids.has('step-scan')).toBe(true);
    expect(ids.has('step-fuzz')).toBe(true);
  });

  it('handles empty inputs', () => {
    const ids = getTestedStepIds([], []);
    expect(ids.size).toBe(0);
  });

  it('skips findings/evidence without stepId', () => {
    const findings: FindingRecord[] = [
      makeFinding({ dedupKey: 'fp:1', runId: 'run-1' }), // no stepId
    ];
    const ids = getTestedStepIds(findings, []);
    expect(ids.size).toBe(0);
  });
});