import { describe, it, expect } from 'vitest';
import {
  buildRegistry,
  validateComponentVersions,
  productionGate,
  versionHistoryOf,
} from './componentVersioning';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1', irVersion: '1.0.0', name: 'OWASP',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'ZAP Active Scan', version: '2.15.0' } },
    ],
    edges: [{ from: 'disc', to: 'scan', kind: 'depends_on' }],
  };
}

describe('Component Versioning (PK-CI-9)', () => {
  it('registry builds from catalog with stable versions', () => {
    const registry = buildRegistry();
    expect(registry.length).toBeGreaterThan(0);
    for (const r of registry) {
      expect(r.versions.length).toBeGreaterThan(0);
      expect(r.versions[0]!.version).not.toBe('latest');
    }
  });

  it('validates pinned pipeline as OK', () => {
    const v = validateComponentVersions(makePipeline(), { production: true });
    expect(v.ok).toBe(true);
    expect(v.unpinnedSteps.length).toBe(0);
  });

  it('flags latest version', () => {
    const p = makePipeline();
    p.steps[0] = { id: 'disc', component: { name: 'Browser Discovery', version: 'latest' } };
    const v = validateComponentVersions(p, { production: true });
    expect(v.ok).toBe(false);
    expect(v.unpinnedSteps).toContain('disc');
  });

  it('flags unknown version', () => {
    const p = makePipeline();
    p.steps[0] = { id: 'disc', component: { name: 'Browser Discovery', version: '99.99.99' } };
    const v = validateComponentVersions(p, { production: true });
    expect(v.ok).toBe(false);
    expect(v.unknownVersionSteps).toContain('disc');
  });

  it('productionGate equals validateComponentVersions(production=true)', () => {
    const p = makePipeline();
    p.steps[0] = { id: 'disc', component: { name: 'Browser Discovery', version: 'latest' } };
    expect(productionGate(p).unpinnedSteps).toEqual(['disc']);
  });

  it('versionHistoryOf returns catalog version', () => {
    const versions = versionHistoryOf('Browser Discovery');
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]!.version).toBe('1.4.0');
  });
});
