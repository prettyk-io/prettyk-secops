/**
 * PERS stub: attach lab caller to Live HTTP from Admin/FE.
 */

import { currentUserId } from '../shell/persAuth';

/** Headers for Live GETs that enforce owner|admin filtering. */
export function liveCallerHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const user = currentUserId();
  if (user) {
    headers['X-pk-User'] = user;
  }
  return headers;
}
