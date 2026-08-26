/**
 * Fuzzer create/rename confirm (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import { fuzzerIdError } from './studioFuzzers';
import type { NamingState } from './studioTreeNaming';
import {
  confirmNamingEntity,
  type ConfirmNamingActions,
} from './studioTreeNamingConfirmTypes';

export function confirmFuzzerModes(
  naming: NamingState,
  value: string,
  tree: StudioTree,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'rename-fuzzer') {
    const fuzzerIndex = naming.fuzzerIndex;
    confirmNamingEntity(
      value,
      {
        isRename: true,
        focusOnError: false,
        validate: fuzzerIdError,
        taken: false,
        takenMsg: `Fuzzer «${value}» уже есть`,
        create: () => actions.createFuzzer(value),
        createFailMsg: 'Не удалось создать fuzzer (имя занято или неверно)',
        rename: () => actions.renameFuzzer(fuzzerIndex, value),
        renameFailMsg: 'Не удалось переименовать fuzzer',
      },
      actions,
    );
    return true;
  }
  if (naming.mode === 'create-fuzzer') {
    confirmNamingEntity(
      value,
      {
        isRename: false,
        focusOnError: false,
        validate: fuzzerIdError,
        taken: tree.fuzzers.some((item) => item.title === value),
        takenMsg: `Fuzzer «${value}» уже есть`,
        create: () => actions.createFuzzer(value),
        createFailMsg: 'Не удалось создать fuzzer (имя занято или неверно)',
        rename: () => true,
        renameFailMsg: 'Не удалось переименовать fuzzer',
      },
      actions,
    );
    return true;
  }
  return false;
}
