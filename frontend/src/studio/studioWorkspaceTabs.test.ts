import { describe, expect, it } from 'vitest';
import { mergeTabsAfterKindDelete } from './studioWorkspaceTabs';
import type { StudioTab } from './studioTabs';

const tab = (id: string, title = id): StudioTab => ({
  id: id as StudioTab['id'],
  title,
  language: 'pk-constructor',
  path: '',
  readOnly: false,
  kind: 'constructor',
});

describe('studioWorkspaceTabs', () => {
  it('merges replacement tabs and activates fallback when active kind deleted', () => {
    const hub = (tabs: StudioTab[]) => [...tabs, tab('action-hub', 'Hub')];
    const { tabs, activate } = mergeTabsAfterKindDelete({
      prev: [tab('scenario:0', 'A'), tab('page:x', 'P')],
      kindPrefix: 'scenario:',
      replacementTabs: [tab('scenario:0', 'B')],
      activeTabId: 'scenario:0',
      activateHubWhenNoDocuments: hub,
    });
    expect(tabs.map((t) => t.id)).toEqual(['page:x', 'scenario:0']);
    expect(activate?.id).toBe('scenario:0');
  });

  it('activates hub when no documents remain', () => {
    const hubbed = [tab('action-hub', 'Hub')];
    const { tabs, activate } = mergeTabsAfterKindDelete({
      prev: [tab('fuzzer:0')],
      kindPrefix: 'fuzzer:',
      replacementTabs: [],
      activeTabId: 'fuzzer:0',
      activateHubWhenNoDocuments: () => hubbed,
    });
    expect(tabs).toEqual(hubbed);
    expect(activate).toBeUndefined();
  });
});
