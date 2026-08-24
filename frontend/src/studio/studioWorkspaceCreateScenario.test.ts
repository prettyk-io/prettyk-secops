import { describe, expect, it } from 'vitest';
import { scenarioTabAfterCreate } from './studioWorkspaceCreateScenario';

describe('scenarioTabAfterCreate', () => {
  it('builds tab for last scenario index', () => {
    const data = { test_suites: { scenarios: [{ name: 'A' }, { name: 'B' }] } };
    const tab = scenarioTabAfterCreate(data, 'B');
    expect(tab?.id).toBe('scenario:1');
    expect(tab?.title).toBe('B');
    expect(tab?.path).toContain('/1/');
  });
});
