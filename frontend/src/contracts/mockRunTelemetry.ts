/**
 * Mock Run Telemetry with Variable Snapshots & Ghost Values (PK-EC-4)
 */

import type { StepRuntimeSnapshot, StepTelemetryEvent } from './types';

export const MOCK_RUN_TELEMETRY_EVENTS: StepTelemetryEvent[] = [
  {
    run_id: 'run-alpha-8821',
    step_id: 'step-auth-init',
    status: 'success',
    duration_ms: 142,
    timestamp: '2026-08-25T14:32:01.100Z',
    metrics: { http_status: 200, retry_count: 0 },
  },
  {
    run_id: 'run-alpha-8821',
    step_id: 'step-fuzz-auth-header',
    status: 'running',
    duration_ms: 850,
    timestamp: '2026-08-25T14:32:01.950Z',
    metrics: { payloads_sent: 120, anomalies_detected: 1 },
  },
  {
    run_id: 'run-alpha-8821',
    step_id: 'step-assert-fail-closed',
    status: 'queued',
    timestamp: '2026-08-25T14:32:02.800Z',
  },
];

export const MOCK_STEP_RUNTIME_SNAPSHOTS: StepRuntimeSnapshot[] = [
  {
    step_id: 'step-auth-init',
    timestamp: '2026-08-25T14:32:01.242Z',
    variables: [
      {
        name: 'AUTH_ENDPOINT',
        value: 'https://api.stage.internal/v1/auth/exchange',
        isSecret: false,
        type: 'string',
        sourceStepId: 'step-auth-init',
      },
      {
        name: 'JWT_ACCESS_TOKEN',
        value: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItOTkxMiIsImV4cCI6MTc4NzY3OTkyMX0.mock_signature',
        isSecret: true,
        type: 'token',
        sourceStepId: 'step-auth-init',
        masked: true,
      },
      {
        name: 'SESSION_NONCE',
        value: '7f9c3140a8d',
        isSecret: false,
        type: 'string',
        sourceStepId: 'step-auth-init',
      },
    ],
    stdout: '[AUTH] Initial handshake completed with status 200 OK.',
    httpExchange: {
      requestUrl: 'https://api.stage.internal/v1/auth/exchange',
      method: 'POST',
      status: 200,
      responseBodyPreview: '{"status":"ok","token_type":"Bearer","expires_in":3600}',
    },
  },
  {
    step_id: 'step-fuzz-auth-header',
    timestamp: '2026-08-25T14:32:02.800Z',
    variables: [
      {
        name: 'FUZZ_MUTATION_SEED',
        value: '0xDEADBEEF',
        isSecret: false,
        type: 'string',
        sourceStepId: 'step-fuzz-auth-header',
      },
      {
        name: 'ACTIVE_ANOMALY_CODE',
        value: 'CVE-2024-NULL-BYTE-EXPANSION',
        isSecret: false,
        type: 'string',
        sourceStepId: 'step-fuzz-auth-header',
      },
      {
        name: 'PROBE_PAYLOAD',
        value: 'Bearer eyJhbGciOiJub25lIn0.%00.signature',
        isSecret: true,
        type: 'token',
        sourceStepId: 'step-fuzz-auth-header',
      },
    ],
    stdout: '[FUZZ] Probing null-byte and none-algorithm mutations against backend gateway.',
    stderr: '[ALERT] Server responded with 500 Internal Error on mutation #84.',
    httpExchange: {
      requestUrl: 'https://api.stage.internal/v1/auth/validate',
      method: 'GET',
      status: 500,
      responseBodyPreview: '{"error":"NullPointerException in HeaderParser.java:42"}',
    },
  },
  {
    step_id: 'step-assert-fail-closed',
    timestamp: '2026-08-25T14:32:03.000Z',
    variables: [
      {
        name: 'EXPECTED_STATUS',
        value: '401',
        isSecret: false,
        type: 'number',
        sourceStepId: 'step-assert-fail-closed',
      },
      {
        name: 'GATE_RESULT',
        value: 'PENDING',
        isSecret: false,
        type: 'string',
        sourceStepId: 'step-assert-fail-closed',
      },
    ],
  },
];
