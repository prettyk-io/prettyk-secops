/**
 * ADM-DOJO-1/2: Live GET /api/dojo/program?project_id=…
 */
import { LIVE_DOJO_PROGRAM_URL } from '../api/apiBase';
import { liveCallerHeaders } from './liveFetchHeaders';
import type { DojoSeverityStats } from './evidenceTypes';

export { LIVE_DOJO_PROGRAM_URL };

export type DojoProgramStatus =
  | 'ok'
  | 'unconfigured'
  | 'down'
  | 'product_missing'
  | 'bad_request'
  | 'partial';

export type DojoProgramItem = {
  ok: boolean;
  status: DojoProgramStatus | string;
  project_id: string;
  at?: string;
  stats?: DojoSeverityStats | null;
  product_id?: number | string | null;
  product_name?: string;
  engagement_url?: string | null;
  findings_n?: number;
  error?: string;
};

export type DojoProgramResponse = {
  ok: boolean;
  status: DojoProgramStatus | string;
  items: Record<string, DojoProgramItem>;
  error?: string;
};

export function buildDojoProgramUrl(projectIds: readonly string[]): string {
  const ids = [...new Set(projectIds.map((p) => p.trim()).filter(Boolean))];
  const q = new URLSearchParams();
  if (ids.length) {
    q.set('project_id', ids.join(','));
  }
  q.set('t', String(Date.now()));
  return `${LIVE_DOJO_PROGRAM_URL}?${q.toString()}`;
}

export function normalizeDojoProgramPayload(raw: unknown): DojoProgramResponse {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 'down', items: {}, error: 'bad_payload' };
  }
  const row = raw as Record<string, unknown>;
  const itemsRaw = row.items;
  const items: Record<string, DojoProgramItem> = {};
  if (itemsRaw && typeof itemsRaw === 'object' && !Array.isArray(itemsRaw)) {
    for (const [key, val] of Object.entries(itemsRaw as Record<string, unknown>)) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        continue;
      }
      const it = val as Record<string, unknown>;
      const project_id =
        typeof it.project_id === 'string' && it.project_id.trim()
          ? it.project_id.trim()
          : key;
      items[project_id] = {
        ok: Boolean(it.ok),
        status: typeof it.status === 'string' ? it.status : 'down',
        project_id,
        at: typeof it.at === 'string' ? it.at : undefined,
        stats:
          it.stats && typeof it.stats === 'object'
            ? (it.stats as DojoSeverityStats)
            : null,
        product_id: (it.product_id as number | string | null | undefined) ?? null,
        product_name: typeof it.product_name === 'string' ? it.product_name : undefined,
        engagement_url:
          typeof it.engagement_url === 'string' ? it.engagement_url : null,
        findings_n: typeof it.findings_n === 'number' ? it.findings_n : undefined,
        error: typeof it.error === 'string' ? it.error : undefined,
      };
    }
  }
  return {
    ok: Boolean(row.ok),
    status: typeof row.status === 'string' ? row.status : 'down',
    items,
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}

export async function fetchDojoProgram(
  projectIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<DojoProgramResponse> {
  const ids = [...new Set(projectIds.map((p) => p.trim()).filter(Boolean))];
  if (!ids.length) {
    return { ok: false, status: 'bad_request', items: {}, error: 'project_id_required' };
  }
  try {
    const res = await fetchImpl(buildDojoProgramUrl(ids), {
      cache: 'no-store',
      headers: liveCallerHeaders(),
    });
    if (!res.ok) {
      return { ok: false, status: 'down', items: {}, error: `HTTP ${res.status}` };
    }
    return normalizeDojoProgramPayload(await res.json());
  } catch (err) {
    return {
      ok: false,
      status: 'down',
      items: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
