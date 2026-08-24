/**
 * Folder create/rename confirm (S3776).
 */
import type { NamingState } from './studioTreeNaming';
import type { ConfirmNamingActions } from './studioTreeNamingConfirmTypes';

export function confirmFolderModes(
  naming: NamingState,
  value: string,
  actions: ConfirmNamingActions,
): boolean {
  if (naming.mode === 'create-folder') {
    if (!value) {
      actions.cancel();
      return true;
    }
    if (!actions.createFolder(naming.section, value)) {
      actions.reject(`Папка «${value}» уже есть`);
      return true;
    }
    actions.cancel();
    return true;
  }
  if (naming.mode === 'rename-folder') {
    if (!value) {
      actions.reject('Название папки не может быть пустым');
      return true;
    }
    if (!actions.renameFolder(naming.section, naming.folderId, value)) {
      actions.reject(`Папка «${value}» уже есть`);
      return true;
    }
    actions.cancel();
    return true;
  }
  return false;
}
