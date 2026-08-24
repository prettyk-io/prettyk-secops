/**
 * EPIC-REPLAY-DIFF A: mark / consume History «Перегнать».
 */

export const PENDING_REPLAY_KEY = 'pk.pendingReplayCheck';

export function markPendingReplay(checkId: string): void {
  const id = checkId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(PENDING_REPLAY_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Returns checkId once; clears key. */
export function consumePendingReplay(): string | null {
  try {
    const id = (sessionStorage.getItem(PENDING_REPLAY_KEY) || '').trim();
    sessionStorage.removeItem(PENDING_REPLAY_KEY);
    return id || null;
  } catch {
    return null;
  }
}

export function peekPendingReplay(): string | null {
  try {
    const id = (sessionStorage.getItem(PENDING_REPLAY_KEY) || '').trim();
    return id || null;
  } catch {
    return null;
  }
}
