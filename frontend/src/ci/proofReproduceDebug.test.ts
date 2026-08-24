import { describe, it, expect, beforeEach } from 'vitest';
import { createRunEngine } from './runEngine';
import { memoryStorage } from './storage';
import { buildProofPackage, proofFromEngine, checksumOf } from './proofCarrying';
import { reproduceFromEngine } from './reproduce';
import { createStepDebugger, diffRuns } from './stepDebugger';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1', irVersion: '1.0.0', name: 'OWASP Juice Check',
    target: { id: 'tgt-juice', name: 'Juice Shop', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol-owasp', name: 'OWASP Top-10', version: '2' },
    requiredCapabilities: ['checks:create', 'fuzzer:execute'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'ZAP Active Scan', version: '2.15.0' }, inputs: { target_url: 'https://juice-shop.prettyk.io', auth_ref: 'secret:auth' } },
      { id: 'gate', component: { name: 'Quality Gate', version: '3.1.0' } },
    ],
    edges: [
      { from: 'disc', to: 'scan', kind: 'depends_on' },
      { from: 'scan', to: 'gate', kind: 'depends_on' },
    ],
  };
}

function completeRun(engine: ReturnType<typeof createRunEngine>) {
  const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec', toolVersions: { zap: '2.15.0' } });
  engine.transition(run.id, 'submit');
  engine.transition(run.id, 'approve');
  engine.transition(run.id, 'acquire');
  engine.recordFinding(run.id, 'fp:sql-injection', {}, { severity: 'CRITICAL', stepId: 'scan' });
  engine.recordEvidence(run.id, 'evd:zap-report', { report: 'zap.xml' }, { checksum: checksumOf('zap-report') });
  engine.transition(run.id, 'complete');
  return run.id;
}

describe('Proof-Carrying Run (PK-CI-10)', () => {
  let engine: ReturnType<typeof createRunEngine>;

  beforeEach(() => {
    engine = createRunEngine(memoryStorage());
  });

  it('buildProofPackage carries actor, scope, policy, versions, findings, checksums', () => {
    const runId = completeRun(engine);
    const proof = proofFromEngine(engine, runId, 'OWASP check of juice-shop');

    expect(proof).not.toBeNull();
    expect(proof!.actor).toBe('admin-sec');
    expect(proof!.intent).toBe('OWASP check of juice-shop');
    expect(proof!.scope).toContain('juice-shop.prettyk.io');
    expect(proof!.policy.version).toBe('2');
    expect(proof!.toolVersions.zap).toBe('2.15.0');
    expect(proof!.findings.length).toBe(1);
    expect(proof!.findings[0]!.severity).toBe('CRITICAL');
    expect(proof!.artifacts.length).toBe(1);
    expect(proof!.artifacts[0]!.checksum).toBeDefined();
    expect(proof!.provenance.pipelineId).toBe('pipe-1');
  });

  it('proofFromEngine returns null for non-terminal run', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    expect(proofFromEngine(engine, run.id)).toBeNull();
  });

  it('redacts secret-like inputs in proof', () => {
    const runId = completeRun(engine);
    const proof = proofFromEngine(engine, runId)!;
    const authKey = Object.keys(proof.inputsRedacted).find(k => k.includes('auth_ref'));
    expect(authKey).toBeDefined();
    expect(proof.inputsRedacted[authKey!]).toBe('***');
  });

  it('checksumOf is deterministic', () => {
    expect(checksumOf('same')).toBe(checksumOf('same'));
    expect(checksumOf('a')).not.toBe(checksumOf('b'));
  });
});

describe('Reproduce (PK-CI-11)', () => {
  let engine: ReturnType<typeof createRunEngine>;

  beforeEach(() => {
    engine = createRunEngine(memoryStorage());
  });

  it('builds minimal pipeline with gate + evidence from finding', () => {
    const runId = completeRun(engine);
    const result = reproduceFromEngine(engine, runId, 'fp:sql-injection');

    expect(result).not.toBeNull();
    expect(result!.pipeline.steps.some(s => s.component.name === 'Quality Gate')).toBe(true);
    expect(result!.pipeline.steps.some(s => s.component.name === 'Evidence Pack')).toBe(true);
    expect(result!.findingKey).toBe('fp:sql-injection');
    expect(result!.toolVersions.zap).toBe('2.15.0');
    expect(result!.rationale.length).toBeGreaterThan(0);
  });

  it('returns null for unknown finding', () => {
    const runId = completeRun(engine);
    expect(reproduceFromEngine(engine, runId, 'fp:nonexistent')).toBeNull();
  });
});

describe('Step Debugger (PK-CI-12)', () => {
  let engine: ReturnType<typeof createRunEngine>;
  let debugger_: ReturnType<typeof createStepDebugger>;

  beforeEach(() => {
    engine = createRunEngine(memoryStorage());
    debugger_ = createStepDebugger(engine);
  });

  it('inspectStep returns IO for a step', () => {
    const runId = completeRun(engine);
    const io = debugger_.inspectStep(runId, 'scan');
    expect(io).not.toBeNull();
    expect(io!.stepId).toBe('scan');
    expect(io!.input.target_url).toBe('https://juice-shop.prettyk.io');
    expect(io!.output.findings.length).toBeGreaterThan(0);
  });

  it('replayStep builds replay command with optional payload', () => {
    const runId = completeRun(engine);
    const cmd = debugger_.replayStep(runId, 'scan');
    expect(cmd).toContain('pk replay-step');
    expect(cmd).toContain(runId);
    expect(cmd).toContain('scan');

    const withPayload = debugger_.replayStep(runId, 'scan', 'modified-payload');
    expect(withPayload).toContain('--payload');
    expect(withPayload).toContain('modified-payload');
  });

  it('listSteps returns all step ids', () => {
    const runId = completeRun(engine);
    const steps = debugger_.listSteps(runId);
    expect(steps).toEqual(['disc', 'scan', 'gate']);
  });

  it('diffRuns detects new findings', () => {
    const a = { findings: [{ dedupKey: 'fp:1', runId: 'r', observedAt: '', payload: {} }], evidence: [] };
    const b = {
      findings: [
        { dedupKey: 'fp:1', runId: 'r', observedAt: '', payload: {} },
        { dedupKey: 'fp:2', runId: 'r', observedAt: '', payload: {} },
      ],
      evidence: [],
    };
    const diff = diffRuns(a, b);
    expect(diff.newFindings).toEqual(['fp:2']);
    expect(diff.removedFindings).toEqual([]);
  });
});
