/**
 * Редact чувствительных строковых полей манифеста перед download/copy/draft,
 * плюс маска RHS у `Секрет $name = …` в конструкторах / WireK preview (G-59).
 */

const SECRET_KEY_EXACT = new Set([
  'Пароль',
  'password',
  'Password',
  'secret',
  'Secret',
  'api_key',
  'apiKey',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
]);

const SECRET_KEY_NORM = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'api-key',
  'apikey',
  'client_secret',
  'client-secret',
  'clientsecret',
]);

export const REDACT_PLACEHOLDER = '***';

/** Пустой placeholder для draft в localStorage — не восстанавливаем plaintext. */
export const DRAFT_SECRET_PLACEHOLDER = '';

export function isSecretFieldKey(key: string): boolean {
  if (SECRET_KEY_EXACT.has(key)) {
    return true;
  }
  return SECRET_KEY_NORM.has(key.toLowerCase());
}

function redactDeep(value: unknown, placeholder: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, placeholder));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretFieldKey(key) && typeof child === 'string') {
        out[key] = child.length > 0 ? placeholder : child;
      } else {
        out[key] = redactDeep(child, placeholder);
      }
    }
    return out;
  }
  return value;
}

/** Download / clipboard: структура сохраняется, секреты → "***". */
export function redactWiredSecrets(data: unknown): unknown {
  return redactDeep(data, REDACT_PLACEHOLDER);
}

/** Draft: секреты не пишем в plaintext (пустая строка). */
export function redactSecretsForDraft(data: unknown): unknown {
  return redactDeep(data, DRAFT_SECRET_PLACEHOLDER);
}

/* ── `Секрет $name = …` RHS masking ── */

function skipWs(text: string, i: number): number {
  let k = i;
  while (k < text.length && (text[k] === ' ' || text[k] === '\t')) {
    k += 1;
  }
  return k;
}

function isAssignBoundary(text: string, i: number): boolean {
  return i === 0 || text[i - 1] === '\n' || text[i - 1] === '{' || text[i - 1] === ';';
}

function skipIdentToken(text: string, i: number): number {
  let k = i;
  while (
    k < text.length &&
    text[k] !== ' ' &&
    text[k] !== '\t' &&
    text[k] !== '=' &&
    text[k] !== '\n'
  ) {
    k += 1;
  }
  return k;
}

function skipRhsValue(text: string, i: number): number {
  let k = i;
  while (k < text.length && text[k] !== '\n' && text[k] !== '{' && text[k] !== ';') {
    k += 1;
  }
  return k;
}

/** After boundary + `Секрет`, find `=` and start of RHS; undefined if not an assign. */
function findSecretRhsStart(text: string, afterKeyword: number): number | undefined {
  if (afterKeyword >= text.length || (text[afterKeyword] !== ' ' && text[afterKeyword] !== '\t')) {
    return undefined;
  }
  let k = skipWs(text, afterKeyword);
  k = skipIdentToken(text, k);
  k = skipWs(text, k);
  if (text[k] !== '=') {
    return undefined;
  }
  k = skipWs(text, k + 1);
  if (k >= text.length || text[k] === '\n' || text[k] === '{' || text[k] === ';') {
    return undefined;
  }
  return k;
}

/** If `i` starts a `Секрет … = rhs` at a boundary, return slice end after placeholder replace. */
export function tryRedactSecretAssignmentAt(
  text: string,
  i: number,
  placeholder: string,
): { next: number; prefix: string; placeholder: string } | undefined {
  if (!isAssignBoundary(text, i)) {
    return undefined;
  }
  const j = skipWs(text, i);
  if (!text.startsWith('Секрет', j)) {
    return undefined;
  }
  const rhsStart = findSecretRhsStart(text, j + 'Секрет'.length);
  if (rhsStart === undefined) {
    return undefined;
  }
  return {
    next: skipRhsValue(text, rhsStart),
    prefix: text.slice(i, rhsStart),
    placeholder,
  };
}

/**
 * Маска RHS у строк `Секрет $name = …` в конструкторах / WireK preview (G-59).
 * Кавычки и `$ref` заменяются на `***`, структура строки сохраняется.
 */
export function redactSecretAssignmentLines(
  text: string,
  placeholder: string = REDACT_PLACEHOLDER,
): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const hit = tryRedactSecretAssignmentAt(text, i, placeholder);
    if (hit) {
      out.push(hit.prefix);
      out.push(hit.placeholder);
      i = hit.next;
      continue;
    }
    out.push(text[i]!);
    i += 1;
  }
  return out.join('');
}

function redactConstructorStrings(value: unknown, placeholder: string): unknown {
  if (typeof value === 'string') {
    return redactSecretAssignmentLines(value, placeholder);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactConstructorStrings(item, placeholder));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactConstructorStrings(child, placeholder);
    }
    return out;
  }
  return value;
}

/**
 * Предпросмотр Form: authoring-структура, но без plaintext секретов и `Секрет … =`.
 * Не путать с export runtime (там ещё flatten).
 */
export function redactWiredForPreview(data: unknown): unknown {
  const keyed = redactWiredSecrets(data);
  return redactConstructorStrings(keyed, REDACT_PLACEHOLDER);
}
