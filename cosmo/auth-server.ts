/**
 * SPIKE-B-1: Auth Server Entry Point (bare Node.js HTTP)
 *
 * Запуск: npx tsx auth-server.ts
 * Порт: 3001
 * Vite проксирует /api/auth → localhost:3001/api/auth
 */
import { createServer } from 'node:http';
import { auth } from './src/auth/server/betterAuth';
import { toNodeHandler } from 'better-auth/node';

const port = 3001;

const server = createServer(async (req, res) => {
  // Health check
  if (req.url === '/api/auth/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: 'spike-v1' }));
    return;
  }

  // Better Auth handles all /api/auth/* routes
  const handler = toNodeHandler(auth);
  await handler(req, res);
});

server.listen(port, () => {
  console.log(`\n 🔐 Better Auth server → http://localhost:${port}/api/auth`);
  console.log(`    Health: http://localhost:${port}/api/auth/health\n`);
});