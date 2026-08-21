/**
 * PERS lab: local FE-auth → owner_user_id (не OIDC).
 * SecOps Admin = nshr | admin_ib (emails + aliases admin/debug).
 */

import {
  canAccessAdmin,
  isAuthUser,
  readSession,
  type AuthUser,
} from './auth';

export type LabUserId = AuthUser | 'legacy' | string;

export function currentUserId(): LabUserId | null {
  return readSession();
}

export function isSecOpsAdmin(userId: LabUserId | null | undefined): boolean {
  if (userId == null) {
    return false;
  }
  if (typeof userId !== 'string') {
    return false;
  }
  if (!isAuthUser(userId)) {
    return false;
  }
  return canAccessAdmin(userId);
}

/** Normalize stored owner; missing → legacy (visible to all until re-saved). */
export function normalizeOwnerId(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    const v = raw.trim();
    if (isAuthUser(v) || v === 'legacy') {
      return v;
    }
    return v;
  }
  return 'legacy';
}

/** History: все проверки видны всем — импорт конфигурации разрешён. */
export function canViewCheckInHistory(
  _ownerUserId: unknown,
  _viewer: LabUserId | null,
): boolean {
  return true;
}
