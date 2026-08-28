/**
 * DSL-L2: Sugar DSL парсер.
 *
 * Разбор строки Sugar DSL → ParsedSugarLine и обратно.
 * Грамматика: verb [locator] [args...] [modifiers...]
 *
 * Locator: первый не-глагольный токен (для глаголов с локатором: все кроме Ждать/Скрин).
 * Args: позиционные значения между локатором и модификаторами.
 * Modifiers: `>?` (опциональный), `-> $var` (сохранить), `># текст` (подсказка).
 */

import type { ParsedSugarLine, SugarLocator, SugarModifierEntry, SugarVerb } from '../core/interfaces/sugar';

/** Глаголы, которым НЕ нужен локатор (первый токен после глагола — аргумент). */
const VERBS_WITHOUT_LOCATOR: ReadonlySet<SugarVerb> = new Set(['Ждать', 'Скрин']);

/** Все 10 канонических глаголов. */
const ALL_VERBS: ReadonlySet<string> = new Set<SugarVerb>([
  'Клик', 'Вставить', 'Ждать', 'Скрин', 'Текст',
  'Значение', 'Атрибут', 'Дописать', 'Очистить', 'Выбрать',
]);

function isSugarVerb(s: string): s is SugarVerb {
  return ALL_VERBS.has(s);
}

// ── Токенизация ──

interface Token {
  value: string;
  start: number;
  quoted: boolean;
}

/**
 * Разбивает строку Sugar DSL на токены.
 * Post-processing склеивает разорванные `-` + `>` → `->` и т.д.
 */
function tokenize(line: string): Token[] {
  const raw: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (line[i] === ' ' || line[i] === '\t') {
      i++;
      continue;
    }

    // Модификаторы: >? | -> | >#
    if (line[i] === '>') {
      if (i + 1 < len && line[i + 1] === '?') {
        raw.push({ value: '>?', start: i, quoted: false });
        i += 2;
        continue;
      }
      if (i + 1 < len && (line[i + 1] === '-' || line[i + 1] === '#')) {
        const ch = line[i + 1]!;
        raw.push({ value: line[i] + ch, start: i, quoted: false });
        i += 2;
        continue;
      }
      raw.push({ value: '>', start: i, quoted: false });
      i++;
      continue;
    }

    // Кавычки
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      const start = i;
      i++;
      let value = '';
      while (i < len && line[i] !== quote) {
        if (line[i] === '\\' && i + 1 < len) {
          value += line[i + 1];
          i += 2;
        } else {
          value += line[i];
          i++;
        }
      }
      if (i < len) i++;
      raw.push({ value, start, quoted: true });
      continue;
    }

    // Обычное слово: до пробела или >
    const tokStart = i;
    let value = '';
    while (i < len && line[i] !== ' ' && line[i] !== '\t' && line[i] !== '>') {
      value += line[i];
      i++;
    }
    raw.push({ value, start: tokStart, quoted: false });
  }

  // ── Post-processing: склеиваем разорванные `-` + `>` → `->` и т.д. ──
  const tokens: Token[] = [];
  let t = 0;
  while (t < raw.length) {
    const cur = raw[t]!;
    // `-` + `>` → `->`
    if (cur.value === '-' && t + 1 < raw.length && raw[t + 1]!.value === '>') {
      tokens.push({ value: '->', start: cur.start, quoted: false });
      t += 2;
      continue;
    }
    // `>` + `?` → `>?`
    if (cur.value === '>' && t + 1 < raw.length && raw[t + 1]!.value === '?') {
      tokens.push({ value: '>?', start: cur.start, quoted: false });
      t += 2;
      continue;
    }
    // `>` + `#` → `>#`
    if (cur.value === '>' && t + 1 < raw.length && raw[t + 1]!.value === '#') {
      tokens.push({ value: '>#', start: cur.start, quoted: false });
      t += 2;
      continue;
    }
    tokens.push(cur);
    t++;
  }

  return tokens;
}

// ── Разбор локатора ──

function detectLocatorStrategy(raw: string): SugarLocator {
  const prefixMatch = raw.match(/^(role|label|test_id|css|text|placeholder|xpath):(.+)/);
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    return { strategy: prefixMatch[1] as SugarLocator['strategy'], value: prefixMatch[2] };
  }
  if (/^#[a-zA-Z_][\w-]*$/.test(raw)) {
    return { strategy: 'test_id', value: raw.slice(1) };
  }
  if (/^\.[a-zA-Z_][\w-]*$/.test(raw)) {
    return { strategy: 'css', value: raw };
  }
  if (raw.startsWith('//') || raw.startsWith('/')) {
    return { strategy: 'xpath', value: raw };
  }
  return { strategy: 'text', value: raw };
}

// ── Публичный API ──

export function parseSugarLine(line: string): ParsedSugarLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return null;

  const first = tokens[0]!;
  if (!isSugarVerb(first.value)) return null;
  const verb: SugarVerb = first.value;

  let pos = 1;
  let locator: SugarLocator;
  const args: string[] = [];
  const modifiers: SugarModifierEntry[] = [];

  // ── locator ──
  if (!VERBS_WITHOUT_LOCATOR.has(verb)) {
    if (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok && !tok.value.startsWith('>')) {
        locator = detectLocatorStrategy(tok.value);
        pos++;
      } else {
        return null; // требует локатор, но его нет
      }
    } else {
      return null; // требует локатор, но токенов больше нет
    }
  } else {
    locator = { strategy: 'text', value: '' };
  }

  // ── args ──
  while (pos < tokens.length) {
    const tok = tokens[pos]!;
    // Останавливаемся на любом модификаторе (в т.ч. склеенном `->`)
    if (tok.value.startsWith('>') || tok.value === '->') break;
    args.push(tok.value);
    pos++;
  }

  // ── modifiers ──
  while (pos < tokens.length) {
    const tok = tokens[pos]!;
    if (tok.value === '>?') {
      modifiers.push({ kind: '>?' });
      pos++;
      continue;
    }
    if (tok.value === '->') {
      pos++;
      if (pos < tokens.length && tokens[pos]!.value.startsWith('$')) {
        modifiers.push({ kind: '->', value: tokens[pos]!.value });
        pos++;
      } else {
        modifiers.push({ kind: '->' });
      }
      continue;
    }
    if (tok.value === '>#') {
      pos++;
      const hintParts: string[] = [];
      while (pos < tokens.length && !tokens[pos]!.value.startsWith('>')) {
        hintParts.push(tokens[pos]!.value);
        pos++;
      }
      modifiers.push({ kind: '>#', value: hintParts.join(' ') });
      continue;
    }
    pos++;
  }

  return {
    verb, locator, args, modifiers, raw: trimmed,
  };
}

export function formatSugarLine(parsed: ParsedSugarLine): string {
  const parts: string[] = [parsed.verb];

  if (parsed.locator.value && !VERBS_WITHOUT_LOCATOR.has(parsed.verb)) {
    const needsQuoting = parsed.locator.value.includes(' ');
    parts.push(needsQuoting ? `"${parsed.locator.value}"` : parsed.locator.value);
  }

  for (const arg of parsed.args) {
    const needsQuoting = arg.includes(' ');
    parts.push(needsQuoting ? `"${arg}"` : arg);
  }

  for (const mod of parsed.modifiers) {
    if (mod.kind === '>?') {
      parts.push('>?');
    } else if (mod.kind === '->') {
      parts.push(mod.value ? `-> ${mod.value}` : '->');
    } else if (mod.kind === '>#') {
      parts.push(mod.value ? `># ${mod.value}` : '>#');
    }
  }

  return parts.join(' ');
}