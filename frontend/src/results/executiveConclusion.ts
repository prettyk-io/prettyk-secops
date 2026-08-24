/**
 * RES-5: заключение Critical / High / Watch / Pass (+ рекомендации для акта).
 * Зеркало orchestrator/core/executive_conclusion.py
 */

import type { ExecutiveClass, RunSummary } from './types';

export type ExecutiveRisks = NonNullable<RunSummary['risks']>;

export type ExecutiveConclusion = {
  executive_class: ExecutiveClass;
  recommendations: string[];
  risks: Required<ExecutiveRisks>;
  source: string;
  /** Ось исполнения упала — не смешивать с security-классом */
  execution_fault: boolean;
};

const RANK: Record<ExecutiveClass, number> = {
  Pass: 0,
  Watch: 1,
  High: 2,
  Critical: 3,
};

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function normalizeRisks(raw: unknown): Required<ExecutiveRisks> {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    critical: num(o.critical),
    high: num(o.high),
    medium: num(o.medium),
    low: num(o.low),
    info: num(o.info) || num(o.informational),
  };
}

function maxClass(a: ExecutiveClass, b: ExecutiveClass): ExecutiveClass {
  return RANK[a] >= RANK[b] ? a : b;
}

export function classFromRisks(risks: Required<ExecutiveRisks>): ExecutiveClass {
  if (risks.critical > 0) {
    return 'Critical';
  }
  if (risks.high > 0) {
    return 'High';
  }
  if (risks.medium > 0 || risks.low > 0 || risks.info > 0) {
    return 'Watch';
  }
  return 'Pass';
}

export function isExecutionFault(input: {
  ci_verdict?: string;
  ci_exit_code?: number | null;
}): boolean {
  const verdict = (input.ci_verdict || '').trim().toLowerCase();
  return verdict === 'fail_run' || input.ci_exit_code === 1;
}

/** Security-класс из CI. fail_run не эскалирует — это ось исполнения. */
export function classFromCi(input: {
  ci_verdict?: string;
  ci_gate?: string;
  ci_exit_code?: number | null;
}): ExecutiveClass | undefined {
  const verdict = (input.ci_verdict || '').trim().toLowerCase();
  const gate = (input.ci_gate || '').trim().toLowerCase();
  if (isExecutionFault(input)) {
    return undefined;
  }
  if (verdict === 'fail_gate' || gate === 'fail') {
    return 'High';
  }
  if (verdict === 'pass_watch' || verdict === 'pass_edge' || gate === 'watch') {
    return 'Watch';
  }
  if (verdict === 'pass' || gate === 'pass' || gate === 'ok') {
    return 'Pass';
  }
  return undefined;
}

function ruRecommendations(
  cls: ExecutiveClass,
  risks: Required<ExecutiveRisks>,
  top: Array<{ name: string; risk: string; count: number; systemic?: boolean }>,
  executionFault: boolean,
): string[] {
  const out: string[] = [];
  if (executionFault) {
    out.push(
      'Исполнение: сбой (exit 1) — evidence/запуск не завершён штатно; допуск по ACTIVE считать недействительным до повторного успешного запуска.',
    );
  }
  if (cls === 'Critical') {
    out.push(
      'Заключение: критический уровень риска — допуск не рекомендован до устранения ACTIVE Critical и повторной проверки.',
    );
  } else if (cls === 'High') {
    out.push(
      `Заключение: высокий уровень риска — закрыть ACTIVE High/Critical (critical=${risks.critical}, high=${risks.high}) до следующего допуска.`,
    );
  } else if (cls === 'Watch') {
    out.push(
      `Заключение: условно удовлетворительно — остаточный soft-риск (medium=${risks.medium}, low=${risks.low}, info=${risks.info}); требуется риск-ack / план устранения.`,
    );
  } else if (!executionFault) {
    out.push(
      'Заключение: удовлетворительно — ACTIVE Critical/High не выявлены; допуск по severity-политике возможен.',
    );
  } else {
    out.push(
      'Заключение по ACTIVE: Critical/High не зафиксированы, но из‑за сбоя исполнения оценка допуска не применяется.',
    );
  }
  for (const item of top.slice(0, 5)) {
    const systemic = item.systemic ? ' (site-wide)' : '';
    out.push(`Кластер: ${item.name} — ${item.risk}×${item.count}${systemic}.`);
  }
  return out;
}

type TopFinding = { name: string; risk: string; count: number; systemic?: boolean };

function asCollapseRecord(collapse: unknown): Record<string, unknown> | undefined {
  if (collapse && typeof collapse === 'object' && !Array.isArray(collapse)) {
    return collapse as Record<string, unknown>;
  }
  return undefined;
}

function parseTopFindings(rawTop: unknown): TopFinding[] {
  const top: TopFinding[] = [];
  if (!Array.isArray(rawTop)) {
    return top;
  }
  for (const item of rawTop) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) {
      continue;
    }
    top.push({
      name,
      risk: typeof row.risk === 'string' ? row.risk : 'info',
      count: num(row.count) || 1,
      systemic: Boolean(row.systemic),
    });
  }
  return top;
}

function resolveConclusionSource(
  inputSource: string | undefined,
  collapse: Record<string, unknown> | undefined,
  risks: Required<ExecutiveRisks>,
): string {
  const explicit = (inputSource || '').trim();
  if (explicit) {
    return explicit;
  }
  if (collapse) {
    return 'collapse+counts';
  }
  if (Object.values(risks).some((n) => n > 0)) {
    return 'counts';
  }
  return 'ci';
}

export function buildExecutiveConclusion(input: {
  counts?: unknown;
  collapse?: unknown;
  ci_verdict?: string;
  ci_gate?: string;
  ci_exit_code?: number | null;
  ci_recommendations?: string[];
  source?: string;
}): ExecutiveConclusion {
  let risks = normalizeRisks(input.counts);
  const collapse = asCollapseRecord(input.collapse);
  if (!Object.values(risks).some((n) => n > 0) && collapse?.totals) {
    risks = normalizeRisks(collapse.totals);
  }
  const byRisks = classFromRisks(risks);
  const byCi = classFromCi({
    ci_verdict: input.ci_verdict,
    ci_gate: input.ci_gate,
    ci_exit_code: input.ci_exit_code,
  });
  const cls = byCi ? maxClass(byRisks, byCi) : byRisks;
  const executionFault = isExecutionFault({
    ci_verdict: input.ci_verdict,
    ci_exit_code: input.ci_exit_code,
  });

  const top = parseTopFindings(collapse?.top_findings);
  const recommendations = ruRecommendations(cls, risks, top, executionFault);
  for (const line of input.ci_recommendations || []) {
    const text = line.trim();
    if (text && !recommendations.includes(text)) {
      recommendations.push(text);
    }
  }

  return {
    executive_class: cls,
    recommendations,
    risks,
    source: resolveConclusionSource(input.source, collapse, risks),
    execution_fault: executionFault,
  };
}
