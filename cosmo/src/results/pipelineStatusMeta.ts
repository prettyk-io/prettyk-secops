/**
 * Live meta field helpers for pipelineStatusFromMeta (S3776).
 */
import type { PipelineRiskHints } from './pipelineVerdict';

export function stringMeta(meta: Record<string, unknown>, key: string): string | undefined {
  const value = meta[key];
  return typeof value === 'string' ? value : undefined;
}

export function numberMeta(meta: Record<string, unknown>, key: string): number | undefined {
  const value = meta[key];
  return typeof value === 'number' ? value : undefined;
}

export function hasCiFields(meta: Record<string, unknown>): boolean {
  return (
    meta.ci_phase != null ||
    meta.ci_conclusion != null ||
    meta.ci_exit_code != null ||
    meta.ci_job_name != null ||
    meta.ci_verdict != null
  );
}

export function recommendationsFromMeta(
  meta: Record<string, unknown>,
  riskHints: PipelineRiskHints | null,
): string[] {
  if (Array.isArray(riskHints?.recommendations)) {
    return riskHints!.recommendations!.filter((x): x is string => typeof x === 'string');
  }
  if (Array.isArray(meta.ci_recommendations)) {
    return (meta.ci_recommendations as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  return [];
}

export function riskHintsFromMeta(meta: Record<string, unknown>): PipelineRiskHints | null {
  if (meta.ci_risk_hints && typeof meta.ci_risk_hints === 'object') {
    return meta.ci_risk_hints as PipelineRiskHints;
  }
  return null;
}
