/**
 * ADM-DOJO-FULL-1: Live GET /api/dojo/findings?project_id=
 */
import { LIVE_DOJO_FINDINGS_URL } from '../api/apiBase';
import { liveCallerHeaders } from './liveFetchHeaders';
import type { DojoSeverityStats } from './evidenceTypes';

export { LIVE_DOJO_FINDINGS_URL };

export type DojoFinding = {
  id?: number | string;
  title: string;
  severity: string;
  cwe?: number | string | null;
  active?: boolean;
  verified?: boolean;
  false_p?: boolean;
  duplicate?: boolean;
  is_mitigated?: boolean;
  date?: string;
  url?: string;
  test_engagement?: number | string;
};

export type DojoFindingsEnvelope = {
  ok: boolean;
  status: string;
  project_id: string;
  at?: string;
  findings: DojoFinding[] | null;
  verified?: DojoSeverityStats | null;
  false_p?: DojoSeverityStats | null;
  product_id?: number | string | null;
  engagement_url?: string | null;
  findings_n?: number;
  error?: string;
};

export function buildDojoFindingsUrl(projectId: string): string {
  const q = new URLSearchParams();
  q.set('project_id', projectId.trim());
  q.set('t', String(Date.now()));
  return `${LIVE_DOJO_FINDINGS_URL}?${q.toString()}`;
}

function asStats(raw: unknown): DojoSeverityStats | null | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as DojoSeverityStats;
}

function normalizeFinding(raw: unknown): DojoFinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const f = raw as Record<string, unknown>;
  const title = typeof f.title === 'string' ? f.title.trim() : '';
  if (!title) {
    return null;
  }
  return {
    id: (f.id as number | string | undefined) ?? undefined,
    title,
    severity: typeof f.severity === 'string' ? f.severity : 'high',
    cwe: (f.cwe as number | string | null | undefined) ?? null,
    active: typeof f.active === 'boolean' ? f.active : undefined,
    verified: typeof f.verified === 'boolean' ? f.verified : undefined,
    false_p: typeof f.false_p === 'boolean' ? f.false_p : undefined,
    duplicate: typeof f.duplicate === 'boolean' ? f.duplicate : undefined,
    is_mitigated: typeof f.is_mitigated === 'boolean' ? f.is_mitigated : undefined,
    date: typeof f.date === 'string' && f.date ? f.date : undefined,
    url: typeof f.url === 'string' && f.url ? f.url : undefined,
    test_engagement:
      (f.test_engagement as number | string | undefined) ?? undefined,
  };
}

export function normalizeDojoFindingsPayload(raw: unknown): DojoFindingsEnvelope {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      status: 'down',
      project_id: '',
      findings: null,
      error: 'bad_payload',
    };
  }
  const row = raw as Record<string, unknown>;
  let findings: DojoFinding[] | null = null;
  if (Array.isArray(row.findings)) {
    findings = row.findings
      .map(normalizeFinding)
      .filter((f): f is DojoFinding => f !== null);
  }
  return {
    ok: Boolean(row.ok),
    status: typeof row.status === 'string' ? row.status : 'down',
    project_id: typeof row.project_id === 'string' ? row.project_id : '',
    at: typeof row.at === 'string' ? row.at : undefined,
    findings,
    verified: asStats(row.verified),
    false_p: asStats(row.false_p),
    product_id: (row.product_id as number | string | null | undefined) ?? null,
    engagement_url:
      typeof row.engagement_url === 'string' ? row.engagement_url : null,
    findings_n: typeof row.findings_n === 'number' ? row.findings_n : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}

export async function fetchDojoFindings(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DojoFindingsEnvelope> {
  const pid = (projectId || '').trim();
  if (!pid) {
    return {
      ok: false,
      status: 'bad_request',
      project_id: '',
      findings: null,
      error: 'project_id_required',
    };
  }
  try {
    const res = await fetchImpl(buildDojoFindingsUrl(pid), {
      cache: 'no-store',
      headers: liveCallerHeaders(),
    });
    if (!res.ok) {
      return {
        ok: false,
        status: 'down',
        project_id: pid,
        findings: null,
        error: `HTTP ${res.status}`,
      };
    }
    return normalizeDojoFindingsPayload(await res.json());
  } catch (err) {
    return {
      ok: false,
      status: 'down',
      project_id: pid,
      findings: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
