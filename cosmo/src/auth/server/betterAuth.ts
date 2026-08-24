/**
 * SPIKE-B-1: Better Auth Server Configuration
 *
 * Email/password + sessions + SQLite (прямой better-sqlite3).
 * Таблицы создаются скриптом scripts/migrate-db.ts перед запуском.
 */
import { betterAuth } from 'better-auth';
import { admin, username, customSession } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import Database from 'better-sqlite3';

const db = new Database('./spike-auth.db');
db.pragma('journal_mode = WAL');

export const auth = betterAuth({
  baseURL: 'http://localhost:3001',
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60,
    },
    expiresIn: 7 * 24 * 60 * 60,
  },
  user: {
    additionalFields: {
      displayName: { type: 'string', required: false },
      department: { type: 'string', required: false },
      role: { type: 'string', required: false },
      preferences: { type: 'string', required: false },
    },
  },
  plugins: [
    admin({ defaultRole: 'user', adminRole: 'admin' }),
    username(),
    apiKey({
      defaultPrefix: 'pk_live_',
      enableMetadata: true,
      keyExpiration: {
        defaultExpiresIn: null,
        disableCustomExpiresTime: false,
        minExpiresIn: 1,
        maxExpiresIn: 365,
      },
    }),
    customSession(async ({ user, session }) => {
      const role = (user as any).role ?? 'user';
      const caps = computeCapabilitiesFromRole(role);
      return {
        capabilities: caps,
        role,
        displayName: (user as any).displayName ?? user.name ?? user.email,
        preferences: parsePreferences((user as any).preferences),
      };
    }),
  ],
  trustedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
});

export default auth;

// ═══════ Helpers ═══════
import type { UserCapability, UserPreferences } from '../profileStore';

function computeCapabilitiesFromRole(role: string): UserCapability[] {
  const map: Record<string, UserCapability[]> = {
    admin_sec: ['admin:access','control:access','checks:create','checks:import','checks:delete','fuzzer:execute','policies:manage','retention:clean','tokens:manage'],
    admin_service: ['control:access','retention:clean','tokens:manage'],
    sec_expert: ['checks:create','checks:import','fuzzer:execute','tokens:manage'],
    admin: ['admin:access','control:access','checks:create','checks:import','checks:delete','fuzzer:execute','policies:manage','retention:clean','tokens:manage'],
    user: ['checks:create'],
  };
  return map[role] ?? ['checks:create'];
}

function parsePreferences(raw: string | null | undefined): UserPreferences {
  const d: UserPreferences = { theme: 'dark', font: 'golos', locale: 'ru', density: 'standard' };
  if (!raw) return d;
  try { return { ...d, ...JSON.parse(raw) }; } catch { return d; }
}

declare module 'better-auth' {
  interface BetterAuthSession {
    capabilities?: UserCapability[];
    role?: string;
    displayName?: string;
    preferences?: UserPreferences;
  }
}