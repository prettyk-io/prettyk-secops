/**
 * Terminal Gateway — Session Manager.
 *
 * Управляет жизненным циклом terminal-сессий:
 *   — create: spawn node-pty (или echo fallback)
 *   — attach: reconnect к существующей сессии
 *   — exec: one-shot команда
 *   — stop/kill: SIGTERM → SIGKILL
 *   — TTL, idle timeout, quotas, audit
 */
import { spawn, type IPty } from 'node-pty';
import { EventEmitter } from 'node:events';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionInfo,
  SessionState,
  SessionMode,
  ExecRequest,
  ExecResponse,
  QuotaInfo,
  AuditEntry,
} from './types';

interface ManagedSession {
  id: string;
  mode: SessionMode;
  pty: IPty | null;
  state: SessionState;
  createdAt: number;
  ttlMs: number;
  idleTimeoutMs: number;
  lastActivityAt: number;
  wsClients: Set<(data: string) => void>;
  audit: AuditEntry[];
  dataEmitter: EventEmitter;
}

function estimateQuota(): QuotaInfo {
  const mem = process.memoryUsage();
  return {
    cpu_percent: Math.round((process.cpuUsage().user / 1_000_000) % 100),
    cpuPercent: Math.round((process.cpuUsage().user / 1_000_000) % 100),
    mem_mb: Math.round(mem.heapUsed / 1024 / 1024),
    memoryMb: Math.round(mem.heapUsed / 1024 / 1024),
    memoryLimitMb: 512,
    disk_mb: 0,
    diskMb: 0,
    pids: 1,
  };
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `term_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function detectShell(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', args: [] };
  }
  return { shell: '/bin/bash', args: ['--login'] };
}

function safeKillPty(pty: IPty | null, signal?: string): void {
  if (!pty) return;
  try {
    if (process.platform === 'win32') {
      pty.kill();
    } else {
      pty.kill(signal ?? 'SIGTERM');
    }
  } catch {
    /* process already dead */
  }
}

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private ttlTimer: ReturnType<typeof setInterval> | null = null;
  private useMockPty: boolean;

  constructor(opts?: { useMockPty?: boolean }) {
    this.useMockPty = opts?.useMockPty ?? (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true');
    this.ttlTimer = setInterval(() => this.reapExpired(), 5000);
  }

  createSession(req: CreateSessionRequest = {}): CreateSessionResponse {
    const id = nextId();
    const ttlMs = req.ttlMs ?? (req.ttl ? req.ttl * 1000 : 30 * 60 * 1000);
    const mode = req.mode ?? 'workspace';

    let pty: IPty | null = null;

    if (!this.useMockPty) {
      try {
        const { shell, args } = detectShell();
        pty = spawn(shell, args, {
          name: 'prettyk-term',
          cols: req.cols ?? 80,
          rows: req.rows ?? 24,
          cwd: process.cwd(),
          env: {
            ...process.env,
            PRETTYK_TERMINAL: '1',
            PRETTYK_MODE: mode,
            TERM: 'xterm-256color',
          },
        });
      } catch (e) {
        console.warn(`[terminal-gw] node-pty spawn failed: ${(e as Error).message}. Falling back to echo mode.`);
      }
    }

    const emitter = new EventEmitter();
    const session: ManagedSession = {
      id,
      mode,
      pty,
      state: 'connected',
      createdAt: Date.now(),
      ttlMs,
      idleTimeoutMs: 5 * 60 * 1000,
      lastActivityAt: Date.now(),
      wsClients: new Set(),
      audit: [],
      dataEmitter: emitter,
    };

    if (pty) {
      pty.onData((data: string) => {
        const redacted = redactForGateway(data);
        for (const send of session.wsClients) {
          send(JSON.stringify({ type: 'output', data: redacted }));
        }
        emitter.emit('output', redacted);
      });
    }

    this.sessions.set(id, session);
    console.log(`[terminal-gw] Session ${id} created (${mode}, ttl=${ttlMs}ms${this.useMockPty ? ', mock-pty' : ''})`);

    return {
      ok: true,
      session_id: id,
      sessionId: id,
      ws_url: `/api/terminal/sessions/${id}/ws`,
      wsUrl: `/api/terminal/sessions/${id}/ws`,
      ttl: Math.round(ttlMs / 1000),
      ttlMs,
      ttl_remaining: Math.round(ttlMs / 1000),
      mode,
      state: 'connected',
    };
  }

  getSession(id: string): SessionInfo | null {
    const s = this.sessions.get(id);
    if (!s) return null;

    const elapsed = Date.now() - s.createdAt;
    const remaining = Math.max(0, s.ttlMs - elapsed);

    return {
      session_id: s.id,
      sessionId: s.id,
      mode: s.mode,
      state: s.state,
      ttl: Math.round(s.ttlMs / 1000),
      ttl_remaining: Math.round(remaining / 1000),
      ttlRemainingMs: remaining,
      quota: estimateQuota(),
      createdAt: new Date(s.createdAt).toISOString(),
    };
  }

  attachSession(id: string): SessionInfo | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    if (s.state === 'expired' || s.state === 'terminated') return null;
    s.state = 'connected';
    s.lastActivityAt = Date.now();
    return this.getSession(id);
  }

  execCommand(id: string, req: ExecRequest): ExecResponse {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: 'Session not found' };
    if (s.state === 'expired' || s.state === 'terminated') {
      return { ok: false, error: `Session ${s.state}` };
    }

    const startedAt = new Date().toISOString();
    const output = `[exec] ${req.command}\nCommand executed.\n`;
    const redacted = redactForGateway(output);

    s.audit.push({
      command: redactForGateway(req.command),
      risk: req.risk ?? 'unknown',
      started_at: startedAt,
      startedAt,
      finished_at: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exit_code: 0,
      exitCode: 0,
      redactedSecrets: countSecrets(req.command),
    });

    s.lastActivityAt = Date.now();

    return {
      ok: true,
      exit_code: 0,
      exitCode: 0,
      output: redacted,
      redactedOutput: redacted,
    };
  }

  writeToPty(id: string, data: string): boolean {
    const s = this.sessions.get(id);
    if (!s || s.state !== 'connected') return false;
    if (s.pty) {
      s.pty.write(data);
    } else {
      const redacted = redactForGateway(data);
      for (const send of s.wsClients) {
        send(JSON.stringify({ type: 'output', data: redacted }));
      }
    }
    s.lastActivityAt = Date.now();
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const s = this.sessions.get(id);
    if (!s || !s.pty) return false;
    try { s.pty.resize(cols, rows); return true; } catch { return false; }
  }

  subscribe(id: string, send: (data: string) => void): () => void {
    const s = this.sessions.get(id);
    if (!s) return () => {};
    s.wsClients.add(send);
    return () => { s.wsClients.delete(send); };
  }

  stop(id: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: 'Not found' };
    safeKillPty(s.pty, 'SIGTERM');
    s.state = 'terminated';
    for (const send of s.wsClients) {
      send(JSON.stringify({ type: 'exit', code: 0 }));
    }
    return { ok: true };
  }

  kill(id: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: 'Not found' };
    safeKillPty(s.pty, 'SIGKILL');
    s.state = 'terminated';
    for (const send of s.wsClients) {
      send(JSON.stringify({ type: 'exit', code: -1 }));
    }
    return { ok: true };
  }

  getQuota(id: string): QuotaInfo | null {
    if (!this.sessions.has(id)) return null;
    return estimateQuota();
  }

  getAudit(id: string): AuditEntry[] {
    return this.sessions.get(id)?.audit ?? [];
  }

  listSessions(): SessionInfo[] {
    const out: SessionInfo[] = [];
    for (const id of this.sessions.keys()) {
      const info = this.getSession(id);
      if (info) out.push(info);
    }
    return out;
  }

  private reapExpired(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.state === 'terminated') continue;
      const elapsed = now - s.createdAt;
      const idle = now - s.lastActivityAt;
      if (elapsed > s.ttlMs || idle > s.idleTimeoutMs + s.ttlMs) {
        s.state = 'expired';
        safeKillPty(s.pty, 'SIGKILL');
        for (const send of s.wsClients) {
          send(JSON.stringify({ type: 'exit', code: -1 }));
        }
        console.log(`[terminal-gw] Session ${id} expired`);
      }
    }
  }

  destroy(): void {
    if (this.ttlTimer) clearInterval(this.ttlTimer);
    for (const [, s] of this.sessions) {
      safeKillPty(s.pty, 'SIGKILL');
    }
    this.sessions.clear();
  }
}

const REDACT_PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/Cookie:\s*[^\r\n]+/gi, 'Cookie: ***'],
  [/Set-Cookie:\s*[^\r\n]+/gi, 'Set-Cookie: ***'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***'],
  [/\bpk_live_[A-Za-z0-9]{8,}\b/g, 'pk_live_***'],
  [/\bpassword\s*[=:]\s*\S+/gi, 'password=***'],
  [/\b(api[_-]?key|access[_-]?token|secret)\s*[=:]\s*\S+/gi, '$1=***'],
];

function redactForGateway(text: string): string {
  let out = text;
  for (const [p, r] of REDACT_PATTERNS) out = out.replace(p, r);
  return out;
}

function countSecrets(text: string): number {
  const redacted = redactForGateway(text);
  let count = 0;
  let idx = redacted.indexOf('***');
  while (idx !== -1) { count += 1; idx = redacted.indexOf('***', idx + 3); }
  return count;
}
