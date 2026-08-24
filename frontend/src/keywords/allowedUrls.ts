/**
 * Allowlist «Дополнительные разрешенные URL» — зеркало orchestrator/utils/allowed_urls.py.
 * Сегменты: `|` и `,`. Паттерны: URL-prefix | bare host[:port] | *.domain.
 */

import { stripTrailingSlashes } from './textScan';

export const ALLOWED_URL_DENY_MSG =
  'Домен данного URL не включен в список разрешенных.';

export function parseAllowedUrlTokens(text: string): string[] {
  const tokens: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    const ch = i < text.length ? text[i] : '|';
    if (ch === '|' || ch === ',' || i === text.length) {
      const piece = text.slice(start, i).trim();
      if (piece.length > 0) {
        tokens.push(piece);
      }
      start = i + 1;
    }
  }
  return tokens;
}

function hostMatchesWildcard(hostname: string, token: string): boolean {
  const base = token.slice(2).toLowerCase();
  const host = hostname.toLowerCase();
  if (!base || !host) {
    return false;
  }
  return host === base || host.endsWith(`.${base}`);
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

function hostPortFromToken(token: string): { host: string; port?: number } {
  let tokHost = token.toLowerCase();
  let tokPort: number | undefined;
  const colon = tokHost.lastIndexOf(':');
  if (colon > 0 && !tokHost.startsWith('[')) {
    const maybePort = tokHost.slice(colon + 1);
    if (maybePort.length > 0 && [...maybePort].every((ch) => ch >= '0' && ch <= '9')) {
      tokHost = tokHost.slice(0, colon);
      tokPort = Number(maybePort);
    }
  }
  return { host: tokHost, port: tokPort };
}

function tokenAllowsUrl(
  token: string,
  raw: string,
  host: string,
  port: number | undefined,
): boolean {
  if (token.startsWith('*.') && !token.includes('://')) {
    return hostMatchesWildcard(host, token);
  }
  if (token.includes('://')) {
    const prefix = stripTrailingSlashes(token);
    const candidate = stripTrailingSlashes(raw);
    return candidate === prefix || candidate.startsWith(`${prefix}/`);
  }
  const { host: tokHost, port: tokPort } = hostPortFromToken(token);
  if (host !== tokHost) {
    return false;
  }
  if (tokPort !== undefined && port !== tokPort) {
    return false;
  }
  return true;
}

export function urlAllowed(url: string, allowlist: string | readonly string[]): boolean {
  const raw = url.trim();
  if (!raw) {
    return false;
  }
  const tokens = typeof allowlist === 'string' ? parseAllowedUrlTokens(allowlist) : [...allowlist];
  if (tokens.length === 0) {
    return false;
  }
  const parsed = parseUrl(raw);
  if (!parsed) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? Number(parsed.port) : undefined;
  return tokens.some((token) => tokenAllowsUrl(token, raw, host, port));
}

export function isAbsoluteHttpUrl(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t.startsWith('http://') || t.startsWith('https://');
}
