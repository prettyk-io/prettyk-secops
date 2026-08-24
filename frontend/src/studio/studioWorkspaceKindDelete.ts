/**
 * Rebuild open-tab lists after kind-delete (scenario/module/fuzzer/resource).
 */
import type { StudioTree } from './collectStudioNodes';
import { tabFromNode } from './collectStudioNodes';
import type { StudioTab } from './studioTabs';
import { scenarioIndexFromTabId } from './studioTabs';

function filterDefined<T>(items: Array<T | undefined>): T[] {
  return items.filter((item): item is T => item !== undefined);
}

/** Open scenario titles currently mapped from open tabs. */
export function openScenarioTitlesFromTabs(
  tabs: readonly StudioTab[],
  tree: StudioTree,
): string[] {
  return filterDefined(
    tabs
      .filter((tab) => tab.id.startsWith('scenario:'))
      .map((tab) => {
        const index = scenarioIndexFromTabId(tab.id);
        return index === undefined ? undefined : tree.scenarios[index]?.title;
      }),
  );
}

export function rebuildScenarioTabs(
  tree: StudioTree,
  titlesToKeep: readonly string[],
): StudioTab[] {
  return filterDefined(
    titlesToKeep.map((title) => tree.scenarios.find((item) => item.title === title)),
  ).map((item) => tabFromNode(item));
}

export function openModuleIdsFromTabs(
  tabs: readonly StudioTab[],
  tree: StudioTree,
): string[] {
  return filterDefined(
    tabs
      .filter((tab) => tab.id.startsWith('module:'))
      .map((tab) => {
        const index = Number(tab.id.slice('module:'.length));
        return Number.isFinite(index) ? tree.modules[index]?.moduleId : undefined;
      }),
  );
}

export function rebuildModuleTabs(
  tree: StudioTree,
  idsToKeep: readonly string[],
): StudioTab[] {
  return filterDefined(
    idsToKeep.map((id) => tree.modules.find((item) => item.moduleId === id)),
  ).map((item) => tabFromNode(item));
}

export function openFuzzerIdsFromTabs(
  tabs: readonly StudioTab[],
  tree: StudioTree,
): string[] {
  return filterDefined(
    tabs
      .filter((tab) => tab.id.startsWith('fuzzer:'))
      .map((tab) => {
        const index = Number(tab.id.slice('fuzzer:'.length));
        return Number.isFinite(index) ? tree.fuzzers[index]?.fuzzerId : undefined;
      }),
  );
}

export function rebuildFuzzerTabs(
  tree: StudioTree,
  idsToKeep: readonly string[],
): StudioTab[] {
  return filterDefined(
    idsToKeep.map((id) => tree.fuzzers.find((item) => item.fuzzerId === id)),
  ).map((item) => tabFromNode(item));
}

export function openResourceAsFromTabs(
  tabs: readonly StudioTab[],
  tree: StudioTree,
): string[] {
  return filterDefined(
    tabs
      .filter((tab) => tab.id.startsWith('resource:'))
      .map((tab) => {
        const index = Number(tab.id.slice('resource:'.length));
        return Number.isFinite(index) ? tree.resources[index]?.as : undefined;
      }),
  );
}

export function rebuildResourceTabs(
  tree: StudioTree,
  asToKeep: readonly string[],
): StudioTab[] {
  return filterDefined(
    asToKeep.map((as) => tree.resources.find((item) => item.as === as)),
  ).map((item) => tabFromNode(item));
}
