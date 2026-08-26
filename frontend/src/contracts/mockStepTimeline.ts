/**
 * Mock Step Timeline (PK-EC-4)
 *
 * 5-step scenario execution timeline with durations, statuses, and metrics.
 */

import type { RunTimelineSummary } from './types';

export const MOCK_STEP_TIMELINE_SUMMARY: RunTimelineSummary = {
  run_id: 'run-secops-9941',
  check_id: 'check-cbr-payment-gateway',
  total_steps: 5,
  completed_steps: 4,
  status: 'running',
  total_duration_ms: 3240,
  timeline: [
    {
      step_id: 'step-01-cdp-handshake',
      name: 'CDP Chrome Session Handshake',
      status: 'success',
      duration_ms: 380,
      started_at: '2026-08-25T14:32:00.000Z',
      ended_at: '2026-08-25T14:32:00.380Z',
    },
    {
      step_id: 'step-02-auth-token-obtain',
      name: 'OAuth2 Client Credentials Exchange',
      status: 'success',
      duration_ms: 540,
      started_at: '2026-08-25T14:32:00.380Z',
      ended_at: '2026-08-25T14:32:00.920Z',
    },
    {
      step_id: 'step-03-spider-crawl',
      name: 'Active Spider Crawl & Endpoint Discovery',
      status: 'success',
      duration_ms: 1250,
      started_at: '2026-08-25T14:32:00.920Z',
      ended_at: '2026-08-25T14:32:02.170Z',
    },
    {
      step_id: 'step-04-corpus-fuzz-mutation',
      name: 'Corpus Fuzzing with Spectral Mutations',
      status: 'running',
      duration_ms: 1070,
      started_at: '2026-08-25T14:32:02.170Z',
    },
    {
      step_id: 'step-05-proof-evidence-pack',
      name: 'Cryptographic Proof & Evidence Archival',
      status: 'queued',
      duration_ms: 0,
      started_at: '2026-08-25T14:32:03.240Z',
    },
  ],
};
