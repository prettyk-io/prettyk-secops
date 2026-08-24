/** AUTH-PROF: Reactive user profile store — single source for identity, preferences, and tokens. */
import { create } from 'zustand';
import { authClient } from './betterAuthClient';

// ── Types ──

export type UserCapability =
  | 'admin:access' | 'control:access' | 'checks:create' | 'checks:import'
  | 'checks:delete' | 'fuzzer:execute' | 'policies:manage' | 'retention:clean'
  | 'tokens:manage' | 'dojo:sync' | 'studio:edit';

export type ProfileTheme = 'dark' | 'light' | 'system';
export type ProfileFont = 'golos' | 'astra' | 'inter';
export type ProfileLocale = 'ru' | 'en';

export interface UserPreferences {
  theme: ProfileTheme;
  font: ProfileFont;
  locale: ProfileLocale;
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
  role: string;
  department: string;
  avatarUrl: string | null;
  capabilities: UserCapability[];
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt: string;
}

// ── Seed helpers ──

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
}

function defaultProfile(): UserProfile {
  return {
    id: 'user-1',
    email: 'admin-sec@prettyk.io',
    name: 'Администратор ИБ',
    role: 'admin_sec',
    department: 'Отдел информационной безопасности',
    avatarUrl: null,
    capabilities: ['admin:access', 'control:access', 'checks:create', 'checks:import', 'checks:delete', 'fuzzer:execute', 'policies:manage', 'retention:clean', 'tokens:manage', 'dojo:sync', 'studio:edit'],
    preferences: { theme: 'dark', font: 'golos', locale: 'ru', density: 'standard' },
    createdAt: '2026-08-01T00:00:00Z',
    lastLoginAt: new Date().toISOString(),
  };
}

function seedTokens(): PersonalAccessToken[] {
  return [
    { id: 'tok-1', name: 'CI/CD Pipeline — Juice Shop', tokenMasked: 'pk_live_br4a****3a8f', scopes: ['checks:create', 'checks:import'], createdAt: '2026-08-20T10:00:00Z', expiresAt: '2026-11-20T10:00:00Z', lastUsedAt: '2026-08-22T14:22:00Z' },
    { id: 'tok-2', name: 'Automation Script — Bank Gateway', tokenMasked: 'pk_live_5x9q****7c2e', scopes: ['checks:create', 'fuzzer:execute'], createdAt: '2026-08-15T08:30:00Z', expiresAt: null, lastUsedAt: '2026-08-21T09:15:00Z' },
  ];
}

// ── Store ──

export interface ProfileStore {
  profile: UserProfile;
  tokens: PersonalAccessToken[];
  drawerOpen: boolean;
  /** Server sync — pull profile + tokens from Better Auth. */
  syncFromServer: () => Promise<void>;
  /** Push profile name/email/dept to server + update local */
  saveProfile: (patch: Partial<Pick<UserProfile, 'name' | 'email' | 'department'>>) => Promise<void>;
  /** Push preferences to server metadata + update local */
  savePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  setProfile: (patch: Partial<UserProfile>) => void;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  setTokens: (tokens: PersonalAccessToken[]) => void;
  addToken: (token: PersonalAccessToken) => void;
  revokeToken: (id: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: defaultProfile(),
  tokens: seedTokens(),
  drawerOpen: false,

  syncFromServer: async () => {
    const session = await authClient.getSession();
    if (session?.user) {
      const { keys } = await authClient.apiKey.list();
      set({ profile: session.user, tokens: keys });
    }
  },

  saveProfile: async (patch) => {
    await authClient.updateUser(patch);
    set((s) => ({ profile: { ...s.profile, ...patch } }));
  },

  savePreferences: async (prefs) => {
    const merged = { ...get().profile.preferences, ...prefs };
    await authClient.savePreferences(merged);
    set((s) => ({ profile: { ...s.profile, preferences: merged } }));
  },

  setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  setPreferences: (prefs) => set((s) => ({ profile: { ...s.profile, preferences: { ...s.profile.preferences, ...prefs } } })),
  setTokens: (tokens) => set({ tokens }),
  addToken: (token) => set((s) => ({ tokens: [...s.tokens, token] })),
  revokeToken: (id) => set((s) => ({ tokens: s.tokens.filter((t) => t.id !== id) })),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
}));