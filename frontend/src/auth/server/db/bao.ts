/**
 * AUTH-PROD-2: OpenBao secrets client.
 *
 * Читает auth-секреты из OpenBao KV v2 (dev mode).
 * Fallback: переменные окружения (для локальной разработки без OpenBao).
 */
import { Pool } from 'pg';

interface AuthSecrets {
  betterAuthSecret: string;
  sessionKey: string;
  pgUser: string;
  pgPassword: string;
  pgDb: string;
  pgUrl: string;
  adminEmail: string;
  adminPassword: string;
}

const BAO_URL = process.env.PRETTYK_BAO_URL || 'http://127.0.0.1:8200';
const BAO_TOKEN = process.env.PRETTYK_BAO_TOKEN || 'prettyk-bao-root-dev';
const BAO_PATH = 'prettyk/data/auth';

let cachedSecrets: AuthSecrets | null = null;

/** Читает секреты из OpenBao. При недоступности — env fallback. */
async function fetchBaoSecrets(): Promise<AuthSecrets | null> {
  try {
    const resp = await fetch(`${BAO_URL}/v1/${BAO_PATH}`, {
      headers: {
        'X-Vault-Token': BAO_TOKEN,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return null;

    const json = await resp.json();
    const data = json?.data?.data;
    if (!data) return null;

    return {
      betterAuthSecret: data.better_auth_secret || '',
      sessionKey: data.session_key || '',
      pgUser: data.pg_user || 'prettyk',
      pgPassword: data.pg_password || 'prettyk',
      pgDb: data.pg_db || 'prettyk',
      pgUrl: data.pg_url || '',
      adminEmail: data.admin_email || 'admin@prettyk.io',
      adminPassword: data.admin_password || 'admin123!',
    };
  } catch {
    return null;
  }
}

/** Получить секреты auth (cached). */
export async function getAuthSecrets(): Promise<AuthSecrets> {
  if (!cachedSecrets) {
    const bao = await fetchBaoSecrets();
    if (bao && bao.betterAuthSecret) {
      console.log('🔐 Secrets loaded from OpenBao');
      cachedSecrets = bao;
    } else {
      console.log('⚠️  OpenBao unavailable — using env fallback');
      cachedSecrets = {
        betterAuthSecret: process.env.BETTER_AUTH_SECRET || 'changeme-better-auth-secret-dev-only',
        sessionKey: process.env.SESSION_KEY || 'changeme-session-encryption-key-32b',
        pgUser: process.env.PRETTYK_PG_USER || 'prettyk',
        pgPassword: process.env.PRETTYK_PG_PASSWORD || 'prettyk',
        pgDb: process.env.PRETTYK_PG_DB || 'prettyk',
        pgUrl: process.env.PRETTYK_PG_URL || 'postgresql://prettyk:prettyk@127.0.0.1:5432/prettyk',
        adminEmail: process.env.ADMIN_EMAIL || 'admin@prettyk.io',
        adminPassword: process.env.ADMIN_PASSWORD || 'admin123!',
      };
    }
  }
  return cachedSecrets;
}

/** Создать PostgreSQL pool из секретов. */
export async function createPgPool(): Promise<Pool> {
  const secrets = await getAuthSecrets();
  return new Pool({
    connectionString: secrets.pgUrl || `postgresql://${secrets.pgUser}:${secrets.pgPassword}@127.0.0.1:5432/${secrets.pgDb}`,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}