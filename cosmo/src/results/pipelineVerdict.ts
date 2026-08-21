/**
 * Pipeline risk verdict — допуск (merge/promote), не severity finding.
 * Канон: docs/results-epic.md (RES-5a).
 */
import { computePipelineVerdict } from './derivePipelineVerdict';
import {
  hasCiFields,
  numberMeta,
  recommendationsFromMeta,
  riskHintsFromMeta,
  stringMeta,
} from './pipelineStatusMeta';

export type PipelineVerdict =
  | 'idle'
  | 'running'
  | 'pass'
  | 'pass_watch'
  | 'pass_edge'
  | 'fail_gate'
  | 'fail_run';

export type PipelinePhase = 'queued' | 'in_progress' | 'completed' | '';

export type PipelineConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'neutral'
  | ''
  | null;

export type PipelineGate = 'pass' | 'fail' | 'error' | 'void' | '';

export type PipelineRiskHints = {
  highest_severity?: string;
  elevated?: boolean;
  counts?: Record<string, number>;
  recommendations?: string[];
  source?: string;
  counts_source?: string;
  filter_audit?: Record<string, number>;
  admission_void?: boolean;
  debug_mode?: boolean;
  execution_fault_kind?: string;
  execution_fault_reason?: string;
};

export type PipelineVerdictInput = {
  phase?: PipelinePhase | string;
  conclusion?: PipelineConclusion | string;
  exit_code?: number | null;
  gate?: PipelineGate | string;
  risk_hints?: PipelineRiskHints | null;
};

export type PipelineJobStatus = {
  phase?: string;
  conclusion?: string;
  verdict: PipelineVerdict;
  job_name?: string;
  job_description?: string;
  job_url?: string;
  html_url?: string;
  exit_code?: number | null;
  gate?: string;
  recommendations?: string[];
  updated_at?: number;
  counts_source?: string;
  risk_hints?: PipelineRiskHints | null;
};

/** Map verdict → ExecutiveClass (RES-5 bridge). */
export function verdictToExecutiveClass(
  verdict: PipelineVerdict,
): 'Critical' | 'High' | 'Watch' | 'Pass' | undefined {
  switch (verdict) {
    case 'pass':
      return 'Pass';
    case 'pass_watch':
    case 'pass_edge':
      return 'Watch';
    case 'fail_gate':
      return 'High';
    case 'fail_run':
      // Ось исполнения — не security-класс (см. executiveConclusion / admission-act-ib).
      return undefined;
    default:
      return undefined;
  }
}

export function derivePipelineVerdict(input: PipelineVerdictInput): PipelineVerdict {
  return computePipelineVerdict(input);
}

export function pipelineStatusFromMeta(meta: Record<string, unknown> | null): PipelineJobStatus {
  if (!meta || !hasCiFields(meta)) {
    return { verdict: 'idle' };
  }

  const riskHints = riskHintsFromMeta(meta);
  const input: PipelineVerdictInput = {
    phase: typeof meta.ci_phase === 'string' ? meta.ci_phase : '',
    conclusion: typeof meta.ci_conclusion === 'string' ? meta.ci_conclusion : '',
    exit_code: typeof meta.ci_exit_code === 'number' ? meta.ci_exit_code : null,
    gate: typeof meta.ci_gate === 'string' ? meta.ci_gate : '',
    risk_hints: riskHints,
  };

  const countsSource =
    (typeof riskHints?.counts_source === 'string' && riskHints.counts_source) ||
    (typeof riskHints?.source === 'string' && riskHints.source) ||
    undefined;

  return {
    phase: stringMeta(meta, 'ci_phase'),
    conclusion: stringMeta(meta, 'ci_conclusion'),
    verdict: derivePipelineVerdict(input),
    job_name: stringMeta(meta, 'ci_job_name'),
    job_description: stringMeta(meta, 'ci_job_description'),
    job_url: stringMeta(meta, 'ci_job_url'),
    html_url: stringMeta(meta, 'ci_html_url'),
    exit_code: typeof meta.ci_exit_code === 'number' ? meta.ci_exit_code : null,
    gate: stringMeta(meta, 'ci_gate'),
    recommendations: recommendationsFromMeta(meta, riskHints),
    updated_at: numberMeta(meta, 'ci_updated_at'),
    counts_source: countsSource,
    risk_hints: riskHints,
  };
}
