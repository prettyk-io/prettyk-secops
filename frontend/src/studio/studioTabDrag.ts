/**
 * Tab strip DnD / middle-click helpers for StudioWorkspace (S3776).
 */
import { isStudioTabId, type StudioTabId } from './studioTabs';
import type { TabDropEdge } from './studioTabOrder';

/** data-node-key на .ant-tabs-tab, если это документная вкладка. */
export function documentTabIdFromNodeKey(key: string | null | undefined): StudioTabId | undefined {
  if (!key || key === 'action-hub' || !isStudioTabId(key)) {
    return undefined;
  }
  return key;
}

export function tabIdFromTabsEventTarget(
  target: EventTarget | null,
): StudioTabId | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const tabEl = target.closest('.ant-tabs-tab');
  return documentTabIdFromNodeKey(tabEl?.getAttribute('data-node-key'));
}

export type TabDropHint = { id: StudioTabId; edge: TabDropEdge };

export function nextTabDropHint(
  prev: TabDropHint | null,
  id: StudioTabId,
  edge: TabDropEdge,
): TabDropHint {
  if (prev?.id === id && prev.edge === edge) {
    return prev;
  }
  return { id, edge };
}
