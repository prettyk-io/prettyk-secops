/**
 * Содержимое ресурсов в браузере (draft): as → text.
 * На диск хоста не пишем; уходит в zip suite при экспорте.
 */

const STORAGE_KEY = 'pk.resourceContents.v1';

export type ResourceContentsMap = Record<string, string>;

export function loadResourceContents(): ResourceContentsMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: ResourceContentsMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveResourceContents(map: ResourceContentsMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota */
  }
}

export function clearResourceContents(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function renameContentKey(
  map: ResourceContentsMap,
  fromAs: string,
  toAs: string,
): ResourceContentsMap {
  if (fromAs === toAs || !(fromAs in map)) {
    return map;
  }
  const next = { ...map };
  next[toAs] = next[fromAs] ?? '';
  delete next[fromAs];
  return next;
}

export function removeContentKey(map: ResourceContentsMap, as: string): ResourceContentsMap {
  if (!(as in map)) {
    return map;
  }
  const next = { ...map };
  delete next[as];
  return next;
}

export function previewLines(text: string, maxLines = 12): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }
  return `${lines.slice(0, maxLines).join('\n')}\n…`;
}
