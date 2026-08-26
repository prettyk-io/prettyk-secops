/**
 * AUTH-PROD: Auth Server Entry Point (bare Node.js HTTP)
 *
 * Запуск: npx tsx auth-server.ts / npm run dev:auth
 * Порт: 3001
 * Vite проксирует /api/auth → localhost:3001/api/auth
 *
 * Возможности:
 *   - PostgreSQL (drizzle-orm). SQLite (spike-auth.db) — удалён.
 *   - Миграции — автоматически через drizzleAdapter.
 *   - 2FA (TOTP) — плагин twoFactor.
 *   - Email verification — опционально (EMAIL_VERIFICATION=true).
 *   - Rate limiting — sliding window на sign-in/sign-up.
 *   - Секреты: OpenBao → env → dev fallback.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { toNodeHandler } from 'better-auth/node';
import { initAuth, getAuth } from './src/auth/server/betterAuth';
import { initPgPool } from './src/auth/server/db/pg';
import { getAuthSecrets } from './src/auth/server/db/bao';
import { checkRateLimit, clientIp } from './src/auth/server/rateLimit';

const port = parseInt(process.env.AUTH_PORT || '3001', 10);

/** Rate-limit critical auth endpoints */
function applyRateLimit(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url || '';

  // Rate-limit sign-in/sign-up/forgot-password
  const isAuthCritical =
    url.includes('/sign-in') ||
    url.includes('/sign-up') ||
    url.includes('/forget-password') ||
    url.includes('/reset-password');

  if (!isAuthCritical) return true;

  const ip = clientIp(req);
  const key = `auth:${ip}:${req.method}`;
  const result = checkRateLimit(key, { windowMs: 60_000, max: 10 });

  // Заголовки для клиента
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'too_many_requests',
      message: 'Слишком много запросов. Попробуйте через минуту.',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    }));
    return false;
  }

  return true;
}

async function main() {
  console.log('🔐 Starting PrettyK Auth Server (PostgreSQL)...\n');

  // Step 1: Load secrets (OpenBao → env)
  const secrets = await getAuthSecrets();
  console.log(`   Secrets source: ${process.env.PRETTYK_BAO_TOKEN ? 'OpenBao' : 'env fallback'}`);

  // Step 2: Initialize PostgreSQL connection
  const pool = await initPgPool();

  // Step 3: Initialize Better Auth
  const auth = await initAuth(pool, secrets.betterAuthSecret);
  console.log('   Better Auth: PostgreSQL + 2FA + rate limiting\n');

  // Step 4: Start HTTP server
  const server = createServer(async (req, res) => {
    // Rate limiting на критические эндпоинты
    if (!applyRateLimit(req, res)) return;

    // Health check
    if (req.url === '/api/auth/health') {
      try {
        await pool.query('SELECT 1');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          db: 'postgresql',
          secrets: process.env.PRETTYK_BAO_TOKEN ? 'openbao' : 'env',
          twoFactor: true,
          emailVerify: process.env.EMAIL_VERIFICATION === 'true',
          version: 'auth-prod-v1',
        }));
      } catch (err: any) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'degraded',
          db: 'unavailable',
          error: err.message,
          version: 'auth-prod-v1',
        }));
      }
      return;
    }

    // Seed admin endpoint
    if (req.method === 'POST' && req.url === '/api/auth/seed-admin') {
      try {
        await auth.api.signUpEmail({
          body: {
            email: secrets.adminEmail,
            password: secrets.adminPassword,
            name: 'Boss Admin',
          },
          headers: new Headers({ 'Content-Type': 'application/json' }),
          query: {},
        } as any);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'created', email: secrets.adminEmail }));
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('unique')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'exists', email: secrets.adminEmail }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', error: msg }));
        }
      }
      return;
    }

    // Better Auth handles all /api/auth/* routes
    const handler = toNodeHandler(auth);
    await handler(req, res);
  });

  server.listen(port, () => {
    console.log(` 🔐 Better Auth (PostgreSQL) → http://localhost:${port}/api/auth`);
    console.log(`    Health:   http://localhost:${port}/api/auth/health`);
    console.log(`    Seed:     POST http://localhost:${port}/api/auth/seed-admin`);
    console.log(`    2FA:      TOTP (Google Authenticator / Aegis)`);
    console.log(`    Rate:     10 req/min per IP (sign-in/sign-up)`);
    console.log(`    Email:    ${process.env.EMAIL_VERIFICATION === 'true' ? 'verification enabled' : 'dev-only (log to console)'}\n`);
  });
}

main().catch((err) => {
  console.error('❌ Auth server failed to start:', err);
  process.exit(1);
});