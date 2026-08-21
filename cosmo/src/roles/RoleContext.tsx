/**
 * Декларативный RBAC: провайдер роли + guard-обёртка.
 * Вся логика ролей — здесь. Без связки с App.tsx.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { RoleCaps } from '../shell/auth';
import { capsForRole, capsForUser, readSession } from '../shell/auth';

/* ── Контекст ── */

export const RoleContext = createContext<RoleCaps | undefined>(undefined);

export function useRoleCaps(): RoleCaps {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRoleCaps must be used within a <RoleProvider>');
  }
  return ctx;
}

export interface RoleProviderProps {
  children: React.ReactNode;
}

export function RoleProvider({ children }: RoleProviderProps): React.JSX.Element {
  const caps = useMemo(() => {
    const session = readSession();
    if (!session) {
      return capsForRole(null);
    }
    return capsForUser(session);
  }, []);
  return <RoleContext.Provider value={caps}>{children}</RoleContext.Provider>;
}

/* ── Guard ── */

export type RolePolicy = (caps: RoleCaps) => boolean;

export interface RoleGuardProps {
  /** Дети, которые отрисуются, если политика разрешает. */
  children: React.ReactNode;
  /** Политика доступа (caps → boolean). */
  policy: RolePolicy;
  /** Альтернативный рендер при отказе (по умолчанию — null). */
  fallback?: React.ReactNode;
}

/**
 * Условный рендер детей на основе текущих RoleCaps.
 * Пример: <RoleGuard policy={(c) => c.canGenerateAct}><ActButton /></RoleGuard>
 */
export function RoleGuard({ children, policy, fallback = null }: RoleGuardProps): React.JSX.Element | null {
  const caps = useContext(RoleContext);
  if (!caps || !policy(caps)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

/* ── Стандартные политики ── */

export const CanAccessAdmin: RolePolicy = (c) => c.canAccessAdmin;
export const CanSelectEmergency: RolePolicy = (c) => c.canSelectEmergency;
export const CanSelectPreRelease: RolePolicy = (c) => c.canSelectPreRelease;
export const CanGenerateAct: RolePolicy = (c) => c.canGenerateAct;
export const CanOverrideScanUrl: RolePolicy = (c) => c.canOverrideScanUrl;
export const CanUseDebugMode: RolePolicy = (c) => c.canUseDebugMode;
export const CanSelectWebswing: RolePolicy = (c) => c.canSelectWebswing;
export const CanimportWired: RolePolicy = (c) => c.canimportWired;
