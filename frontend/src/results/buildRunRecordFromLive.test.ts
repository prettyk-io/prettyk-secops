import { describe, expect, it } from 'vitest';
import { buildRunRecordFromLive } from './buildRunRecordFromLive';

describe('buildRunRecordFromLive', () => {
  it('maps hooks stats + collapse into summary', () => {
    const run = buildRunRecordFromLive({
      meta: {
        session_name: 'demo-run',
        status: 'success',
        ci_gate: 'fail',
        ci_verdict: 'fail_gate',
        ci_recommendations: ['Закрыть High'],
        live_url: 'http://127.0.0.1:8767/',
      },
      hooks: {
        allure: { report_url: 'http://127.0.0.1:5050/' },
        dojo: {
          report_url: 'http://127.0.0.1:8081/engagement/1',
          stats: { high: 2, medium: 1, low: 0, info: 0 },
          collapse: {
            raw_count: 5,
            cluster_count: 1,
            systemic_clusters: 1,
            totals: { high: 0, medium: 0, low: 1, info: 0 },
            top_findings: [
              {
                name: 'Missing Anti-clickjacking Header',
                risk: 'low',
                count: 5,
              },
            ],
          },
        },
      },
    });

    expect(run.run_id).toBe('demo-run');
    expect(run.status).toBe('success');
    expect(run.summary?.risks?.high).toBe(2);
    expect(run.summary?.top_findings?.[0]?.count).toBe(5);
    expect(run.summary?.executive_class).toBe('High');
    expect(run.gate?.failed).toBe(true);
    expect(run.links.dojo).toContain('8081');
  });

  it('fail_run keeps Pass security class and marks execution_fault', () => {
    const run = buildRunRecordFromLive({
      meta: {
        ci_verdict: 'fail_run',
        ci_exit_code: 1,
        ci_gate: 'pass',
        status: 'failed',
      },
      hooks: null,
    });
    expect(run.summary?.executive_class).toBe('Pass');
    expect(run.gate?.summary?.execution_fault).toBe(true);
    expect(run.gate?.summary?.admission_void).toBe(true);
    expect(run.gate?.failed).toBe(false);
    expect(run.summary?.recommendations?.[0]).toMatch(/Исполнение: сбой/i);
  });

  it('fail_run + residual gate=fail still voids admission claim', () => {
    const run = buildRunRecordFromLive({
      meta: {
        ci_verdict: 'fail_run',
        ci_exit_code: 1,
        ci_gate: 'fail',
        ci_risk_hints: {
          admission_void: true,
          execution_fault_kind: 'webdriver',
          counts: { high: 2 },
        },
        status: 'failed',
      },
      hooks: {
        dojo: {
          report_url: '',
          stats: { high: 2, medium: 0, low: 0, info: 0, critical: 0 },
        },
      },
    });
    expect(run.gate?.failed).toBe(false);
    expect(run.gate?.summary?.admission_void).toBe(true);
    expect(run.gate?.summary?.execution_fault_kind).toBe('webdriver');
  });

  it('pulls filter_audit from ci_risk_hints when hooks omit it', () => {
    const run = buildRunRecordFromLive({
      meta: {
        ci_verdict: 'fail_gate',
        ci_gate: 'fail',
        ci_risk_hints: {
          source: 'dojo_stats',
          counts_source: 'dojo_stats',
          filter_audit: { raw: 3, kept: 1, dropped_fp: 2 },
        },
      },
      hooks: {
        dojo: {
          report_url: 'http://127.0.0.1:8081/engagement/1',
          stats: { high: 1, medium: 0, low: 0, info: 0, critical: 0 },
        },
      },
    });
    expect(run.gate?.summary?.filter_audit).toEqual({
      raw: 3,
      kept: 1,
      dropped_fp: 2,
    });
    expect(run.gate?.summary?.counts_source).toBe('dojo_stats');
  });

  it('falls back to lab links when hooks empty', () => {
    const run = buildRunRecordFromLive({
      meta: { status: 'idle' },
      hooks: null,
      orchestratorSummary: {
        exit_code: 0,
        gate: 'pass',
        scenarios: { ok: 2, fail: 0, skip: 0 },
      },
    });
    expect(run.orchestrator_summary?.exit_code).toBe(0);
    expect(run.orchestrator_summary?.gate).toBe('pass');
    expect(run.links.allure).toContain('5050');
    expect(run.summary?.top_findings).toBeUndefined();
  });
});

