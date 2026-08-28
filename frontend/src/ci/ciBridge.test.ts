import { describe, it, expect, beforeEach } from 'vitest';
import { createRunEngine } from './runEngine';
import { createCiBridge, exitCodeOf, externalStatusOf } from './ciBridge';
import { memoryStorage } from './storage';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1', irVersion: '1.0.0', name: 'OWASP Juice Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'scanner Active Scan', version: '2.15.0' } },
    ],
    edges: [{ from: 'disc', to: 'scan', kind: 'depends_on' }],
  };
}

describe('Exit codes (PK-CI-6)', () => {
  it('succeeded → 0, failed → 1, cancelled → 2, pending → 3', () => {
    expect(exitCodeOf('succeeded')).toBe(0);
    expect(exitCodeOf('failed')).toBe(1);
    expect(exitCodeOf('cancelled')).toBe(2);
    expect(exitCodeOf('expired')).toBe(2);
    expect(exitCodeOf('pending')).toBe(3);
    expect(exitCodeOf('running')).toBe(3);
  });

  it('externalStatus maps to GitHub/GitLab-compatible', () => {
    expect(externalStatusOf('succeeded')).toBe('completed');
    expect(externalStatusOf('failed')).toBe('failed');
    expect(externalStatusOf('cancelled')).toBe('cancelled');
    expect(externalStatusOf('running')).toBe('running');
    expect(externalStatusOf('pending')).toBe('pending');
  });
});

describe('CI Bridge (PK-CI-6)', () => {
  let engine: ReturnType<typeof createRunEngine>;
  let bridge: ReturnType<typeof createCiBridge>;

  beforeEach(() => {
    engine = createRunEngine(memoryStorage());
    bridge = createCiBridge(engine, 'https://prettyk.io');
  });

  it('syncStatus returns null for unknown run', () => {
    expect(bridge.syncStatus('nonexistent')).toBeNull();
  });

  it('syncStatus returns stable external status for running run', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');

    const status = bridge.syncStatus(run.id);
    expect(status?.status).toBe('running');
    expect(status?.exitCode).toBe(3);
    expect(status?.evidenceUrl).toContain(run.id);
  });

  it('syncStatus for succeeded run returns completed + exit 0', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');
    engine.transition(run.id, 'complete');

    const status = bridge.syncStatus(run.id);
    expect(status?.status).toBe('completed');
    expect(status?.exitCode).toBe(0);
    expect(status?.completedAt).toBeDefined();
    expect(status?.conclusion).toContain('passed');
  });

  it('buildCallback returns null for non-terminal runs', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    expect(bridge.buildCallback(run.id, 'https://prettyk.io')).toBeNull();
  });

  it('buildCallback returns full result for terminal runs', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');
    engine.transition(run.id, 'complete');

    const cb = bridge.buildCallback(run.id, 'https://prettyk.io');
    expect(cb).not.toBeNull();
    expect(cb!.idempotencyKey).toBeDefined();
  });

  it('findingsSummary aggregates correctly', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');
    engine.recordFinding(run.id, 'fp:critical-1', {}, { severity: 'CRITICAL' });
    engine.recordFinding(run.id, 'fp:high-1', {}, { severity: 'HIGH' });
    engine.recordFinding(run.id, 'fp:medium-1', {}, { severity: 'MEDIUM' });

    const summary = bridge.findingsSummary(run.id);
    expect(summary.critical).toBe(1);
    expect(summary.high).toBe(1);
    expect(summary.medium).toBe(1);
    expect(summary.total).toBe(3);
  });
});