/** SPIKE-F: Better Auth client adapter for Profile Drawer & admin panels.
 *
 * Surface: same typed API whether backend is live or not.
 * When Boss ships SPIKE-B-1, swap the fetch URL from localhost stub
 * to the real endpoint.  No UI code changes needed.
 */
import type { UserProfile, UserPreferences, PersonalAccessToken, UserCapability } from './useProfileStore';

// ── Stub backend (remove when Boss SPIKE-B-1 is live) ──
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://127.0.0.1:8767/api/auth'  // Live shell proxy
  : '/api/auth';

// ── Session cache ──
let _cachedSession: UserProfile | null = null;
let _sessionLoaded = false;

async function _fetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Public API (mirrors Better Auth surface) ──

export const authClient = {
  /** Get the current server-side session. Falls back to localStorage profile on cold start. */
  async getSession(): Promise<{ user: UserProfile } | null> {
    if (_sessionLoaded) {
      return _cachedSession ? { user: { ..._cachedSession } } : null;
    }
    // Try server first
    const fromServer = await _fetch<{ user: UserProfile }>('/session');
    if (fromServer?.user) {
      _cachedSession = fromServer.user;
      _sessionLoaded = true;
      return fromServer;
    }
    // Fallback: localStorage (existing useProfileStore data)
    try {
      const raw = localStorage.getItem('pk.profile.v1');
      if (raw) {
        _cachedSession = JSON.parse(raw) as UserProfile;
        _sessionLoaded = true;
        return { user: { ..._cachedSession } };
      }
    } catch { /* ignore */ }
    _sessionLoaded = true;
    return null;
  },

  /** Update the current user profile (name, email, department). */
  async updateUser(patch: Partial<Pick<UserProfile, 'name' | 'email' | 'department'>>): Promise<{ ok: boolean }> {
    const fromServer = await _fetch<{ ok: boolean }>('/user', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (fromServer?.ok) {
      if (_cachedSession) {
        _cachedSession = { ..._cachedSession, ...patch };
        localStorage.setItem('pk.profile.v1', JSON.stringify(_cachedSession));
      }
      return { ok: true };
    }
    // localStorage fallback
    if (_cachedSession) {
      _cachedSession = { ..._cachedSession, ...patch };
      localStorage.setItem('pk.profile.v1', JSON.stringify(_cachedSession));
    }
    return { ok: true };
  },

  /** Save preferences to user metadata. */
  async savePreferences(prefs: UserPreferences): Promise<{ ok: boolean }> {
    const fromServer = await _fetch<{ ok: boolean }>('/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
    if (fromServer?.ok) {
      if (_cachedSession) {
        _cachedSession = { ..._cachedSession, preferences: prefs };
        localStorage.setItem('pk.profile.v1', JSON.stringify(_cachedSession));
      }
      return { ok: true };
    }
    // localStorage fallback
    if (_cachedSession) {
      _cachedSession = { ..._cachedSession, preferences: prefs };
      localStorage.setItem('pk.profile.v1', JSON.stringify(_cachedSession));
    }
    return { ok: true };
  },

  // ── API Keys (PAT → Better Auth API Key plugin) ──

  apiKey: {
    async list(): Promise<{ keys: PersonalAccessToken[] }> {
      const fromServer = await _fetch<{ keys: PersonalAccessToken[] }>('/api-keys');
      if (fromServer?.keys) return fromServer;
      // localStorage fallback
      try {
        const raw = localStorage.getItem('pk.tokens.v1');
        return { keys: raw ? (JSON.parse(raw) as PersonalAccessToken[]) : [] };
      } catch {
        return { keys: [] };
      }
    },

    async create(opts: { name: string; expiresIn: number | null; scopes: UserCapability[] }): Promise<{ key: PersonalAccessToken; rawToken: string } | null> {
      const fromServer = await _fetch<{ key: PersonalAccessToken; rawToken: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify(opts),
      });
      if (fromServer) return fromServer;
      // localStorage fallback — generate a fake key
      const id = `tok-${Date.now()}`;
      const hex = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const mask = `pk_live_${hex.slice(0, 4)}****${hex.slice(-4)}`;
      const rawToken = `pk_live_${hex}`;
      const key: PersonalAccessToken = {
        id,
        name: opts.name,
        tokenMasked: mask,
        scopes: opts.scopes,
        createdAt: new Date().toISOString(),
        expiresAt: opts.expiresIn ? new Date(Date.now() + opts.expiresIn * 86400000).toISOString() : null,
        lastUsedAt: null,
      };
      // Persist in localStorage
      try {
        const raw = localStorage.getItem('pk.tokens.v1');
        const tokens: PersonalAccessToken[] = raw ? JSON.parse(raw) : [];
        tokens.push(key);
        localStorage.setItem('pk.tokens.v1', JSON.stringify(tokens));
      } catch { /* ignore */ }
      return { key, rawToken };
    },

    async delete(id: string): Promise<{ ok: boolean }> {
      const fromServer = await _fetch<{ ok: boolean }>(`/api-keys/${id}`, { method: 'DELETE' });
      if (fromServer?.ok) return { ok: true };
      // localStorage fallback
      try {
        const raw = localStorage.getItem('pk.tokens.v1');
        if (raw) {
          const tokens: PersonalAccessToken[] = JSON.parse(raw);
          localStorage.setItem('pk.tokens.v1', JSON.stringify(tokens.filter((t) => t.id !== id)));
        }
      } catch { /* ignore */ }
      return { ok: true };
    },
  },

  /** Change the current user's password. */
  async changePassword(currentPassword: string, newPassword: string, revokeOtherSessions = true): Promise<{ ok: boolean; error?: string }> {
    const fromServer = await _fetch<{ ok: boolean; error?: string }>('/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions }),
    });
    if (fromServer) return fromServer;
    return { ok: false, error: 'Server unavailable' };
  },

  /** Invalidate the cached session (after logout). */
  clearSession() {
    _cachedSession = null;
    _sessionLoaded = false;
  },
};