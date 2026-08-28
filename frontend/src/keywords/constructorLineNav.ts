/**
 * Построчные диагностики constructor: Открыть / Контекст / Пусть|Секрет (S3776 extract).
 */
import { isAbsoluteHttpUrl, urlAllowed } from './allowedUrls';
import { diagnoseAssignNavigationLine } from './constructorLineNavAssign';
import {
  contextIncludePattern,
  diagnoseContextIncludeLine,
} from './constructorLineNavContext';
import { diagnoseOpenNavigationLine } from './constructorLineNavOpen';
import { diagnosePrettyAssignRhsLine } from './constructorLineNavRhs';
import { stripTrailingSlashes } from './textScan';

/** Совместимо с ConstructorDiagnostic (без импорта constructor — нет цикла). */
export type LineNavDiagnostic = {
  severity: 'error';
  message: string;
  start: number;
  end: number;
};

export const OPEN_ABSOLUTE_MSG =
  'Открыть принимает только относительный путь; для абсолютного URL используйте ОткрытьПоURL';

export const CONTEXT_INCLUDE_FORMAT_MSG =
  'ВключитьВКонтекст: URL должен начинаться с http:// или https:// (или без URL — тогда base_url)';

function stripIncludeRegexSuffix(pattern: string): string {
  let s = pattern.trim();
  while (s.endsWith('.*')) {
    s = s.slice(0, -2);
  }
  while (s.endsWith('*')) {
    s = s.slice(0, -1);
  }
  return stripTrailingSlashes(s);
}

/** Allowlist + base_url как разрешённый origin (зеркало scannerAdapter._context_include_allowed). */
export function contextIncludeAllowed(
  urlPattern: string,
  allowedExtraDomains: string,
  baseUrl = '',
): boolean {
  const probe = stripIncludeRegexSuffix(urlPattern);
  if (!isAbsoluteHttpUrl(probe)) {
    return false;
  }
  if (urlAllowed(probe, allowedExtraDomains)) {
    return true;
  }
  const base = baseUrl.trim();
  if (!base) {
    return false;
  }
  if (urlAllowed(probe, base)) {
    return true;
  }
  const bp = stripTrailingSlashes(base);
  return probe === bp || probe.startsWith(`${bp}/`) || bp.startsWith(probe);
}

const SECRET_RHS_MSG =
  'Секрет: значение в кавычках ("…") или $name; не пусто и не плейсхолдер value.';
const BARE_ARG_MSG =
  'Голое имя без $ и без кавычек: нужна ссылка $name или строка \"…\". Пример: Пусть $x = \"var\"; Размер $data_module.';

type ConstructorLineSpan = {
  trimmed: string;
  lineStart: number;
  lineEnd: number;
};

function* iterateConstructorLines(text: string): Generator<ConstructorLineSpan> {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let offset = 0;
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    const trimIdx = line.indexOf(trimmed);
    const lineStart = offset + Math.max(trimIdx, 0);
    const lineEnd = lineStart + trimmed.length;
    offset += line.length + 1;
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    yield { trimmed, lineStart, lineEnd };
  }
}

function pushDiag(
  diagnostics: LineNavDiagnostic[],
  message: string,
  lineStart: number,
  lineEnd: number,
): void {
  diagnostics.push({ severity: 'error', message, start: lineStart, end: lineEnd });
}

function firstPrettyArg(rest: string): string {
  const t = rest.trim();
  if (!t) {
    return '';
  }
  if (t.startsWith('"') || t.startsWith("'")) {
    const quote = t[0]!;
    const end = t.indexOf(quote, 1);
    if (end > 0) {
      return t.slice(1, end);
    }
  }
  return t.split(/\s+/, 1)[0] ?? '';
}

function lhsPathKey(token: string): string {
  const t = token.trim();
  const brace = /^\$\{([^}]+)\}$/.exec(t);
  if (brace?.[1]) {
    return brace[1];
  }
  if (t.startsWith('$')) {
    return t.slice(1);
  }
  return t;
}

function diagnosePrettyAssignRhs(
  rhs: string,
  diagnostics: LineNavDiagnostic[],
  lineStart: number,
  lineEnd: number,
): void {
  diagnosePrettyAssignRhsLine(rhs, diagnostics, lineStart, lineEnd, {
    pushDiag,
    bareArgMsg: BARE_ARG_MSG,
  });
}

export function analyzeGluedAssignmentLines(text: string): LineNavDiagnostic[] {
  const diagnostics: LineNavDiagnostic[] = [];
  const seenAssign = new Map<string, number>();
  const helpers = {
    pushDiag,
    lhsPathKey,
    diagnosePrettyAssignRhs,
    secretRhsMsg: SECRET_RHS_MSG,
  };
  for (const { trimmed, lineStart, lineEnd } of iterateConstructorLines(text)) {
    diagnoseAssignNavigationLine(
      trimmed,
      lineStart,
      lineEnd,
      diagnostics,
      seenAssign,
      helpers,
    );
  }
  return diagnostics;
}

export function analyzeOpenNavigationLines(
  text: string,
  allowedExtraDomains = '',
): LineNavDiagnostic[] {
  const diagnostics: LineNavDiagnostic[] = [];
  const helpers = {
    pushDiag,
    firstPrettyArg,
    openAbsoluteMsg: OPEN_ABSOLUTE_MSG,
  };
  for (const { trimmed, lineStart, lineEnd } of iterateConstructorLines(text)) {
    diagnoseOpenNavigationLine(
      trimmed,
      lineStart,
      lineEnd,
      diagnostics,
      allowedExtraDomains,
      helpers,
    );
  }
  return diagnostics;
}

type AnalyzeContextOpts = {
  allowedExtraDomains?: string;
  baseUrl?: string;
};

export function analyzeContextIncludeLines(
  text: string,
  options: AnalyzeContextOpts = {},
): LineNavDiagnostic[] {
  const allowedExtraDomains = options.allowedExtraDomains ?? '';
  const baseUrl = options.baseUrl ?? '';
  const diagnostics: LineNavDiagnostic[] = [];
  for (const { trimmed, lineStart, lineEnd } of iterateConstructorLines(text)) {
    const pattern = contextIncludePattern(trimmed);
    if (!pattern) {
      continue;
    }
    diagnoseContextIncludeLine({
      pattern,
      lineStart,
      lineEnd,
      diagnostics,
      allowedExtraDomains,
      baseUrl,
      pushDiag,
      formatMsg: CONTEXT_INCLUDE_FORMAT_MSG,
      contextAllowed: contextIncludeAllowed,
    });
  }
  return diagnostics;
}
