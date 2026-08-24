/**
 * ART-4: Admin artifact_retention_days → Live RetentionPolicy (not GatePolicy).
 */
import type { AdminPolicies } from './types';

export type RetentionPolicyJson = {
  version: 1;
  artifact_retention_days: number;
};

export function adminPoliciesToRetentionPolicy(policies: AdminPolicies): RetentionPolicyJson {
  return {
    version: 1,
    artifact_retention_days: Math.max(1, Number(policies.artifact_retention_days) || 90),
  };
}

import { LIVE_RETENTION_POLICY_URL } from '../api/apiBase';

export { LIVE_RETENTION_POLICY_URL };

export async function pushRetentionPolicyToLive(policies: AdminPolicies): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  try {
    const res = await fetch(LIVE_RETENTION_POLICY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: adminPoliciesToRetentionPolicy(policies) }),
    });
    const data = (await res.json()) as { ok?: boolean; path?: string; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `http_${res.status}` };
    }
    return { ok: true, path: data.path };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'live_unreachable',
    };
  }
}
