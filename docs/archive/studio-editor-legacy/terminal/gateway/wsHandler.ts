/**
 * Terminal Gateway — WebSocket handler (data plane).
 *
 * Каждое WS-соединение = subscribe на вывод PTY + forward input в PTY.
 */
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { SessionManager } from './SessionManager';
import type { WsClientMessage } from './types';

export function createWsHandler(wss: WebSocketServer, sessions: SessionManager) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // Extract session ID from URL: /api/terminal/sessions/:id/ws
    const url = req.url ?? '';
    const match = url.match(/\/api\/terminal\/sessions\/([^/?]+)\/ws/);
    if (!match || !match[1]) {
      ws.close(4000, 'Missing session ID in URL');
      return;
    }

    const sessionId = match[1];
    const session = sessions.getSession(sessionId);
    if (!session) {
      ws.close(4001, 'Session not found');
      return;
    }

    console.log(`[terminal-gw] WS client connected to ${sessionId}`);

    // Heartbeat
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });
    const heartbeat = setInterval(() => {
      if (!isAlive) return ws.terminate();
      isAlive = false;
      ws.ping();
    }, 30_000);

    // Subscribe on PTY output
    const unsubscribe = sessions.subscribe(sessionId, (data: string) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    // Forward client → PTY
    ws.on('message', (raw) => {
      try {
        const msg: WsClientMessage = JSON.parse(raw.toString());

        if (msg.type === 'input' && msg.data) {
          sessions.writeToPty(sessionId, msg.data);
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          sessions.resize(sessionId, msg.cols, msg.rows);
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // Не JSON — raw ввод в PTY
        sessions.writeToPty(sessionId, raw.toString());
      }
    });

    // Send initial status
    ws.send(JSON.stringify({
      type: 'status',
      state: session.state,
      ttlRemaining: session.ttlRemainingMs,
      quota: session.quota,
    }));

    ws.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      console.log(`[terminal-gw] WS client disconnected from ${sessionId}`);
    });
  });
}