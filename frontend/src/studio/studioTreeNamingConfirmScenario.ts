/**
 * Scenario create/rename confirm (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import { scenarioNameError } from './studioScenarios';
import type { NamingState } from './studioTreeNaming';
import {
  confirmNamingEntity,
  type ConfirmNamingActions,
} from './studioTreeNamingConfirmTypes';

export function confirmScenarioModes(
  naming: NamingState,
  value: string,
  tree: StudioTree,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'rename-scenario') {
    const scenarioIndex = naming.scenarioIndex;
    const removeIfEmpty = naming.removeIfEmpty;
    const currentName = tree.scenarios[scenarioIndex]?.title ?? '';
    confirmNamingEntity(
      value,
      {
        isRename: true,
        validate: scenarioNameError,
        taken:
          value !== currentName && tree.scenarios.map((item) => item.title).includes(value),
        takenMsg: `Сценарий «${value}» уже есть`,
        create: () => actions.createScenario(value),
        createFailMsg: 'Не удалось создать сценарий',
        rename: () => actions.renameScenario(scenarioIndex, value),
        renameFailMsg: 'Не удалось переименовать',
        folderSection: 'scenarios',
        emptyDeletes: () => {
          if (removeIfEmpty) {
            actions.deleteScenario(scenarioIndex);
          }
        },
      },
      actions,
    );
    return true;
  }
  if (naming.mode === 'create-scenario') {
    confirmNamingEntity(
      value,
      {
        isRename: false,
        validate: scenarioNameError,
        taken: tree.scenarios.map((item) => item.title).includes(value),
        takenMsg: `Сценарий «${value}» уже есть`,
        create: () => actions.createScenario(value),
        createFailMsg: 'Не удалось создать сценарий',
        rename: () => true,
        renameFailMsg: 'Не удалось переименовать',
        folderId: naming.folderId,
        folderSection: 'scenarios',
      },
      actions,
    );
    return true;
  }
  return false;
}
