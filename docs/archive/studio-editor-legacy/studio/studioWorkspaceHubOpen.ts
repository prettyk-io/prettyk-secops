/**
 * Open / focus Action Hub draft tab (S3776).
 */
import { actionHubDraftTab, type StudioTab, type StudioTabId } from './studioTabs';

export type OpenHubDraftResult = {
  tabs?: StudioTab[];
  activeTabId: StudioTabId;
};

/** Ensure action-hub tab exists and becomes active. */
export function planOpenHubDraftTab(tabs: readonly StudioTab[]): OpenHubDraftResult {
  if (tabs.some((tab) => tab.id === 'action-hub')) {
    return { activeTabId: 'action-hub' };
  }
  return {
    tabs: [...tabs, actionHubDraftTab()],
    activeTabId: 'action-hub',
  };
}
