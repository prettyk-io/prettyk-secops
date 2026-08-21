/**
 * RES data contract — Results / blanks / waiting room.
 * Канон: docs/results-epic.md. G-20 orchestrator: docs/run_summary.schema.json.
 */

export type RunStatus = 'idle' | 'running' | 'success' | 'failed' | 'unknown';

export type ExecutiveClass = 'Critical' | 'High' | 'Watch' | 'Pass';

export type ExplorerNodeKind =
  | 'pages'
  | 'page'
  | 'scenarios'
  | 'scenario'
  | 'modules'
  | 'module'
  | 'fuzzers'
  | 'fuzzer'
  | 'resources'
  | 'resource'
  | 'folder';

export type ExplorerNode = {
  id: string;
  kind: ExplorerNodeKind;
  title: string;
  children?: ExplorerNode[];
};

export type RunLinks = {
  live?: string;
  monitor?: string;
  allure?: string;
  dojo?: string;
  zap_api?: string;
};

export type RunSummary = {
  risks?: {
    critical?: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  top_findings?: { name: string; risk: string; count: number }[];
  scenarios?: { name: string; status: string }[];
  fuzz?: { id?: string; anomalies?: number; stopped_reason?: string }[];
  duration_sec?: number;
  notes?: string[];
  executive_class?: ExecutiveClass;
  recommendations?: string[];
  /** Allure totals from hooks (RES-4 thin). */
  allure_summary_line?: string;
};

export type RunArtifact = {
  kind: string;
  path?: string;
  url?: string;
};

export type RunGate = {
  failed: boolean;
  summary?: Record<string, unknown>;
};

/** Сущность прогона для Results / акта. */
export type RunRecord = {
  run_id: string;
  started_at?: string;
  status: RunStatus;
  manifest_hash?: string;
  links: RunLinks;
  gate?: RunGate;
  summary?: RunSummary;
  /** G-20 machine summary when present (RES-4). */
  orchestrator_summary?: Record<string, unknown>;
  artifacts?: RunArtifact[];
};

export type BlankKind = 'regulation' | 'act';

export type BlankOrg = {
  title?: string;
  subtitle?: string;
  logo_ref?: string;
};

export type BlankPayload = {
  kind: BlankKind;
  template_version: string;
  org: BlankOrg;
  form_snapshot: unknown;
  explorer_tree: ExplorerNode[];
  run?: RunRecord;
  generated_at: string;
  manifest_hash?: string;
};

import { LIVE_HOME } from '../api/apiBase';

export const BLANK_TEMPLATE_VERSION = 'res-blank-0.6';

/** Lab defaults for waiting-room link grid. */
export const LAB_RESULT_LINKS: Required<
  Pick<RunLinks, 'live' | 'monitor' | 'allure' | 'dojo' | 'zap_api'>
> = {
  live: LIVE_HOME,
  monitor: LIVE_HOME,
  allure:
    'http://127.0.0.1:5050/',
  dojo: 'http://127.0.0.1:8081/',
  zap_api: 'http://127.0.0.1:8080/',
};

export type LiveMetaSnapshot = {
  session_name?: string;
  status?: string;
  live_url?: string;
  novnc_url?: string;
  /** meta.generate_act — нужен ли акт в этом прогоне. */
  generate_act?: boolean;
  assessment_purpose?: string;
  /** CI / GHA intake — see pipelineVerdict.ts + docs/results-epic.md RES-5a */
  ci_phase?: string;
  ci_conclusion?: string;
  ci_verdict?: string;
  ci_job_name?: string;
  ci_job_description?: string;
  ci_job_url?: string;
  ci_html_url?: string;
  ci_exit_code?: number;
  ci_gate?: string;
  ci_updated_at?: number;
  ci_risk_hints?: Record<string, unknown>;
  ci_recommendations?: string[];
  /** HEAL-D: last locator heal proposal from runtime */
  locator_heal_last?: {
    status?: string;
    old_type?: string;
    old_value?: string;
    new_type?: string;
    new_value?: string;
    score?: number;
    reason?: string;
  };
  /** DISC-2E: last label resolve proposal from runtime */
  locator_label_last?: {
    status?: string;
    label?: string;
    new_type?: string;
    new_value?: string;
    score?: number;
    n?: number;
    reason?: string;
    retry?: boolean;
  };
  [key: string]: unknown;
};

export type {
  PipelineJobStatus,
  PipelineVerdict,
  PipelineVerdictInput,
} from './pipelineVerdict';

/** Fresh report URLs from Live POST /api/results/hooks (Allure / Dojo). */
export type ResultsHookEntry = {
  report_url: string;
  updated_at?: number;
  /** allure-light-secops project — not meta.project_id (see docs/check-evidence-refs.md). */
  allure_project_id?: string;
  check_id?: string;
  deploy_id?: string;
  product_id?: number | string;
  engagement_id?: number | string;
  test_id?: number | string;
  status?: string;
  [key: string]: unknown;
};

export type ResultsHooksSnapshot = {
  allure?: ResultsHookEntry | null;
  dojo?: ResultsHookEntry | null;
  /** RES-4: ZAP XML summary (counts / collapse) when finalize wrote hooks.zap */
  zap?: ResultsHookEntry | null;
};
