/**
 * Guide height + hover visibility for StudioBlocksTree (S3776 extract).
 */
import { syncFolderGuides } from './studioTreeFolderGuides';
import { syncSectionGuides } from './studioTreeSectionGuides';

export type TreePointerPos = { x: number; y: number };

export type SyncTreeGuidesState = {
  treeElement: HTMLElement;
  pointerPos: TreePointerPos | null;
  hoveredSectionKey: string | undefined;
  isAnimating: boolean;
  /** Mutated when elementFromPoint resolves a section under the pointer. */
  setHoveredSectionKey: (key: string | undefined) => void;
  /** Schedule another sync when layout not ready (empty descendants). */
  requestRetry: () => void;
};

export function sectionKeyForElement(
  treeElement: HTMLElement,
  target: EventTarget | null,
): string | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const item = target.closest<HTMLElement>('[role="treeitem"]');
  if (!item) {
    return undefined;
  }
  const treeItems = Array.from(treeElement.querySelectorAll<HTMLElement>('[role="treeitem"]'));
  const itemIndex = treeItems.indexOf(item);
  if (itemIndex < 0) {
    return undefined;
  }
  const sectionNode = treeItems
    .slice(0, itemIndex + 1)
    .reverse()
    .find((candidate) => candidate.classList.contains('pk-studio-tree-section-node'));
  return (
    sectionNode?.querySelector('[data-pk-tree-key]')?.getAttribute('data-pk-tree-key') ??
    undefined
  );
}

function clearSectionGuide(section: HTMLElement): void {
  section.classList.remove('pk-studio-tree-section-guide');
  section.classList.remove('pk-studio-tree-section-guide-visible');
  section.style.removeProperty('--pk-section-guide-height');
}

function clearFolderGuide(folder: HTMLElement): void {
  folder.classList.remove('pk-studio-tree-folder-guide');
  folder.classList.remove('pk-studio-tree-folder-guide-visible');
  folder.style.removeProperty('--pk-folder-guide-height');
}

function resolveHoveredKey(state: SyncTreeGuidesState): string | undefined {
  let currentHoveredKey = state.hoveredSectionKey;
  const pos = state.pointerPos;
  if (!pos) {
    return currentHoveredKey;
  }
  const el = document.elementFromPoint(pos.x, pos.y);
  if (!el || !state.treeElement.contains(el)) {
    return currentHoveredKey;
  }
  const resolvedKey = sectionKeyForElement(state.treeElement, el);
  if (resolvedKey) {
    currentHoveredKey = resolvedKey;
    state.setHoveredSectionKey(resolvedKey);
  }
  return currentHoveredKey;
}

/** Apply section/folder guide classes and heights from pointer + expansion. */
export function syncTreeGuides(state: SyncTreeGuidesState): void {
  const { treeElement, isAnimating } = state;
  const treeItems = Array.from(treeElement.querySelectorAll<HTMLElement>('[role="treeitem"]'));
  const sections = treeItems.filter((item) =>
    item.classList.contains('pk-studio-tree-section-node'),
  );
  const currentHoveredKey = resolveHoveredKey(state);
  const needsRetry = syncSectionGuides(
    treeItems,
    sections,
    currentHoveredKey,
    isAnimating,
    clearSectionGuide,
  );
  syncFolderGuides(
    treeElement,
    treeItems,
    currentHoveredKey,
    isAnimating,
    clearFolderGuide,
    sectionKeyForElement,
  );
  if (needsRetry) {
    state.requestRetry();
  }
}

export type TreeGuidePointerState = {
  pointerPos: TreePointerPos | null;
  hoveredSectionKey: string | undefined;
};

export function applyTreePointerMove(
  treeElement: HTMLElement,
  state: TreeGuidePointerState,
  event: PointerEvent,
): void {
  state.pointerPos = { x: event.clientX, y: event.clientY };
  const nextKey = sectionKeyForElement(treeElement, event.target);
  if (nextKey !== state.hoveredSectionKey) {
    state.hoveredSectionKey = nextKey;
  }
}

/** Clear pointer when leaving the tree bounds. Returns true if cleared. */
export function applyTreePointerLeave(
  state: TreeGuidePointerState,
  treeElement: HTMLElement,
  event: PointerEvent,
): boolean {
  const rect = treeElement.getBoundingClientRect();
  if (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  ) {
    return false;
  }
  state.pointerPos = null;
  state.hoveredSectionKey = undefined;
  return true;
}
