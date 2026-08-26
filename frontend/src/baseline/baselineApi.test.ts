import { describe, it, expect } from 'vitest';
import { SmartBaselinePipelineStore } from './smartPipeline';
import {
  executeBaselinePipeline,
  handleStartBaseline,
  handleGetBaselineStatus,
  handleGetBaselineLedger,
  formatSseEvent,
  BaselineApiClient,
} from './baselineApi';
import type { BaselineStreamEvent } from './types';

describe('PK-BL-5: Baseline REST, SSE & Pipeline Execution API', () => {
  it('executes full 6-phase baseline pipeline and emits events', async () => {
    const store = new SmartBaselinePipelineStore();
    const { run } = store.createRun({
      targetUrl: 'http://test.secops.local/api/health',
      openapiContent: {
        openapi: '3.0.0',
        paths: {
          '/api/v1/auth/login': { post: {} },
          '/api/v1/admin/debug': { get: {} },
        },
      },
    });

    const emittedEvents: BaselineStreamEvent[] = [];
    const completedRun = await executeBaselinePipeline(run.runId, store, {
      onEvent: (e) => emittedEvents.push(e),
    });

    expect(completedRun.status).toBe('succeeded');
    expect(completedRun.progressPercent).toBe(100);
    expect(completedRun.graph).toBeDefined();
    expect(completedRun.findings.length).toBeGreaterThan(0);
    expect(completedRun.ledger).toBeDefined();

    expect(emittedEvents.some((e) => e.type === 'phase_started')).toBe(true);
    expect(emittedEvents.some((e) => e.type === 'phase_completed')).toBe(true);
    expect(emittedEvents.some((e) => e.type === 'run_completed')).toBe(true);
  });

  it('formats SSE stream events accurately', () => {
    const ev: BaselineStreamEvent = {
      type: 'phase_started',
      runId: 'bl_run_123',
      timestamp: '2026-08-25T12:00:00Z',
      payload: { phase: 'intake-parsing', progress: 10 },
    };

    const sseFormatted = formatSseEvent(ev);
    expect(sseFormatted.startsWith('event: phase_started\n')).toBe(true);
    expect(sseFormatted).toContain('"runId":"bl_run_123"');
    expect(sseFormatted.endsWith('\n\n')).toBe(true);
  });

  it('provides working BaselineApiClient SDK', async () => {
    const store = new SmartBaselinePipelineStore();
    const client = new BaselineApiClient(store);

    const startRes = await client.startBaseline({
      targetUrl: 'https://client-test.local',
    });

    expect(startRes.runId).toBeDefined();
    expect(['pending', 'running', 'succeeded']).toContain(startRes.status);

    const statusRes = await client.getStatus(startRes.runId);
    expect(statusRes).toBeDefined();
    expect(statusRes?.runId).toBe(startRes.runId);
  });
});
