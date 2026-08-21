/**
 * Tab merge after kind-delete in StudioWorkspace (S3776).
 */
import {
  isDocumentStudioTab,
  type StudioTab,
  type StudioTabId,
} from './studioTabs';

export type MergeTabsAfterKindDeleteArgs = {
  prev: StudioTab[];
  /** e.g. `scenario:` / `module:` / `fuzzer:` / `resource:` */
  kindPrefix: string;
  replacementTabs: StudioTab[];
  activeTabId: string | undefined;
  activateHubWhenNoDocuments: (tabs: StudioTab[]) => StudioTab[];
};

export type MergeTabsAfterKindDeleteResult = {
  tabs: StudioTab[];
  /** Set when active tab was in deleted kind and needs remount. */
  activate?: StudioTab;
};

/** Drop tabs of a kind, append rebuilt ones, hub/fallback if needed. */
export function mergeTabsAfterKindDelete(
  args: MergeTabsAfterKindDeleteArgs,
): MergeTabsAfterKindDeleteResult {
  const { prev, kindPrefix, replacementTabs, activeTabId, activateHubWhenNoDocuments } = args;
  const kept = prev.filter((tab) => !tab.id.startsWith(kindPrefix));
  const merged = [...kept, ...replacementTabs];
  if (!merged.some(isDocumentStudioTab)) {
    return { tabs: activateHubWhenNoDocuments(merged) };
  }
  if (!activeTabId?.startsWith(kindPrefix)) {
    return { tabs: merged };
  }
  const stillActive = merged.find((tab) => tab.id === activeTabId);
  const fallback =
    stillActive ??
    [...merged].reverse().find(isDocumentStudioTab) ??
    merged[merged.length - 1];
  return { tabs: merged, activate: fallback };
}

export function applyActiveTabAfterMerge(
  activate: StudioTab | undefined,
  setActiveTabId: (id: StudioTabId | undefined) => void,
  syncLiveFromTab: (tab: StudioTab | undefined) => void,
): void {
  if (!activate) {
    return;
  }
  setActiveTabId(activate.id);
  syncLiveFromTab(activate);
}
