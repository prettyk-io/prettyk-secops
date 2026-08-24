/**
 * Пусть/Секрет assign line diagnostics (S3776).
 */
import { isBadSecretRhs } from './prettyToWire';
import { matchPrettyAssign } from './textScan';

export type AssignDiag = {
  severity: 'error';
  message: string;
  start: number;
  end: number;
};

type Push = (
  diagnostics: AssignDiag[],
  message: string,
  lineStart: number,
  lineEnd: number,
) => void;

function trackAssignDup(
  key: string | undefined,
  lineStart: number,
  lineEnd: number,
  diagnostics: AssignDiag[],
  seenAssign: Map<string, number>,
  pushDiag: Push,
): void {
  if (!key) {
    return;
  }
  if (seenAssign.has(key)) {
    pushDiag(
      diagnostics,
      `Переменная $${key} уже объявлена (повторное Пусть/Секрет запрещено)`,
      lineStart,
      lineEnd,
    );
    return;
  }
  seenAssign.set(key, lineStart);
}

function diagnoseSecretRhs(
  rhs: string,
  lineStart: number,
  lineEnd: number,
  diagnostics: AssignDiag[],
  pushDiag: Push,
  secretMsg: string,
): void {
  if (!rhs || isBadSecretRhs(rhs)) {
    pushDiag(diagnostics, secretMsg, lineStart, lineEnd);
  }
}

export function diagnoseAssignNavigationLine(
  trimmed: string,
  lineStart: number,
  lineEnd: number,
  diagnostics: AssignDiag[],
  seenAssign: Map<string, number>,
  helpers: {
    pushDiag: Push;
    lhsPathKey: (lhs: string) => string;
    diagnosePrettyAssignRhs: (
      rhs: string,
      diagnostics: AssignDiag[],
      lineStart: number,
      lineEnd: number,
    ) => void;
    secretRhsMsg: string;
  },
): void {
  const pretty = matchPrettyAssign(trimmed);
  const kind = pretty?.kind.toLowerCase();
  if (kind === 'пусть' || kind === 'секрет') {
    const lhs = pretty?.lhs ?? '';
    trackAssignDup(
      helpers.lhsPathKey(lhs),
      lineStart,
      lineEnd,
      diagnostics,
      seenAssign,
      helpers.pushDiag,
    );
    helpers.diagnosePrettyAssignRhs(
      (pretty?.rhs ?? '').trim(),
      diagnostics,
      lineStart,
      lineEnd,
    );
  }
  if (kind === 'секрет') {
    diagnoseSecretRhs(
      (pretty?.rhs ?? '').trim(),
      lineStart,
      lineEnd,
      diagnostics,
      helpers.pushDiag,
      helpers.secretRhsMsg,
    );
    return;
  }
  if (/^data\|secret\|/i.test(trimmed)) {
    const parts = trimmed.split('|');
    const val = parts.length >= 4 ? parts.slice(3).join('|') : '';
    diagnoseSecretRhs(val.trim(), lineStart, lineEnd, diagnostics, helpers.pushDiag, helpers.secretRhsMsg);
  }
}
