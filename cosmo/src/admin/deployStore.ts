/**
 * Local deploy registry + check links (mock → future bank sync / signed drop).
 */

import { getCheck } from '../checks/checksStore';
import { MOCK_DEPLOYS } from './mockDeploys';
import { DEFAULT_ADMIN_POLICIES, DEFAULT_AIRGAP_CONNECTORS } from './defaults';
import { resolveDeployGateSignal } from './deployGateFromVerdict';
import { getEvidence, listEvidenceForDeploy, upsertEvidence } from './evidenceRegistry';
import type {
  AdminPolicies,
  AirgapConnectors,
  BankDeploy,
  ConnectorHealth,
  DeployCheckLink,
  DeployGate,
} from './types';

const DEPLOYS_KEY = 'pk.admin.deploys.v1';
const LINKS_KEY = 'pk.admin.deploy_links.v1';
const POLICIES_KEY = 'pk.admin.policies.v1';
const CONNECTORS_KEY = 'pk.admin.connectors.v1';

type DeploysSnapshot = { version: 1; items: BankDeploy[] };
type LinksSnapshot = { version: 1; items: DeployCheckLink[] };

function readJson(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function loadDeploys(): BankDeploy[] {
  const raw = readJson(DEPLOYS_KEY);
  if (!raw) {
    return MOCK_DEPLOYS.map((d) => ({ ...d }));
  }
  try {
    const parsed = JSON.parse(raw) as DeploysSnapshot;
    if (parsed?.version === 1 && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed.items;
    }
  } catch {
    /* fall through */
  }
  return MOCK_DEPLOYS.map((d) => ({ ...d }));
}

function saveDeploys(items: BankDeploy[]): void {
  writeJson(DEPLOYS_KEY, JSON.stringify({ version: 1, items } satisfies DeploysSnapshot));
}

function loadLinks(): DeployCheckLink[] {
  const raw = readJson(LINKS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as LinksSnapshot;
    if (parsed?.version === 1 && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch {
    /* fall through */
  }
  return [];
}

function saveLinks(items: DeployCheckLink[]): void {
  writeJson(LINKS_KEY, JSON.stringify({ version: 1, items } satisfies LinksSnapshot));
}

export function listDeploys(filters?: {
  app_group?: string;
  /** Код приложения (= project_id). */
  project_id?: string;
  deploy_env?: string;
  status?: string;
  q?: string;
}): BankDeploy[] {
  let items = loadDeploys();
  if (filters?.app_group) {
    items = items.filter((d) => d.app_group === filters.app_group);
  }
  if (filters?.project_id?.trim()) {
    const pid = filters.project_id.trim();
    items = items.filter((d) => d.project_id === pid);
  }
  if (filters?.deploy_env) {
    items = items.filter((d) => d.deploy_env === filters.deploy_env);
  }
  if (filters?.status) {
    items = items.filter((d) => d.status === filters.status);
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    items = items.filter(
      (d) =>
        d.application_name.toLowerCase().includes(q) ||
        d.project_id.toLowerCase().includes(q) ||
        d.deploy_url.toLowerCase().includes(q) ||
        d.build_id.toLowerCase().includes(q) ||
        d.deploy_id.toLowerCase().includes(q),
    );
  }
  return [...items].sort((a, b) => (b.deployed_at > a.deployed_at ? 1 : -1));
}

export type EnsureDeployInput = {
  project_id: string;
  deploy_env: string;
  deploy_url: string;
  application_name?: string;
  app_group?: string;
  build_id?: string;
  build_number?: string;
  repo?: string;
};

export type EnsureDeployResult = {
  deploy: BankDeploy;
  created: boolean;
};

/**
 * ADM-DEPLOY-ENSURE: найти деплой по код+env+url или создать в реестре (lab localStorage).
 */
export function ensureDeploy(input: EnsureDeployInput): EnsureDeployResult {
  const project_id = input.project_id.trim();
  const deploy_env = input.deploy_env.trim();
  const deploy_url = input.deploy_url.trim();
  if (!project_id || !deploy_env || !deploy_url) {
    throw new Error('Нужны код приложения, env и URL');
  }
  const items = loadDeploys();
  const existing = items.find(
    (d) =>
      d.project_id === project_id &&
      d.deploy_env === deploy_env &&
      d.deploy_url === deploy_url,
  );
  if (existing) {
    let patched = existing;
    const name = input.application_name?.trim();
    if (name && name !== existing.application_name) {
      patched = { ...existing, application_name: name };
      const idx = items.findIndex((d) => d.deploy_id === existing.deploy_id);
      if (idx >= 0) {
        items[idx] = patched;
        saveDeploys(items);
      }
    }
    return { deploy: patched, created: false };
  }
  const stamp = Date.now().toString(36);
  const deploy: BankDeploy = {
    deploy_id: `dep_${project_id}_${stamp}`,
    app_group: input.app_group?.trim() || '—',
    project_id,
    application_name: input.application_name?.trim() || project_id,
    repo: input.repo?.trim() || '',
    build_id: input.build_id?.trim() || `bld_${stamp}`,
    build_number: input.build_number?.trim() || stamp,
    deploy_env,
    deploy_url,
    deployed_at: new Date().toISOString(),
    status: 'active',
  };
  items.push(deploy);
  saveDeploys(items);
  return { deploy, created: true };
}

/** Уникальные коды приложений из реестра (для Home blank / фильтров). */
export function listAppCodes(): { project_id: string; application_name: string }[] {
  const seen = new Set<string>();
  const out: { project_id: string; application_name: string }[] = [];
  for (const d of listDeploys()) {
    const pid = d.project_id.trim();
    if (!pid || seen.has(pid)) {
      continue;
    }
    seen.add(pid);
    out.push({ project_id: pid, application_name: d.application_name });
  }
  return out.sort((a, b) => a.project_id.localeCompare(b.project_id));
}

export function getDeploy(deployId: string): BankDeploy | undefined {
  return loadDeploys().find((d) => d.deploy_id === deployId);
}

export function listLinksForDeploy(deployId: string): DeployCheckLink[] {
  return loadLinks()
    .filter((l) => l.deploy_id === deployId)
    .sort((a, b) => (b.linked_at > a.linked_at ? 1 : -1));
}

export function linkCheckToDeploy(deployId: string, checkId: string): void {
  const links = loadLinks();
  if (links.some((l) => l.deploy_id === deployId && l.check_id === checkId)) {
    return;
  }
  links.push({
    deploy_id: deployId,
    check_id: checkId,
    linked_at: new Date().toISOString(),
  });
  saveLinks(links);

  const deploys = loadDeploys();
  const idx = deploys.findIndex((d) => d.deploy_id === deployId);
  const target = idx >= 0 ? deploys[idx] : undefined;
  if (target) {
    deploys[idx] = { ...target, last_check_id: checkId };
    saveDeploys(deploys);
  }

  upsertEvidence({
    check_id: checkId,
    deploy_id: deployId,
    source: 'manual',
  });
  syncDeployGatesFromChecks([deployId]);
}

export function updateDeployGate(deployId: string, gate: DeployGate): void {
  const deploys = loadDeploys();
  const idx = deploys.findIndex((d) => d.deploy_id === deployId);
  const target = idx >= 0 ? deploys[idx] : undefined;
  if (target) {
    deploys[idx] = { ...target, last_gate: gate };
    saveDeploys(deploys);
  }
}

export function listAllDeployLinks(): DeployCheckLink[] {
  return loadLinks();
}

export function linksByDeployMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const link of loadLinks()) {
    const list = map.get(link.deploy_id) ?? [];
    list.push(link.check_id);
    map.set(link.deploy_id, list);
  }
  return map;
}

/** Обновить gate только для деплоев, связанных с check_id. */
export function syncDeployGatesForCheck(checkId: string): number {
  const id = (checkId || '').trim();
  if (!id) {
    return 0;
  }
  const fromLinks = loadLinks()
    .filter((l) => l.check_id === id)
    .map((l) => l.deploy_id);
  const fromLast = loadDeploys()
    .filter((d) => d.last_check_id === id)
    .map((d) => d.deploy_id);
  const deployIds = [...new Set([...fromLinks, ...fromLast])];
  if (deployIds.length === 0) {
    return 0;
  }
  return syncDeployGatesFromChecks(deployIds);
}

/**
 * ADM-2: обновить last_gate по linked checks (ci_verdict) и evidence history.
 * @returns сколько деплоев обновили
 */
export function syncDeployGatesFromChecks(onlyDeployIds?: readonly string[]): number {
  const deploys = loadDeploys();
  const links = loadLinks();
  let updated = 0;
  const next = deploys.map((deploy) => {
    if (onlyDeployIds && !onlyDeployIds.includes(deploy.deploy_id)) {
      return deploy;
    }
    const checkIds = links
      .filter((l) => l.deploy_id === deploy.deploy_id)
      .map((l) => l.check_id);
    if (deploy.last_check_id && !checkIds.includes(deploy.last_check_id)) {
      checkIds.push(deploy.last_check_id);
    }
    const checks = checkIds
      .map((id) => getCheck(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const evidence = [
      ...listEvidenceForDeploy(deploy.deploy_id),
      ...checkIds.map((id) => getEvidence(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    ];
    const gate = resolveDeployGateSignal({ checks, evidence });
    if (!gate || gate === deploy.last_gate) {
      return deploy;
    }
    updated += 1;
    return { ...deploy, last_gate: gate };
  });
  if (updated > 0) {
    saveDeploys(next);
  }
  return updated;
}

export function updateDeployHooks(
  deployId: string,
  hooks: NonNullable<BankDeploy['hooks']>,
): void {
  const deploys = loadDeploys();
  const idx = deploys.findIndex((d) => d.deploy_id === deployId);
  const target = idx >= 0 ? deploys[idx] : undefined;
  if (target) {
    deploys[idx] = {
      ...target,
      hooks: { ...target.hooks, ...hooks },
    };
    saveDeploys(deploys);
  }
}

export function loadAdminPolicies(): AdminPolicies {
  const raw = readJson(POLICIES_KEY);
  if (!raw) {
    return { ...DEFAULT_ADMIN_POLICIES };
  }
  try {
    return { ...DEFAULT_ADMIN_POLICIES, ...(JSON.parse(raw) as AdminPolicies) };
  } catch {
    return { ...DEFAULT_ADMIN_POLICIES };
  }
}

export function saveAdminPolicies(policies: AdminPolicies): void {
  writeJson(POLICIES_KEY, JSON.stringify(policies));
}

export function loadConnectors(): AirgapConnectors {
  const raw = readJson(CONNECTORS_KEY);
  if (!raw) {
    return { ...DEFAULT_AIRGAP_CONNECTORS };
  }
  try {
    return { ...DEFAULT_AIRGAP_CONNECTORS, ...(JSON.parse(raw) as AirgapConnectors) };
  } catch {
    return { ...DEFAULT_AIRGAP_CONNECTORS };
  }
}

export function saveConnectors(connectors: AirgapConnectors): void {
  writeJson(CONNECTORS_KEY, JSON.stringify(connectors));
}

export type ProbeHttpOutcome = {
  health: ConnectorHealth;
  /** Reachable but needs credentials (401/403) — still ok for «up». */
  authRequired?: boolean;
};

async function probeHttp(
  url: string,
  okStatuses: readonly number[] = [200],
): Promise<ProbeHttpOutcome> {
  if (!url.trim()) {
    return { health: 'unknown' };
  }
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    if (okStatuses.includes(res.status) || res.ok) {
      const authRequired = res.status === 401 || res.status === 403;
      return authRequired ? { health: 'ok', authRequired: true } : { health: 'ok' };
    }
    if (res.status === 401 || res.status === 403) {
      return { health: 'ok', authRequired: true };
    }
    return { health: 'degraded' };
  } catch {
    return { health: 'down' };
  }
}

export type ProbeConnectorsResult = {
  connectors: AirgapConnectors;
  summary: string;
};

/**
 * Probe on-prem HTTP endpoints (no SaaS). CORS/lab may mark degraded.
 * DB/SSH/MQ — без сетевого probe → health forced unknown (ADM-E5 honesty).
 */
export async function probeConnectors(
  current: AirgapConnectors,
): Promise<ProbeConnectorsResult> {
  const { applySkippedHealthHonesty, buildProbeReport } = await import('./connectorProbe');
  let next: AirgapConnectors = {
    ...current,
    last_probe_at: new Date().toISOString(),
  };

  const authNotes: Record<string, string> = {};

  const allureBase = current.allure_base_url.replace(/\/$/, '');
  const allure = await probeHttp(`${allureBase}/health`);
  next.allure_health = allure.health;
  if (allure.authRequired) authNotes.allure = 'reachable + auth required';

  const dojoBase = current.dojo_base_url.replace(/\/$/, '');
  const dojo = await probeHttp(`${dojoBase}/api/v2/`, [200, 401, 403]);
  next.dojo_health = dojo.health;
  if (dojo.authRequired) authNotes.dojo = 'reachable + auth required';

  const promBase = current.prom_url.replace(/\/$/, '');
  let prom = await probeHttp(`${promBase}/-/healthy`);
  if (prom.health === 'down') {
    prom = await probeHttp(`${promBase}/api/v1/status/buildinfo`);
  }
  next.prom_health = prom.health;
  if (prom.authRequired) authNotes.prom = 'reachable + auth required';

  if (current.siem_url.trim()) {
    const siem = await probeHttp(current.siem_url.replace(/\/$/, ''));
    next.siem_health = siem.health;
    if (siem.authRequired) authNotes.siem = 'reachable + auth required';
  } else {
    next.siem_health = 'unknown';
  }

  next = applySkippedHealthHonesty(next);
  const report = buildProbeReport(current, next, next.last_probe_at, authNotes);
  saveConnectors(next);
  return { connectors: next, summary: report.summary };
}

/** Reset seed (tests / lab). */
export function resetAdminStoresForTests(): void {
  try {
    window.localStorage.removeItem(DEPLOYS_KEY);
    window.localStorage.removeItem(LINKS_KEY);
    window.localStorage.removeItem(POLICIES_KEY);
    window.localStorage.removeItem(CONNECTORS_KEY);
  } catch {
    /* ignore */
  }
}
