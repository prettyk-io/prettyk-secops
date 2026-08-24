/**
 * Ссылки переменных PrettyK — зеркало orchestrator/core/expr.py.
 * Канон: $name, $user.email, $names[0], $ENV:VAR. Legacy: ${…}.
 * Сканер без nested-quantifier regex (Sonar S8786).
 */
import { isIdentCont, isIdentStart, scanDollarPath } from './refPathScan';

export function stripRef(text: string): string | undefined {
  const raw = text.trim();
  if (raw.startsWith('${') && raw.endsWith('}') && raw.length >= 3) {
    return raw.slice(2, -1).trim();
  }
  if (!raw.startsWith('$')) {
    return undefined;
  }
  const end = scanDollarPath(raw, 0);
  if (end === undefined || end !== raw.length) {
    return undefined;
  }
  return raw.slice(1);
}

export function formatRef(pathExpr: string): string {
  return `$${pathExpr.trim()}`;
}

/** Ссылка с позиции i (`$`…) → токен и конец, или undefined. */
export function matchRefAt(s: string, i: number): { token: string; end: number } | undefined {
  if (i < 0 || i >= s.length || s[i] !== '$') {
    return undefined;
  }
  if (s.startsWith('${', i)) {
    const j = s.indexOf('}', i + 2);
    if (j < 0) {
      return undefined;
    }
    return { token: s.slice(i, j + 1), end: j + 1 };
  }
  const end = scanDollarPath(s, i);
  if (end === undefined || end <= i + 1) {
    return undefined;
  }
  return { token: s.slice(i, end), end };
}

/** Все `$…` / `${…}` в тексте (для diagnostics). */
export function findRefsInText(
  text: string,
): Array<{ token: string; path: string; start: number; end: number }> {
  const out: Array<{ token: string; path: string; start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '$') {
      i += 1;
      continue;
    }
    const hit = matchRefAt(text, i);
    if (!hit) {
      i += 1;
      continue;
    }
    const path = hit.token.startsWith('${')
      ? hit.token.slice(2, -1).trim()
      : hit.token.slice(1);
    out.push({ token: hit.token, path, start: i, end: hit.end });
    i = hit.end;
  }
  return out;
}

export function rootNameFromRefPath(pathExpr: string): string | undefined {
  const root = pathExpr.trim().split(/[.[\]]/, 1)[0]?.trim();
  if (!root || !isIdentStart(root[0])) {
    return undefined;
  }
  for (let k = 1; k < root.length; k += 1) {
    if (!isIdentCont(root[k])) {
      return undefined;
    }
  }
  return root;
}
