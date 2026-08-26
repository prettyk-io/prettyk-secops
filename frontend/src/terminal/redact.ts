/**
 * CDP-WIRE POC-CDP-5 — redaction (UI-сторона).
 *
 * Инвариант PoC: plaintext-значения (пароли, токены, введённый текст)
 * НИКОГДА не появляются в proposal UI, Diff и Monaco. В wire хранится
 * только reference (`$value` / `$secret`), а не сам plaintext.
 *
 * Когда Boss отдаст живой Type-event с реальным значением, Flash обязан
 * прогнать его через `redactValue` до любого рендера/сохранения.
 */

/** Placeholder для чувствительного введённого значения. */
export const SECRET_PLACEHOLDER = '$secret';

/** Placeholder для обычного (не-секретного) введённого значения Type-шага. */
export const VALUE_PLACEHOLDER = '$value';

/** Reference/replacement-переменная — начинается с `$`, трогать не надо. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('$');
}

/**
 * Заменить plaintext на placeholder. Уже-placeholder (`$...`) возвращается
 * как есть (reference не маскируется повторно). Пустое → пустое.
 */
export function redactValue(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (isPlaceholder(trimmed)) return trimmed;
  return SECRET_PLACEHOLDER;
}

/**
 * Redact для Type-шага: введённое значение → `$value` (reference),
 * чтобы wire не хранил plaintext. Секрет остаётся `$secret`.
 */
export function redactTypedValue(value: string | null | undefined): string {
  if (value == null) return VALUE_PLACEHOLDER;
  const trimmed = value.trim();
  if (trimmed === '') return VALUE_PLACEHOLDER;
  if (isPlaceholder(trimmed)) return trimmed;
  return VALUE_PLACEHOLDER;
}
