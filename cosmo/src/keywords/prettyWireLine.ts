/**
 * Line/text PrettyK → wire (S3776 extract from prettyToWire).
 */
import { resolveCall, resolvePrettyDataLine } from './prettyToWire';
import { ensureWirePrimary } from './prettyWireEnsure';

/** Одна строка: data / MethodId → wire, иначе исходник. */
export function ensureWireLine(line: string): string {
  return ensureWirePrimary(line, resolvePrettyDataLine, resolveCall);
}

/** Весь текст constructor → wire построчно. */
export function prettyTextToWire(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.includes('\n')) {
    // Scenario failsafe marker alone / on single line — не трогаем.
    if (normalized.startsWith('<!>')) {
      return normalized;
    }
    return ensureWireLine(normalized).trim();
  }
  return normalized
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
        return line;
      }
      // 1-я строка `<!>` — scenario failsafe, не MethodId.
      if (index === 0 && line.startsWith('<!>')) {
        return line;
      }
      return ensureWireLine(line);
    })
    .join('\n');
}
