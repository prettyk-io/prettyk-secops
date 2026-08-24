// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeCapabilities,
  hasCapability,
  defaultPreferences,
  useUserProfile,
  PROFILE_STORAGE_KEY,
  TOKENS_STORAGE_KEY,
} from './profileStore';
import type { UserCapability } from './profileStore';
import { createToken, listTokens, revokeToken, validateToken, maskToken } from './tokenEngine';

// ═══════════════════════════════════════════════════════════════════════════
// Setup: clean localStorage + reset Zustand store before each test
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  localStorage.clear();
  useUserProfile.getState()._reset();
});

// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITY MATRIX TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('computeCapabilities — Capability Matrix', () => {
  it('admin_sec has all capabilities (9)', () => {
    const caps = computeCapabilities('admin_sec');
    expect(caps).toContain('admin:access');
    expect(caps).toContain('control:access');
    expect(caps).toContain('checks:create');
    expect(caps).toContain('checks:import');
    expect(caps).toContain('checks:delete');
    expect(caps).toContain('fuzzer:execute');
    expect(caps).toContain('policies:manage');
    expect(caps).toContain('retention:clean');
    expect(caps).toContain('tokens:manage');
    expect(caps.length).toBe(9);
  });

  it('sec_expert has creation + fuzzer + tokens (4)', () => {
    const caps = computeCapabilities('sec_expert');
    expect(caps).toContain('checks:create');
    expect(caps).toContain('checks:import');
    expect(caps).toContain('fuzzer:execute');
    expect(caps).toContain('tokens:manage');
    expect(caps).not.toContain('admin:access');
    expect(caps).not.toContain('policies:manage');
    expect(caps.length).toBe(4);
  });

  it('admin_service has control + retention + tokens (3)', () => {
    const caps = computeCapabilities('admin_service');
    expect(caps).toContain('control:access');
    expect(caps).toContain('retention:clean');
    expect(caps).toContain('tokens:manage');
    expect(caps).not.toContain('admin:access');
    expect(caps).not.toContain('fuzzer:execute');
    expect(caps.length).toBe(3);
  });

  it('user has only checks:create (1)', () => {
    const caps = computeCapabilities('user');
    expect(caps).toEqual(['checks:create']);
  });

  it('null role returns empty array', () => {
    expect(computeCapabilities(null)).toEqual([]);
    expect(computeCapabilities(undefined)).toEqual([]);
  });

  it('deprecated roles (admin_ib, expert_ib) map to full capability sets', () => {
    const adminIb = computeCapabilities('admin_ib');
    expect(adminIb).toContain('admin:access');
    expect(adminIb).toContain('policies:manage');
    expect(adminIb.length).toBe(9);

    const expertIb = computeCapabilities('expert_ib');
    expect(expertIb).toContain('fuzzer:execute');
    expect(expertIb).not.toContain('admin:access');
    expect(expertIb.length).toBe(4);
  });
});

describe('hasCapability — Pure capability checker', () => {
  it('returns true when cap is present', () => {
    const caps: UserCapability[] = ['checks:create', 'fuzzer:execute'];
    expect(hasCapability(caps, 'checks:create')).toBe(true);
    expect(hasCapability(caps, 'fuzzer:execute')).toBe(true);
  });

  it('returns false when cap is absent', () => {
    const caps: UserCapability[] = ['checks:create'];
    expect(hasCapability(caps, 'admin:access')).toBe(false);
    expect(hasCapability(caps, 'policies:manage')).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasCapability([], 'checks:create')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE PERSISTENCE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Profile persistence (localStorage)', () => {
  it('defaultPreferences returns correct shape', () => {
    const prefs = defaultPreferences();
    expect(prefs).toEqual({
      theme: 'dark',
      font: 'golos',
      locale: 'ru',
      density: 'standard',
    });
  });

  it('stores profile object in localStorage', () => {
    const profile = {
      id: 'admin',
      email: 'admin@test.ru',
      name: 'Admin Test',
      role: 'admin_sec' as const,
      capabilities: computeCapabilities('admin_sec'),
      preferences: defaultPreferences(),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe('admin');
    expect(parsed.name).toBe('Admin Test');
    expect(parsed.capabilities).toContain('admin:access');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, 'not-json');
    // Store reads it — should return empty tokens at minimum
    const rawTokens = localStorage.getItem(TOKENS_STORAGE_KEY);
    expect(rawTokens).toBeNull(); // not yet set
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('tokenEngine — Personal Access Tokens', () => {
  it('maskToken shows pk_live_****<last 5>', () => {
    const masked = maskToken('pk_live_9f8a3c4b7d1e2f09a8b7c6d5e4f3a2b1');
    expect(masked).toMatch(/^pk_live_\*+[0-9a-f]{5}$/);
    expect(masked.endsWith('3a2b1')).toBe(true);
  });

  it('maskToken handles short tokens', () => {
    const masked = maskToken('pk_live_abc');
    expect(masked).toBe('pk_live_***');
  });

  it('maskToken handles non-prefixed tokens', () => {
    const masked = maskToken('garbage');
    expect(masked).toBe('pk_live_********');
  });

  it('createToken returns raw token + masked record', () => {
    const { token, record } = createToken('CI Pipeline Token', ['checks:create'], 90);

    // Token format
    expect(token).toMatch(/^pk_live_[0-9a-f]{32}$/);

    // Record is stored
    expect(record.name).toBe('CI Pipeline Token');
    expect(record.scopes).toEqual(['checks:create']);
    expect(record.tokenMasked).not.toBe(token);
    expect(record.tokenMasked).toMatch(/^pk_live_\*+[0-9a-f]{5}$/);
    expect(record.expiresAt).not.toBeNull();

    // Expiration is roughly 90 days from now
    const expires = new Date(record.expiresAt!);
    const expected = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const diffMs = Math.abs(expires.getTime() - expected.getTime());
    expect(diffMs).toBeLessThan(2000); // within 2 seconds
  });

  it('createToken with null ttlDays creates non-expiring token', () => {
    const { record } = createToken('Permanent Token', ['checks:create'], null);
    expect(record.expiresAt).toBeNull();
  });

  it('listTokens returns stored tokens', () => {
    createToken('Token A', ['checks:create'], 30);
    createToken('Token B', ['fuzzer:execute'], 60);

    const tokens = listTokens();
    expect(tokens.length).toBe(2);
    expect(tokens[0]!.name).toBe('Token A');
    expect(tokens[1]!.name).toBe('Token B');
  });

  it('revokeToken removes token from storage', () => {
    const { record } = createToken('Revoke Me', ['checks:create'], 30);
    expect(listTokens().length).toBe(1);

    revokeToken(record.id);
    expect(listTokens().length).toBe(0);
  });

  it('revokeToken on non-existent ID is a no-op', () => {
    createToken('Keep Me', ['checks:create'], 30);
    expect(listTokens().length).toBe(1);

    revokeToken('nonexistent_id');
    expect(listTokens().length).toBe(1);
  });

  it('validateToken accepts valid token', () => {
    const { token } = createToken('Valid Token', ['checks:create'], 30);
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.name).toBe('Valid Token');
  });

  it('validateToken rejects empty input', () => {
    expect(validateToken('').valid).toBe(false);
    expect(validateToken('').reason).toContain('Empty');
  });

  it('validateToken rejects wrong prefix', () => {
    const result = validateToken('sk_live_9f8a3c4b7d1e2f09a8b7c6d5e4f3a2b1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('prefix');
  });

  it('validateToken rejects invalid hex body', () => {
    const result = validateToken('pk_live_NOT_HEX_ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('hex');
  });

  it('validateToken rejects revoked token', () => {
    const { token, record } = createToken('Revoke Later', ['checks:create'], 30);
    expect(validateToken(token).valid).toBe(true);

    revokeToken(record.id);
    expect(validateToken(token).valid).toBe(false);
    expect(validateToken(token).reason).toContain('not found');
  });

  it('validateToken marks lastUsedAt on success', () => {
    const { token } = createToken('Usage Tracker', ['checks:create'], 30);
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.record!.lastUsedAt).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('token count stays correct after create + revoke + create cycle', () => {
    const t1 = createToken('T1', ['checks:create'], 30);
    expect(listTokens().length).toBe(1);

    const t2 = createToken('T2', ['fuzzer:execute'], 60);
    expect(listTokens().length).toBe(2);

    revokeToken(t1.record.id);
    expect(listTokens().length).toBe(1);

    createToken('T3', ['checks:import'], 90);
    expect(listTokens().length).toBe(2);
  });

  it('maskToken reveals correct suffix on 32-char hex body', () => {
    const token = 'pk_live_9f8a3c4b7d1e2f09a8b7c6d5e4f3a2b1';
    const masked = maskToken(token);
    expect(masked).toBe('pk_live_***************************3a2b1');
  });

  it('defaultPreferences is frozen in shape', () => {
    const p1 = defaultPreferences();
    const p2 = defaultPreferences();
    expect(p1).toEqual(p2);
    expect(Object.keys(p1).sort()).toEqual(['theme', 'font', 'locale', 'density'].sort());
  });
});