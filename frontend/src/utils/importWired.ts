/**
 * Импорт JSON-болванки манифеста (без JSON Schema — VNEXT).
 * Только JSON.parse: валидация по схеме ушла вместе с RJSF.
 */

export type WiredImportResult =
  | { ok: true; formData: unknown }
  | { ok: false; reason: 'json' };

export function importWiredJson(text: string): WiredImportResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    return { ok: true, formData: parsed };
  } catch {
    return { ok: false, reason: 'json' };
  }
}

export function importWiredErrorMessage(
  fileName: string,
  fail: { ok: false; reason: 'json' },
): string {
  return `${fileName}: это не JSON (синтаксис)`;
}
