/**
 * AUTH-PROD-1: Drizzle ORM — PostgreSQL (заменяет better-sqlite3).
 *
 * Использует pg (node-postgres) через drizzle-orm/node-postgres.
 * Таблицы Better Auth создаются автоматически через drizzleAdapter.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool, initPgPool, closePgPool } from './pg';
export { initPgPool, closePgPool } from './pg';

let _drizzle: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  const pool = getPool();
  if (!_drizzle) {
    _drizzle = drizzle(pool, { logger: false });
  }
  return _drizzle;
}