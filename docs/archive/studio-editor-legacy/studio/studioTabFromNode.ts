/**
 * StudioEditableNode → StudioTab (S3776).
 */
import type { StudioTab, StudioTabId } from './studioTabs';

/** Minimal node shape — avoids cycle with collectStudioNodes. */
export type EditableTabNode = {
  kind: 'page' | 'scenario' | 'module' | 'fuzzer' | 'resource';
  tabId: StudioTabId;
  title: string;
  path?: string;
  needsName?: boolean;
  resourceIndex?: number;
  fuzzerIndex?: number;
};

export function tabFromEditableNode(node: EditableTabNode): StudioTab {
  if (node.kind === 'resource') {
    return {
      id: node.tabId,
      title: node.title,
      language: 'resource-form',
      path: '',
      readOnly: false,
      kind: 'resource',
      resourceIndex: node.resourceIndex ?? 0,
    };
  }
  if (node.kind === 'fuzzer') {
    return {
      id: node.tabId,
      title: node.title,
      language: 'fuzzer-form',
      path: '',
      readOnly: false,
      kind: 'fuzzer',
      fuzzerIndex: node.fuzzerIndex ?? 0,
    };
  }
  if (node.kind === 'page') {
    return {
      id: node.tabId,
      title: node.needsName ? 'Модель (имя…)' : node.title,
      language: 'pk-constructor',
      path: node.path ?? '',
      readOnly: false,
      kind: 'constructor',
    };
  }
  return {
    id: node.tabId,
    title: node.title,
    language: 'pk-constructor',
    path: node.path ?? '',
    readOnly: false,
    kind: 'constructor',
  };
}

export function findEditableByTabId<T extends { tabId: StudioTabId }>(
  groups: readonly (readonly T[])[],
  tabId: StudioTabId,
): T | undefined {
  for (const group of groups) {
    for (const item of group) {
      if (item.tabId === tabId) {
        return item;
      }
    }
  }
  return undefined;
}
