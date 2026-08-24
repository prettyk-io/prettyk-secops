/**
 * ADM-POC-A: flat Admin runs ledger from local checksStore + evidence + deploy links.
 * Pure aggregate — no Live /api/runs/index.
 */

import type { CheckInstance, CheckRunRef, CheckRunStatus } from '../checks/types';
import { CHECK_RUNS_MAX } from '../checks/types';
import type { CheckEvidenceRefs } from './evidenceTypes';
import type { DeployCheckLink } from './types';

/** Cap across all checks (History keeps CHECK_RUNS_MAX per check). */
export const ADMIN_RUNS_MAX = CHECK_RUNS_MAX * 5; // 200

export type AdminRunRow = {
  key: string;
  check_id: string;
  check_title: string;
  run_id: string;
  started_at?: string;
  ended_at?: string;
  status: CheckRunStatus;
  ci_verdict?: string;
  deploy_id?: string;
  allure_url?: string;
  dojo_url?: string;
  /** PERS: check/run owner (Admin sees all). */
  owner_user_id?: string;
};

export type CollectAdminRunsInput = {
  checks: readonly CheckInstance[];
  evidence?: readonly CheckEvidenceRefs[];
  links?: readonly DeployCheckLink[];
  /** Soft cap after sort (newest first). Default ADMIN_RUNS_MAX. */
  maxRows?: number;
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;

function runSortMs(run: CheckRunRef): number {
  const raw = run.ended_at || run.started_at;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function evidenceByCheckId(
  evidence: readonly CheckEvidenceRefs[],
): Map<string, CheckEvidenceRefs> {
  const map = new Map<string, CheckEvidenceRefs>();
  for (const refs of evidence) {
    const prev = map.get(refs.check_id);
    if (!prev) {
      map.set(refs.check_id, refs);
      continue;
    }
    const prevAt = String(prev.updated_at ?? '');
    const nextAt = String(refs.updated_at ?? '');
    if (nextAt.localeCompare(prevAt) >= 0) {
      map.set(refs.check_id, refs);
    }
  }
  return map;
}

function deployIdByCheck(
  links: readonly DeployCheckLink[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    if (!map.has(link.check_id)) {
      map.set(link.check_id, link.deploy_id);
    }
  }
  return map;
}

function pickFromHistory(
  history: NonNullable<CheckEvidenceRefs['history']>,
): { allure_url?: string; dojo_url?: string } {
  let allure_url: string | undefined;
  let dojo_url: string | undefined;
  const hist = [...history].sort((a, b) => b.at.localeCompare(a.at));
  for (const point of hist) {
    allure_url ??= point.allure_report_url;
    dojo_url ??= point.dojo_engagement_url;
    if (allure_url && dojo_url) {
      break;
    }
  }
  return { allure_url, dojo_url };
}

function urlsFromEvidence(refs: CheckEvidenceRefs | undefined): {
  allure_url?: string;
  dojo_url?: string;
} {
  if (!refs) return {};
  const allure_url = refs.allure?.report_url;
  const dojo_url = refs.dojo?.engagement_url ?? refs.dojo?.test_url;
  if (allure_url && dojo_url) {
    return { allure_url, dojo_url };
  }
  if (!refs.history?.length) {
    return { allure_url, dojo_url };
  }
  const fromHist = pickFromHistory(refs.history);
  return {
    allure_url: allure_url ?? fromHist.allure_url,
    dojo_url: dojo_url ?? fromHist.dojo_url,
  };
}

function rowFromCheckRun(
  check: CollectAdminRunsInput['checks'][number],
  run: NonNullable<CollectAdminRunsInput['checks'][number]['runs']>[number],
  evMap: Map<string, CheckEvidenceRefs>,
  depMap: Map<string, string>,
): AdminRunRow {
  const urls = urlsFromEvidence(evMap.get(check.check_id));
  return {
    key: `${check.check_id}:${run.run_id}`,
    check_id: check.check_id,
    check_title: check.title || check.check_id,
    run_id: run.run_id,
    started_at: run.started_at,
    ended_at: run.ended_at,
    status: run.status,
    ci_verdict: run.ci_verdict,
    deploy_id: depMap.get(check.check_id),
    allure_url: urls.allure_url,
    dojo_url: urls.dojo_url,
    owner_user_id: run.owner_user_id || check.owner_user_id,
  };
}

function sortAdminRunsNewestFirst(rows: AdminRunRow[]): AdminRunRow[] {
  return [...rows].sort((a, b) => {
    const ta = runSortMs({
      run_id: a.run_id,
      status: a.status,
      started_at: a.started_at,
      ended_at: a.ended_at,
    });
    const tb = runSortMs({
      run_id: b.run_id,
      status: b.status,
      started_at: b.started_at,
      ended_at: b.ended_at,
    });
    return tb - ta;
  });
}

/** Flatten checks.runs → AdminRunRow[], newest first, capped. */
export function collectAdminRuns(input: CollectAdminRunsInput): AdminRunRow[] {
  const maxRows = input.maxRows ?? ADMIN_RUNS_MAX;
  const evMap = evidenceByCheckId(input.evidence ?? []);
  const depMap = deployIdByCheck(input.links ?? []);
  const rows: AdminRunRow[] = [];

  for (const check of input.checks) {
    for (const run of check.runs ?? []) {
      rows.push(rowFromCheckRun(check, run, evMap, depMap));
    }
  }

  return sortAdminRunsNewestFirst(rows).slice(0, Math.max(0, maxRows));
}

export type AdminRunsFilter = {
  /** Exact or substring match on ci_verdict (case-insensitive). Empty = any. */
  verdict?: string;
  /** Keep only runs with started/ended within last 7 days of nowMs. */
  last7d?: boolean;
  deployId?: string;
  nowMs?: number;
};

function rowMatchesAdminFilter(
  row: AdminRunRow,
  opts: {
    verdictNeedle: string;
    last7d: boolean | undefined;
    floor: number;
    deployId: string;
  },
): boolean {
  if (opts.verdictNeedle) {
    const v = String(row.ci_verdict ?? '').toLowerCase();
    if (!v.includes(opts.verdictNeedle)) return false;
  }
  if (opts.last7d) {
    const t = runSortMs({
      run_id: row.run_id,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
    });
    if (t < opts.floor) return false;
  }
  if (opts.deployId && row.deploy_id !== opts.deployId) return false;
  return true;
}

export function filterAdminRuns(
  rows: readonly AdminRunRow[],
  filter: AdminRunsFilter = {},
): AdminRunRow[] {
  const nowMs = filter.nowMs ?? Date.now();
  const floor = nowMs - MS_7D;
  const verdictNeedle = (filter.verdict ?? '').trim().toLowerCase();
  const deployId = (filter.deployId ?? '').trim();

  return rows.filter((row) =>
    rowMatchesAdminFilter(row, {
      verdictNeedle,
      last7d: filter.last7d,
      floor,
      deployId,
    }),
  );
}

/** Count rows in last 7d (same clock as deriveProgramKpi checks_last_7d). */
export function countAdminRunsLast7d(
  rows: readonly AdminRunRow[],
  nowMs: number = Date.now(),
): number {
  return filterAdminRuns(rows, { last7d: true, nowMs }).length;
}
