/**
 * RK-MANIFEST-1: плоский typed JSON-контракт.
 * Замена JSON Schema (docs/wired.json) — два корневых ключа: regulation + editor.
 * Canon-request: docs/canon-requests/REGULATION-EDITOR-SPLIT.md § «Целевой формат».
 */

/* ─── Regulation (Регламент) ─── */

export type AssessmentPurpose = 'scheduled' | 'pre_release' | 'emergency' | 'manual';

export type scannerMode = 'demon' | 'webswing';

export type BrowserType = 'chrome' | 'chrome-headless' | 'firefox' | 'firefox-headless';

export type AuthType =
  | 'Без авторизации'
  | 'Базовая авторизация'
  | 'Страница авторизации'
  | 'Последовательность действий / SSO'
  | 'На основе Cookie'
  | 'Скрипт авторизация Web'
  | 'API Cookie'
  | 'API Key'
  | 'Bearer Token'
  | 'Query Key'
  | 'Скрипт авторизация API'
  | 'Последовательность вызовов / SSO';

export type ScanPolicy = 'custom_policy';

export interface GateSpec {
  max_critical: number;
  max_high: number;
}

export interface RegulationMeta {
  project_id: string;
  initiator_name: string;
  app_leader: string;
  assessment_purpose: AssessmentPurpose;
  generate_act: boolean;
  /** scheduled → плановая */
  scheduled_info?: string;
  /** pre_release → контроль релиза */
  release_domain?: string;
  compliance_requirements?: string;
  release_manager?: string;
  /** emergency → внештатная */
  emergency_reason?: string;
}

export interface RegulationInfrastructure {
  base_url_override: string;
  allowed_extra_domains: string;
  blocked_urls_list?: string[];
  scanner_mode: scannerMode;
  browser_type: BrowserType;
  debug_mode: boolean;
  /** manual → только Webswing */
  webswing_session_timeout_min?: number;
  idle_timeout_min?: number;
  /** emergency → доп. порт scanner */
  additional_local_server_port?: number;
}

export interface RegulationSecurity {
  scan_policy: ScanPolicy;
  auth_type: AuthType;
  auth_details: Record<string, unknown>;
  active_auth_module: string;
}

export interface RegulationGate {
  /** gate_policy из манифеста (опционально — default из коробки) */
  gate?: GateSpec;
}

export interface Regulation {
  meta: RegulationMeta;
  infrastructure: RegulationInfrastructure;
  security_configuration: RegulationSecurity;
}

/* ─── Editor (Редактор) ─── */

export interface EditorImport {
  path: string;
  kind: string;
  stream_name?: string;
  proto_roots?: string;
}

export interface EditorPage {
  title: string;
  path: string;
  constructor: string;
}

export interface ScenarioStep {
  step_id: string;
  description: string;
  constructor: string;
  expect_error: boolean;
  retry_count: number;
  retry_delay_sec: number;
  continue_on_error: boolean;
  save_result_var: string;
}

export interface EditorScenario {
  scenario_id: string;
  title: string;
  description: string;
  continue_on_error: boolean;
  steps: ScenarioStep[];
}

export interface FuzzerHttpTemplate {
  method: string;
  url: string;
  headers: Record<string, string>;
  follow_redirect: boolean;
}

export interface FuzzerQueryTarget {
  param: string;
  corpus: string;
}

export interface FuzzerLimits {
  max_requests: number;
  requests_per_sec: number;
  request_timeout_sec: number;
}

export interface FuzzerAnomaly {
  mark_5xx: boolean;
  delay_threshold_ms: number;
}

export interface FuzzerTarget {
  url: string;
  method: string;
  corpus: string;
  body_template: string;
}

export interface FuzzerPolicy {
  max_requests: number;
  requests_per_sec: number;
  mark_5xx: boolean;
  delay_threshold_ms: number;
  size_threshold_pct: number;
  size_threshold_abs: number;
}

export interface FuzzerModule {
  id: string;
  intent: string;
  name: string;
  http_template?: FuzzerHttpTemplate;
  query_target?: FuzzerQueryTarget;
  limits?: FuzzerLimits;
  anomaly?: FuzzerAnomaly;
  engine?: { method: string; headers?: Record<string, string>; body?: string };
  connector?: Record<string, unknown>;
  data?: Record<string, unknown>;
  init_raw?: string;
}

export interface AuthModule {
  id: string;
  dialect: string;
  /* поля зависят от dialect */
  [k: string]: unknown;
}

export interface OpenApiModule {
  id: string;
  schema_mode: string;
  schema_resource?: string;
  schema_path?: string;
  auth_module_id?: string;
  allow_scanner_import: boolean;
  operations_cache?: unknown;
}

export interface GraphqlModule {
  id: string;
  schema_mode: string;
  sdl_resource?: string;
  introspection_path?: string;
  endpoint_path?: string;
  auth_module_id?: string;
  allow_scanner_import: boolean;
  allow_scanner_scan: boolean;
  operations_cache?: unknown;
}

export interface GrpcModule {
  id: string;
  proto_resource?: string;
  auth_module_id?: string;
  services_cache?: unknown;
}

export interface ChainModule {
  id: string;
  har_resource?: string;
  sequence_name?: string;
  raw_har?: unknown;
  templated_har?: unknown;
  steps_cache?: unknown;
  replace_map?: unknown;
  play_bindings?: Record<string, string>;
  value_pack_module_id?: string;
  notes?: string;
}

export interface DataModule {
  id: string;
  source: string;
  process_id: string;
  editor: string;
  output_format: string;
}

export interface ConnectorModule {
  id: string;
  kind: string;
  notes?: string;
  [k: string]: unknown;
}

export interface EditorModules {
  auth: AuthModule[];
  openapi: OpenApiModule[];
  graphql: GraphqlModule[];
  grpc: GrpcModule[];
  chain: ChainModule[];
  data: DataModule[];
  connectors: ConnectorModule[];
  fuzzers: FuzzerModule[];
}

export interface EditorFolder {
  folder_id: string;
  title: string;
  items: unknown[];
}

export type EditorFolders = Record<string, EditorFolder[]>;

export interface Editor {
  imports: EditorImport[];
  pages: EditorPage[];
  scenarios: EditorScenario[];
  modules: EditorModules;
  fuzzer_targets: FuzzerTarget[];
  fuzzer_policy?: FuzzerPolicy;
  folders?: EditorFolders;
}

/* ─── Wired (корень) ─── */

export interface Wired {
  regulation: Regulation;
  editor: Editor;
}

/* ─── Результат парсера ─── */

export type WiredResult =
  | { ok: true; wired: Wired }
  | { ok: false; error: string };

/** Legacy-формат formData (хранится в checksStore) */
export type WiredData = Record<string, unknown>;
