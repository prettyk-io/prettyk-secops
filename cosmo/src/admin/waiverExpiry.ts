/**
 * ADM-E7: classify waivers by expires_at (expired / soon / ok / none).
 */

import type { AdminWaiver } from './types';

export type WaiverExpiryKind = 'expired' | 'soon' | 'ok' | 'none';

export type WaiverExpiryRow = {
  title: string;
  expires_at?: string;
  kind: WaiverExpiryKind;
  daysLeft?: number;
};

const MS_DAY = 24 * 60 * 60 * 1000;
/** Warn when expires within this many days (inclusive). */
export const WAIVER_SOON_DAYS = 14;

export function classifyWaiverExpiry(
  waiver: AdminWaiver,
  nowMs: number = Date.now(),
  soonDays: number = WAIVER_SOON_DAYS,
): WaiverExpiryRow {
  const title = (waiver.title || '').trim() || '(без title)';
  const raw = (waiver.expires_at || '').trim();
  if (!raw) {
    return { title, expires_at: undefined, kind: 'none' };
  }
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    return { title, expires_at: raw, kind: 'none' };
  }
  const daysLeft = Math.ceil((t - nowMs) / MS_DAY);
  if (daysLeft < 0) {
    return { title, expires_at: raw, kind: 'expired', daysLeft };
  }
  if (daysLeft <= soonDays) {
    return { title, expires_at: raw, kind: 'soon', daysLeft };
  }
  return { title, expires_at: raw, kind: 'ok', daysLeft };
}

export function summarizeWaiversExpiry(
  waivers: readonly AdminWaiver[] | undefined,
  nowMs: number = Date.now(),
): { expired: WaiverExpiryRow[]; soon: WaiverExpiryRow[]; rows: WaiverExpiryRow[] } {
  const rows = (waivers ?? []).map((w) => classifyWaiverExpiry(w, nowMs));
  return {
    rows,
    expired: rows.filter((r) => r.kind === 'expired'),
    soon: rows.filter((r) => r.kind === 'soon'),
  };
}
