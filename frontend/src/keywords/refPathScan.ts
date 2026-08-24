/**
 * `$ENV:VAR` / `$name[0].field` path scanner pieces (S3776).
 */

export function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_]/.test(ch);
}

export function isIdentCont(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/** Scan `[0]` / `[-1]` starting at `[`; returns end exclusive or undefined. */
export function scanBracketIndex(s: string, openAt: number): number | undefined {
  if (s[openAt] !== '[') {
    return undefined;
  }
  let j = openAt + 1;
  if (s[j] === '-') {
    j += 1;
  }
  if (j >= s.length || !/\d/.test(s[j]!)) {
    return undefined;
  }
  while (j < s.length && /\d/.test(s[j]!)) {
    j += 1;
  }
  if (s[j] !== ']') {
    return undefined;
  }
  return j + 1;
}

/** Scan `.field` starting at `.`; returns end exclusive or undefined. */
export function scanDotField(s: string, dotAt: number): number | undefined {
  if (s[dotAt] !== '.') {
    return undefined;
  }
  const afterDot = dotAt + 1;
  if (!isIdentStart(s[afterDot])) {
    return undefined;
  }
  let j = afterDot + 1;
  while (isIdentCont(s[j])) {
    j += 1;
  }
  return j;
}

function scanIdent(s: string, start: number): number | undefined {
  if (!isIdentStart(s[start])) {
    return undefined;
  }
  let i = start + 1;
  while (isIdentCont(s[i])) {
    i += 1;
  }
  return i;
}

function scanPathSuffix(s: string, start: number): number {
  let i = start;
  while (i < s.length) {
    if (s[i] === '[') {
      const end = scanBracketIndex(s, i);
      if (end === undefined) {
        break;
      }
      i = end;
      continue;
    }
    if (s[i] === '.') {
      const end = scanDotField(s, i);
      if (end === undefined) {
        break;
      }
      i = end;
      continue;
    }
    break;
  }
  return i;
}

/** Parse `$ENV:VAR` or `$name[0].field…` starting at `$`; returns end index exclusive. */
export function scanDollarPath(s: string, dollarAt: number): number | undefined {
  if (s[dollarAt] !== '$') {
    return undefined;
  }
  let i = dollarAt + 1;
  if (s.startsWith('ENV:', i)) {
    const end = scanIdent(s, i + 4);
    return end;
  }
  const nameEnd = scanIdent(s, i);
  if (nameEnd === undefined) {
    return undefined;
  }
  return scanPathSuffix(s, nameEnd);
}
