import { describe, it, expect } from 'vitest';
import { serializePipeline, parsePipeline, toGraph, fromGraph, assertRoundTrip, PIPELINE_IR_VERSION } from './codec';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1',
    irVersion: PIPELINE_IR_VERSION,
    name: 'OWASP Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice.prettyk.io'] }] },
    policy: { id: 'pol', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'scanner Active Scan', version: '2.15.0' } },
    ],
    edges: [{ from: 'disc', to: 'scan', kind: 'depends_on' }],
  };
}

describe('Codec — code ↔ graph (PK-CI-3)', () => {
  it('serialize → parse round-trips the same definition', () => {
    const text = serializePipeline(makePipeline());
    const res = parsePipeline(text);
    expect(res.ok).toBe(true);
    expect(res.pipeline).toEqual(makePipeline());
  });

  it('parse rejects garbage', () => {
    expect(parsePipeline('not json').ok).toBe(false);
    expect(parsePipeline('{"foo":1}').ok).toBe(false); // missing steps/edges
  });

  it('toGraph produces nodes + edges from one source', () => {
    const g = toGraph(makePipeline());
    expect(g.nodes.length).toBe(2);
    expect(g.edges.length).toBe(1);
    expect(g.nodes[0]!.id).toBe('disc');
    expect(g.edges[0]!.source).toBe('disc');
    expect(g.edges[0]!.target).toBe('scan');
  });

  it('fromGraph rebuilds equivalent definition', () => {
    const def = makePipeline();
    const g = toGraph(def);
    const base = {
      id: def.id, irVersion: def.irVersion, name: def.name,
      target: def.target, scope: def.scope, policy: def.policy,
      requiredCapabilities: def.requiredCapabilities,
    };
    const rebuilt = fromGraph(base, g);
    expect(rebuilt.steps.map(s => s.id).sort()).toEqual(['disc', 'scan']);
    expect(rebuilt.edges).toEqual([{ from: 'disc', to: 'scan', kind: 'depends_on' }]);
  });

  it('assertRoundTrip holds for valid pipeline (code and graph are one description)', () => {
    expect(assertRoundTrip(makePipeline())).toBe(true);
  });
});
