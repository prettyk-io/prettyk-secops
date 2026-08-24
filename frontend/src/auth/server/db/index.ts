/**
 * SPIKE-B-1: Drizzle ORM database layer for Better Auth.
 *
 * Использует better-sqlite3 + drizzle-orm — рекомендуемый стек better-auth.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('./spike-auth.db');
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite);
export default db;