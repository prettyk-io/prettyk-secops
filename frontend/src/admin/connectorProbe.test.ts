// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_AIRGAP_CONNECTORS } from './defaults';
import { applySkippedHealthHonesty, buildProbeReport } from './connectorProbe';

describe('connectorProbe honesty', () => {
  it('marks DB/SSH/MQ unknown and builds summary', () => {
    const before = {
      ...DEFAULT_AIRGAP_CONNECTORS,
      db_health: 'ok' as const,
      ssh_health: 'ok' as const,
      mq_health: 'degraded' as const,
    };
    const afterHttp = {
      ...before,
      allure_health: 'ok' as const,
      dojo_health: 'down' as const,
      prom_health: 'degraded' as const,
      siem_health: 'unknown' as const,
    };
    const honest = applySkippedHealthHonesty(afterHttp);
    expect(honest.db_health).toBe('unknown');
    expect(honest.ssh_health).toBe('unknown');
    expect(honest.mq_health).toBe('unknown');
    const report = buildProbeReport(before, honest, '2026-08-12T00:00:00Z');
    expect(report.summary).toContain('HTTP:');
    expect(report.summary).toContain('не зондировались');
    expect(report.rows.filter((r) => r.lane === 'skipped')).toHaveLength(3);
  });

  it('marks HTTP ok(auth) when authNotes say reachable + auth', () => {
    const before = { ...DEFAULT_AIRGAP_CONNECTORS };
    const after = {
      ...before,
      allure_health: 'ok' as const,
      dojo_health: 'ok' as const,
      prom_health: 'ok' as const,
    };
    const report = buildProbeReport(before, after, '2026-08-12T00:00:00Z', {
      dojo: 'reachable + auth required',
    });
    expect(report.summary).toContain('dojo=ok(auth)');
    expect(report.rows.find((r) => r.id === 'dojo')?.note).toContain('auth');
  });
});
