/**
 * QG-AF-7: Admin policies → GatePolicy JSON (same shape as runner / Live API).
 */
import type { AdminPolicies } from './types';

export type GatePolicyFilterJson = {
  require_active: boolean;
  exclude_false_positive: boolean;
  exclude_duplicate: boolean;
  exclude_mitigated: boolean;
  verified_only: boolean;
  min_severity: string;
  exclude_tags: string[];
  require_tags: string[];
  max_age_days: number;
};

export type GatePolicyJson = {
  max_critical: number;
  max_high: number;
  enabled: boolean;
  filter: GatePolicyFilterJson;
  waivers: Array<{
    title?: string;
    severity?: string;
    cwe?: string;
    fingerprint?: string;
    expires_at?: string;
  }>;
};

function splitTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function adminPoliciesToGatePolicy(policies: AdminPolicies): GatePolicyJson {
  return {
    max_critical: Math.max(0, Number(policies.max_critical) || 0),
    max_high: Math.max(0, Number(policies.max_high) || 0),
    enabled: policies.gate_enabled !== false,
    filter: {
      require_active: policies.filter_require_active !== false,
      exclude_false_positive: policies.filter_exclude_fp !== false,
      exclude_duplicate: policies.filter_exclude_dup !== false,
      exclude_mitigated: policies.filter_exclude_mitigated !== false,
      verified_only: Boolean(policies.filter_verified_only),
      min_severity: (policies.filter_min_severity || '').trim().toLowerCase(),
      exclude_tags: splitTags(policies.filter_exclude_tags),
      require_tags: splitTags(policies.filter_require_tags),
      max_age_days: Math.max(0, Number(policies.filter_max_age_days) || 0),
    },
    waivers: Array.isArray(policies.waivers) ? policies.waivers : [],
  };
}

import { LIVE_GATE_POLICY_URL } from '../api/apiBase';

export { LIVE_GATE_POLICY_URL };

export async function pushGatePolicyToLive(policies: AdminPolicies): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  try {
    const res = await fetch(LIVE_GATE_POLICY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: adminPoliciesToGatePolicy(policies) }),
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
