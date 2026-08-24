/**
 * Page create/rename confirm (S3776).
 */
import type { StudioTree } from './collectStudioNodes';
import { pageDisplayError } from './studioPages';
import type { NamingState } from './studioTreeNaming';
import {
  confirmNamingEntity,
  type ConfirmNamingActions,
} from './studioTreeNamingConfirmTypes';

export function confirmPageModes(
  naming: NamingState,
  value: string,
  tree: StudioTree,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'rename-page') {
    const pageId = naming.pageId;
    const removeIfEmpty = naming.removeIfEmpty;
    const currentTitle = tree.pages.find((item) => item.pageId === pageId)?.title ?? '';
    confirmNamingEntity(
      value,
      {
        isRename: true,
        validate: pageDisplayError,
        taken: value !== currentTitle && tree.pages.map((item) => item.title).includes(value),
        takenMsg: `Модель данных «${value}» уже есть`,
        create: () => actions.createPage(value, value),
        createFailMsg: 'Не удалось создать модель данных',
        rename: () => value === currentTitle || actions.renamePage(pageId, value),
        renameFailMsg: 'Не удалось переименовать',
        folderSection: 'pages',
        emptyDeletes: () => {
          if (removeIfEmpty) {
            actions.deletePage(pageId);
          }
        },
      },
      actions,
    );
    return true;
  }
  if (naming.mode === 'create-page') {
    confirmNamingEntity(
      value,
      {
        isRename: false,
        validate: pageDisplayError,
        taken: tree.pages.map((item) => item.title).includes(value),
        takenMsg: `Модель данных «${value}» уже есть`,
        create: () => actions.createPage(value, value),
        createFailMsg: 'Не удалось создать модель данных',
        rename: () => true,
        renameFailMsg: 'Не удалось переименовать',
        folderId: naming.folderId,
        folderSection: 'pages',
      },
      actions,
    );
    return true;
  }
  return false;
}
