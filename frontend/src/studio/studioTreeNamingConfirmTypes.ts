/**
 * Naming confirm shared types + entity helper (S3776).
 */
import type { EditorFolderSection } from './studioFolders';
import {
  confirmCreateOrRenameEntity,
  type ConfirmEntityHandlers,
  type ConfirmEntityOpts,
} from './studioTreeNaming';

export type ConfirmNamingActions = ConfirmEntityHandlers & {
  createFolder: (section: EditorFolderSection, title: string) => boolean;
  renameFolder: (section: EditorFolderSection, folderId: string, title: string) => boolean;
  createPage: (id: string, title: string) => boolean;
  renamePage: (pageId: string, title: string) => boolean;
  deletePage: (pageId: string) => void;
  createScenario: (id: string, description?: string) => boolean;
  renameScenario: (index: number, name: string) => boolean;
  deleteScenario: (index: number) => void;
  createModule: (label: string) => boolean;
  renameModule: (index: number, label: string) => boolean;
  createFuzzer: (id: string) => boolean;
  renameFuzzer: (index: number, id: string) => boolean;
  createResource: (as: string) => boolean;
  renameResource: (index: number, as: string) => boolean;
};

export function confirmNamingEntity(
  value: string,
  opts: ConfirmEntityOpts,
  actions: ConfirmNamingActions,
): void {
  confirmCreateOrRenameEntity(value, opts, {
    reject: actions.reject,
    cancel: actions.cancel,
    moveToFolder: actions.moveToFolder,
  });
}
