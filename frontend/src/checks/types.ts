/**
 * CheckInstance — черновик/проверка без обязательного execute (NAV).
 */

export type CheckStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'archived';

export type CheckView = 'form' | 'studio' | 'results';

export type CheckRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'unknown';

export type CheckRunRef = {
  run_id: string;
  started_at?: string;
  ended_at?: string;
  status: CheckRunStatus;
  /** PipelineVerdict from Live CI (pass / fail_gate / …). */
  ci_verdict?: string;
  job_url?: string;
  live_session?: string;
  /** PERS: lab owner (FE-auth user id). */
  owner_user_id?: string;
  /** MON-13: bind-токен для «свой инстанс без логина» в Monitor. */
  monitor_token?: string;
};

/** Cap History runs[] per check (newest kept). */
export const CHECK_RUNS_MAX = 40;

export type CheckInstance = {
  check_id: string;
  title: string;
  status: CheckStatus;
  created_at: string;
  updated_at: string;
  last_opened_at?: string;
  /** formData; при persist секреты redact (G-59). */
  wired: unknown;
  resource_contents?: Record<string, string>;
  view?: CheckView;
  runs: CheckRunRef[];
  /** PERS: lab owner (FE-auth user id). Missing → treat as legacy. */
  owner_user_id?: string;
};

export type ChecksStoreSnapshot = {
  version: 1;
  items: CheckInstance[];
};

export const CHECKS_STORAGE_KEY = 'pk.checks.v1';
export const CHECKS_ACTIVE_KEY = 'pk.checks.active';
