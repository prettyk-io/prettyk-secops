/**
 * NAV-API lab: sync CheckInstance registry with playground file bus.
 * GET/PUT http://127.0.0.1:8765/api/checks → reports/live/checks_registry.json
 */
import { CHECKS_API_URL } from '../api/apiBase';
import {
  applyMergedRemoteSnapshot,
  readChecksSnapshot,
  setChecksPersistHook,
} from './checksStore';
import type { ChecksStoreSnapshot } from './types';

export { CHECKS_API_URL };

const PUSH_DEBOUNCE_MS = 400;

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let syncEnabled = false;

function isChecksSnapshot(value: unknown): value is ChecksStoreSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snap = value as ChecksStoreSnapshot;
  return snap.version === 1 && Array.isArray(snap.items);
}

export async function pullChecksFromServer(): Promise<boolean> {
  try {
    const res = await fetch(`${CHECKS_API_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return false;
    }
    const payload = (await res.json().catch(() => null)) as unknown;
    if (!isChecksSnapshot(payload)) {
      return false;
    }
    return applyMergedRemoteSnapshot(payload);
  } catch {
    return false;
  }
}

export async function pushChecksToServer(
  snapshot?: ChecksStoreSnapshot,
): Promise<boolean> {
  const body = snapshot ?? readChecksSnapshot();
  try {
    const res = await fetch(CHECKS_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, items: body.items }),
    });
    if (!res.ok) {
      return false;
    }
    const payload = (await res.json().catch(() => null)) as { ok?: boolean };
    return payload?.ok !== false;
  } catch {
    return false;
  }
}

export function scheduleChecksPush(snapshot?: ChecksStoreSnapshot): void {
  if (typeof window === 'undefined') {
    return;
  }
  const snap = snapshot ?? readChecksSnapshot();
  if (pushTimer !== undefined) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    void pushChecksToServer(snap);
  }, PUSH_DEBOUNCE_MS);
}

/** Wire persist → debounced PUT. Idempotent. */
export function enableChecksRemoteSync(): void {
  if (syncEnabled) {
    return;
  }
  syncEnabled = true;
  setChecksPersistHook((snap) => {
    scheduleChecksPush(snap);
  });
}

/** Tests: detach hook + clear timer. */
export function __resetChecksRemoteForTests(): void {
  syncEnabled = false;
  setChecksPersistHook(null);
  if (pushTimer !== undefined) {
    clearTimeout(pushTimer);
    pushTimer = undefined;
  }
}
