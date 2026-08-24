import type { StudioTab, StudioTabId } from './studioTabs';

export type TabDropEdge = 'before' | 'after';

/** Переставить документную вкладку; `+` в openTabs не живёт. */
export function reorderStudioTabs(
  tabs: StudioTab[],
  dragId: StudioTabId,
  targetId: StudioTabId,
  edge: TabDropEdge,
): StudioTab[] {
  if (dragId === targetId) {
    return tabs;
  }
  const from = tabs.findIndex((tab) => tab.id === dragId);
  if (from < 0) {
    return tabs;
  }
  const next = [...tabs];
  const [item] = next.splice(from, 1);
  if (!item) {
    return tabs;
  }
  let to = next.findIndex((tab) => tab.id === targetId);
  if (to < 0) {
    return tabs;
  }
  if (edge === 'after') {
    to += 1;
  }
  next.splice(to, 0, item);
  return next;
}

export function tabDropEdgeFromPoint(tabEl: HTMLElement, clientX: number): TabDropEdge {
  const rect = tabEl.getBoundingClientRect();
  return clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}
