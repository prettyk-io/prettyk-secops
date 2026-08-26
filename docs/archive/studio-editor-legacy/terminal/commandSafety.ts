/**
 * PK-TRM-2: Terminal output redaction + command risk classification.
 *
 * Security Workbench: raw shell/run output never reaches the scrollback,
 * transcript or evidence with plaintext secrets. This module masks
 * Cookie/Bearer/JWT/password/PAT/api-key and classifies command risk level.
 * Pure functions — no DOM, no backend. Mirrors backend run_package redact patterns.
 */

// ── Redaction ──

const REDACT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Authorization: Bearer ***'],
  [/Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi, 'Authorization: Basic ***'],
  [/Cookie:\s*[^\r\n]+/gi, 'Cookie: ***'],
  [/Set-Cookie:\s*[^\r\n]+/gi, 'Set-Cookie: ***'],
  [/\b(api[_-]?key|access[_-]?token|client[_-]?secret|secret)\s*[=:]\s*(["']?)[^\s"']+\2/gi, '$1=***'],
  [/\bpassword\s*[=:]\s*(["']?)[^\s"']+\1/gi, 'password=***'],
  [/\b(refresh[_-]?token|id[_-]?token)\s*[=:]\s*(["']?)[^\s"']+\2/gi, '$1=***'],
  // JSON keys: "password": "...", "token": "..." etc.
  [/("(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)"\s*:\s*")[^"]*(")/gi, '$1***$3'],
  // JWT compact (header.payload.sig)
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '***'],
  // PrettyK PAT: pk_live_<hex>
  [/\bpk_live_[A-Za-z0-9]{8,}\b/g, 'pk_live_***'],
];

/** Маскирует секреты в произвольном тексте терминала/лога/вывода команды. */
export function redactTerminalOutput(text: string): string {
  if (!text) return '';
  let out = text;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Возвращает количество замаскированных секретов (для аудита/статистики). */
export function countRedactedSecrets(text: string): number {
  if (!text) return 0;
  const redacted = redactTerminalOutput(text);
  // Считаем вхождения плейсхолдера `***` как индикатор маскировки
  let count = 0;
  let idx = redacted.indexOf('***');
  while (idx !== -1) {
    count += 1;
    idx = redacted.indexOf('***', idx + 3);
  }
  return count;
}

// ── Command risk classification ──

export type CommandRisk = 'safe' | 'caution' | 'dangerous';

export interface CommandRiskAssessment {
  risk: CommandRisk;
  /** Capabilities required to run this command. */
  capabilities: string[];
  /** Human explanation of why this risk level was assigned. */
  reason: string;
}

// Destructive / target-affecting / privileged markers
const DANGEROUS_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(rm\s+-rf|del\s+\/s|rmdir)\b/i, 'destructive filesystem operation'],
  [/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i, 'destructive database operation'],
  [/\b(docker|kubectl|podman)\b/i, 'container/host orchestration'],
  [/\b(sudo|su\s+-|chmod|chown|kill\s+-9)\b/i, 'privileged/host operation'],
  [/\b(active[_-]?scan|fuzz|intruder|spider|attack)\b/i, 'active security operation against a target'],
  [/\b(curl|wget|nc)\b/i, 'egress network request'],
];

const CAUTION_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(git\s+push|git\s+commit)\b/i, 'source control write'],
  [/\b(pip|npm|apt|yum)\s+install\b/i, 'package install'],
  [/\b(export\s+[A-Z_]+=)\b/i, 'environment mutation'],
];

/** Классифицирует риск команды и перечисляет требуемые capabilities. */
export function assessCommandRisk(command: string): CommandRiskAssessment {
  const cmd = (command || '').trim();
  if (!cmd) {
    return { risk: 'safe', capabilities: [], reason: 'Empty command' };
  }

  for (const [pattern, reason] of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        risk: 'dangerous',
        capabilities: ['fuzzer:execute', 'checks:create', 'policies:manage'],
        reason,
      };
    }
  }

  for (const [pattern, reason] of CAUTION_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        risk: 'caution',
        capabilities: ['checks:create'],
        reason,
      };
    }
  }

  return {
    risk: 'safe',
    capabilities: [],
    reason: 'Read-only or workspace-scoped operation',
  };
}

// ── Audit event shape (start/finish/exit) ──

export interface CommandAuditEvent {
  command: string;
  risk: CommandRisk;
  actor: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  redactedSecrets: number;
}

/** Собирает audit-запись команды (start/finish/exit) без raw секретов. */
export function buildCommandAuditStart(command: string, actor: string): CommandAuditEvent {
  return {
    command: redactTerminalOutput(command),
    risk: assessCommandRisk(command).risk,
    actor,
    startedAt: new Date().toISOString(),
    redactedSecrets: 0,
  };
}

export function buildCommandAuditFinish(
  start: CommandAuditEvent,
  exitCode: number,
  output: string,
): CommandAuditEvent {
  return {
    ...start,
    finishedAt: new Date().toISOString(),
    exitCode,
    redactedSecrets: countRedactedSecrets(output),
  };
}