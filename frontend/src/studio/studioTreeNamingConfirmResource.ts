/**
 * Resource create/rename confirm (S3776).
 */
import { resourceAsError } from './studioResources';
import type { NamingState } from './studioTreeNaming';
import {
  confirmNamingEntity,
  type ConfirmNamingActions,
} from './studioTreeNamingConfirmTypes';

export function confirmResourceModes(
  naming: NamingState,
  value: string,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'rename-resource') {
    const resourceIndex = naming.resourceIndex;
    confirmNamingEntity(
      value,
      {
        isRename: true,
        focusOnError: false,
        validate: resourceAsError,
        taken: false,
        takenMsg: '',
        create: () => actions.createResource(value),
        createFailMsg: 'Не удалось создать ресурс (имя занято или неверно)',
        rename: () => actions.renameResource(resourceIndex, value),
        renameFailMsg: 'Не удалось переименовать ресурс',
      },
      actions,
    );
    return true;
  }
  if (naming.mode === 'create-resource') {
    confirmNamingEntity(
      value,
      {
        isRename: false,
        focusOnError: false,
        validate: resourceAsError,
        taken: false,
        takenMsg: '',
        create: () => actions.createResource(value),
        createFailMsg: 'Не удалось создать ресурс (имя занято или неверно)',
        rename: () => true,
        renameFailMsg: 'Не удалось переименовать ресурс',
      },
      actions,
    );
    return true;
  }
  return false;
}
