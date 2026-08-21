/**
 * ADM-B2: merge Live `/api/runs/index` into local AdminRunRow[].
 */

import type { AdminRunRow } from './collectAdminRuns';
import type { CheckRunStatus } from '../checks/types';
import { liveCallerHeaders } from './liveFetchHeaders';
import { LIVE_BASE } from '../api/apiBase';

export type LiveRunIndexItem = {
  run_id?: string;
  check_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  status?: string;
  ci_verdict?: string | null;
  owner_user_id?: string | null;
  source?: string;
};

function asStatus(raw: string | undefined): CheckRunStatus {
  const s = (raw || '').toLowerCase();
  if (s === 'success' || s === 'failed' || s === 'running' || s === 'idle') {
    return s;
  }
  return 'unknown';
}

export function liveItemToAdminRow(
  item: LiveRunIndexItem,
  titleByCheckId?: ReadonlyMap<string, string>,
): AdminRunRow | null {
  const run_id = String(item.run_id || '').trim();
  if (!run_id) return null;
  const check_id = String(item.check_id || '').trim() || `live:${run_id}`;
  const localTitle = titleByCheckId?.get(check_id);
  return {
    key: `live:${check_id}:${run_id}`,
    check_id,
    check_title: localTitle || (item.check_id ? String(item.check_id) : `Live ${run_id}`),
    run_id,
    started_at: item.started_at || undefined,
    ended_at: item.ended_at || undefined,
    status: asStatus(item.status),
    ci_verdict: item.ci_verdict || undefined,
    owner_user_id: item.owner_user_id || undefined,
  };
}

/** Local first, then Live-only rows (dedupe by run_id). Enrich Live titles from local checks. */
export function mergeLocalAndLiveRuns(
  local: readonly AdminRunRow[],
  live: readonly LiveRunIndexItem[],
  maxRows = 200,
): AdminRunRow[] {
  const titleByCheckId = new Map<string, string>();
  for (const row of local) {
    if (row.check_id && row.check_title && !row.check_id.startsWith('live:')) {
      titleByCheckId.set(row.check_id, row.check_title);
    }
  }
  const seen = new Set(local.map((r) => r.run_id));
  const extra: AdminRunRow[] = [];
  for (const item of live) {
    const row = liveItemToAdminRow(item, titleByCheckId);
    if (!row || seen.has(row.run_id)) continue;
    seen.add(row.run_id);
    extra.push(row);
  }
  const merged = [...local, ...extra];
  merged.sort((a, b) => {
    const ta = Date.parse(a.ended_at || a.started_at || '') || 0;
    const tb = Date.parse(b.ended_at || b.started_at || '') || 0;
    return tb - ta;
  });
  return merged.slice(0, maxRows);
}

export async function fetchLiveRunsIndex(
  baseUrl = LIVE_BASE,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<LiveRunIndexItem[]> {
  const limit = opts?.limit ?? 200;
  const url = `${baseUrl.replace(/\/$/, '')}/api/runs/index?limit=${limit}`;
  const res = await fetch(url, {
    signal: opts?.signal,
    cache: 'no-store',
    headers: liveCallerHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: LiveRunIndexItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** Shared short TTL so Overview / Прогоны / Deploy remounts don't spam Live. */
const LIVE_INDEX_TTL_MS = 10_000;
let liveIndexCache: {
  key: string;
  at: number;
  items: LiveRunIndexItem[];
} | null = null;

export function clearLiveRunsIndexCache(): void {
  liveIndexCache = null;
}

export async function fetchLiveRunsIndexCached(
  baseUrl = LIVE_BASE,
  opts?: { limit?: number; signal?: AbortSignal; ttlMs?: number },
): Promise<LiveRunIndexItem[]> {
  const limit = opts?.limit ?? 200;
  const ttl = opts?.ttlMs ?? LIVE_INDEX_TTL_MS;
  const key = `${baseUrl.replace(/\/$/, '')}|${limit}`;
  const now = Date.now();
  if (
    liveIndexCache &&
    liveIndexCache.key === key &&
    now - liveIndexCache.at < ttl
  ) {
    return liveIndexCache.items;
  }
  const items = await fetchLiveRunsIndex(baseUrl, opts);
  liveIndexCache = { key, at: now, items };
  return items;
}
