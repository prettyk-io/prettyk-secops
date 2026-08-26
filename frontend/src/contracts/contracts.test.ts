import { describe, it, expect } from 'vitest';
import { MOCK_RUN_TELEMETRY_EVENTS, MOCK_STEP_RUNTIME_SNAPSHOTS } from './mockRunTelemetry';
import { MOCK_STEP_TIMELINE_SUMMARY } from './mockStepTimeline';
import type { StepTelemetryEvent, StepRuntimeSnapshot, RunTimelineSummary } from './types';

describe('Data Contracts (PK-EC-4)', () => {
  it('validates mock telemetry events structure and types', () => {
    expect(MOCK_RUN_TELEMETRY_EVENTS).toHaveLength(3);
    const event: StepTelemetryEvent = MOCK_RUN_TELEMETRY_EVENTS[0]!;
    expect(event.run_id).toBe('run-alpha-8821');
    expect(event.step_id).toBe('step-auth-init');
    expect(event.status).toBe('success');
    expect(event.duration_ms).toBe(142);
    expect(event.metrics?.http_status).toBe(200);
  });

  it('validates variable snapshots and secret masking invariants', () => {
    expect(MOCK_STEP_RUNTIME_SNAPSHOTS).toHaveLength(3);
    const snapshot: StepRuntimeSnapshot = MOCK_STEP_RUNTIME_SNAPSHOTS[0]!;
    expect(snapshot.step_id).toBe('step-auth-init');
    expect(snapshot.variables.length).toBeGreaterThanOrEqual(3);

    const secretVar = snapshot.variables.find((v) => v.isSecret);
    expect(secretVar).toBeDefined();
    expect(secretVar?.name).toBe('JWT_ACCESS_TOKEN');
    expect(secretVar?.masked).toBe(true);
  });

  it('validates step timeline summary aggregate metrics', () => {
    const summary: RunTimelineSummary = MOCK_STEP_TIMELINE_SUMMARY;
    expect(summary.run_id).toBe('run-secops-9941');
    expect(summary.total_steps).toBe(5);
    expect(summary.timeline).toHaveLength(5);
    expect(summary.timeline[0]?.name).toBe('CDP Chrome Session Handshake');
    expect(summary.timeline[0]?.status).toBe('success');
    expect(summary.timeline[3]?.status).toBe('running');
    expect(summary.timeline[4]?.status).toBe('queued');
  });
});
