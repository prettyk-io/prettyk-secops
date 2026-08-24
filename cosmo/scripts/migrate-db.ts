/**
 * SPIKE-B-1: Better Auth SQLite schema (full)
 *
 * Все колонки, которые ожидает Better Auth v1.7.1 + admin + username + apiKey + customSession.
 */
import Database from 'better-sqlite3';

async function main() {
  const db = new Database('./spike-auth.db');
  db.pragma('journal_mode = WAL');
  console.log('🔧 Creating Better Auth tables (full schema)...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      displayName TEXT,
      department TEXT,
      role TEXT DEFAULT 'user',
      preferences TEXT,
      banned INTEGER DEFAULT 0,
      twoFactorEnabled INTEGER DEFAULT 0,
      isAnonymous INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY NOT NULL,
      expiresAt TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      activeOrganizationId TEXT,
      impersonatedBy TEXT,
      sessionToken TEXT
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY NOT NULL,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      accessToken TEXT,
      refreshToken TEXT,
      idToken TEXT,
      accessTokenExpiresAt TEXT,
      refreshTokenExpiresAt TEXT,
      scope TEXT,
      password TEXT,
      issuer TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY NOT NULL,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS apikey (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      start TEXT,
      prefix TEXT,
      key TEXT NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      refillInterval INTEGER,
      refillAmount INTEGER,
      lastRefillAt TEXT,
      enabled INTEGER,
      rateLimitEnabled INTEGER,
      rateLimitTimeWindow INTEGER,
      rateLimitMax INTEGER,
      requestCount INTEGER,
      remaining INTEGER,
      lastRequest TEXT,
      expiresAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
    CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
    CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
    CREATE INDEX IF NOT EXISTS idx_apikey_userId ON apikey(userId);
    CREATE INDEX IF NOT EXISTS idx_apikey_key ON apikey(key);
  `);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
  console.log('✅ Tables:', tables.map(t => t.name).join(', '));

  // Show columns for verification
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[];
    console.log(`   ${t.name}: ${cols.map(c => c.name).join(', ')}`);
  }

  db.close();
}

main();