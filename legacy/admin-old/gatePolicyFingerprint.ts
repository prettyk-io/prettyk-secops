/**
 * ADM-E4: last Live GatePolicy push fingerprint (localStorage).
 */

const KEY = 'pk.admin.gate_policy_last_push.v1';

export type GatePolicyPushMeta = {
  at: string;
  fingerprint: string;
  path?: string;
};

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `gp_${(h >>> 0).toString(16)}`;
}

export function recordGatePolicyPush(policy: unknown, path?: string): GatePolicyPushMeta {
  const raw = JSON.stringify(policy ?? {});
  const meta: GatePolicyPushMeta = {
    at: new Date().toISOString(),
    fingerprint: simpleHash(raw),
    path,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
  return meta;
}

export function readLastGatePolicyPush(): GatePolicyPushMeta | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GatePolicyPushMeta;
    if (parsed?.fingerprint && parsed?.at) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}
