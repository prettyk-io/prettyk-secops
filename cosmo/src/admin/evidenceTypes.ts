/**
 * CheckEvidenceRefs — FE mirror of docs/check-evidence-refs.md.
 * meta.project_id (bank) ≠ allure_project_id (allure-light-secops).
 *
 * Showcase stubs: history + thin summaries for bank TZ review
 * (not a clone of Allure/Dojo UI).
 */

export type EvidenceSource = 'finalize' | 'hooks' | 'manual';

/** Scenario outcome counters — typical Allure report summary extract. */
export type AllureRunSummary = {
  total: number;
  passed: number;
  failed: number;
  broken: number;
  skipped: number;
  duration_ms?: number;
};

export type AllureEvidenceMeta = {
  report_url?: string;
  allure_project_id: string;
  generated_at?: string;
  status?: 'ok' | 'error';
  elapsed_ms?: number;
  summary?: AllureRunSummary;
};

export type DojoSeverityStats = {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
};

export type DojoEvidenceMeta = {
  product_id?: number | string;
  engagement_id?: number | string;
  test_id?: number | string;
  product_name?: string;
  engagement_name?: string;
  engagement_url?: string;
  test_url?: string;
  stats?: DojoSeverityStats;
  /** Active / mitigated snapshot for portal cards */
  active_findings?: number;
  mitigated_findings?: number;
};

/** One row in check/deploy evidence history (timeline). */
export type EvidenceHistoryPoint = {
  at: string;
  check_id: string;
  gate?: 'pass' | 'watch' | 'fail' | 'unknown';
  allure_project_id?: string;
  allure_report_url?: string;
  dojo_engagement_url?: string;
  dojo_stats?: DojoSeverityStats;
  allure_summary?: AllureRunSummary;
  note?: string;
};

export type CheckEvidenceRefs = {
  check_id: string;
  deploy_id?: string;
  allure?: AllureEvidenceMeta;
  dojo?: DojoEvidenceMeta;
  history?: EvidenceHistoryPoint[];
  source: EvidenceSource;
  updated_at?: string;
};

/** Aggregated pack for Deploy card / Evidence hub (stub or live). */
export type DeployEvidencePack = {
  deploy_id: string;
  application_name: string;
  meta_project_id: string;
  allure: AllureEvidenceMeta | null;
  dojo: DojoEvidenceMeta | null;
  history: EvidenceHistoryPoint[];
  /** Severity trend for chart: newest last */
  severity_trend: Array<{
    at: string;
    label: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;
  /** Pass-rate trend 0..1 */
  pass_rate_trend: Array<{ at: string; label: string; rate: number }>;
};
