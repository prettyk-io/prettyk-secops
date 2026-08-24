/**
 * Build scenario tab payload after addScenario (S3776).
 */
import { scenarioConstructorPointer, scenarioTabId, type StudioTab } from './studioTabs';

export function scenarioTabAfterCreate(
  data: unknown,
  name: string,
): StudioTab | undefined {
  const suites = (data as { test_suites?: { scenarios?: unknown[] } }).test_suites;
  const index = Array.isArray(suites?.scenarios) ? suites.scenarios.length - 1 : -1;
  if (index < 0) {
    return undefined;
  }
  const tabId = scenarioTabId(index);
  return {
    id: tabId,
    title: name,
    language: 'pk-constructor',
    path: scenarioConstructorPointer(index),
    readOnly: false,
    kind: 'constructor',
  };
}
