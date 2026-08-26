/**
 * CO-PILOT META (PoC) — redaction для движка.
 *
 * Инвариант: plaintext-секреты НИКОГДА не попадают в skeleton, proposal,
 * trace, evidence или статус. Всё чувствительное → `$secret` / `$value`
 * (reference), а не сам текст.
 *
 * Переиспользует `terminal/redact.ts` (Flash-канон `$secret`/`$value`).
 */

import { redactTypedValue, isPlaceholder, VALUE_PLACEHOLDER, SECRET_PLACEHOLDER } from '../terminal/redact';

/** Маркеры чувствительного ввода. */
const SECRET_HINTS = [
  /парол/i,
  /passw/i,
  /токен/i,
  /token/i,
  /secret/i,
  /секрет/i,
  /api[_-]?key/i,
  /bearer/i,
  /код подтвержд/i,
  /sms-?код/i,
  /пин/i,
  /pin/i,
];

/** Определить: похоже ли значение на секрет? */
export function looksSecret(value: string): boolean {
  return SECRET_HINTS.some((re) => re.test(value));
}

/**
 * Redact чувствительного значения для wire/proposal/skeleton.
 * — уже-placeholder (`$...`) → как есть (reference не маскируется повторно);
 * — похоже на секрет → `$secret`;
 * — обычное введённое значение → `$value` (wire не хранит plaintext);
 * — пустое → пустое.
 */
export function redactForEngine(value: string | null | undefined, isSecret = false): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (isPlaceholder(trimmed)) return trimmed;
  if (isSecret || looksSecret(trimmed)) return SECRET_PLACEHOLDER;
  return redactTypedValue(trimmed); // → $value
}

/** Проверить: содержит ли текст потенциальный plaintext-секрет (для аудита).
 *  Ловит паттерн `<secret-key> = <non-$ значение>` — т.е. plaintext-значение
 *  рядом с секретным ключом. Placeholder (`$secret`/`$value`) не считается утечкой. */
const SECRET_VALUE_LEAK_RE =
  /(?:парол|passw|токен|token|secret|секрет|api[_-]?key|bearer|пин|pin)\w*\s*(?:=|:|= )\s*(?!\$)[^\s,;]+/i;

export function containsPlainSecret(text: string): boolean {
  return SECRET_VALUE_LEAK_RE.test(text);
}

export { VALUE_PLACEHOLDER, SECRET_PLACEHOLDER, isPlaceholder };
