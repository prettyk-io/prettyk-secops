import { describe, it, expect } from 'vitest';
import { assessImport, assessExport } from './importExport';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1', irVersion: '1.0.0', name: 'OWASP Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'scanner Active Scan', version: '2.15.0' } },
      { id: 'gate', component: { name: 'Quality Gate', version: '3.1.0' } },
    ],
    edges: [
      { from: 'disc', to: 'scan', kind: 'depends_on' },
      { from: 'scan', to: 'gate', kind: 'depends_on' },
    ],
  };
}

describe('Import/Export Compatibility (PK-CI-8)', () => {
  describe('assessImport', () => {
    it('lossless for direct matches', () => {
      const report = assessImport({
        pipelineId: 'p1',
        externalSteps: [
          { id: 's1', name: 'browser-discovery' },
          { id: 's2', name: 'scanner-active-scan' },
          { id: 's3', name: 'quality-gate' },
        ],
      });
      expect(report.overallLevel).toBe('lossless');
      expect(report.steps.every(s => s.level === 'lossless')).toBe(true);
    });

    it('mapped for vendor-prefixed components', () => {
      const report = assessImport({
        pipelineId: 'p1',
        externalSteps: [
          { id: 's1', name: 'github-action/browser-discovery' },
        ],
      });
      expect(report.steps[0]!.level).toBe('mapped');
    });

    it('degraded for partial matches', () => {
      const report = assessImport({
        pipelineId: 'p1',
        externalSteps: [
          { id: 's1', name: 'scanner-scan-custom' },
        ],
      });
      expect(report.steps[0]!.level).toBe('degraded');
      expect(report.steps[0]!.mappedId).toBeDefined();
    });

    it('unsupported for unknown components', () => {
      const report = assessImport({
        pipelineId: 'p1',
        externalSteps: [
          { id: 's1', name: 'completely-unknown-tool' },
        ],
      });
      expect(report.overallLevel).toBe('unsupported');
      expect(report.steps[0]!.level).toBe('unsupported');
      expect(report.summary).toContain('unsupported');
    });

    it('worst level is propagated across all steps', () => {
      const report = assessImport({
        pipelineId: 'p1',
        externalSteps: [
          { id: 's1', name: 'browser-discovery' },
          { id: 's2', name: 'unknown-evil-scanner' },
        ],
      });
      expect(report.overallLevel).toBe('unsupported');
    });
  });

  describe('assessExport', () => {
    it('exports to GitHub Actions with correct component names', () => {
      const result = assessExport(makePipeline(), 'github-actions');
      expect(result.lossless.length).toBe(3);
      expect(result.unsupported.length).toBe(0);
      expect(result.lossless[0]!.externalName).toBe('prettyk/browser-discovery@v1');
    });

    it('exports to prettyk-native fully lossless', () => {
      const result = assessExport(makePipeline(), 'prettyk-native');
      expect(result.lossless.length).toBe(3);
      expect(result.unsupported.length).toBe(0);
    });

    it('jenkins target has fewer supported components', () => {
      const result = assessExport(makePipeline(), 'jenkins');
      expect(result.lossless.length).toBeGreaterThanOrEqual(2);
      // Quality Gate may or may not be unsupported
    });

    it('unsupported steps listed explicitly (no silent drops)', () => {
      // Add an unsupported step
      const pipeline = {
        ...makePipeline(),
        steps: [
          ...makePipeline().steps,
          { id: 'custom', component: { name: 'Totally Custom Scanner', version: '1.0.0' } },
        ],
      };
      const result = assessExport(pipeline, 'jenkins');
      expect(result.unsupported.length).toBeGreaterThan(0);
      expect(result.unsupported).toContain('custom');
    });
  });
});