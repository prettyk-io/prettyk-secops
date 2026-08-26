/**
 * Immutable JSON Pointer get/set (S3776).
 */

type AsRecord = (value: unknown) => Record<string, unknown> | undefined;

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Сегменты JSON Pointer; пустые сохраняем (`/pages//ctor` → ключ ""). */
export function pointerTokens(pointer: string): string[] {
  const raw = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (raw.length === 0) {
    return [];
  }
  return raw.split('/').map(decodePointerToken);
}

function looksLikeIndex(token: string | undefined): boolean {
  if (token === undefined || token.length === 0) {
    return false;
  }
  for (const ch of token) {
    if (ch < '0' || ch > '9') {
      return false;
    }
  }
  return true;
}

function emptyChildForRest(nextToken: string | undefined): unknown {
  if (looksLikeIndex(nextToken)) {
    return [];
  }
  return {};
}

export function setAtTokens(
  data: unknown,
  tokens: string[],
  value: unknown,
  asRecord: AsRecord,
): unknown {
  const [head, ...rest] = tokens;
  if (head === undefined) {
    return value;
  }
  if (rest.length === 0) {
    if (Array.isArray(data)) {
      const index = Number(head);
      const next = data.slice();
      if (Number.isInteger(index) && index >= 0) {
        next[index] = value;
      }
      return next;
    }
    const record = asRecord(data) ?? {};
    return { ...record, [head]: value };
  }

  if (Array.isArray(data)) {
    const index = Number(head);
    const source = data as unknown[];
    const next = source.slice();
    const child = Number.isInteger(index) && index >= 0 ? source[index] : undefined;
    next[index] = setAtTokens(child ?? emptyChildForRest(rest[0]), rest, value, asRecord);
    return next;
  }

  const record = asRecord(data) ?? {};
  const child = record[head];
  return {
    ...record,
    [head]: setAtTokens(child ?? emptyChildForRest(rest[0]), rest, value, asRecord),
  };
}

export function getAtPointerTokens(
  data: unknown,
  tokens: string[],
  asRecord: AsRecord,
): unknown {
  let cursor: unknown = data;
  for (const token of tokens) {
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }
    const record = asRecord(cursor);
    if (!record || !(token in record)) {
      return undefined;
    }
    cursor = record[token];
  }
  return cursor;
}
