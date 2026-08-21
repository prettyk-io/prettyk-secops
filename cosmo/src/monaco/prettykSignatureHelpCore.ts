/**
 * Чистая логика PrettyK SignatureHelp (без Monaco — удобно для unit).
 */
import {
  formatParam,
  type KeywordAction,
  type SignatureLabel,
} from '../keywords/catalog';
import { splitPrettyArgTokens } from '../keywords/prettyArgsSplit';

export function formatPrettyMethodSignature(
  methodId: string,
  keyword: KeywordAction,
): SignatureLabel {
  let label = methodId;
  const parameterRanges: [number, number][] = [];
  for (const param of keyword.params) {
    label += ' ';
    const start = label.length;
    label += formatParam(param);
    parameterRanges.push([start, label.length]);
  }
  return { label, parameterRanges };
}

/** Индекс активного аргумента PrettyK (0-based) по курсору в trimmed-строке. */
export function activePrettyArgIndex(
  trimmed: string,
  methodLen: number,
  cursorInTrimmed: number,
): number {
  if (cursorInTrimmed <= methodLen) {
    return 0;
  }
  let i = methodLen;
  while (i < trimmed.length && /\s/.test(trimmed[i]!)) {
    i += 1;
  }
  if (cursorInTrimmed <= i) {
    return 0;
  }
  const argsRegion = trimmed.slice(i, cursorInTrimmed);
  if (!argsRegion) {
    return 0;
  }
  const tokens = splitPrettyArgTokens(argsRegion);
  if (/\s$/.test(argsRegion)) {
    return tokens.length;
  }
  return Math.max(0, tokens.length - 1);
}
