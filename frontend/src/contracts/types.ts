/**
 * Telemetry & Ghost Values Data Contracts (PK-EC-4)
 *
 * Defines canonical data stream models for Editor Workbench,
 * Live execution, Step Debugger, and Ghost Value resolution.
 */

export type StepStatus = 'idle' | 'queued' | 'running' | 'success' | 'failed' | 'skipped';

export interface StepTelemetryEvent {
  run_id: string;
  step_id: string;
  status: StepStatus;
  duration_ms?: number;
  error?: string;
  timestamp?: string;
  metrics?: Record<string, number | string>;
}

export interface VariableSnapshot {
  name: string;
  value: string;
  isSecret: boolean;
  type?: 'string' | 'number' | 'boolean' | 'json' | 'binary' | 'token';
  sourceStepId?: string;
  masked?: boolean;
}

export interface StepRuntimeSnapshot {
  step_id: string;
  variables: VariableSnapshot[];
  timestamp?: string;
  stdout?: string;
  stderr?: string;
  httpExchange?: {
    requestUrl?: string;
    method?: string;
    status?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    responseBodyPreview?: string;
  };
}

export interface StepTimelineEntry {
  step_id: string;
  name: string;
  status: StepStatus;
  duration_ms: number;
  started_at: string;
  ended_at?: string;
  error?: string;
}

export interface RunTimelineSummary {
  run_id: string;
  check_id: string;
  total_steps: number;
  completed_steps: number;
  status: StepStatus;
  total_duration_ms: number;
  timeline: StepTimelineEntry[];
}

export type LiveTelemetryStreamMessage =
  | { type: 'step_event'; payload: StepTelemetryEvent }
  | { type: 'runtime_snapshot'; payload: StepRuntimeSnapshot }
  | { type: 'run_summary'; payload: RunTimelineSummary }
  | { type: 'heartbeat'; timestamp: string };
