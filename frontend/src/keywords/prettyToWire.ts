/**
 * PrettyK / MethodId / Пусть → wire (зеркало ensure_wire + pretty_line_to_wire).
 * Управляющие Если/Цикл/try оставляем; листья и data-строки переводим.
 */
import { wireFromCallRhs, wireFromCoreRhs } from './prettyDataLine';
import { resolveMethodCall } from './prettyToWireCall';
import { stripRef } from './refs';
import { matchPrettyAssign } from './textScan';

const WIRE_COMPONENTS = new Set([
  'webdriver',
  'browser',
  'zap',
  'http',
  'data',
  'core',
  'allure',
  'inspector',
]);

/** Слова языка, которые сами по себе не MethodId-вызов. */
const RESERVED_LANGUAGE_WORDS = new Set([
  'Пусть',
  'Секрет',
  'Список',
  'Объект',
  'Словарь',
  'Элемент',
  'Локатор',
  'Селектор',
  'КоллекцияЭлементов',
  'Добавить',
  'Удалить',
  'Размер',
  'Содержит',
  'Склеить',
  'Подстрока',
  'Заменить',
  'Разделить',
  'Обрезать',
  'СовпадаетРег',
  'ЗаменитьРег',
  'ИзвлечьРег',
  'ИзвлечьРегВсе',
  'РазделитьРег',
  'Начинается',
  'Заканчивается',
  'Верхний',
  'Нижний',
  'ВзятьДо',
  'ВзятьПосле',
  'Убрать',
  'Импорт',
  'Если',
  'ИначеЕсли',
  'Иначе',
  'То',
  'Цикл',
  'ДляКаждого',
  'В',
  'Пока',
  
  
  'Поймать',
  'ВКонце',
  'Группа',
  'Прервать',
  'Продолжить',
  'Завершить',
  'ДобавитьВСписок',
  'УдалитьИзСписка',
  'ПоложитьВОбъект',
  'ВзятьИзОбъекта',
]);

/** core RHS справа от Пусть (orchestrator/core/pretty_data._CORE_RHS). */
const CORE_RHS: Record<string, { action: string; min: number; max: number }> = {
  uuid: { action: 'generate_uuid', min: 0, max: 0 },
  случайнаястрока: { action: 'generate_random_string', min: 0, max: 2 },
  случайноечисло: { action: 'generate_random_int', min: 2, max: 2 },
  случайныйemail: { action: 'generate_random_email', min: 0, max: 1 },
  случайныйтелефон: { action: 'generate_random_phone', min: 0, max: 1 },
  случайныебуквы: { action: 'generate_random_letters', min: 0, max: 1 },
  случайныестрочные: { action: 'generate_random_lowercase', min: 0, max: 1 },
  случайныепрописные: { action: 'generate_random_uppercase', min: 0, max: 1 },
  случайныецифры: { action: 'generate_random_digits', min: 0, max: 1 },
  пошаблону: { action: 'generate_from_pattern', min: 1, max: 1 },
  сейчас: { action: 'current_datetime', min: 0, max: 1 },
  таймстамп: { action: 'current_timestamp', min: 0, max: 0 },
  форматдаты: { action: 'format_datetime', min: 1, max: 2 },
  разобратьдату: { action: 'parse_datetime', min: 1, max: 2 },
};

export function isQuotedScalar(v: string): boolean {
  if (v.length < 2) {
    return false;
  }
  let quote = '';
  if (v.startsWith('"')) {
    quote = '"';
  } else if (v.startsWith("'")) {
    quote = "'";
  }
  return quote !== '' && v.endsWith(quote);
}

function isRefPathChar(ch: string): boolean {
  return (
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= 'a' && ch <= 'z') ||
    (ch >= '0' && ch <= '9') ||
    ch === '_' ||
    ch === '.' ||
    ch === '[' ||
    ch === ']'
  );
}

/** Канон ссылки: $name / ${name} (для Размер и Секрет RHS). */
export function isRefToken(v: string): boolean {
  if (v.startsWith('${') && v.endsWith('}') && v.length > 3) {
    return !v.slice(2, -1).includes('}');
  }
  if (!v.startsWith('$') || v.length < 2) {
    return false;
  }
  const body = v.slice(1);
  if (!/[A-Za-z_]/.test(body[0]!)) {
    return false;
  }
  for (let i = 1; i < body.length; i += 1) {
    if (!isRefPathChar(body[i]!)) {
      return false;
    }
  }
  return true;
}

/** Голый идентификатор (не $ref, не \"…\", не число) — типичный косяк вместо $var. */
export function isBarePrettyArg(token: string): boolean {
  const t = token.trim();
  if (!t || isQuotedScalar(t) || isRefToken(t)) {
    return false;
  }
  const low = t.toLowerCase();
  if (low === 'true' || low === 'false' || low === 'null' || low === 'none') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    return false;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(t);
}

function skipAsciiWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i] ?? '')) {
    i += 1;
  }
  return i;
}

function skipQuoted(s: string, i: number): number {
  const quote = s[i]!;
  i += 1;
  while (i < s.length && s[i] !== quote) {
    if (s[i] === '\\' && i + 1 < s.length) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return i < s.length ? i + 1 : i;
}

function skipNonWs(s: string, i: number): number {
  while (i < s.length && !/\s/.test(s[i] ?? '')) {
    i += 1;
  }
  return i;
}

/** Грубый скан аргументов pretty (кавычки / $ref / пробел). */
export function hasBarePrettyArg(rest: string): boolean {
  const s = rest.trim();
  if (!s) {
    return false;
  }
  let i = 0;
  while (i < s.length) {
    i = skipAsciiWs(s, i);
    if (i >= s.length) {
      break;
    }
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(s, i);
      continue;
    }
    if (ch === '$') {
      i = skipNonWs(s, i);
      continue;
    }
    const j = skipNonWs(s, i);
    if (isBarePrettyArg(s.slice(i, j))) {
      return true;
    }
    i = j;
  }
  return false;
}

/**
 * Секрет: пусто / голый value / склейка — зеркало BE assert_clean_assignment_rhs.
 * Пусть: только пустое (остальное — core/MethodId RHS).
 */
export function isBadSecretRhs(value: string): boolean {
  const v = value.trim();
  if (!v) {
    return true;
  }
  if (isQuotedScalar(v) || isRefToken(v)) {
    return false;
  }
  return true;
}

/** @deprecated имя; см. isBadSecretRhs / пустой RHS */
export function isGluedAssignmentRhs(value: string): boolean {
  return isBadSecretRhs(value);
}

export function looksLikeWire(text: string): boolean {
  const head = text.trim().split('|', 1)[0]?.trim().toLowerCase() ?? '';
  return WIRE_COMPONENTS.has(head);
}

export { readQuotedPrettyArg, readRefPrettyArg } from './prettyArgsSplit';
export { splitPrettyArgTokens as splitPrettyArgs } from './prettyArgsSplit';

function lhsPath(token: string): string {
  const raw = token.trim();
  const fromRef = stripRef(raw);
  if (fromRef !== undefined) {
    return fromRef;
  }
  return raw.startsWith('$') ? raw.slice(1) : raw;
}

function withSaveAs(wire: string, path: string): string {
  return `${wire} → ${path}`;
}

/**
 * `Пусть ${email} = СлучайныйEmail` → `core|generate_random_email → email`
 * `Пусть ${role} = "admin"` → `data|let|role|"admin"`
 */
export function resolvePrettyDataLine(text: string): string | undefined {
  const raw = text.trim();
  const assign = matchPrettyAssign(raw);
  if (!assign) {
    return undefined;
  }
  const kind = assign.kind;
  const path = lhsPath(assign.lhs);
  const value = assign.rhs.trim();
  if (!path || !value) {
    return undefined;
  }
  const dataAction = kind.toLowerCase() === 'секрет' ? 'secret' : 'let';
  // Секрет: только "…" / $ref — иначе плейсхолдер value или склейка со следующей строкой.
  if (dataAction === 'secret' && isBadSecretRhs(value)) {
    return undefined;
  }

  const fromCore = wireFromCoreRhs(value, path, CORE_RHS, withSaveAs);
  if (fromCore !== 'miss') {
    return fromCore;
  }

  const fromCall = wireFromCallRhs(value, path, resolveCall, withSaveAs);
  if (fromCall !== undefined) {
    return fromCall;
  }

  // Как runtime: RHS в wire как есть (кавычки остаются частью значения).
  return `data|${dataAction}|${path}|${value}`;
}

/**
 * `Нажать css .ok` → `webdriver|click|css|.ok`
 * Уже wire / не MethodId → undefined.
 */
export function resolveCall(text: string): string | undefined {
  return resolveMethodCall(text, RESERVED_LANGUAGE_WORDS, looksLikeWire);
}

export { ensureWireLine, prettyTextToWire } from './prettyWireLine';
