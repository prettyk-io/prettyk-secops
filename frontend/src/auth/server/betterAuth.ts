/**
 * AUTH-PROD: Better Auth Server Configuration — PostgreSQL.
 *
 * Email/password + 2FA (TOTP) + email verification + rate limiting.
 * Миграции выполняются автоматически через drizzleAdapter.
 *
 * База: PostgreSQL. SQLite (spike-auth.db) — удалён.
 * Секреты: OpenBao (приоритет) → env → dev fallback.
 */
import { betterAuth } from 'better-auth';
import { admin, username, customSession } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Pool } from 'pg';

let _auth: any = null;

export async function initAuth(pool: Pool, secret: string) {
  if (_auth) return _auth;

  // Drizzle ORM over PostgreSQL
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const db = drizzle(pool, { logger: false });

  // Email verification — enabled when SMTP configured
  const emailVerifyEnabled = process.env.EMAIL_VERIFICATION === 'true';

  _auth = betterAuth({
    baseURL: process.env.AUTH_BASE_URL || 'http://localhost:3001',
    secret,
    database: drizzleAdapter(db, { provider: 'pg' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: emailVerifyEnabled,
      // Dev-only: лог в консоль (заменить на SMTP/Resend в production)
      sendVerificationEmail: async (ctx: { user: { email: string }; url: string }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`\n📧 [DEV] Verification email for ${ctx.user.email}:`);
          console.log(`   ${ctx.url}\n`);
        }
        // TODO: SMTP/Resend integration for production
      },
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
        role: { type: 'string', defaultValue: 'user' },
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
      twoFactor({
        issuer: 'PrettyK',
      }),
      customSession(async ({ user }) => {
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

  return _auth;
}

export function getAuth() {
  if (!_auth) throw new Error('Auth not initialized — call initAuth() first');
  return _auth;
}

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