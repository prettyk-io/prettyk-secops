/**
 * SecOps admin domain: bank portal Deploy → PK check (anchor meta.project_id).
 */

export type DeployGate = 'unknown' | 'pass' | 'watch' | 'fail';

export type DeployStatus = 'active' | 'stale' | 'retired';

/** Bank chain: AppGroup → Application → Build → Deploy */
export type BankDeploy = {
  deploy_id: string;
  app_group: string;
  /** Maps to wired meta.project_id («Приложения участвующие в проверке») */
  project_id: string;
  application_name: string;
  repo: string;
  build_id: string;
  build_number?: string;
  deploy_env: string;
  deploy_url: string;
  deployed_at: string;
  status: DeployStatus;
  app_leader?: string;
  initiator_hint?: string;
  last_check_id?: string;
  last_gate?: DeployGate;
  hooks?: {
    allure_report_url?: string;
    dojo_engagement_url?: string;
  };
};

export type DeployCheckLink = {
  deploy_id: string;
  check_id: string;
  linked_at: string;
};

export type AdminWaiver = {
  title?: string;
  severity?: string;
  cwe?: string;
  fingerprint?: string;
  expires_at?: string;
};

export type AdminPolicies = {
  /** ACTIVE Critical above this → fail_gate (align PK_GATE_MAX_CRITICAL) */
  max_critical: number;
  /** ACTIVE High above this → fail_gate (align PK_GATE_MAX_HIGH); soft → watch */
  max_high: number;
  /** When false → quality gate disabled in written GatePolicy JSON */
  gate_enabled?: boolean;
  filter_require_active?: boolean;
  filter_exclude_fp?: boolean;
  filter_exclude_dup?: boolean;
  filter_exclude_mitigated?: boolean;
  filter_verified_only?: boolean;
  filter_min_severity?: string;
  /** Comma-separated tags */
  filter_exclude_tags?: string;
  filter_require_tags?: string;
  filter_max_age_days?: number;
  waivers?: AdminWaiver[];
  artifact_retention_days: number;
  allow_init_without_sso: boolean;
  require_pre_release_for_deploy: boolean;
};

export type ConnectorHealth = 'unknown' | 'ok' | 'degraded' | 'down';

export type PromAuthMode = 'none' | 'bearer' | 'basic';

/**
 * On-prem integrations (Admin → Интеграции).
 * Секреты — только локальный flag/значение в localStorage, не в git.
 * Studio connector-модуль инициализируется отсюда (не дублирует URL/DSN в форме).
 */
export type AirgapConnectors = {
  allure_base_url: string;
  allure_project_id: string;
  dojo_base_url: string;
  /** Token never persisted in git; local-only placeholder */
  dojo_token_set: boolean;
  allure_health: ConnectorHealth;
  dojo_health: ConnectorHealth;

  prom_url: string;
  prom_auth: PromAuthMode;
  prom_token_set: boolean;
  prom_username: string;
  prom_lookback: string;
  /** CSV metric pack ids (http_red,auth_fail,…); Studio копирует при активации. */
  prom_metric_packs: string;
  prom_health: ConnectorHealth;

  db_engine: string;
  db_dsn: string;
  db_schema: string;
  db_read_only: boolean;
  db_health: ConnectorHealth;

  siem_source: string;
  siem_url: string;
  siem_token_set: boolean;
  /** Default query / window для слота при активации (не Studio UI). */
  siem_query: string;
  siem_window: string;
  siem_health: ConnectorHealth;

  ssh_host: string;
  ssh_port: string;
  ssh_username: string;
  ssh_key_set: boolean;
  ssh_allowlist: string;
  ssh_health: ConnectorHealth;

  mq_engine: string;
  mq_broker_url: string;
  mq_topic: string;
  mq_health: ConnectorHealth;

  last_probe_at?: string;
};

export type ProgramKpi = {
  apps_covered: number;
  apps_total: number;
  open_critical: number;
  open_high: number;
  checks_last_7d: number;
  /** Доля pass среди деплоев с известным gate (pass|watch|fail). */
  gate_pass_rate: number;
  /** Δ open Critical vs предыдущая точка history (если есть). */
  trend_critical_delta: number;
  gate_pass: number;
  gate_watch: number;
  gate_fail: number;
  gate_unknown: number;
};

export type AdminSection =
  | 'registry'
  | 'deploy'
  | 'policies'
  | 'evidence'
  | 'integrations'
  | 'runs'
  | 'overview'
  | 'notify';
