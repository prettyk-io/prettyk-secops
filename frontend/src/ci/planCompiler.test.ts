import { describe, expect, it } from 'vitest';
import { compilePipeline, PlanCompilationError } from './planCompiler';
import type { PipelineDefinition } from './types';

function pipeline(): PipelineDefinition {
  return {
    id: 'checkout-security',
    irVersion: '1',
    name: 'Checkout security',
    target: { id: 'checkout', name: 'Checkout', environment: 'lab' },
    scope: { rules: [{ allowedHosts: ['checkout.test'] }] },
    policy: { id: 'default', name: 'Default', version: '3' },
    requiredCapabilities: ['browser'],
    steps: [
      { id: 'scan', component: { name: 'scanner', version: '2.14.0' } },
      { id: 'build', component: { name: 'build', version: '1.2.0' } },
    ],
    edges: [{ from: 'build', to: 'scan', kind: 'depends_on' }],
  };
}

describe('compilePipeline', () => {
  it('produces deterministic hashes despite object and step order', async () => {
    const first = await compilePipeline(pipeline(), { commit: 'abc' });
    const second = await compilePipeline({
      ...pipeline(),
      steps: [...pipeline().steps].reverse(),
      edges: [...pipeline().edges].reverse(),
    }, { commit: 'abc' });

    expect(second.compiledHash).toBe(first.compiledHash);
    expect(second.inputsHash).toBe(first.inputsHash);
    expect(first.order).toEqual(['build', 'scan']);
    expect(first.batches).toEqual([
      { id: 'batch-1', stepIds: ['build'], dependsOn: [] },
      { id: 'batch-2', stepIds: ['scan'], dependsOn: ['batch-1'] },
    ]);
  });

  it('fails closed for invalid graphs and unpinned components', async () => {
    await expect(compilePipeline({
      ...pipeline(),
      steps: [
        { id: 'build', component: { name: 'build', version: 'latest' } },
        { id: 'scan', component: { name: 'scanner', version: '2.14.0' } },
      ],
      edges: [{ from: 'scan', to: 'build', kind: 'depends_on' }],
    })).rejects.toBeInstanceOf(PlanCompilationError);
  });
});