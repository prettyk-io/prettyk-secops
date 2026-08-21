/**
 * ВключитьВКонтекст / zap|set_context_include (S3776).
 */
import { ALLOWED_URL_DENY_MSG, isAbsoluteHttpUrl } from './allowedUrls';
import { matchKeywordPrefix, splitFirstToken } from './textScan';

export type ContextDiag = {
  severity: 'error';
  message: string;
  start: number;
  end: number;
};

type Push = (
  diagnostics: ContextDiag[],
  message: string,
  lineStart: number,
  lineEnd: number,
) => void;

export function contextIncludePattern(trimmed: string): string | undefined {
  if (trimmed.startsWith('zap|set_context_include|')) {
    const parts = trimmed.split('|');
    return (parts[3] ?? '').trim() || undefined;
  }
  const pretty = matchKeywordPrefix(trimmed, 'ВключитьВКонтекст');
  if (!pretty) {
    return undefined;
  }
  const { rest } = splitFirstToken(pretty.rest);
  let pattern = rest.trim();
  if (pattern.startsWith('"') && pattern.endsWith('"') && pattern.length >= 2) {
    pattern = pattern.slice(1, -1);
  }
  return pattern || undefined;
}

export type DiagnoseContextIncludeArgs = {
  pattern: string;
  lineStart: number;
  lineEnd: number;
  diagnostics: ContextDiag[];
  allowedExtraDomains: string;
  baseUrl: string;
  pushDiag: Push;
  formatMsg: string;
  contextAllowed: (pattern: string, allowed: string, base: string) => boolean;
};

export function diagnoseContextIncludeLine(args: DiagnoseContextIncludeArgs): void {
  const {
    pattern,
    lineStart,
    lineEnd,
    diagnostics,
    allowedExtraDomains,
    baseUrl,
    pushDiag,
    formatMsg,
    contextAllowed,
  } = args;
  if (!isAbsoluteHttpUrl(pattern)) {
    pushDiag(diagnostics, formatMsg, lineStart, lineEnd);
    return;
  }
  if (!contextAllowed(pattern, allowedExtraDomains, baseUrl)) {
    pushDiag(diagnostics, ALLOWED_URL_DENY_MSG, lineStart, lineEnd);
  }
}
