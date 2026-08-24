/**
 * PRETTYK-CI — External CI/CD Bridge (PK-CI-6).
 *
 * Контракт для внешних пайпов: GitHub Actions, GitLab CI, Jenkins, Tekton, Argo.
 * Внешний пайп вызывает PrettyK и получает стабильный статус + exit-семантику.
 *
 *   import { createCiBridge } from '@/ci/ciBridge';
 */
import type { RunState, RunRecord, FindingRecord } from './types';
import { isTerminal } from './stateMachine';
import type { RunEngine } from './runEngine';

export type ExternalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export function exitCodeOf(state: RunState): number {
  if (state === 'succeeded') return 0;
  if (state === 'failed') return 1;
  if (state === 'cancelled' || state === 'expired') return 2;
  return 3;
}

export function externalStatusOf(state: RunState): ExternalStatus {
  if (state === 'succeeded') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'cancelled' || state === 'expired') return 'cancelled';
  if (state === 'running' || state === 'cancelling') return 'running';
  return 'pending';
}

export interface FindingsSummary { critical: number; high: number; medium: number; low: number; total: number; }

export interface ExternalCiResult {
  status: ExternalStatus;
  exitCode: number;
  conclusion: string;
  evidenceUrl: string;
  title: string;
  completedAt?: string;
  findingsSummary?: FindingsSummary;
  idempotencyKey: string;
}

export interface CiBridge {
  syncStatus(runId: string, evidenceBaseUrl?: string): ExternalCiResult | null;
  buildCallback(runId: string, evidenceBaseUrl: string): ExternalCiResult | null;
  findingsSummary(runId: string): FindingsSummary;
}

function summaryOf(findings: FindingRecord[]): FindingsSummary {
  const s: FindingsSummary = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const f of findings) {
    s.total += 1;
    const sev = ((f as any).severity ?? '').toLowerCase();
    if (sev.includes('critical')) s.critical += 1;
    else if (sev.includes('high')) s.high += 1;
    else if (sev.includes('medium')) s.medium += 1;
    else s.low += 1;
  }
  return s;
}

function conclusionText(state: RunState): string {
  if (state === 'succeeded') return 'Security check passed all gates.';
  if (state === 'failed') return 'Security check failed gate threshold.';
  if (state === 'cancelled') return 'Security check was cancelled.';
  if (state === 'expired') return 'Security check timed out.';
  if (state === 'running') return 'Security check in progress.';
  return 'Security check waiting to start.';
}

export function createCiBridge(engine: RunEngine, evidenceBaseUrl = 'https://prettyk.io'): CiBridge {
  function toResult(run: RunRecord, baseUrl: string): ExternalCiResult {
    const findings = engine.listFindings(run.id);
    return {
      status: externalStatusOf(run.state),
      exitCode: exitCodeOf(run.state),
      conclusion: run.reason ?? conclusionText(run.state),
      evidenceUrl: `${baseUrl}/#/ci/runs/${run.id}`,
      title: run.pipelineSnapshot?.name ?? run.pipelineId,
      completedAt: isTerminal(run.state) ? run.updatedAt : undefined,
      findingsSummary: summaryOf(findings),
      idempotencyKey: `${run.id}:${run.updatedAt}`,
    };
  }

  return {
    syncStatus(runId, baseUrl = evidenceBaseUrl) {
      const run = engine.getRun(runId);
      return run ? toResult(run, baseUrl) : null;
    },
    buildCallback(runId, baseUrl = evidenceBaseUrl) {
      const run = engine.getRun(runId);
      if (!run || !isTerminal(run.state)) return null;
      return toResult(run, baseUrl);
    },
    findingsSummary(runId) {
      return summaryOf(engine.listFindings(runId));
    },
  };
}