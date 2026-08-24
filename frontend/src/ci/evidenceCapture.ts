/**
 * PK-TRM-6: Evidence capture — из вывода терминала/команды в evidence artifact.
 * PK-TRM-7: Request/Response inspector с redaction секретов.
 *
 * Чистые функции. Потребляют RunEngine для записи.
 */
import { redactTerminalOutput } from '../terminal/commandSafety';
import type { EvidenceRecord } from './types';
import type { RunEngine } from './runEngine';

// ── PK-TRM-6: Evidence Capture ──

export interface EvidenceCaptureResult {
  ok: boolean;
  record?: EvidenceRecord;
  error?: string;
}

/**
 * Создаёт evidence из вывода команды: связанный с run артефакт с checksum,
 * timestamp и исполнителем. Секреты в payload маскируются.
 *
 * Машинг dedupKey = evidenceKind + runId + timestamp (второй capture того же
 * вывода в ту же секунду = тот же dedupKey = игнорируется).
 */
export function captureEvidence(
  engine: RunEngine,
  runId: string,
  output: string,
  kind: string,
): EvidenceCaptureResult {
  const safe = redactTerminalOutput(output);
  if (!safe.trim()) {
    return { ok: false, error: 'Empty output after redaction' };
  }

  // Simple checksum: length + first-32-chars hash плюс timestamp
  const checksum = `${kind}-${safe.length}-${safe.slice(0, 16).replace(/\s/g, '')}`;
  const dedupKey = `evidence:${kind}:${runId}:${checksum}`;
  const now = new Date().toISOString();

  const record = engine.recordEvidence(runId, dedupKey, {
    output: safe,
    capturedAt: now,
    checksum,
  }, { kind, checksum });

  if (!record) {
    return { ok: false, error: 'Duplicate evidence (same dedupKey already recorded)' };
  }

  return { ok: true, record };
}

// ── PK-TRM-7: Request/Response Inspector ──

export interface RequestResponsePair {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  timestamp: string;
  findingId?: string;
}

const SECRET_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
  'proxy-authorization',
]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_HEADERS.has(key.toLowerCase())) {
      out[key] = '***';
    } else {
      out[key] = redactTerminalOutput(value);
    }
  }
  return out;
}

/**
 * Маскирует секреты в request/response pair.
 * Headers: authorization/cookie → ***.
 * Body: прогоняет через redactTerminalOutput.
 */
export function redactRequestResponse(pair: RequestResponsePair): RequestResponsePair {
  return {
    ...pair,
    requestHeaders: redactHeaders(pair.requestHeaders),
    responseHeaders: redactHeaders(pair.responseHeaders),
    requestBody: redactTerminalOutput(pair.requestBody),
    responseBody: redactTerminalOutput(pair.responseBody),
  };
}

/**
 * Извлекает findingId из response body или headers если был передан.
 * Возвращает ссылку для перехода finding→evidence и обратно.
 */
export function linkFindingToResponse(
  pair: RequestResponsePair,
  findingId: string,
): RequestResponsePair {
  return { ...pair, findingId };
}

// ── Render helpers ──

export interface RenderedPair {
  id: string;
  method: string;
  url: string;
  status: number;
  statusColor: string;
  requestSnippet: string;
  responseSnippet: string;
  timestamp: string;
  findingId?: string;
}

export function renderPair(pair: RequestResponsePair): RenderedPair {
  const sc = pair.responseStatus;
  const statusColor =
    sc < 200 ? '#94a3b8' :
    sc < 300 ? '#22c55e' :
    sc < 400 ? '#38bdf8' :
    sc < 500 ? '#f59e0b' :
    '#ef4444';

  return {
    id: pair.id,
    method: pair.method.toUpperCase(),
    url: pair.url,
    status: sc,
    statusColor,
    requestSnippet: `${pair.method} ${pair.url}\n${JSON.stringify(pair.requestHeaders, null, 2)}`.slice(0, 400),
    responseSnippet: `${sc}\n${JSON.stringify(pair.responseHeaders, null, 2)}\n${pair.responseBody}`.slice(0, 400),
    timestamp: pair.timestamp,
    findingId: pair.findingId,
  };
}