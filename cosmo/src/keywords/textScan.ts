/**
 * Разбор строк PrettyK без жадных / backtracking-regex (Sonar S8786).
 */

export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

function isAsciiWs(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '\f' ||
    ch === '\v'
  );
}

/** Первый непробельный токен и остаток (остаток без ведущих пробелов). */
export function splitFirstToken(value: string): { head: string; rest: string } {
  let i = 0;
  while (i < value.length && !isAsciiWs(value[i]!)) {
    i += 1;
  }
  const head = value.slice(0, i);
  let j = i;
  while (j < value.length && isAsciiWs(value[j]!)) {
    j += 1;
  }
  return { head, rest: value.slice(j) };
}

export type PrettyAssignMatch = {
  kind: string;
  lhs: string;
  rhs: string;
};

/** `Пусть $x = …` / `Секрет $x = …` — без хвоста `.+$`. */
export function matchPrettyAssign(line: string): PrettyAssignMatch | undefined {
  const trimmed = line.trim();
  const { head: kind, rest: afterKind } = splitFirstToken(trimmed);
  const kindLow = kind.toLowerCase();
  if (kindLow !== 'пусть' && kindLow !== 'секрет') {
    return undefined;
  }
  const eq = afterKind.indexOf('=');
  if (eq <= 0) {
    return undefined;
  }
  const lhs = afterKind.slice(0, eq).trim();
  if (!lhs) {
    return undefined;
  }
  let rhs = afterKind.slice(eq + 1);
  while (rhs.length > 0 && isAsciiWs(rhs[0]!)) {
    rhs = rhs.slice(1);
  }
  return { kind, lhs, rhs };
}

/** Префикс-ключ (Операция / Объект / Открыть…) + опциональный хвост. */
export function matchKeywordPrefix(
  line: string,
  keyword: string,
): { rest: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === keyword) {
    return { rest: '' };
  }
  if (!trimmed.startsWith(keyword)) {
    return undefined;
  }
  const next = trimmed[keyword.length];
  if (next !== undefined && !isAsciiWs(next)) {
    return undefined;
  }
  let rest = trimmed.slice(keyword.length);
  while (rest.length > 0 && isAsciiWs(rest[0]!)) {
    rest = rest.slice(1);
  }
  return { rest };
}

const LANGUAGE_BLOCK_HEADS = [
  'Если',
  'ИначеЕсли',
  'Иначе',
  'Цикл',
  'ДляКаждого',
  'Пока',
  'Попробовать',
  'Перехватить',
  'Финализировать',
  'Поймать',
  'ВКонце',
  'Группа',
  'Пусть',
  'Секрет',
  'Элемент',
  'Локатор',
  'Селектор',
  'КоллекцияЭлементов',
  'Операция',
  'Прервать',
  'Продолжить',
] as const;

function hasAtBraceBlock(text: string): boolean {
  const at = text.indexOf('>@');
  if (at < 0) {
    return false;
  }
  let i = at + 2;
  while (i < text.length && isAsciiWs(text[i]!)) {
    i += 1;
  }
  return text[i] === '{';
}

function languageKeywordAt(text: string, i: number): boolean {
  if (i > 0) {
    const prev = text[i - 1]!;
    if (!isAsciiWs(prev) && prev !== '{') {
      return false;
    }
  }
  for (const kw of LANGUAGE_BLOCK_HEADS) {
    if (!text.startsWith(kw, i)) {
      continue;
    }
    const next = text[i + kw.length];
    if (next === undefined || isAsciiWs(next) || next === '{' || next === '(') {
      return true;
    }
  }
  return false;
}

function hasLanguageKeyword(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (languageKeywordAt(text, i)) {
      return true;
    }
  }
  return false;
}

/** Языковой блок / try (`? …`) / ` >@ {` — зеркало прежнего LANGUAGE_BLOCK_RE. */
export function looksLikeLanguageBlock(text: string): boolean {
  return (
    text.trimStart().startsWith('?') || hasAtBraceBlock(text) || hasLanguageKeyword(text)
  );
}

const ELEMENT_DECL_HEADS = [
  'Элемент',
  'Локатор',
  'Селектор',
  'КоллекцияЭлементов',
] as const;

function parseElementDeclId(restRaw: string): string | undefined {
  let rest = restRaw;
  while (rest.length > 0 && isAsciiWs(rest[0]!)) {
    rest = rest.slice(1);
  }
  if (rest.startsWith('$')) {
    rest = rest.slice(1);
  }
  let i = 0;
  if (i >= rest.length || !/[A-Za-z_]/.test(rest[i]!)) {
    return undefined;
  }
  i += 1;
  while (i < rest.length && /[A-Za-z0-9_]/.test(rest[i]!)) {
    i += 1;
  }
  const id = rest.slice(0, i);
  let after = rest.slice(i);
  while (after.length > 0 && isAsciiWs(after[0]!)) {
    after = after.slice(1);
  }
  if (!after.startsWith('=') || !id) {
    return undefined;
  }
  return id;
}

/** `Элемент email = …` / `Локатор $x = …` — id без regex. */
export function matchElementDecl(line: string): string | undefined {
  const trimmed = line.trim();
  for (const head of ELEMENT_DECL_HEADS) {
    if (!trimmed.startsWith(head)) {
      continue;
    }
    const next = trimmed[head.length];
    if (next !== undefined && !isAsciiWs(next)) {
      continue;
    }
    const id = parseElementDeclId(trimmed.slice(head.length));
    if (id !== undefined) {
      return id;
    }
  }
  return undefined;
}

/** Обрезать хвостовые `_` / ведущие `_` без `/^_+|_+$/`. */
export function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '_') {
    start += 1;
  }
  while (end > start && value[end - 1] === '_') {
    end -= 1;
  }
  return value.slice(start, end);
}

/** `label (hint)` → `label` без `\s*\(.*\)$`. */
export function stripTrailingParenLabel(label: string): string {
  const open = label.indexOf('(');
  if (open < 0) {
    return label.trim();
  }
  return label.slice(0, open).trimEnd();
}
