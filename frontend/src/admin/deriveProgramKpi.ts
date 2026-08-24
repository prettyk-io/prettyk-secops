/**
 * ADM-1: живые program KPI из deploys + checks.runs + evidence (без MOCK).
 */
import type { CheckInstance, CheckRunRef } from '../checks/types';
import type { CheckEvidenceRefs } from './evidenceTypes';
import type { BankDeploy, DeployGate, ProgramKpi } from './types';

const MS_DAY = 24 * 60 * 60 * 1000;

function runTimeMs(run: CheckRunRef): number {
  const raw = run.ended_at || run.started_at;
  if (!raw) {
    return 0;
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Count runs in the last `windowDays` (default 7 — field name checks_last_7d kept for API). */
function countChecksInWindow(
  checks: readonly CheckInstance[],
  nowMs: number,
  windowDays = 7,
): number {
  const floor = nowMs - windowDays * MS_DAY;
  let n = 0;
  for (const check of checks) {
    for (const run of check.runs ?? []) {
      const t = runTimeMs(run);
      if (t >= floor) {
        n += 1;
      }
    }
  }
  return n;
}

function gateBucket(gate?: DeployGate): keyof Pick<
  ProgramKpi,
  'gate_pass' | 'gate_watch' | 'gate_fail' | 'gate_unknown'
> {
  if (gate === 'pass') return 'gate_pass';
  if (gate === 'watch') return 'gate_watch';
  if (gate === 'fail') return 'gate_fail';
  return 'gate_unknown';
}

function sumOpenSev(evidenceByDeploy: Map<string, CheckEvidenceRefs[]>): {
  critical: number;
  high: number;
  trendDelta: number;
} {
  let critical = 0;
  let high = 0;
  let trendDelta = 0;
  for (const refsList of evidenceByDeploy.values()) {
    const sorted = [...refsList].sort((a, b) =>
      String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
    );
    const top = sorted[0];
    if (!top) continue;
    const c = Number(top.dojo?.stats?.critical ?? 0);
    const h = Number(top.dojo?.stats?.high ?? 0);
    critical += c;
    high += h;
    const hist = [...(top.history ?? [])].sort((a, b) => a.at.localeCompare(b.at));
    if (hist.length >= 2) {
      const prev = hist[hist.length - 2];
      const last = hist[hist.length - 1];
      if (prev && last) {
        const prevC = Number(prev.dojo_stats?.critical ?? 0);
        const lastC = Number(last.dojo_stats?.critical ?? c);
        trendDelta += lastC - prevC;
      }
    }
  }
  return { critical, high, trendDelta };
}

export type DeriveProgramKpiInput = {
  deploys: readonly BankDeploy[];
  checks: readonly CheckInstance[];
  /** evidence grouped or flat — flat ok */
  evidence: readonly CheckEvidenceRefs[];
  /** deploy_id → linked check_ids */
  linksByDeploy: ReadonlyMap<string, readonly string[]>;
  nowMs?: number;
  /** Window for checks_last_7d counter (7 | 30). Default 7. */
  windowDays?: 7 | 30;
};

export function deriveProgramKpi(input: DeriveProgramKpiInput): ProgramKpi {
  const nowMs = input.nowMs ?? Date.now();
  const deploys = input.deploys;
  const apps_total = deploys.length;

  const evidenceByDeploy = new Map<string, CheckEvidenceRefs[]>();
  for (const refs of input.evidence) {
    const dep = refs.deploy_id;
    if (!dep) continue;
    const list = evidenceByDeploy.get(dep) ?? [];
    list.push(refs);
    evidenceByDeploy.set(dep, list);
  }

  let apps_covered = 0;
  for (const d of deploys) {
    const linked = input.linksByDeploy.get(d.deploy_id) ?? [];
    const hasEv = (evidenceByDeploy.get(d.deploy_id)?.length ?? 0) > 0;
    if (linked.length > 0 || hasEv || d.last_check_id) {
      apps_covered += 1;
    }
  }

  let gate_pass = 0;
  let gate_watch = 0;
  let gate_fail = 0;
  let gate_unknown = 0;
  for (const d of deploys) {
    const bucket = gateBucket(d.last_gate);
    if (bucket === 'gate_pass') gate_pass += 1;
    else if (bucket === 'gate_watch') gate_watch += 1;
    else if (bucket === 'gate_fail') gate_fail += 1;
    else gate_unknown += 1;
  }

  const known = gate_pass + gate_watch + gate_fail;
  const gate_pass_rate = known > 0 ? gate_pass / known : 0;

  const open = sumOpenSev(evidenceByDeploy);

  return {
    apps_covered,
    apps_total,
    open_critical: open.critical,
    open_high: open.high,
    checks_last_7d: countChecksInWindow(
      input.checks,
      nowMs,
      input.windowDays ?? 7,
    ),
    gate_pass_rate,
    trend_critical_delta: open.trendDelta,
    gate_pass,
    gate_watch,
    gate_fail,
    gate_unknown,
  };
}

/** Empty / zero KPI when registry пуст. */
export function emptyProgramKpi(): ProgramKpi {
  return {
    apps_covered: 0,
    apps_total: 0,
    open_critical: 0,
    open_high: 0,
    checks_last_7d: 0,
    gate_pass_rate: 0,
    trend_critical_delta: 0,
    gate_pass: 0,
    gate_watch: 0,
    gate_fail: 0,
    gate_unknown: 0,
  };
}
