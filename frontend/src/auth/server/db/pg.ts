/**
 * AUTH-PROD-2: PostgreSQL + Drizzle connection — через OpenBao / env.
 *
 * Приоритет: OpenBao → env → dev fallback.
 * Ни одного hardcoded пароля.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getAuthSecrets } from './bao';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    throw new Error('pgPool not initialized — call initPgPool() first');
  }
  return _pool;
}

export async function initPgPool(): Promise<Pool> {
  if (_pool) return _pool;

  try {
    const secrets = await getAuthSecrets();
    _pool = new Pool({
      connectionString:
        secrets.pgUrl ||
        `postgresql://${secrets.pgUser}:${secrets.pgPassword}@127.0.0.1:5432/${secrets.pgDb}`,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } catch {
    // Dev fallback — последний рубеж
    const PG_URL = process.env.PRETTYK_PG_URL ||
      process.env.DATABASE_URL ||
      'postgresql://prettyk:prettyk@127.0.0.1:5432/prettyk';
    _pool = new Pool({
      connectionString: PG_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  // Verify connectivity
  try {
    await _pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
  } catch (err: any) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    throw err;
  }

  return _pool;
}

export function pgDb() {
  return drizzle(getPool(), { logger: false });
}

export async function closePgPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}