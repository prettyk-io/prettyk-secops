/**
 * PK-TRM-1/3: Terminal Session Client — typed WS + REST contract.
 *
 * Boss контракт: WebSocket duplex для PTY, REST для lifecycle.
 * Сейчас — зашита локальная WS-заглушка (демо без бэка).
 * Когда gateway готов — заменить wsUrl на реальный эндпоинт.
 */
import type { RunRecord } from '../ci/types';

// ── Типы (зеркало Boss-контракта) ──

export type TerminalMode = 'workspace' | 'run-console';

export type TerminalState = 'connected' | 'reconnecting' | 'expired' | 'terminated';

export interface TerminalSession {
  session_id: string;
  ws_url: string;
  ttl: number;        // seconds
  mode: TerminalMode;
  state: TerminalState;
  ttl_remaining: number;
  quota?: TerminalQuota;
  run_id?: string;    // only for run-console mode
}

export interface TerminalQuota {
  cpu_percent: number;
  mem_mb: number;
  disk_mb: number;
  pids: number;
}

export interface TerminalAuditEntry {
  command: string;    // redacted
  risk: string;
  started_at: string;
  finished_at?: string;
  exit_code?: number;
}

// ── WS message types ──

export type WsClientMsg =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ping' };

export type WsServerMsg =
  | { type: 'output'; data: string }
  | { type: 'status'; state: string; ttl_remaining: number }
  | { type: 'quota'; cpu: number; mem: number; disk: number; pids: number }
  | { type: 'exit'; code: number }
  | { type: 'pong' };

// ── REST client (HTTP → lifecycle) ──

const API = '/api/terminal/sessions';

async function _post<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function _get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface TerminalClient {
  /** Создать сессию (REST). */
  create: (mode: TerminalMode, runId?: string) => Promise<TerminalSession | null>;
  /** Получить состояние сессии. */
  get: (id: string) => Promise<TerminalSession | null>;
  /** One-shot exec (Structured Console). */
  exec: (id: string, command: string, confirmed?: boolean) => Promise<{ ok: boolean; output?: string; error?: string } | null>;
  /** Stop (SIGTERM). */
  stop: (id: string) => Promise<boolean>;
  /** Kill (SIGKILL). */
  kill: (id: string) => Promise<boolean>;
  /** Resize терминала. */
  resize: (id: string, cols: number, rows: number) => Promise<boolean>;
  /** Текущие квоты. */
  quota: (id: string) => Promise<TerminalQuota | null>;
  /** Аудит команд. */
  audit: (id: string) => Promise<TerminalAuditEntry[]>;
  /** WebSocket URL для data-plane (attach). */
  wsUrl: (id: string) => string;
}

/**
 * Создаёт клиент терминала.
 * Пока — с локальной заглушкой WS.
 * Когда Boss поднимет gateway — передать `wsBase`.
 */
export function createTerminalClient(wsBase?: string): TerminalClient {
  const base = wsBase ?? `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost'}/api/terminal`;

  return {
    create: async (mode, runId?) => _post(API, { mode, run_id: runId }),
    get: async (id) => _get(`${API}/${id}`),
    exec: async (id, command, confirmed) => _post(`${API}/${id}/exec`, { command, confirmed }),
    stop: async (id) => !!(await _post(`${API}/${id}/stop`)),
    kill: async (id) => !!(await _post(`${API}/${id}/kill`)),
    resize: async (id, cols, rows) => !!(await _post(`${API}/${id}/resize`, { cols, rows })),
    quota: async (id) => _get(`${API}/${id}/quota`),
    audit: async (id) => {
      const raw = await _get<{ entries: TerminalAuditEntry[] }>(`${API}/${id}/audit`);
      return raw?.entries ?? [];
    },
    wsUrl: (id) => `${base}/${id}/ws`,
  };
}

// ── WebSocket connection (для TerminalPane) ──

export interface WsTerminal {
  send: (msg: WsClientMsg) => void;
  close: () => void;
  onMessage: (handler: (msg: WsServerMsg) => void) => () => void;
  onClose: (handler: () => void) => () => void;
  onOpen: (handler: () => void) => () => void;
}

/**
 * Открывает WebSocket к терминальной сессии.
 * Пока — заглушка, возвращает fake WS (демо-режим).
 * Когда Boss поднимет gateway — заменить на реальный new WebSocket(url).
 */
export function connectTerminal(
  sessionId: string,
  client: TerminalClient,
  _opts?: { cols?: number; rows?: number },
): WsTerminal {
  const url = client.wsUrl(sessionId);
  const handlers: {
    message: Array<(msg: WsServerMsg) => void>;
    close: Array<() => void>;
    open: Array<() => void>;
  } = { message: [], close: [], open: [] };

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const doConnect = () => {
    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        handlers.open.forEach((h) => h());
        // Resize после open
        if (_opts?.cols && _opts?.rows) {
          ws?.send(JSON.stringify({ type: 'resize', cols: _opts.cols, rows: _opts.rows }));
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsServerMsg;
          handlers.message.forEach((h) => h(msg));
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        handlers.close.forEach((h) => h());
        // Auto-reconnect через 2s
        reconnectTimer = setTimeout(doConnect, 2000);
      };
    } catch {
      // WebSocket недоступен — демо-режим
      setTimeout(() => {
        handlers.open.forEach((h) => h());
        // Имитируем output через 1s
        setTimeout(() => {
          handlers.message.forEach((h) =>
            h({ type: 'output', data: '\r\n\x1b[1;36mPrettyK Terminal\x1b[0m — demo mode (no backend)\r\n\x1b[90mSession: ' + sessionId.slice(0, 12) + '...\x1b[0m\r\n\x1b[90m$\x1b[0m ' }),
          );
        }, 1000);
      }, 300);
    }
  };

  doConnect();

  return {
    send: (msg) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close: () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
    onMessage: (h) => { handlers.message.push(h); return () => { handlers.message = handlers.message.filter((x) => x !== h); }; },
    onClose: (h) => { handlers.close.push(h); return () => { handlers.close = handlers.close.filter((x) => x !== h); }; },
    onOpen: (h) => { handlers.open.push(h); return () => { handlers.open = handlers.open.filter((x) => x !== h); }; },
  };
}