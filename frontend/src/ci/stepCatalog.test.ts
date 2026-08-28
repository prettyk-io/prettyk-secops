import { describe, it, expect } from 'vitest';
import { STEP_CATALOG, findStep, stepCapabilities, pipelineRequiredCapabilities } from './stepCatalog';

describe('Step Catalog (PK-CI-4)', () => {
  it('contains the canonical security steps', () => {
    const ids = STEP_CATALOG.map(s => s.id);
    expect(ids).toContain('browser-discovery');
    expect(ids).toContain('scanner-active-scan');
    expect(ids).toContain('corpus-fuzzing');
    expect(ids).toContain('quality-gate');
    expect(ids).toContain('evidence-pack');
    expect(ids).toContain('defectdojo-sync');
  });

  it('every step has purpose, risk, capabilities, inputs, outputs', () => {
    for (const s of STEP_CATALOG) {
      expect(s.capability.purpose).toBeTruthy();
      expect(['none', 'low', 'medium', 'high', 'critical']).toContain(s.capability.risk);
      expect(Array.isArray(s.capability.requiredCapabilities)).toBe(true);
      expect(Array.isArray(s.capability.inputs)).toBe(true);
      expect(Array.isArray(s.capability.outputs)).toBe(true);
    }
  });

  it('every step is version-pinned (no latest in catalog)', () => {
    for (const s of STEP_CATALOG) {
      expect(s.version).not.toBe('latest');
      expect(s.version.trim().length).toBeGreaterThan(0);
    }
  });

  it('risk ordering: fuzzing critical, discovery low, gate none', () => {
    expect(findStep('corpus-fuzzing')?.capability.risk).toBe('critical');
    expect(findStep('browser-discovery')?.capability.risk).toBe('low');
    expect(findStep('quality-gate')?.capability.risk).toBe('none');
  });

  it('scanner requires fuzzer:execute + checks:create', () => {
    const caps = stepCapabilities('scanner-active-scan');
    expect(caps).toContain('fuzzer:execute');
    expect(caps).toContain('checks:create');
  });

  it('pipelineRequiredCapabilities unions distinct caps', () => {
    const caps = pipelineRequiredCapabilities(['browser-discovery', 'scanner-active-scan', 'quality-gate']);
    expect(caps).toContain('checks:create');
    expect(caps).toContain('fuzzer:execute');
    expect(caps).toContain('policies:manage');
    // no duplicates
    expect(new Set(caps).size).toBe(caps.length);
  });
});
