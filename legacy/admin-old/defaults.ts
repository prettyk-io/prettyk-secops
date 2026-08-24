import { defaultMetricPacksCsv } from './metricPacks';
import type { AdminPolicies, AirgapConnectors, ProgramKpi } from './types';

export const DEFAULT_ADMIN_POLICIES: AdminPolicies = {
  max_critical: 0,
  max_high: 0,
  gate_enabled: true,
  filter_require_active: true,
  filter_exclude_fp: true,
  filter_exclude_dup: true,
  filter_exclude_mitigated: true,
  filter_verified_only: false,
  filter_min_severity: '',
  filter_exclude_tags: '',
  filter_require_tags: '',
  filter_max_age_days: 0,
  waivers: [],
  artifact_retention_days: 90,
  allow_init_without_sso: true,
  require_pre_release_for_deploy: true,
};

/** Lab-perimeter defaults; secrets never committed. */
export const DEFAULT_AIRGAP_CONNECTORS: AirgapConnectors = {
  allure_base_url: 'http://127.0.0.1:5050',
  allure_project_id: 'default',
  dojo_base_url: 'http://127.0.0.1:8081',
  dojo_token_set: false,
  allure_health: 'unknown',
  dojo_health: 'unknown',

  prom_url: 'http://127.0.0.1:9090',
  prom_auth: 'none',
  prom_token_set: false,
  prom_username: '',
  prom_lookback: '15m',
  prom_metric_packs: defaultMetricPacksCsv(),
  prom_health: 'unknown',

  db_engine: 'PostgreSQL',
  db_dsn: '',
  db_schema: 'public',
  db_read_only: true,
  db_health: 'unknown',

  siem_source: 'Splunk',
  siem_url: '',
  siem_token_set: false,
  siem_query: '',
  siem_window: '',
  siem_health: 'unknown',

  ssh_host: '',
  ssh_port: '22',
  ssh_username: '',
  ssh_key_set: false,
  ssh_allowlist: '',
  ssh_health: 'unknown',

  mq_engine: 'Kafka',
  mq_broker_url: '',
  mq_topic: '',
  mq_health: 'unknown',
};

/** @deprecated ADM-1 — только для legacy-тестов; UI использует deriveProgramKpi. */
export const MOCK_PROGRAM_KPI: ProgramKpi = {
  apps_covered: 3,
  apps_total: 4,
  open_critical: 2,
  open_high: 11,
  checks_last_7d: 7,
  gate_pass_rate: 0.57,
  trend_critical_delta: -1,
  gate_pass: 1,
  gate_watch: 1,
  gate_fail: 1,
  gate_unknown: 1,
};
