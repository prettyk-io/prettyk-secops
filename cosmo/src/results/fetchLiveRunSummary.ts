/**
 * G-20: Live mirror of orchestrator run_summary.json.
 */

import { LIVE_RUN_SUMMARY_URL } from '../api/apiBase';

export async function fetchLiveRunSummary(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(`${LIVE_RUN_SUMMARY_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json()) as { summary?: unknown };
    if (
      payload.summary !== null &&
      typeof payload.summary === 'object' &&
      !Array.isArray(payload.summary)
    ) {
      return payload.summary as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
