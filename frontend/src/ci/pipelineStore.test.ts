import { describe, it, expect } from 'vitest';
import { createPipelineStore, validatePipelineGraph, topologicalOrder, isPinnedVersion, collectUnpinnedComponents } from './pipelineStore';
import { memoryStorage } from './storage';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1',
    irVersion: '1.0.0',
    name: 'OWASP Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice.prettyk.io'] }] },
    policy: { id: 'pol', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create'],
    steps: [
      { id: 'a', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'b', component: { name: 'scanner Active Scan', version: '2.15.0' } },
      { id: 'c', component: { name: 'Quality Gate', version: '3.1.0' } },
    ],
    edges: [
      { from: 'a', to: 'b', kind: 'depends_on' },
      { from: 'b', to: 'c', kind: 'depends_on' },
    ],
  };
}

describe('Pipeline Store (PK-CI-1) — durable graph', () => {
  it('survives restart: save → new store instance → get', () => {
    const storage = memoryStorage();
    const s1 = createPipelineStore(storage);
    s1.save(makePipeline());

    // Новый store над тем же storage — имитация рестарта
    const s2 = createPipelineStore(storage);
    const restored = s2.get('pipe-1');
    expect(restored).not.toBeNull();
    expect(restored!.name).toBe('OWASP Check');
    expect(restored!.steps.length).toBe(3);
    expect(restored!.edges.length).toBe(2);
  });

  it('preserves dependencies and order after restart', () => {
    const storage = memoryStorage();
    createPipelineStore(storage).save(makePipeline());
    const restored = createPipelineStore(storage).get('pipe-1')!;

    expect(restored.edges.map(e => `${e.from}->${e.to}`)).toEqual(['a->b', 'b->c']);
    expect(topologicalOrder(restored.steps, restored.edges)).toEqual(['a', 'b', 'c']);
  });

  it('validates a valid graph → no issues', () => {
    expect(validatePipelineGraph(makePipeline())).toEqual([]);
  });

  it('detects cycle', () => {
    const p = makePipeline();
    p.edges = [
      { from: 'a', to: 'b', kind: 'depends_on' },
      { from: 'b', to: 'c', kind: 'depends_on' },
      { from: 'c', to: 'a', kind: 'depends_on' }, // cycle
    ];
    const issues = validatePipelineGraph(p);
    expect(issues.some(i => i.kind === 'cycle')).toBe(true);
  });

  it('detects missing edge ref and duplicate id', () => {
    const p = makePipeline();
    p.edges = [{ from: 'a', to: 'ghost', kind: 'depends_on' }];
    p.steps.push({ id: 'a', component: { name: 'Dup', version: '1.0.0' } }); // duplicate

    const issues = validatePipelineGraph(p);
    expect(issues.some(i => i.kind === 'missing_edge_ref')).toBe(true);
    expect(issues.some(i => i.kind === 'duplicate_id')).toBe(true);
  });

  it('topological order handles parallel branches (independent → any order, then join)', () => {
    const p: PipelineDefinition = {
      ...makePipeline(),
      steps: [
        { id: 'disc', component: { name: 'Browser Discovery', version: '1.0.0' } },
        { id: 'scanner', component: { name: 'scanner', version: '2.0.0' } },
        { id: 'fuzz', component: { name: 'Fuzz', version: '1.0.0' } },
        { id: 'gate', component: { name: 'Gate', version: '1.0.0' } },
      ],
      edges: [
        { from: 'disc', to: 'scanner', kind: 'depends_on' },
        { from: 'disc', to: 'fuzz', kind: 'depends_on' },
        { from: 'scanner', to: 'gate', kind: 'depends_on' },
        { from: 'fuzz', to: 'gate', kind: 'depends_on' },
      ],
    };
    const order = topologicalOrder(p.steps, p.edges);
    expect(order[0]).toBe('disc');
    expect(order[order.length - 1]).toBe('gate');
    // scanner/fuzz идут после disc и до gate
    expect(order.indexOf('scanner')).toBeGreaterThan(order.indexOf('disc'));
    expect(order.indexOf('fuzz')).toBeGreaterThan(order.indexOf('disc'));
  });

  it('collectUnpinnedComponents flags latest', () => {
    const p = makePipeline();
    p.steps[1] = { id: 'b', component: { name: 'scanner', version: 'latest' } };
    expect(collectUnpinnedComponents(p)).toEqual(['b']);
  });

  it('isPinnedVersion: latest → false, concrete → true', () => {
    expect(isPinnedVersion({ name: 'X', version: 'latest' })).toBe(false);
    expect(isPinnedVersion({ name: 'X', version: '2.15.0' })).toBe(true);
  });
});
