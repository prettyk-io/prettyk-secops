/**
 * Terminal Gateway Server — entry point.
 *
 * REST:  /api/terminal/sessions
 * WS:    /api/terminal/sessions/:id/ws
 *
 * Запуск: npx tsx terminal-gateway.ts
 * Порт:   3002
 * Vite проксирует /api/terminal → :3002
 */
import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';
import { WebSocketServer } from 'ws';
import { SessionManager } from './src/terminal/gateway/SessionManager';
import { createWsHandler } from './src/terminal/gateway/wsHandler';
import type { CreateSessionRequest, ExecRequest } from './src/terminal/gateway/types';

const PORT = 3002;

// Инициализация
const sessions = new SessionManager();

// HTTP + WS на одном порту
const httpServer = createServer(async (req, res) => {
  const url = parseUrl(req.url ?? '/', true);
  const path = url.pathname ?? '/';
  const method = req.method ?? 'GET';

  // CORS для Vite dev server
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── REST API ──

  // Health
  if (path === '/api/terminal/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: 'gateway-v1', sessions: sessions.listSessions().length }));
    return;
  }

  // POST /api/terminal/sessions — create
  if (path === '/api/terminal/sessions' && method === 'POST') {
    const body = await readBody<CreateSessionRequest>(req);
    const result = sessions.createSession(body);
    res.writeHead(result.ok ? 201 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/terminal/sessions — list
  if (path === '/api/terminal/sessions' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions.listSessions()));
    return;
  }

  // GET /api/terminal/sessions/:id — info
  const infoMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)$/);
  if (infoMatch && method === 'GET') {
    const info = sessions.getSession(infoMatch[1]!);
    if (!info) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info));
    return;
  }

  // POST /api/terminal/sessions/:id/attach — reconnect
  const attachMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/attach$/);
  if (attachMatch && method === 'POST') {
    const info = sessions.attachSession(attachMatch[1]!);
    if (!info) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found or terminated' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info));
    return;
  }

  // POST /api/terminal/sessions/:id/exec — one-shot
  const execMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/exec$/);
  if (execMatch && method === 'POST') {
    const body = await readBody<ExecRequest>(req);
    const result = sessions.execCommand(execMatch[1]!, body);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // POST /api/terminal/sessions/:id/stop
  const stopMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/stop$/);
  if (stopMatch && method === 'POST') {
    const result = sessions.stop(stopMatch[1]!);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // POST /api/terminal/sessions/:id/kill
  const killMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/kill$/);
  if (killMatch && method === 'POST') {
    const result = sessions.kill(killMatch[1]!);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/terminal/sessions/:id/quota
  const quotaMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/quota$/);
  if (quotaMatch && method === 'GET') {
    const quota = sessions.getQuota(quotaMatch[1]!);
    if (!quota) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(quota));
    return;
  }

  // GET /api/terminal/sessions/:id/audit
  const auditMatch = path.match(/^\/api\/terminal\/sessions\/([^/]+)\/audit$/);
  if (auditMatch && method === 'GET') {
    if (!sessions.getSession(auditMatch[1]!)) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions.getAudit(auditMatch[1]!)));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket — upgrade на том же сервере
const wss = new WebSocketServer({ server: httpServer });
createWsHandler(wss, sessions);

// Старт
httpServer.listen(PORT, () => {
  console.log(`\n 🔌 Terminal Gateway → http://localhost:${PORT}/api/terminal`);
  console.log(`    Health: http://localhost:${PORT}/api/terminal/health`);
  console.log(`    Sessions: POST http://localhost:${PORT}/api/terminal/sessions`);
  console.log(`    WS: ws://localhost:${PORT}/api/terminal/sessions/:id/ws\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => { sessions.destroy(); httpServer.close(); });
process.on('SIGINT', () => { sessions.destroy(); httpServer.close(); process.exit(0); });

// ── Helpers ──

function readBody<T = unknown>(req: Parameters<Parameters<typeof createServer>[0]>[0]): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}