import { describe, expect, it } from 'vitest';
import { actionHubDraftTab } from './studioTabs';
import { planOpenHubDraftTab } from './studioWorkspaceHubOpen';

describe('planOpenHubDraftTab', () => {
  it('reuses existing hub or appends draft', () => {
    const hub = actionHubDraftTab();
    expect(planOpenHubDraftTab([hub]).tabs).toBeUndefined();
    expect(planOpenHubDraftTab([hub]).activeTabId).toBe('action-hub');
    const planned = planOpenHubDraftTab([]);
    expect(planned.tabs).toHaveLength(1);
    expect(planned.activeTabId).toBe('action-hub');
  });
});
