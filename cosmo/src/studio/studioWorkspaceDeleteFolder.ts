/**
 * Resolve folder members → delete targets (descending indices for safe remove).
 */
import type { StudioPageNode, StudioTree } from './collectStudioNodes';

/** Pages in folder by title (stable pageId). */
export function resolveFolderPages(
  tree: StudioTree,
  memberTitles: readonly string[],
): StudioPageNode[] {
  return memberTitles
    .map((title) => tree.pages.find((item) => item.title === title))
    .filter((item): item is StudioPageNode => item !== undefined);
}

/** Scenario indices high→low so removeScenario shifts stay valid. */
export function resolveFolderScenarioIndicesDesc(
  tree: StudioTree,
  memberTitles: readonly string[],
): number[] {
  return memberTitles
    .map(
      (title) => tree.scenarios.find((item) => item.title === title)?.scenarioIndex,
    )
    .filter((index): index is number => index !== undefined)
    .sort((left, right) => right - left);
}

/** Module indices high→low. */
export function resolveFolderModuleIndicesDesc(
  tree: StudioTree,
  memberIds: readonly string[],
): number[] {
  return memberIds
    .map(
      (moduleId) =>
        tree.modules.find((item) => item.moduleId === moduleId)?.moduleIndex,
    )
    .filter((index): index is number => index !== undefined)
    .sort((left, right) => right - left);
}
