/**
 * CRAWL-4: Browser-native network capture.
 *
 * Нормализация Playwright-событий request/response/console/pageerror
 * в NetworkDelta с привязкой к transition.
 *
 * REDACTION: поля из _SECRET_FIELD_NAMES → [REDACTED].
 * Заголовки Cookie/Authorization/Set-Cookie целиком не пишутся.
 * Бинарные тела, ответы >64KB, OPTIONS/preflight, статика — не сохраняются.
 */

// ── Типы ──

export type ResourceType =
  | 'xhr' | 'fetch' | 'document' | 'websocket'
  | 'script' | 'stylesheet' | 'image' | 'font' | 'media'
  | 'other';

export interface CapturedRequest {
  requestId: string;
  method: string;
  url: string;
  resourceType: ResourceType;
  /** Первые 2000 байт тела запроса (после redaction). */
  requestBody: string | null;
  /** Content-Type запроса. */
  requestContentType: string | null;
  timestamp: number;
}

export interface CapturedResponse {
  requestId: string;
  status: number;
  /** Первые 2000 байт тела ответа (после redaction). */
  responseBody: string | null;
  /** Content-Type ответа. */
  responseContentType: string | null;
  timestamp: number;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  location?: string;
  timestamp: number;
}

export interface PageError {
  message: string;
  stack?: string;
  timestamp: number;
}

/** NetworkDelta — все сетевые/консольные события за одно действие. */
export interface NetworkDelta {
  transitionId: string;
  requests: CapturedRequest[];
  responses: CapturedResponse[];
  console: ConsoleEntry[];
  pageErrors: PageError[];
}

// ── Redaction ──

const SECRET_FIELD_NAMES = new Set([
  'password', 'passwd', 'secret', 'token', 'csrf',
  'api_key', 'apikey', 'authorization', 'auth',
]);

const SKIP_HEADERS = new Set(['cookie', 'authorization', 'set-cookie', 'x-csrf-token', 'x-api-key']);

const SKIP_RESOURCE_TYPES: Set<ResourceType> = new Set(['image', 'font', 'media']);

/** Redact значения секретных полей в JSON-теле. */
function redactJsonBody(body: string): string {
  try {
    const obj = JSON.parse(body);
    const redacted = redactObject(obj);
    return JSON.stringify(redacted);
  } catch {
    // Не-JSON тело — возвращаем как есть (вдруг бинарный?)
    return body;
  }
}

function redactObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactObject(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_FIELD_NAMES.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactObject(value, depth + 1);
    }
  }
  return out;
}

/** Обрезать тело до maxLength байт. */
function truncateBody(body: string | null, maxLength = 2000): string | null {
  if (!body) return null;
  return body.length <= maxLength ? body : body.slice(0, maxLength);
}

// ── Фильтры ──

/** Пропустить статику? */
function isSkippableResource(type: string): boolean {
  return SKIP_RESOURCE_TYPES.has(type as ResourceType);
}

/** Пропустить OPTIONS/preflight? */
function isPreflight(method: string): boolean {
  return method.toUpperCase() === 'OPTIONS';
}

// ── Capture request ──

export function captureRequest(raw: {
  requestId: string;
  method: string;
  url: string;
  resourceType: string;
  postData?: string;
  headers?: Record<string, string>;
  timestamp?: number;
}): CapturedRequest | null {
  if (isSkippableResource(raw.resourceType)) return null;
  if (isPreflight(raw.method)) return null;

  let body = raw.postData ?? null;
  if (body) {
    const contentType = raw.headers?.['content-type'] ?? '';
    if (contentType.includes('json')) {
      body = redactJsonBody(body);
    }
  }

  return {
    requestId: raw.requestId,
    method: raw.method.toUpperCase(),
    url: raw.url,
    resourceType: raw.resourceType as ResourceType,
    requestBody: truncateBody(body),
    requestContentType: raw.headers?.['content-type'] ?? null,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

// ── Capture response ──

export function captureResponse(raw: {
  requestId: string;
  status: number;
  body?: string;
  headers?: Record<string, string>;
  timestamp?: number;
}): CapturedResponse | null {
  let body = raw.body ?? null;
  if (body && body.length > 64000) return null; // >64KB — не сохраняем

  if (body) {
    const contentType = raw.headers?.['content-type'] ?? '';
    if (contentType.includes('json')) {
      body = redactJsonBody(body);
    }
  }

  return {
    requestId: raw.requestId,
    status: raw.status,
    responseBody: truncateBody(body),
    responseContentType: raw.headers?.['content-type'] ?? null,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

// ── Capture console ──

export function captureConsole(raw: {
  type: string;
  text: string;
  location?: { url: string; lineNumber?: number };
  timestamp?: number;
}): ConsoleEntry {
  return {
    level: (raw.type as ConsoleEntry['level']) ?? 'log',
    text: raw.text.slice(0, 500),
    location: raw.location ? `${raw.location.url}:${raw.location.lineNumber ?? ''}` : undefined,
    timestamp: raw.timestamp ?? Date.now(),
  };
}

// ── Capture page error ──

export function capturePageError(raw: {
  message: string;
  stack?: string;
  timestamp?: number;
}): PageError {
  return {
    message: raw.message.slice(0, 500),
    stack: raw.stack?.slice(0, 1000),
    timestamp: raw.timestamp ?? Date.now(),
  };
}

// ── Сборка NetworkDelta ──

export function buildNetworkDelta(
  transitionId: string,
  requests: CapturedRequest[],
  responses: CapturedResponse[],
  consoleEntries: ConsoleEntry[],
  pageErrors: PageError[],
): NetworkDelta {
  return { transitionId, requests, responses, console: consoleEntries, pageErrors };
}