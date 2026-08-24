/**
 * ADM-2: PipelineVerdict / evidence gate → DeployGate семафор.
 */
import type { CheckInstance, CheckRunRef } from '../checks/types';
import type { CheckEvidenceRefs } from './evidenceTypes';
import type { DeployGate } from './types';

const ADMISSION_PASS = new Set(['pass', 'pass_edge']);
const ADMISSION_WATCH = new Set(['pass_watch', 'watch']);
const ADMISSION_FAIL = new Set(['fail_gate', 'fail']);

/** Map ci_verdict or evidence history gate → DeployGate; null = не трогать. */
export function deployGateFromVerdict(verdict?: string | null): DeployGate | null {
  const v = (verdict || '').trim().toLowerCase();
  if (!v || v === 'idle' || v === 'running' || v === 'unknown') {
    return null;
  }
  if (ADMISSION_PASS.has(v)) {
    return 'pass';
  }
  if (ADMISSION_WATCH.has(v)) {
    return 'watch';
  }
  if (ADMISSION_FAIL.has(v)) {
    return 'fail';
  }
  // fail_run / прочее — ось исполнения, не допуск; last_gate не трогаем
  return null;
}

function runStamp(run: CheckRunRef): string {
  return run.ended_at || run.started_at || '';
}

function newestRun(runs: readonly CheckRunRef[]): CheckRunRef | undefined {
  if (!runs.length) {
    return undefined;
  }
  return [...runs].sort((a, b) => runStamp(b).localeCompare(runStamp(a)))[0];
}

function pickNewestVerdictRun(
  checks: readonly CheckInstance[],
): CheckRunRef | undefined {
  let best: CheckRunRef | undefined;
  for (const check of checks) {
    const run = newestRun(check.runs ?? []);
    if (!run?.ci_verdict) {
      continue;
    }
    if (!best || runStamp(run) > runStamp(best)) {
      best = run;
    }
  }
  return best;
}

function pickLatestEvidenceGate(
  evidence: readonly CheckEvidenceRefs[],
): DeployGate | null {
  let latestGate: DeployGate | null = null;
  let latestAt = '';
  for (const refs of evidence) {
    for (const point of refs.history ?? []) {
      const at = point.at || '';
      const g = deployGateFromVerdict(point.gate);
      if (!g || at < latestAt) {
        continue;
      }
      latestAt = at;
      latestGate = g;
    }
  }
  return latestGate;
}

/** Предпочтительный сигнал: latest run ci_verdict → latest evidence history gate. */
export function resolveDeployGateSignal(input: {
  checks: readonly CheckInstance[];
  evidence: readonly CheckEvidenceRefs[];
}): DeployGate | null {
  const fromRun = deployGateFromVerdict(pickNewestVerdictRun(input.checks)?.ci_verdict);
  if (fromRun) {
    return fromRun;
  }
  return pickLatestEvidenceGate(input.evidence);
}
