/**
 * Terminal Gateway — типы (совместимые с TerminalSessionClient.ts).
 */
export type SessionMode = 'workspace' | 'run-console';
export type SessionState = 'connected' | 'reconnecting' | 'expired' | 'terminated';

export interface CreateSessionRequest {
  mode?: SessionMode;
  run_id?: string;
  runId?: string;
  ttl?: number;
  ttlMs?: number;
  cols?: number;
  rows?: number;
}

export interface CreateSessionResponse {
  ok: boolean;
  session_id: string;
  sessionId: string;
  ws_url: string;
  wsUrl: string;
  ttl: number;
  ttlMs: number;
  ttl_remaining: number;
  mode: SessionMode;
  state: SessionState;
  error?: string;
}

export interface SessionInfo {
  session_id: string;
  sessionId: string;
  mode: SessionMode;
  state: SessionState;
  ttl: number;
  ttl_remaining: number;
  ttlRemainingMs: number;
  quota: QuotaInfo;
  createdAt: string;
}

export interface ExecRequest {
  command: string;
  confirmed?: boolean;
  riskConfirmed?: boolean;
  risk?: 'safe' | 'caution' | 'dangerous';
}

export interface ExecResponse {
  ok: boolean;
  exit_code?: number;
  exitCode?: number;
  output?: string;
  redactedOutput?: string;
  error?: string;
}

export interface ResizeRequest {
  cols: number;
  rows: number;
}

export interface QuotaInfo {
  cpu_percent: number;
  cpuPercent: number;
  mem_mb: number;
  memoryMb: number;
  memoryLimitMb: number;
  disk_mb: number;
  diskMb: number;
  pids: number;
}

export interface AuditEntry {
  command: string;
  risk: string;
  started_at: string;
  startedAt: string;
  finished_at?: string;
  finishedAt?: string;
  exit_code?: number;
  exitCode?: number;
  redactedSecrets: number;
}

// ═══════ WebSocket messages ═══════

export interface WsClientMessage {
  type: 'input' | 'resize' | 'ping';
  data?: string;
  cols?: number;
  rows?: number;
}

export interface WsServerMessage {
  type: 'output' | 'status' | 'quota' | 'exit' | 'pong';
  data?: string;
  state?: SessionState;
  ttl_remaining?: number;
  ttlRemaining?: number;
  quota?: QuotaInfo;
  code?: number;
}
