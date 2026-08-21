/**
 * confirmNaming mode dispatch — extract from StudioBlocksTree (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import type { NamingState } from './studioTreeNaming';
import { confirmFolderModes } from './studioTreeNamingConfirmFolder';
import { confirmFuzzerModes } from './studioTreeNamingConfirmFuzzer';
import { confirmModuleModes } from './studioTreeNamingConfirmModule';
import { confirmPageModes } from './studioTreeNamingConfirmPage';
import { confirmResourceModes } from './studioTreeNamingConfirmResource';
import { confirmScenarioModes } from './studioTreeNamingConfirmScenario';
import type { ConfirmNamingActions } from './studioTreeNamingConfirmTypes';

export type { ConfirmNamingActions } from './studioTreeNamingConfirmTypes';

/** Dispatch naming confirm by mode. */
export function runConfirmNaming(
  naming: NamingState,
  value: string,
  tree: StudioTree,
  actions: ConfirmNamingActions,
): void {
  if (confirmFolderModes(naming, value, actions)) {
    return;
  }
  if (confirmPageModes(naming, value, tree, actions)) {
    return;
  }
  if (confirmScenarioModes(naming, value, tree, actions)) {
    return;
  }
  if (confirmModuleModes(naming, value, tree, actions)) {
    return;
  }
  if (confirmFuzzerModes(naming, value, tree, actions)) {
    return;
  }
  confirmResourceModes(naming, value, actions);
}
