/**
 * Module create/rename confirm (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import { moduleDisplayError } from './studioModules';
import type { NamingState } from './studioTreeNaming';
import {
  confirmNamingEntity,
  type ConfirmNamingActions,
} from './studioTreeNamingConfirmTypes';

export function confirmModuleModes(
  naming: NamingState,
  value: string,
  tree: StudioTree,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'rename-module') {
    const moduleIndex = naming.moduleIndex;
    const currentLabel = tree.modules[moduleIndex]?.title ?? '';
    confirmNamingEntity(
      value,
      {
        isRename: true,
        focusOnError: false,
        validate: moduleDisplayError,
        taken:
          value !== currentLabel && tree.modules.map((item) => item.title).includes(value),
        takenMsg: `Модуль «${value}» уже есть`,
        create: () => actions.createModule(value),
        createFailMsg: 'Не удалось создать модуль',
        rename: () => value === currentLabel || actions.renameModule(moduleIndex, value),
        renameFailMsg: 'Не удалось переименовать модуль',
      },
      actions,
    );
    return true;
  }
  if (naming.mode === 'create-module') {
    confirmNamingEntity(
      value,
      {
        isRename: false,
        focusOnError: false,
        validate: moduleDisplayError,
        taken: tree.modules.map((item) => item.title).includes(value),
        takenMsg: `Модуль «${value}» уже есть`,
        create: () => actions.createModule(value),
        createFailMsg: 'Не удалось создать модуль',
        rename: () => true,
        renameFailMsg: 'Не удалось переименовать модуль',
      },
      actions,
    );
    return true;
  }
  return false;
}
