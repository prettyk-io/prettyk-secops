/**
 * Penguin / client gate: ФаззингВолна <id> и fuzz|wave|<id> → id есть в test_suites.fuzzers.
 */
import type { ConstructorBatchFail } from '../api/editorValidate';
import { batchFailFromClientDiag } from '../api/editorValidate';
import type { CollectedConstructor } from '../keywords/constructor';
import { resolveCall } from '../keywords/prettyToWire';

function fuzzerIdsFromFormData(data: unknown): Set<string> {
  const root =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const suites =
    root?.test_suites !== null &&
    typeof root?.test_suites === 'object' &&
    !Array.isArray(root.test_suites)
      ? (root.test_suites as Record<string, unknown>)
      : undefined;
  const fuzzers = Array.isArray(suites?.fuzzers) ? suites.fuzzers : [];
  const ids = new Set<string>();
  for (const item of fuzzers) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim()) {
        ids.add(id.trim());
      }
    }
  }
  return ids;
}

function waveFuzzerIdFromLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }
  const wire = resolveCall(trimmed) ?? (trimmed.includes('|') ? trimmed : undefined);
  if (!wire) {
    return undefined;
  }
  const parts = wire.split('|');
  if (parts[0] !== 'fuzz' || parts[1] !== 'wave') {
    return undefined;
  }
  const id = (parts[2] ?? '').trim();
  return id || undefined;
}

/** Ошибки «нет такого фаззера» для batch/penguin. */
export function collectFuzzerRefFails(
  fields: readonly CollectedConstructor[],
  data: unknown,
): ConstructorBatchFail[] {
  const known = fuzzerIdsFromFormData(data);
  const fails: ConstructorBatchFail[] = [];
  for (const field of fields) {
    const lines = field.text.split(/\n/);
    let offset = 0;
    for (const line of lines) {
      const id = waveFuzzerIdFromLine(line);
      if (id && !known.has(id)) {
        const start = offset + (line.length - line.trimStart().length);
        fails.push(
          batchFailFromClientDiag(
            field,
            {
              message: `ФаззингВолна: фаззер «${id}» не найден в test_suites.fuzzers`,
              start,
              end: start + line.trim().length,
            },
            data,
          ),
        );
        break;
      }
      offset += line.length + 1;
    }
  }
  return fails;
}
