/**
 * Открыть / open_by_url line diagnostics (S3776).
 */
import { ALLOWED_URL_DENY_MSG, isAbsoluteHttpUrl, urlAllowed } from './allowedUrls';
import { matchKeywordPrefix } from './textScan';

export type OpenLineDiag = {
  severity: 'error';
  message: string;
  start: number;
  end: number;
};

export type OpenLineHelpers = {
  pushDiag: (
    diagnostics: OpenLineDiag[],
    message: string,
    lineStart: number,
    lineEnd: number,
  ) => void;
  firstPrettyArg: (rest: string) => string;
  openAbsoluteMsg: string;
};

function diagnoseWireOpen(
  trimmed: string,
  lineStart: number,
  lineEnd: number,
  diagnostics: OpenLineDiag[],
  allowedExtraDomains: string,
  helpers: OpenLineHelpers,
): boolean {
  if (trimmed.startsWith('webdriver|open|') && !trimmed.startsWith('webdriver|open_by_url|')) {
    const arg = trimmed.slice('webdriver|open|'.length).split('|')[0] ?? '';
    if (isAbsoluteHttpUrl(arg)) {
      helpers.pushDiag(diagnostics, helpers.openAbsoluteMsg, lineStart, lineEnd);
    }
    return true;
  }
  if (trimmed.startsWith('webdriver|open_by_url|')) {
    const arg = trimmed.slice('webdriver|open_by_url|'.length).split('|')[0] ?? '';
    if (!isAbsoluteHttpUrl(arg)) {
      helpers.pushDiag(
        diagnostics,
        'ОткрытьПоURL: нужен абсолютный http(s) URL',
        lineStart,
        lineEnd,
      );
    } else if (!urlAllowed(arg, allowedExtraDomains)) {
      helpers.pushDiag(diagnostics, ALLOWED_URL_DENY_MSG, lineStart, lineEnd);
    }
    return true;
  }
  return false;
}

function diagnosePrettyOpen(
  trimmed: string,
  lineStart: number,
  lineEnd: number,
  diagnostics: OpenLineDiag[],
  allowedExtraDomains: string,
  helpers: OpenLineHelpers,
): void {
  const openBy = matchKeywordPrefix(trimmed, 'ОткрытьПоURL');
  if (openBy) {
    const arg = helpers.firstPrettyArg(openBy.rest);
    if (!arg || !isAbsoluteHttpUrl(arg)) {
      helpers.pushDiag(
        diagnostics,
        'ОткрытьПоURL: нужен абсолютный http(s) URL',
        lineStart,
        lineEnd,
      );
    } else if (!urlAllowed(arg, allowedExtraDomains)) {
      helpers.pushDiag(diagnostics, ALLOWED_URL_DENY_MSG, lineStart, lineEnd);
    }
    return;
  }
  const openOnly = matchKeywordPrefix(trimmed, 'Открыть');
  if (!openOnly) {
    return;
  }
  const arg = helpers.firstPrettyArg(openOnly.rest);
  if (arg && isAbsoluteHttpUrl(arg)) {
    helpers.pushDiag(diagnostics, helpers.openAbsoluteMsg, lineStart, lineEnd);
  }
}

export function diagnoseOpenNavigationLine(
  trimmed: string,
  lineStart: number,
  lineEnd: number,
  diagnostics: OpenLineDiag[],
  allowedExtraDomains: string,
  helpers: OpenLineHelpers,
): void {
  if (
    diagnoseWireOpen(trimmed, lineStart, lineEnd, diagnostics, allowedExtraDomains, helpers)
  ) {
    return;
  }
  diagnosePrettyOpen(trimmed, lineStart, lineEnd, diagnostics, allowedExtraDomains, helpers);
}
