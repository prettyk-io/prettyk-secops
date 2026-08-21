/**
 * AC после `ФаззингВолна ` / `ЗапуститьФаззер `: id из test_suites.fuzzers[].
 */
import type * as monacoNs from 'monaco-editor';
import type { CompletionList } from './completionTypes';

const WAVE_HEADS = new Set(['ФаззингВолна', 'ЗапуститьФаззер']);

export function listFuzzerIdsFromFormData(formData: unknown): string[] {
  const root =
    formData !== null && typeof formData === 'object' && !Array.isArray(formData)
      ? (formData as Record<string, unknown>)
      : undefined;
  const suites =
    root?.test_suites !== null &&
    typeof root?.test_suites === 'object' &&
    !Array.isArray(root.test_suites)
      ? (root.test_suites as Record<string, unknown>)
      : undefined;
  const fuzzers = Array.isArray(suites?.fuzzers) ? suites.fuzzers : [];
  const ids: string[] = [];
  for (const item of fuzzers) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim()) {
        ids.push(id.trim());
      }
    }
  }
  return ids.sort((a, b) => a.localeCompare(b, 'ru'));
}

/** `ФаззингВолна juice_` → подсказки id. */
export function suggestFuzzWaveArgs(
  monaco: typeof monacoNs,
  trimmedStart: string,
  defaultRange: monacoNs.IRange,
  formData: unknown,
): CompletionList | undefined {
  const parts = trimmedStart.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  const head = parts[0]!;
  if (!WAVE_HEADS.has(head)) {
    return undefined;
  }
  // Только когда уже есть пробел после MethodId (иначе root AC MethodId).
  if (!/\s/.test(trimmedStart)) {
    return undefined;
  }
  if (parts.length > 2) {
    return undefined;
  }
  const prefix = parts.length === 2 ? parts[1]! : '';
  const ids = listFuzzerIdsFromFormData(formData);
  if (ids.length === 0) {
    return {
      suggestions: [
        {
          label: '(нет фаззеров)',
          kind: monaco.languages.CompletionItemKind.Text,
          insertText: '',
          detail: 'Создай сущность в дереве Фаззеры',
          range: defaultRange,
          sortText: '0_empty',
        },
      ],
    };
  }
  const filtered = prefix
    ? ids.filter((id) => id.toLowerCase().startsWith(prefix.toLowerCase()))
    : ids;
  const list = filtered.length > 0 ? filtered : ids;
  return {
    suggestions: list.map((id) => ({
      label: id,
      kind: monaco.languages.CompletionItemKind.Reference,
      insertText: id,
      detail: 'fuzzer id → test_suites.fuzzers',
      documentation: {
        value: `Вызов: \`${head} ${id}\` → wire \`fuzz|wave|${id}\``,
      },
      range: defaultRange,
      sortText: `0_${id}`,
    })),
  };
}
