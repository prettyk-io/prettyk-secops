/**
 * AUTH-PROF B-1: Unified User Profile Store
 *
 * Единый источник правды профиля: идентичность, RBAC-права, UI-преференсы, PAT-токены.
 * ZERO external dependencies beyond Zustand + shell/auth.ts.
 *
 * Контракт:
 *   import { useUserProfile, computeCapabilities, hasCapability } from '@/auth/profileStore';
 *   import type { UserProfile, UserCapability, UserPreferences, PersonalAccessToken } from '@/auth/profileStore';
 */
import { create } from 'zustand';

import {
  type LabRole,
  type AuthUser,
  readSession,
  roleOf,
  capsForRole,
  displayNameOf,
} from '../shell/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Core domain types (canon per research doc §4)
// ═══════════════════════════════════════════════════════════════════════════

export type UserCapability =
  | 'admin:access'
  | 'control:access'
  | 'checks:create'
  | 'checks:import'
  | 'checks:delete'
  | 'fuzzer:execute'
  | 'policies:manage'
  | 'retention:clean'
  | 'tokens:manage';

export interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  font: 'golos' | 'astra' | 'inter';
  locale: 'ru' | 'en';
  density: 'compact' | 'standard';
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  tokenMasked: string;
  scopes: UserCapability[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: LabRole;
  department?: string;
  avatarUrl?: string | null;
  capabilities: UserCapability[];
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage keys
// ═══════════════════════════════════════════════════════════════════════════

export const PROFILE_STORAGE_KEY = 'pk.user.profile.v1';
export const TOKENS_STORAGE_KEY = 'pk.user.tokens.v1';

// ═══════════════════════════════════════════════════════════════════════════
// Capability Matrix (LabRole → UserCapability[])
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_CAPABILITY_MAP: Record<LabRole, UserCapability[]> = {
  admin_sec: [
    'admin:access',
    'control:access',
    'checks:create',
    'checks:import',
    'checks:delete',
    'fuzzer:execute',
    'policies:manage',
    'retention:clean',
    'tokens:manage',
  ],
  admin_abnormal: [
    'admin:access',
    'control:access',
    'checks:create',
    'checks:import',
    'checks:delete',
    'fuzzer:execute',
    'policies:manage',
    'retention:clean',
    'tokens:manage',
  ],
  admin_service: [
    'control:access',
    'retention:clean',
    'tokens:manage',
  ],
  sec_expert: [
    'checks:create',
    'checks:import',
    'fuzzer:execute',
    'tokens:manage',
  ],
  user: [
    'checks:create',
  ],
  // Deprecated aliases map to canonical
  admin_ib: [
    'admin:access',
    'control:access',
    'checks:create',
    'checks:import',
    'checks:delete',
    'fuzzer:execute',
    'policies:manage',
    'retention:clean',
    'tokens:manage',
  ],
  nshr: [
    'admin:access',
    'control:access',
    'checks:create',
    'checks:import',
    'checks:delete',
    'fuzzer:execute',
    'policies:manage',
    'retention:clean',
    'tokens:manage',
  ],
  expert_ib: [
    'checks:create',
    'checks:import',
    'fuzzer:execute',
    'tokens:manage',
  ],
};

/**
 * Pure function: compute capabilities from role.
 * No side effects. Safe to call in SSR, tests, render.
 */
export function computeCapabilities(role: LabRole | null | undefined): UserCapability[] {
  if (!role) return [];
  return ROLE_CAPABILITY_MAP[role] ?? [];
}

/**
 * Pure function: check if a capabilities array contains a specific cap.
 * Works with both computeCapabilities() output and profile.capabilities.
 */
export function hasCapability(caps: UserCapability[], cap: UserCapability): boolean {
  return caps.includes(cap);
}

// ═══════════════════════════════════════════════════════════════════════════
// Persistence helpers
// ═══════════════════════════════════════════════════════════════════════════

function readStoredProfile(): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: UserProfile = JSON.parse(raw);
    if (!parsed.id || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredProfile(profile: UserProfile): void {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode */
  }
}

function readStoredTokens(): PersonalAccessToken[] {
  try {
    const raw = window.localStorage.getItem(TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeStoredTokens(tokens: PersonalAccessToken[]): void {
  try {
    window.localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    /* private mode */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default preferences factory
// ═══════════════════════════════════════════════════════════════════════════

export function defaultPreferences(): UserPreferences {
  return {
    theme: 'dark',
    font: 'golos',
    locale: 'ru',
    density: 'standard',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Profile factory from AuthUser session
// ═══════════════════════════════════════════════════════════════════════════

function buildProfileFromSession(authUser: AuthUser): UserProfile {
  const role = roleOf(authUser) ?? 'user';
  const caps = computeCapabilities(role);
  const roleData = capsForRole(role);
  const now = new Date().toISOString();

  return {
    id: authUser,
    email: authUser,
    name: displayNameOf(authUser) || roleData.displayName,
    role,
    capabilities: caps,
    preferences: defaultPreferences(),
    createdAt: now,
    lastLoginAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Zustand Store
// ═══════════════════════════════════════════════════════════════════════════

interface UserProfileState {
  profile: UserProfile | null;
  tokens: PersonalAccessToken[];

  // Profile operations
  getProfile: () => UserProfile | null;
  refreshFromSession: () => UserProfile | null;
  updateProfile: (patch: Partial<Pick<UserProfile, 'name' | 'department' | 'avatarUrl'>>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  hasCapability: (cap: UserCapability) => boolean;

  // Token operations
  listTokens: () => PersonalAccessToken[];
  addToken: (token: PersonalAccessToken) => void;
  revokeToken: (id: string) => void;

  /** Сброс стора (тесты, logout). */
  _reset: () => void;
}

export const useUserProfile = create<UserProfileState>((set, get) => {
  // Bootstrap: localStorage first, fallback to session, finally null
  let initial: UserProfile | null = readStoredProfile();
  if (!initial) {
    const session = readSession();
    if (session) {
      initial = buildProfileFromSession(session);
      writeStoredProfile(initial);
    }
  }

  const initialTokens = readStoredTokens();

  return {
    profile: initial,
    tokens: initialTokens,

    getProfile: () => get().profile,

    refreshFromSession: () => {
      const session = readSession();
      if (!session) {
        set({ profile: null });
        return null;
      }
      const profile = buildProfileFromSession(session);
      writeStoredProfile(profile);
      set({ profile });
      return profile;
    },

    updateProfile: (patch) => {
      const current = get().profile;
      if (!current) return;
      const updated: UserProfile = { ...current, ...patch };
      writeStoredProfile(updated);
      set({ profile: updated });
    },

    updatePreferences: (prefs) => {
      const current = get().profile;
      if (!current) return;
      const updated: UserProfile = {
        ...current,
        preferences: { ...current.preferences, ...prefs },
      };
      writeStoredProfile(updated);
      set({ profile: updated });
    },

    hasCapability: (cap) => {
      const caps = get().profile?.capabilities ?? [];
      return caps.includes(cap);
    },

    listTokens: () => get().tokens,

    addToken: (token) => {
      const updated = [...get().tokens, token];
      writeStoredTokens(updated);
      set({ tokens: updated });
    },

    revokeToken: (id) => {
      const updated = get().tokens.filter((t) => t.id !== id);
      writeStoredTokens(updated);
      set({ tokens: updated });
    },

    _reset: () => {
      set({ profile: null, tokens: [] });
    },
  };
});