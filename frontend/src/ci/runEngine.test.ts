import { describe, it, expect, beforeEach } from 'vitest';
import { createRunEngine } from './runEngine';
import { memoryStorage } from './storage';
import type { PipelineDefinition } from './types';

function makePipeline(): PipelineDefinition {
  return {
    id: 'pipe-1',
    irVersion: '1.0.0',
    name: 'Juice Shop OWASP Check',
    target: { id: 'tgt-juice', name: 'Juice Shop', environment: 'Lab Stand' },
    scope: { rules: [{ allowedHosts: ['juice-shop.prettyk.io'] }] },
    policy: { id: 'pol-owasp', name: 'OWASP Top-10 Gate', version: '2' },
    requiredCapabilities: ['checks:create', 'fuzzer:execute'],
    steps: [
      { id: 'disc', component: { name: 'Browser Discovery', version: '1.4.0' } },
      { id: 'scan', component: { name: 'scanner Active Scan', version: '2.15.0' } },
    ],
    edges: [{ from: 'disc', to: 'scan', kind: 'depends_on' }],
  };
}

describe('Run Engine (PK-CI-2)', () => {
  let engine: ReturnType<typeof createRunEngine>;

  beforeEach(() => {
    engine = createRunEngine(memoryStorage());
  });

  it('createRun returns draft, transitions through honest states', () => {
    const run = engine.createRun({ pipeline: makePipeline(), actor: 'admin-sec' });
    expect(run.state).toBe('draft');

    const s1 = engine.transition(run.id, 'submit');
    expect(s1.ok).toBe(true);
    expect(s1.run?.state).toBe('pending');

    const s2 = engine.transition(run.id, 'approve');
    expect(s2.run?.state).toBe('queued');

    const s3 = engine.transition(run.id, 'acquire');
    expect(s3.run?.state).toBe('running');

    const s4 = engine.transition(run.id, 'complete');
    expect(s4.run?.state).toBe('succeeded');
  });

  it('idempotency: same intent → same run (no duplicate spawn)', () => {
    const p = makePipeline();
    const r1 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://x.io' } });
    const r2 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://x.io' } });
    expect(r1.id).toBe(r2.id); // тот же run, не дубль
  });

  it('idempotency: different inputs → different run', () => {
    const p = makePipeline();
    const r1 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://a.io' } });
    const r2 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://b.io' } });
    expect(r1.id).not.toBe(r2.id);
  });

  it('idempotency: terminal run does NOT block a fresh run', () => {
    const p = makePipeline();
    const r1 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://x.io' } });
    engine.transition(r1.id, 'submit');
    engine.transition(r1.id, 'approve');
    engine.transition(r1.id, 'acquire');
    engine.transition(r1.id, 'complete');

    const r2 = engine.createRun({ pipeline: p, actor: 'admin-sec', inputs: { url: 'https://x.io' } });
    expect(r2.id).not.toBe(r1.id); // terminal → можно новый
  });

  it('recordFinding dedups by identity (same dedupKey → null, no dup)', () => {
    const p = makePipeline();
    const run = engine.createRun({ pipeline: p, actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');

    const f1 = engine.recordFinding(run.id, 'fp:sql-injection-1', { cve: 'CVE-1' });
    expect(f1).not.toBeNull();
    const f2 = engine.recordFinding(run.id, 'fp:sql-injection-1', { cve: 'CVE-1' });
    expect(f2).toBeNull(); // дубль подавлен

    const findings = engine.listFindings(run.id);
    expect(findings.length).toBe(1);
  });

  it('recordEvidence dedups by identity', () => {
    const p = makePipeline();
    const run = engine.createRun({ pipeline: p, actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');

    engine.recordEvidence(run.id, 'evd:scanner-report-1', { report: '...' });
    engine.recordEvidence(run.id, 'evd:scanner-report-1', { report: '...' });
    expect(engine.listEvidence(run.id).length).toBe(1);
  });

  it('retry creates new attempt WITHOUT duplicating findings (parent findings untouched)', () => {
    const p = makePipeline();
    const run = engine.createRun({ pipeline: p, actor: 'admin-sec' });
    engine.transition(run.id, 'submit');
    engine.transition(run.id, 'approve');
    engine.transition(run.id, 'acquire');
    engine.recordFinding(run.id, 'fp:x', { cve: 'X' });
    engine.transition(run.id, 'fail');

    const retry = engine.retry(run.id, 'admin-sec');
    expect(retry).not.toBeNull();
    expect(retry!.retryOf).toBe(run.id);
    expect(retry!.attemptNumber).toBe(2);

    // Находки родителя не задвоились
    expect(engine.listFindings(run.id).length).toBe(1);
    // Новый attempt — свой список, пустой
    expect(engine.listFindings(retry!.id).length).toBe(0);
  });

  it('retry refused for succeeded/cancelled', () => {
    const p = makePipeline();
    const r1 = engine.createRun({ pipeline: p, actor: 'admin-sec' });
    engine.transition(r1.id, 'submit');
    engine.transition(r1.id, 'approve');
    engine.transition(r1.id, 'acquire');
    engine.transition(r1.id, 'complete');
    expect(engine.retry(r1.id)).toBeNull();
  });

  it('lease expiry → recoverStale marks running as expired (retryable)', () => {
    // Инжектируем часы, чтобы контролировать lease.
    let now = 1_000_000;
    const engine2 = createRunEngine(memoryStorage(), () => now);

    const p = makePipeline();
    const run = engine2.createRun({ pipeline: p, actor: 'admin-sec' });
    engine2.transition(run.id, 'submit');
    engine2.transition(run.id, 'approve');
    engine2.transition(run.id, 'acquire');

    // Воркер взял lease на 30s
    engine2.renewLease(run.id, 30_000);
    expect(engine2.getRun(run.id)?.leaseExpiresAt).toBeDefined();

    // Прошло 31s — lease истёк
    now += 31_000;
    const recovered = engine2.recoverStale();
    expect(recovered.length).toBe(1);
    expect(recovered[0]!.state).toBe('expired');
    expect(recovered[0]!.reason).toContain('lease expired');
  });

  it('recoverStale does not touch running with unexpired lease', () => {
    let now = 1_000_000;
    const engine2 = createRunEngine(memoryStorage(), () => now);
    const p = makePipeline();
    const run = engine2.createRun({ pipeline: p, actor: 'admin-sec' });
    engine2.transition(run.id, 'submit');
    engine2.transition(run.id, 'approve');
    engine2.transition(run.id, 'acquire');
    engine2.renewLease(run.id, 30_000);

    now += 10_000; // только 10s прошло
    expect(engine2.recoverStale().length).toBe(0);
    expect(engine2.getRun(run.id)?.state).toBe('running');
  });
});
