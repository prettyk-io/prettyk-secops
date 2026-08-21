/**
 * Pretty arg token readers / splitter (S3776).
 */
import { matchRefAt } from './refs';

/** Аргументы pretty: кавычки, $… / ${…}, иначе токены по пробелу (как split_pretty_args). */
export function readQuotedPrettyArg(s: string, start: number): { token: string; end: number } {
  const quote = s[start]!;
  let i = start + 1;
  const n = s.length;
  let buf = '';
  while (i < n && s[i] !== quote) {
    if (s[i] === '\\' && i + 1 < n) {
      const nxt = s[i + 1]!;
      buf += nxt === quote || nxt === '\\' ? nxt : `\\${nxt}`;
      i += 2;
      continue;
    }
    buf += s[i]!;
    i += 1;
  }
  if (i < n) {
    i += 1;
  }
  return { token: buf, end: i };
}

function appendGluedRefs(
  s: string,
  start: number,
  initial: string,
): { token: string; end: number } {
  let buf = initial;
  let i = start;
  const n = s.length;
  while (i < n && !/\s/.test(s[i]!) && s[i] !== '"' && s[i] !== "'") {
    if (s[i] === '$') {
      const nxt = matchRefAt(s, i);
      if (!nxt) {
        buf += s[i]!;
        i += 1;
        continue;
      }
      buf += nxt.token;
      i = nxt.end;
      continue;
    }
    buf += s[i]!;
    i += 1;
  }
  return { token: buf, end: i };
}

export function readRefPrettyArg(s: string, start: number): { token: string; end: number } {
  const n = s.length;
  const got = matchRefAt(s, start);
  if (!got) {
    let j = start;
    while (j < n && !/\s/.test(s[j]!)) {
      j += 1;
    }
    return { token: s.slice(start, j), end: j };
  }
  return appendGluedRefs(s, got.end, got.token);
}

function readNextPrettyArg(s: string, i: number): { token: string; end: number } {
  const ch = s[i]!;
  if (ch === '"' || ch === "'") {
    return readQuotedPrettyArg(s, i);
  }
  if (ch === '$') {
    return readRefPrettyArg(s, i);
  }
  let j = i;
  while (j < s.length && !/\s/.test(s[j]!)) {
    j += 1;
  }
  return { token: s.slice(i, j), end: j };
}

export function splitPrettyArgTokens(rest: string): string[] {
  const s = rest.trim();
  if (!s) {
    return [];
  }
  if (s.includes('|') && !s.startsWith('$') && !s.includes('"') && !s.includes("'")) {
    return s.split('|').filter((part) => part !== '');
  }

  const out: string[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i]!)) {
      i += 1;
    }
    if (i >= n) {
      break;
    }
    const got = readNextPrettyArg(s, i);
    out.push(got.token);
    i = got.end;
  }
  return out;
}
