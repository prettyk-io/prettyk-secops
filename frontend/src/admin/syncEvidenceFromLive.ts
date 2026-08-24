/**
 * RES-3: подтянуть CheckEvidenceRefs с Live в Admin localStorage registry.
 */

import { LIVE_EVIDENCE_URL } from '../api/apiBase';
import type { CheckEvidenceRefs, EvidenceSource } from './evidenceTypes';
import { upsertEvidence } from './evidenceRegistry';
import { liveCallerHeaders } from './liveFetchHeaders';

export { LIVE_EVIDENCE_URL };

function asSource(raw: unknown): EvidenceSource {
  if (raw === 'finalize' || raw === 'hooks' || raw === 'manual') {
    return raw;
  }
  return 'hooks';
}

export function normalizeLiveEvidenceItem(raw: unknown): CheckEvidenceRefs | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const checkId = typeof row.check_id === 'string' ? row.check_id.trim() : '';
  if (!checkId) {
    return null;
  }
  return {
    ...(row as CheckEvidenceRefs),
    check_id: checkId,
    source: asSource(row.source),
  };
}

export async function syncEvidenceFromLive(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; upserted: number; error?: string }> {
  try {
    const res = await fetchImpl(`${LIVE_EVIDENCE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: liveCallerHeaders(),
    });
    if (!res.ok) {
      return { ok: false, upserted: 0, error: `HTTP ${res.status}` };
    }
    const payload = (await res.json()) as { list?: unknown[]; items?: Record<string, unknown> };
    let list: unknown[] = [];
    if (Array.isArray(payload.list)) {
      list = payload.list;
    } else if (payload.items) {
      list = Object.values(payload.items);
    }
    let upserted = 0;
    for (const item of list) {
      const refs = normalizeLiveEvidenceItem(item);
      if (!refs) {
        continue;
      }
      upsertEvidence(refs);
      upserted += 1;
    }
    return { ok: true, upserted };
  } catch (err) {
    return {
      ok: false,
      upserted: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
