/**
 * splitConstructor quote/brace walker (S3776).
 */

export type SplitPush = (end: number) => void;

/** Advance index inside string / ${…} / separator; returns next i. */
export function advanceConstructorSplit(
  value: string,
  i: number,
  inStr: string | null,
  separator: string,
  push: SplitPush,
): { i: number; inStr: string | null } {
  const ch = value[i];
  if (inStr !== null) {
    if (ch === '\\' && i + 1 < value.length) {
      return { i: i + 2, inStr };
    }
    if (ch === inStr) {
      return { i: i + 1, inStr: null };
    }
    return { i: i + 1, inStr };
  }
  if (ch === '"' || ch === "'") {
    return { i: i + 1, inStr: ch };
  }
  if (value.startsWith('${', i)) {
    const close = value.indexOf('}', i + 2);
    if (close < 0) {
      return { i: value.length, inStr };
    }
    return { i: close + 1, inStr };
  }
  if (ch === separator) {
    push(i);
    return { i: i + 1, inStr };
  }
  return { i: i + 1, inStr };
}
