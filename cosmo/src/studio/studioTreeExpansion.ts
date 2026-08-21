/**
 * localStorage expansion state for StudioBlocksTree (S3776).
 */
import { ALL_GROUP_KEYS } from './studioTreeKeys';

export type StoredTreeExpansion = {
  folders?: string[];
  collapsedGroups?: string[];
};

export type ParsedTreeExpansion = {
  folders: string[];
  collapsedGroups: string[];
};

function stringKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((key): key is string => typeof key === 'string');
}

const DEFAULT_COLLAPSED_GROUPS = Object.freeze([]);

/** Parse legacy (string[]) or object expansion payload. */
export function parseStoredTreeExpansion(raw: string | null): ParsedTreeExpansion {
  if (!raw) {
    return { folders: [], collapsedGroups: [...DEFAULT_COLLAPSED_GROUPS] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { folders: stringKeys(parsed), collapsedGroups: [...DEFAULT_COLLAPSED_GROUPS] };
    }
    const expansion = parsed as StoredTreeExpansion;
    return {
      folders: stringKeys(expansion.folders),
      collapsedGroups: stringKeys(expansion.collapsedGroups).filter((key) =>
        ALL_GROUP_KEYS.includes(key),
      ),
    };
  } catch {
    return { folders: [], collapsedGroups: [...DEFAULT_COLLAPSED_GROUPS] };
  }
}

export function serializeTreeExpansion(
  folders: readonly string[],
  collapsedGroups: readonly string[],
): string {
  const stored: StoredTreeExpansion = {
    folders: [...folders],
    collapsedGroups: [...collapsedGroups],
  };
  return JSON.stringify(stored);
}
