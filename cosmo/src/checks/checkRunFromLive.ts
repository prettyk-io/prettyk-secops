/**
 * NAV-RUN: Live meta / CI → CheckRunRef (без серверного persist).
 */

import { syncDeployGatesForCheck } from '../admin/deployStore';
import { pipelineStatusFromMeta } from '../results/pipelineVerdict';
import type { LiveMetaSnapshot } from '../results/types';
import { getActiveCheckId, upsertCheckRun } from './checksStore';
import type { CheckRunRef, CheckRunStatus, CheckStatus } from './types';

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function checkRunStatusFromLiveMeta(meta: LiveMetaSnapshot): CheckRunStatus {
  const pipe = pipelineStatusFromMeta(meta);
  if (pipe.verdict === 'running') {
    return 'running';
  }
  if (pipe.verdict === 'fail_gate' || pipe.verdict === 'fail_run') {
    return 'failed';
  }
  if (
    pipe.verdict === 'pass' ||
    pipe.verdict === 'pass_watch' ||
    pipe.verdict === 'pass_edge'
  ) {
    return 'success';
  }
  const liveStatus = str(meta.status).toLowerCase();
  if (liveStatus === 'running') {
    return 'running';
  }
  if (typeof meta.ci_exit_code === 'number') {
    if (meta.ci_exit_code === 0) {
      return 'success';
    }
    if (meta.ci_exit_code === 1 || meta.ci_exit_code === 2) {
      return 'failed';
    }
  }
  return 'unknown';
}

/** Instance status for History row when a run is recorded. */
export function checkStatusFromRunStatus(runStatus: CheckRunStatus): CheckStatus | undefined {
  if (runStatus === 'running') {
    return 'running';
  }
  if (runStatus === 'success') {
    return 'completed';
  }
  if (runStatus === 'failed') {
    return 'failed';
  }
  return undefined;
}

function isoFromEpochSeconds(value: unknown): string | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  return new Date(value * 1000).toISOString();
}

function endedAtFromLiveMeta(
  meta: LiveMetaSnapshot,
  status: CheckRunStatus,
): string | undefined {
  if (status !== 'success' && status !== 'failed') {
    return undefined;
  }
  return isoFromEpochSeconds(meta.last_export_at) ?? isoFromEpochSeconds(meta.ci_updated_at);
}

/**
 * Build / refresh a CheckRunRef from Live meta.
 * Prefer meta.run_id (hex, MON-13 bind) → last_export_run_id → session_name.
 */
export function checkRunRefFromLiveMeta(meta: LiveMetaSnapshot | null): CheckRunRef | null {
  if (!meta) {
    return null;
  }
  const exportId = str(meta.last_export_run_id);
  const session = str(meta.session_name);
  const metaRunId = str(meta.run_id);
  if (session === 'idle' && !exportId && !metaRunId) {
    return null;
  }
  // run_id для Monitor должен быть hex (тот же, что летит фронту и в видео).
  // session_name (human) — для заголовка, fallback для legacy/тестов без явного run_id.
  const runId = metaRunId || exportId || session || '';
  if (!runId || runId === 'idle') {
    return null;
  }

  const status = checkRunStatusFromLiveMeta(meta);
  const jobUrl = str(meta.ci_job_url) || str(meta.ci_html_url) || undefined;
  const verdict = str(meta.ci_verdict) || undefined;
  const ended = endedAtFromLiveMeta(meta, status);

  return {
    run_id: runId,
    status,
    started_at: undefined,
    ended_at: ended,
    ci_verdict: verdict,
    job_url: jobUrl,
    live_session: session && session !== 'idle' ? session : undefined,
  };
}

/** Best-effort: bind Live meta to target CheckInstance.runs[]. */
export function syncActiveCheckRunFromLive(meta: LiveMetaSnapshot | null): void {
  if (!meta) {
    return;
  }
  const metaCheckId = typeof meta.check_id === 'string' ? meta.check_id.trim() : '';
  const checkId = metaCheckId || getActiveCheckId();
  if (!checkId) {
    return;
  }
  const ref = checkRunRefFromLiveMeta(meta);
  if (!ref) {
    return;
  }
  upsertCheckRun(checkId, ref);
  syncDeployGatesForCheck(checkId);
}
