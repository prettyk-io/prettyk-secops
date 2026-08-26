/**
 * VN-ADM data layer — honesty-first клиенты Live API (:8767) и health-probe Dojo/Allure.
 * Реальные ручки Live server (orchestrator/utils/live_server.py):
 *   /api/meta            — статус стенда/прогона (diary_bus.get_meta)
 *   /api/dojo/severity   — ACTIVE severity + daily series (envelope со status)
 *   /api/runs/index      — реестр прогонов (NDJSON ledger)
 *   /api/summary/trend   — тренд severity + allure_pass_rate
 * Honesty: down / not_found / error → данные null, никаких «зелёных нулей».
 */

import { LIVE_BASE } from '../api/apiBase';

export const ADMIN_LIVE_BASE = LIVE_BASE;
export const ADMIN_DOJO_BASE = 'http://127.0.0.1:8081';
export const ADMIN_ALLURE_BASE = 'http://127.0.0.1:5050';

/** Коды severity — индустриальные (Dojo). */
export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SeverityStats = Partial<Record<SeverityKey, number>>;

/** Статус стенда из /api/meta. */
export type StandStatus = {
  ok: boolean;
  status: string;
  session_name?: string;
  live_url?: string;
  ci_verdict?: string;
  ci_phase?: string;
  hasLive: boolean;
};

/** Envelope /api/dojo/severity. */
export type DojoSeverityEnvelope = {
  ok: boolean;
  status: string;
  project_id: string;
  stats: SeverityStats | null;
  series: SeverityTrendPoint[];
  findings_n?: number;
  engaged?: boolean;
  error?: string;
};

export type SeverityTrendPoint = {
  label: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  allure_pass_rate?: number;
};

export type RunIndexRow = {
  run_id: string;
  check_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string | null;
  ci_verdict?: string | null;
  owner_user_id?: string | null;
  source?: string | null;
};

export type ServiceHealth = {
  key: 'live' | 'dojo' | 'allure';
  label: string;
  up: boolean;
  detail?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

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

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

/** GET JSON с no-store; null при любом сбое (сеть/bad status/таймаут). */
export async function fetchJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    window.clearTimeout(timer);
    return null;
  }
}

/** GET /api/meta — статус стенда. */
export async function fetchLiveMeta(fetchImpl: typeof fetch = fetch): Promise<StandStatus> {
  const raw = await fetchJson<unknown>(`${ADMIN_LIVE_BASE}/api/meta`, fetchImpl);
  const row = asRecord(raw);
  if (!row) {
    return { ok: false, status: 'down', hasLive: false };
  }
  const status = str(row.status) ?? '';
  return {
    ok: true,
    status,
    session_name: str(row.session_name),
    live_url: str(row.live_url),
    ci_verdict: str(row.ci_verdict),
    ci_phase: str(row.ci_phase),
    hasLive: true,
  };
}

function parseSeverityStats(statsRaw: unknown): SeverityStats | null {
  const row = asRecord(statsRaw);
  if (!row) {
    return null;
  }
  const empty = !(['critical', 'high', 'medium', 'low', 'info'] as SeverityKey[]).some(
    (k) => row[k] !== undefined,
  );
  if (empty) {
    return null;
  }
  return {
    critical: num(row.critical),
    high: num(row.high),
    medium: num(row.medium),
    low: num(row.low),
    info: num(row.info) || num(row.informational),
  };
}

function parseSeveritySeries(rawSeries: unknown): SeverityTrendPoint[] {
  if (!Array.isArray(rawSeries)) {
    return [];
  }
  const out: SeverityTrendPoint[] = [];
  for (const item of rawSeries) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const label = str(row.label) ?? str(row.at) ?? '';
    if (!label) {
      continue;
    }
    const rateRaw = row.allure_pass_rate;
    const rate = typeof rateRaw === 'number' && Number.isFinite(rateRaw) ? rateRaw : undefined;
    out.push({
      label,
      critical: num(row.critical),
      high: num(row.high),
      medium: num(row.medium),
      low: num(row.low),
      ...(rate !== undefined ? { allure_pass_rate: rate } : {}),
    });
  }
  return out;
}

/** GET /api/dojo/severity — ACTIVE severity по project_id (honesty: down → stats null). */
export async function fetchDojoSeverity(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DojoSeverityEnvelope> {
  const pid = (projectId || '').trim();
  const q = pid ? encodeURIComponent(pid) : '';
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/dojo/severity?project_id=${q}`,
    fetchImpl,
  );
  const row = asRecord(raw);
  if (!row) {
    return {
      ok: false,
      status: 'down',
      project_id: pid,
      stats: null,
      series: [],
      error: 'live_down',
    };
  }
  return {
    ok: Boolean(row.ok),
    status: str(row.status) ?? 'error',
    project_id: str(row.project_id) ?? pid,
    stats: parseSeverityStats(row.stats),
    series: parseSeveritySeries(row.series),
    findings_n: typeof row.findings_n === 'number' ? row.findings_n : undefined,
    error: str(row.error),
  };
}

/** GET /api/runs/index — реестр прогонов. */
export async function fetchRunsIndex(
  limit = 200,
  fetchImpl: typeof fetch = fetch,
): Promise<RunIndexRow[]> {
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/runs/index?limit=${limit}`,
    fetchImpl,
  );
  const row = asRecord(raw);
  const items = Array.isArray(row?.items) ? row.items : [];
  const out: RunIndexRow[] = [];
  for (const item of items) {
    const r = asRecord(item);
    if (!r || !str(r.run_id)) {
      continue;
    }
    out.push({
      run_id: String(r.run_id),
      check_id: str(r.check_id) ?? null,
      started_at: str(r.started_at) ?? null,
      ended_at: str(r.ended_at) ?? null,
      status: str(r.status) ?? null,
      ci_verdict: str(r.ci_verdict) ?? null,
      owner_user_id: str(r.owner_user_id) ?? null,
      source: str(r.source) ?? null,
    });
  }
  return out;
}

/** GET /api/summary/trend — тренд severity + allure pass rate. */
export async function fetchSeverityTrend(fetchImpl: typeof fetch = fetch): Promise<SeverityTrendPoint[]> {
  const raw = await fetchJson<unknown>(`${ADMIN_LIVE_BASE}/api/summary/trend`, fetchImpl);
  const row = asRecord(raw);
  return parseSeveritySeries(row?.points);
}

/** Probe одного сервиса: live подтягивается из /api/meta, Dojo/Allure прямым HTTP. */
export async function probeServiceHealth(fetchImpl: typeof fetch = fetch): Promise<ServiceHealth[]> {
  const live = await fetchLiveMeta(fetchImpl);
  const [dojo, allure] = await Promise.all([
    probeHttp(ADMIN_DOJO_BASE, fetchImpl),
    probeHttp(ADMIN_ALLURE_BASE, fetchImpl),
  ]);
  return [
    {
      key: 'live',
      label: 'PrettyK Live',
      up: live.ok,
      detail: live.ok ? (live.status || 'ok') : 'недоступен',
    },
    { key: 'dojo', label: 'DefectDojo', up: dojo, detail: dojo ? 'ok' : 'недоступен' },
    { key: 'allure', label: 'Allure', up: allure, detail: allure ? 'ok' : 'недоступен' },
  ];
}

async function probeHttp(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  // no-cors: health-проба «хост слушает?» без чтения тела. Прямой cross-origin
  // GET к Dojo/Allure без CORS-заголовков на сервисе рождает консольную ошибку
  // браузера; opaque-ответ (mode:'no-cors') её не даёт, а connection refused
  // всё так же ловится catch → down.
  try {
    await fetchImpl(url, { method: 'GET', cache: 'no-store', mode: 'no-cors' });
    return true;
  } catch {
    return false;
  }
}

/* ─── VN-FBR: evidence / findings / gate-policy ─── */

export type EvidenceCard = {
  check_id?: string;
  source?: string;
  updated_at?: string;
  deploy_id?: string;
  severity?: string;
  finding_type?: string;
  screenshot?: string;
  [k: string]: unknown;
};

/** GET /api/evidence — список карточек доказательств. */
export async function fetchEvidence(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; items: EvidenceCard[] }> {
  const raw = await fetchJson<unknown>(`${ADMIN_LIVE_BASE}/api/evidence`, fetchImpl);
  const row = asRecord(raw);
  const out: EvidenceCard[] = [];
  if (Array.isArray(row?.list)) {
    for (const item of row.list) {
      const r = asRecord(item);
      if (r) out.push(r as EvidenceCard);
    }
  } else if (row?.items && typeof row.items === 'object' && !Array.isArray(row.items)) {
    for (const v of Object.values(row.items)) {
      const r = asRecord(v);
      if (r) out.push(r as EvidenceCard);
    }
  }
  return { ok: Boolean(row?.ok), items: out };
}

export type DojoFinding = {
  id?: number | string;
  title: string;
  severity: string;
  cwe?: number | string | null;
  status?: string;
  date?: string;
  age_days?: number;
  /** AI-ассистент: severity по мнению Qwen3-1.7B */
  ai_severity?: string;
  /** AI-ассистент: уверенность что это false positive (0.0–1.0) */
  ai_fp_confidence?: number;
  /** AI-ассистент: краткое обоснование */
  ai_reasoning?: string;
  /** AI-классификация уже запрошена (ждём/закешировано) */
  ai_loading?: boolean;
};

/** GET /api/dojo/findings?project_id= — LIST через Live (без банковского project filter). */
export async function fetchDojoFindings(fetchImpl: typeof fetch = fetch): Promise<{
  ok: boolean;
  status: 'down' | 'ok';
  findings: DojoFinding[];
}> {
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/dojo/findings?project_id=`,
    fetchImpl,
  );
  const row = asRecord(raw);
  const out: DojoFinding[] = [];
  if (Array.isArray(row?.findings)) {
    for (const item of row.findings) {
      const r = asRecord(item);
      if (!r || !str(r.title)) continue;
      out.push({
        id: r.id as number | string | undefined,
        title: String(r.title),
        severity: str(r.severity) ?? 'high',
        cwe: (r.cwe as number | string | null | undefined) ?? null,
        status: str(r.status),
        date: str(r.date),
        age_days: typeof r.age_days === 'number' ? r.age_days : undefined,
      });
    }
  }
  return { ok: Boolean(row?.ok), status: row ? 'ok' : 'down', findings: out };
}

/** QWEN3-ALERT-ASSISTANT: AI-классификация алерта. */
export type AiClassifyResult = {
  severity: string;
  fp_confidence: number;
  reasoning: string;
};

const AI_LIVE_BASE = LIVE_BASE;

/** EXP-01: включён ли Qwen3-ассистент (PK_AI_ASSISTANT_ENABLED=1). */
export async function fetchAiEnabled(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${AI_LIVE_BASE}/api/ai/status`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = (await res.json()) as { enabled?: boolean };
    return json.enabled === true;
  } catch {
    return false;
  }
}

export type FindingBrief = { title: string; severity: string; cwe?: number | string | null };

export async function requestAiClassify(
  finding: FindingBrief,
  fetchImpl: typeof fetch = fetch,
): Promise<AiClassifyResult | null> {
  try {
    const res = await fetchImpl(`${AI_LIVE_BASE}/api/ai/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: {
          name: finding.title,
          description: finding.title,
          risk: finding.severity,
          confidence: finding.cwe ? 'Medium' : 'N/A',
        },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      severity: json.severity || 'info',
      fp_confidence: typeof json.fp_confidence === 'number' ? json.fp_confidence : 0.5,
      reasoning: json.reasoning || '',
    };
  } catch {
    return null;
  }
}

/** W1: Delta finding entry from deterministic comparison. */
export type DeltaEntry = {
  finding_id: string;
  title: string;
  severity: string;
  cwe: string;
  method: string;
  path: string;
  parameter: string;
  evidence_refs: string[];
  dojo_id?: number | string | null;
  dojo_url?: string | null;
  before?: { severity: string };
  after?: { severity: string };
};

/** W1: Deterministic delta result (always present). */
export type DeterministicDelta = {
  schema_version: string;
  baseline_id: string;
  current_run_id: string;
  comparison_status: 'comparable' | 'incomparable' | 'baseline_missing' | 'current_missing' | 'artifact_incomplete';
  fingerprint_version: string;
  newly_observed: DeltaEntry[];
  not_observed: DeltaEntry[];
  changed: DeltaEntry[];
  metrics: {
    baseline_findings: number;
    current_findings: number;
    newly_observed: number;
    not_observed: number;
    changed: number;
  };
  warnings: string[];
};

/** W1: AI delta advisory (optional, fail-closed). */
export type AiDeltaResponse = {
  schema_version: string;
  decision: 'narrative_ready' | 'abstain' | 'invalid_model_output' | 'llm_unavailable';
  confidence: 'low' | 'medium' | 'high';
  narrative_ru: string;
  suggestions: Array<{ code: string; text: string; support: string; evidence_refs: string[] }>;
  unsupported_claims: string[];
  model: { name: string; prompt_version: string; runtime_version?: string };
};

export async function fetchDeterministicDelta(
  baselineId: string,
  currentRunId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeterministicDelta | null> {
  try {
    const res = await fetchImpl(
      `${AI_LIVE_BASE}/api/ai/delta/deterministic?baseline_id=${encodeURIComponent(baselineId)}&run_id=${encodeURIComponent(currentRunId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as DeterministicDelta;
  } catch {
    return null;
  }
}

export async function requestAiDelta(
  baselineId: string,
  currentRunId: string,
  compactDelta: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<AiDeltaResponse | null> {
  try {
    const res = await fetchImpl(`${AI_LIVE_BASE}/api/ai/delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline_id: baselineId,
        current_run_id: currentRunId,
        compact_redacted_delta: compactDelta,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AiDeltaResponse;
  } catch {
    return null;
  }
}

/** W2: Семантическая группировка findings в exploit-кластеры. */
export type SemanticCluster = {
  cluster_id: string;
  title: string;
  severity: string;
  member_indices: number[];
  member_ids: Array<string | number>;
  relationship: string;
  root_cause_hypothesis: string;
  systemic_remediation: string;
};

export type SemanticGroupResult = {
  clusters: SemanticCluster[];
  confidence: string;
  reasoning: string;
  total_findings: number;
  total_clusters: number;
  model: { name: string; prompt_version: string };
};

export async function requestSemanticGroup(
  findings: Array<{ finding_id?: string | number | null; title: string; severity: string; cwe?: number | string | null }>,
  fetchImpl: typeof fetch = fetch,
): Promise<SemanticGroupResult | null> {
  try {
    const res = await fetchImpl(`${AI_LIVE_BASE}/api/ai/semantic-group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findings }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SemanticGroupResult;
  } catch {
    return null;
  }
}

/** W2: Pre-flight warning. */
export type PreflightWarning = {
  code: string;
  text: string;
  entity_id?: string;
};

export type PreflightResult = {
  warnings: PreflightWarning[];
  summary: string;
  manifest_stats: Record<string, number>;
  model: { name: string; prompt_version: string };
};

export async function requestPreflight(
  wired: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<PreflightResult | null> {
  try {
    const res = await fetchImpl(`${AI_LIVE_BASE}/api/ai/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wired }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PreflightResult;
  } catch {
    return null;
  }
}

export type GatePolicyFilter = {
  min_severity?: string;
  min_confidence?: number;
  require_active?: boolean;
  exclude_false_positive?: boolean;
  exclude_duplicate?: boolean;
  verified_only?: boolean;
  max_age_days?: number;
};

export type GateWaiver = {
  title?: string;
  severity?: string;
  cwe?: string;
  fingerprint?: string;
  expires_at?: string;
};

export type GatePolicy = {
  max_critical?: number;
  max_high?: number;
  enabled?: boolean;
  filter?: GatePolicyFilter;
  waivers?: GateWaiver[];
};

/** GET /api/gate/policy — read-only (waiver/min_severity/min_confidence/rules). */
/* ─── ADM-APP-1: /api/runs/apps ─── */

export type RunAppInstance = {
  instance_id: string;
  check_id: string | null;
  run_id: string;
  last_run_ts: number;
  status: string;
  owner: string | null;
};

export type RunAppDeploy = {
  deploy_url: string;
  instances: RunAppInstance[];
};

export type RunApp = {
  app_code: string;
  first_run_ts: number;
  last_run_ts: number;
  deploys: RunAppDeploy[];
};

/** GET /api/runs/apps — сгруппированный список apps для HomePage. */
export async function fetchRunApps(
  fetchImpl: typeof fetch = fetch,
): Promise<RunApp[]> {
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/runs/apps`,
    fetchImpl,
  );
  const row = asRecord(raw);
  const apps = Array.isArray(row?.apps) ? row.apps : [];
  return apps.map((a: unknown) => {
    const app = asRecord(a) ?? {};
    return {
      app_code: str(app.app_code) ?? '',
      first_run_ts: num(app.first_run_ts),
      last_run_ts: num(app.last_run_ts),
      deploys: Array.isArray(app.deploys)
        ? (app.deploys as unknown[]).map((d: unknown) => {
            const dep = asRecord(d) ?? {};
            return {
              deploy_url: str(dep.deploy_url) ?? '',
              instances: Array.isArray(dep.instances)
                ? (dep.instances as unknown[]).map((i: unknown) => {
                    const inst = asRecord(i) ?? {};
                    return {
                      instance_id: str(inst.instance_id) ?? '',
                      check_id: str(inst.check_id) ?? null,
                      run_id: str(inst.run_id) ?? '',
                      last_run_ts: num(inst.last_run_ts),
                      status: str(inst.status) ?? 'unknown',
                      owner: str(inst.owner) ?? null,
                    };
                  })
                : [],
            };
          })
        : [],
    };
  });
}

/* ─── RET-UI-1: Retention & Cleanup ─── */

export type StorageCategory = {
  key: string;
  label: string;
  bytes: number;
  items_count: number;
  protected?: boolean;
  description?: string;
};

export type RetentionStatus = {
  ok: boolean;
  total_bytes: number;
  total_runs: number;
  protected_runs: number;
  categories: StorageCategory[];
  runs_index_protected: boolean;
  error?: string;
};

export type RetentionCleanResult = {
  ok: boolean;
  freed_bytes: number;
  deleted_items: number;
  error?: string;
};

/** GET /api/admin/retention/status — статус хранилища и артефактов */
export async function fetchRetentionStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<RetentionStatus> {
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/admin/retention/status`,
    fetchImpl,
  );
  const row = asRecord(raw);
  if (!row) {
    return {
      ok: false,
      total_bytes: 0,
      total_runs: 0,
      protected_runs: 0,
      categories: [],
      runs_index_protected: true,
      error: 'live_down',
    };
  }

  const categories: StorageCategory[] = [];
  if (Array.isArray(row.categories)) {
    for (const c of row.categories) {
      const cr = asRecord(c);
      if (cr && str(cr.key)) {
        categories.push({
          key: String(cr.key),
          label: str(cr.label) ?? String(cr.key),
          bytes: num(cr.bytes),
          items_count: num(cr.items_count),
          protected: Boolean(cr.protected),
          description: str(cr.description),
        });
      }
    }
  }

  return {
    ok: Boolean(row.ok ?? true),
    total_bytes: num(row.total_bytes),
    total_runs: num(row.total_runs),
    protected_runs: num(row.protected_runs),
    categories,
    runs_index_protected: row.runs_index_protected !== false,
    error: str(row.error),
  };
}

/** POST /api/admin/retention/clean — запуск очистки */
export async function postRetentionClean(
  params: { days?: number; clean_temp_only?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<RetentionCleanResult> {
  try {
    const res = await fetchImpl(`${ADMIN_LIVE_BASE}/api/admin/retention/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: Boolean(data?.ok),
      freed_bytes: num(data?.freed_bytes),
      deleted_items: num(data?.deleted_items),
      error: str(data?.error),
    };
  } catch (err) {
    return {
      ok: false,
      freed_bytes: 0,
      deleted_items: 0,
      error: err instanceof Error ? err.message : 'clean_failed',
    };
  }
}

export async function fetchGatePolicy(fetchImpl: typeof fetch = fetch): Promise<{
  ok: boolean;
  policy?: GatePolicy;
  path?: string;
  down: boolean;
}> {
  const raw = await fetchJson<unknown>(`${ADMIN_LIVE_BASE}/api/gate/policy`, fetchImpl);
  const row = asRecord(raw);
  if (!row) {
    return { ok: false, down: true };
  }
  const policy = asRecord(row.policy);
  return {
    ok: Boolean(row.ok),
    down: false,
    path: str(row.path),
    policy: policy ? (policy as GatePolicy) : undefined,
  };
}

/* ─── ADM-DOJO: /api/dojo/findings ─── */

/* ─── AUTH-VAULT: /api/auth/vault ─── */

export type AuthVaultStatus = {
  ok: boolean;
  down: boolean;
  profiles: AuthProfileSummary[];
  error?: string;
};

export type AuthProfileSummary = {
  id: string;
  kind: string;
  auth_type: string;
  session_ok: boolean;
  ttl_sec: number;
  masked_token: string;
  last_error: string;
};

export type AuthVaultCheckResult = {
  ok: boolean;
  status: number;
  tokens: string[];
  error: string;
};

/** GET /api/auth/vault/status — состояние vault и профилей. */
export async function fetchAuthVaultStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<AuthVaultStatus> {
  const raw = await fetchJson<unknown>(
    `${ADMIN_LIVE_BASE}/api/auth/vault/status`,
    fetchImpl,
  );
  const row = asRecord(raw);
  if (!row) {
    return { ok: false, down: true, profiles: [], error: 'live_down' };
  }
  const profiles: AuthProfileSummary[] = [];
  if (Array.isArray(row.profiles)) {
    for (const item of row.profiles) {
      const r = asRecord(item);
      if (!r || !str(r.id)) continue;
      profiles.push({
        id: String(r.id),
        kind: str(r.kind) ?? '',
        auth_type: str(r.auth_type) ?? '',
        session_ok: Boolean(r.session_ok),
        ttl_sec: num(r.ttl_sec),
        masked_token: str(r.masked_token) ?? '',
        last_error: str(r.last_error) ?? '',
      });
    }
  }
  return {
    ok: Boolean(row.ok),
    down: false,
    profiles,
    error: str(row.error),
  };
}

/** POST /api/auth/vault/check — живой прогон pre-flight (Check Auth Flow). */
export async function postAuthVaultCheck(
  profileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthVaultCheckResult> {
  try {
    const res = await fetchImpl(`${ADMIN_LIVE_BASE}/api/auth/vault/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: Boolean(data?.ok),
      status: num(data?.status),
      tokens: Array.isArray(data?.tokens)
        ? (data.tokens as unknown[]).map(String)
        : [],
      error: str(data?.error) ?? '',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      tokens: [],
      error: err instanceof Error ? err.message : 'check_failed',
    };
  }
}
