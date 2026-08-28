/**
 * RES-ACT: собрать RunRecord из Live meta + hooks (без скрейпа Dojo/Allure HTML).
 */

import { buildExecutiveConclusion } from './executiveConclusion';
import { mapLiveStatus } from './resultsLiveMeta';
import {
  LAB_RESULT_LINKS,
  type LiveMetaSnapshot,
  type ResultsHooksSnapshot,
  type RunRecord,
  type RunSummary,
} from './types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function riskBucket(stats: Record<string, unknown> | undefined): RunSummary['risks'] | undefined {
  if (!stats) {
    return undefined;
  }
  const critical = num(stats.critical) ?? 0;
  const high = num(stats.high) ?? 0;
  const medium = num(stats.medium) ?? 0;
  const low = num(stats.low) ?? 0;
  const info = num(stats.info) ?? num(stats.informational) ?? 0;
  return { critical, high, medium, low, info };
}

function topFromCollapse(collapse: Record<string, unknown> | undefined): RunSummary['top_findings'] {
  const top = collapse?.top_findings;
  if (!Array.isArray(top)) {
    return undefined;
  }
  const out: NonNullable<RunSummary['top_findings']> = [];
  for (const item of top) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const name = typeof row.name === 'string' ? row.name : '';
    if (!name) {
      continue;
    }
    out.push({
      name,
      risk: typeof row.risk === 'string' ? row.risk : 'info',
      count: num(row.count) ?? 1,
    });
  }
  return out.length ? out : undefined;
}

function hookUrl(
  hooks: ResultsHooksSnapshot | null | undefined,
  key: 'allure' | 'dojo',
): string | undefined {
  const entry = hooks?.[key];
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }
  const url = (entry as { report_url?: unknown }).report_url;
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}

function allureSummaryLine(
  hooks: ResultsHooksSnapshot | null | undefined,
): string | undefined {
  const allure = hooks?.allure && typeof hooks.allure === 'object' ? asRecord(hooks.allure) : undefined;
  const summary = asRecord(allure?.summary);
  if (!summary) {
    const status = typeof allure?.status === 'string' ? allure.status.trim() : '';
    return status ? `Allure: status=${status}` : undefined;
  }
  const parts: string[] = [];
  for (const key of ['passed', 'failed', 'broken', 'skipped'] as const) {
    const n = num(summary[key]);
    if (n !== undefined) {
      parts.push(`${key}=${n}`);
    }
  }
  if (parts.length) {
    return `Allure: ${parts.join(', ')}`;
  }
  const status = typeof summary.status === 'string' ? summary.status : '';
  return status ? `Allure: status=${status}` : undefined;
}

function resolveExecutiveSource(
  hookExecutive: Record<string, unknown> | undefined,
  dojo: Record<string, unknown> | undefined,
): string | undefined {
  if (typeof hookExecutive?.source === 'string') {
    return hookExecutive.source;
  }
  if (typeof dojo?.counts_source === 'string') {
    return dojo.counts_source;
  }
  return undefined;
}

function parseScenarioOutcomes(
  outcomeRaw: unknown,
): Array<{ name: string; status: string }> | undefined {
  if (!Array.isArray(outcomeRaw)) {
    return undefined;
  }
  const out: Array<{ name: string; status: string }> = [];
  for (const item of outcomeRaw) {
    const row = asRecord(item);
    if (!row || typeof row.name !== 'string') {
      continue;
    }
    out.push({
      name: row.name,
      status: typeof row.status === 'string' ? row.status : 'unknown',
    });
  }
  return out.length ? out : undefined;
}

function applyHookExecutiveOverride(
  executive: ReturnType<typeof buildExecutiveConclusion>,
  hookExecutive: Record<string, unknown> | undefined,
): void {
  if (
    typeof hookExecutive?.executive_class === 'string' &&
    ['Critical', 'High', 'Watch', 'Pass'].includes(hookExecutive.executive_class)
  ) {
    executive.executive_class = hookExecutive.executive_class as typeof executive.executive_class;
  }
  if (Array.isArray(hookExecutive?.recommendations) && hookExecutive.recommendations.length) {
    executive.recommendations = hookExecutive.recommendations.filter(
      (x): x is string => typeof x === 'string' && x.trim().length > 0,
    );
  }
}

function trimStr(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function collapseNotes(collapse: Record<string, unknown> | undefined): string[] | undefined {
  if (!collapse) {
    return undefined;
  }
  return [
    `Схлопывание: ${String(collapse.cluster_count ?? '—')} кластеров из ${String(collapse.raw_count ?? '—')} сырых (systemic: ${String(collapse.systemic_clusters ?? 0)}).`,
  ];
}

function isAdmissionVoid(
  meta: LiveMetaSnapshot | null,
  hints: Record<string, unknown> | undefined,
  gateRaw: string,
  executionFault: boolean,
): boolean {
  if (hints?.admission_void === true || executionFault) {
    return true;
  }
  if (gateRaw === 'void' || gateRaw === 'error' || meta?.ci_exit_code === 1) {
    return true;
  }
  return (
    typeof meta?.ci_verdict === 'string' && meta.ci_verdict.trim().toLowerCase() === 'fail_run'
  );
}

function buildLiveSummary(input: {
  risks: RunSummary['risks'];
  collapse: Record<string, unknown> | undefined;
  executive: ReturnType<typeof buildExecutiveConclusion>;
  allureLine: string | undefined;
  scenarioOutcomes: RunSummary['scenarios'];
}): RunSummary {
  return {
    risks: input.risks,
    top_findings: topFromCollapse(input.collapse),
    executive_class: input.executive.executive_class,
    recommendations: input.executive.recommendations,
    allure_summary_line: input.allureLine,
    scenarios: input.scenarioOutcomes,
    notes: collapseNotes(input.collapse),
  };
}

function buildLiveGate(input: {
  meta: LiveMetaSnapshot | null;
  dojo: Record<string, unknown> | undefined;
  hints: Record<string, unknown> | undefined;
  executive: ReturnType<typeof buildExecutiveConclusion>;
}): RunRecord['gate'] {
  const gateRaw =
    typeof input.meta?.ci_gate === 'string' ? input.meta.ci_gate.trim().toLowerCase() : '';
  const admissionVoid = isAdmissionVoid(
    input.meta,
    input.hints,
    gateRaw,
    input.executive.execution_fault,
  );
  const countsSource =
    input.dojo?.counts_source ??
    input.hints?.counts_source ??
    (typeof input.hints?.source === 'string' ? input.hints.source : undefined);
  const faultKind =
    typeof input.hints?.execution_fault_kind === 'string'
      ? input.hints.execution_fault_kind
      : undefined;
  return {
    failed: !admissionVoid && ['fail', 'failed'].includes(gateRaw),
    summary: {
      ci_gate: input.meta?.ci_gate,
      ci_verdict: input.meta?.ci_verdict,
      ci_exit_code: input.meta?.ci_exit_code,
      counts_source: countsSource,
      filter_audit: input.dojo?.filter_audit ?? input.hints?.filter_audit,
      execution_fault: input.executive.execution_fault,
      admission_void: admissionVoid,
      debug_mode: input.hints?.debug_mode === true,
      execution_fault_kind: faultKind,
    },
  };
}

export function buildRunRecordFromLive(input: {
  meta?: LiveMetaSnapshot | null;
  hooks?: ResultsHooksSnapshot | null;
  /** G-20 payload from Live /api/run_summary/latest */
  orchestratorSummary?: Record<string, unknown> | null;
}): RunRecord {
  const meta = input.meta ?? null;
  const hooks = input.hooks ?? null;
  const dojo = hooks?.dojo && typeof hooks.dojo === 'object' ? asRecord(hooks.dojo) : undefined;
  const stats = asRecord(dojo?.stats);
  const collapse = asRecord(dojo?.collapse);
  const hookExecutive = asRecord(dojo?.executive);
  const ciRecs = Array.isArray(meta?.ci_recommendations)
    ? meta!.ci_recommendations!.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined;
  const executive = buildExecutiveConclusion({
    counts: stats,
    collapse,
    ci_verdict: typeof meta?.ci_verdict === 'string' ? meta.ci_verdict : '',
    ci_gate: typeof meta?.ci_gate === 'string' ? meta.ci_gate : '',
    ci_exit_code: typeof meta?.ci_exit_code === 'number' ? meta.ci_exit_code : null,
    ci_recommendations: ciRecs,
    source: resolveExecutiveSource(hookExecutive, dojo),
  });
  applyHookExecutiveOverride(executive, hookExecutive);
  const risks = riskBucket(stats) ?? riskBucket(asRecord(collapse?.totals)) ?? executive.risks;
  const allureLine = allureSummaryLine(hooks);
  const hints = asRecord(meta?.ci_risk_hints);
  const summary = buildLiveSummary({
    risks,
    collapse,
    executive,
    allureLine,
    scenarioOutcomes: parseScenarioOutcomes(hints?.scenario_outcomes),
  });
  const session = trimStr(meta?.session_name);
  const exportRun = trimStr(meta?.last_export_run_id);

  return {
    run_id: exportRun || session || `live-${Date.now().toString(36)}`,
    status: mapLiveStatus(typeof meta?.status === 'string' ? meta.status : undefined),
    links: {
      live: trimStr(meta?.live_url) || LAB_RESULT_LINKS.live,
      monitor: LAB_RESULT_LINKS.monitor,
      allure: hookUrl(hooks, 'allure') || LAB_RESULT_LINKS.allure,
      dojo: hookUrl(hooks, 'dojo') || LAB_RESULT_LINKS.dojo,
      scanner_api: LAB_RESULT_LINKS.scanner_api,
    },
    gate: buildLiveGate({ meta, dojo, hints, executive }),
    summary,
    orchestrator_summary: {
      ...(input.orchestratorSummary && typeof input.orchestratorSummary === 'object'
        ? input.orchestratorSummary
        : {}),
      ...(collapse ? { finding_collapse: collapse } : {}),
      ...(stats ? { dojo_stats: stats } : {}),
      ...(allureLine ? { allure_summary_line: allureLine } : {}),
      executive: {
        executive_class: executive.executive_class,
        source: executive.source,
        risks: executive.risks,
        execution_fault: executive.execution_fault,
      },
    },
  };
}
