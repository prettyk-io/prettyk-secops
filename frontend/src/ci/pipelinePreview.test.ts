import { describe, it, expect } from 'vitest';
import { buildPipelinePreview } from './pipelinePreview';
import type { PipelineDefinition, Capability } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1', irVersion: '1.0.0', name: 'OWASP Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol-owasp', name: 'OWASP Top-10', version: '2' },
    requiredCapabilities: ['checks:create', 'fuzzer:execute'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'ZAP Active Scan', version: '2.15.0' } },
      { id: 'gate', component: { name: 'Quality Gate', version: '3.1.0' } },
    ],
    edges: [
      { from: 'disc', to: 'scan', kind: 'depends_on' },
      { from: 'scan', to: 'gate', kind: 'depends_on' },
    ],
    timeoutMs: 600_000,
    retry: { maxAttempts: 2 },
    qualityGate: 'strict',
  };
}

describe('Pipeline Preview (PK-CI-7)', () => {
  const heldCaps: Capability[] = ['checks:create', 'fuzzer:execute', 'policies:manage'];

  it('produces full plan with all steps', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'admin-sec',
    });

    expect(plan.steps.length).toBe(3);
    expect(plan.steps.map(s => s.stepId)).toEqual(['disc', 'scan', 'gate']);
  });

  it('marks steps as allowed when caps cover all requirements', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'admin-sec',
    });
    expect(plan.steps.every(s => s.allowed)).toBe(true);
  });

  it('marks steps as not-allowed when caps insufficient', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: ['checks:create'], // no fuzzer, no policies
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'user',
    });
    const scanStep = plan.steps.find(s => s.stepId === 'scan');
    expect(scanStep?.allowed).toBe(false);
  });

  it('lists blockers for scope violation', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://evil.com',
      actor: 'admin-sec',
    });
    expect(plan.blockers.length).toBeGreaterThan(0);
    expect(plan.blockers.some(b => b.includes('scope_violation'))).toBe(true);
  });

  it('shows gate descriptions', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'admin-sec',
    });
    expect(plan.gateDescriptions.length).toBeGreaterThan(0);
    expect(plan.gateDescriptions.some(g => g.includes('strict'))).toBe(true);
    expect(plan.gateDescriptions.some(g => g.includes('2 attempts'))).toBe(true);
  });

  it('totalEstimate sums resources across steps', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'admin-sec',
    });
    expect(plan.totalEstimate.durationMs).toBeGreaterThan(0);
    expect(['lightweight', 'standard', 'intensive']).toContain(plan.totalEstimate.kind);
  });

  it('secretRefs are references only (never raw values)', () => {
    const plan = buildPipelinePreview({
      pipeline: makePipeline(),
      heldCapabilities: heldCaps,
      targetUrl: 'https://juice-shop.prettyk.io',
      actor: 'admin-sec',
    });
    for (const s of plan.steps) {
      for (const ref of s.secretRefs) {
        expect(ref).not.toContain('=');
        expect(ref).not.toMatch(/[A-Za-z0-9]{20,}/);
      }
    }
  });
});