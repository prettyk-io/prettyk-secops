import { describe, it, expect } from 'vitest';
import { runPreflight, checkScope, checkPolicy, checkCapabilities } from './preflight';
import type { PipelineDefinition, Scope, Capability } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1',
    irVersion: '1.0.0',
    name: 'OWASP Check',
    target: { id: 'tgt', name: 'Juice', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io', '*.bank.ru'] }] },
    policy: { id: 'pol-owasp', name: 'OWASP', version: '2' },
    requiredCapabilities: ['checks:create', 'fuzzer:execute'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'scanner Active Scan', version: '2.15.0' }, approvals: [{ kind: 'role', required: 'fuzzer:execute', label: 'Fuzz approval' }] },
    ],
    edges: [{ from: 'disc', to: 'scan', kind: 'depends_on' }],
  };
}

describe('Preflight — checkScope (PK-CI-5)', () => {
  it('allows URL inside scope', () => {
    const scope: Scope = { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] };
    expect(checkScope('https://juice-shop.prettyk.io/api', scope)).toEqual([]);
  });

  it('allows wildcard subdomain', () => {
    const scope: Scope = { rules: [{ allowedHosts: ['*.bank.ru'] }] };
    expect(checkScope('https://api.bank.ru/v1/auth', scope)).toEqual([]);
    expect(checkScope('https://bank.ru', scope).length).toBe(0);
  });

  it('blocks URL outside scope', () => {
    const scope: Scope = { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] };
    const blocks = checkScope('https://evil.com/attack', scope);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.kind).toBe('scope_violation');
  });

  it('path prefix check restricts paths', () => {
    const scope: Scope = { rules: [{ allowedHosts: ['api.bank.ru'], allowedPaths: ['/v1/'] }] };
    expect(checkScope('https://api.bank.ru/v1/auth', scope)).toEqual([]);
    const blocks = checkScope('https://api.bank.ru/v2/admin', scope);
    expect(blocks.length).toBe(1);
  });

  it('empty scope = implicit allow', () => {
    expect(checkScope('https://anything.com', { rules: [] })).toEqual([]);
  });
});

describe('Preflight — checkPolicy', () => {
  it('blocks inactive policy', () => {
    const blocks = checkPolicy({ id: 'pol-x', active: false });
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.kind).toBe('inactive_policy');
  });

  it('allows active/undefined policy', () => {
    expect(checkPolicy({ id: 'pol-x', active: true })).toEqual([]);
    expect(checkPolicy({ id: 'pol-x' })).toEqual([]);
  });
});

describe('Preflight — checkCapabilities', () => {
  it('blocks missing capability', () => {
    const blocks = checkCapabilities(['fuzzer:execute'], ['checks:create']);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.kind).toBe('missing_capability');
  });

  it('allows when all caps held', () => {
    expect(checkCapabilities(['checks:create', 'fuzzer:execute'], ['checks:create', 'fuzzer:execute', 'policies:manage'])).toEqual([]);
  });
});

describe('Preflight — full runPreflight', () => {
  const heldCaps: Capability[] = ['checks:create', 'fuzzer:execute', 'policies:manage'];

  it('passes with valid scope + caps + active policy', () => {
    const result = runPreflight({
      pipeline: makePipeline(),
      targetUrl: 'https://juice-shop.prettyk.io',
      heldCapabilities: heldCaps,
      actor: 'admin-sec',
      policyActive: true,
    });
    expect(result.ok).toBe(true);
    expect(result.blocks.length).toBe(0); // unpinned — только если есть
  });

  it('fail-closed on scope violation', () => {
    const result = runPreflight({
      pipeline: makePipeline(),
      targetUrl: 'https://evil.com',
      heldCapabilities: heldCaps,
      actor: 'admin-sec',
      policyActive: true,
    });
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.kind === 'scope_violation')).toBe(true);
  });

  it('fail-closed on inactive policy', () => {
    const result = runPreflight({
      pipeline: makePipeline(),
      targetUrl: 'https://juice-shop.prettyk.io',
      heldCapabilities: heldCaps,
      actor: 'admin-sec',
      policyActive: false,
    });
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.kind === 'inactive_policy')).toBe(true);
  });

  it('fail-closed on missing capability', () => {
    const result = runPreflight({
      pipeline: makePipeline(),
      targetUrl: 'https://juice-shop.prettyk.io',
      heldCapabilities: ['checks:create'], // missing fuzzer:execute
      actor: 'user',
      policyActive: true,
    });
    expect(result.ok).toBe(false);
    expect(result.blocks.some(b => b.kind === 'missing_capability')).toBe(true);
    expect(result.blocks.some(b => b.kind === 'missing_approval')).toBe(true);
  });

  it('produces audit on block', () => {
    const result = runPreflight({
      pipeline: makePipeline(),
      targetUrl: 'https://evil.com',
      heldCapabilities: [],
      actor: 'bad-actor',
    });
    expect(result.audit.length).toBe(1);
    expect(result.audit[0]!.kind).toBe('preflight_blocked');
    expect(result.audit[0]!.blocks.length).toBeGreaterThan(0);
  });
});