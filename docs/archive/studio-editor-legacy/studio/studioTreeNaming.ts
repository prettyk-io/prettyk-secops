/**
 * Naming state + confirm helpers for StudioBlocksTree (S3776).
 */
import type { EditorFolderSection } from './studioFolders';
import { fuzzerIdError } from './studioFuzzers';
import { moduleDisplayError } from './studioModules';
import { pageDisplayError } from './studioPages';
import { resourceAsError } from './studioResources';
import { scenarioNameError } from './studioScenarios';

export type NamingState =
  | { mode: 'create-page'; value: string; folderId?: string }
  | { mode: 'rename-page'; pageId: string; value: string; removeIfEmpty: boolean }
  | { mode: 'create-scenario'; value: string; folderId?: string }
  | { mode: 'rename-scenario'; scenarioIndex: number; value: string; removeIfEmpty: boolean }
  | { mode: 'create-module'; value: string; folderId?: string }
  | { mode: 'rename-module'; moduleIndex: number; value: string }
  | { mode: 'create-auth'; value: string }
  | { mode: 'create-fuzzer'; value: string }
  | { mode: 'rename-fuzzer'; fuzzerIndex: number; value: string }
  | { mode: 'create-resource'; value: string }
  | { mode: 'rename-resource'; resourceIndex: number; value: string }
  | { mode: 'create-folder'; section: EditorFolderSection; value: string }
  | { mode: 'rename-folder'; section: EditorFolderSection; folderId: string; value: string };

/** Ошибка формата для className; без setState родителя на каждый Backspace. */
export function namingValueHasError(mode: NamingState['mode'], value: string): boolean {
  if (value.trim().length === 0) {
    return false;
  }
  if (mode === 'create-page' || mode === 'rename-page') {
    return Boolean(pageDisplayError(value));
  }
  if (mode === 'create-scenario' || mode === 'rename-scenario') {
    return Boolean(scenarioNameError(value));
  }
  if (mode === 'create-module' || mode === 'rename-module' || mode === 'create-auth') {
    return Boolean(moduleDisplayError(value));
  }
  if (mode === 'create-fuzzer' || mode === 'rename-fuzzer') {
    return Boolean(fuzzerIdError(value));
  }
  if (mode === 'create-resource' || mode === 'rename-resource') {
    return Boolean(resourceAsError(value));
  }
  return false;
}

export type ConfirmEntityOpts = {
  validate?: (v: string) => string | undefined;
  taken: boolean;
  takenMsg: string;
  create?: () => boolean;
  createFailMsg: string;
  rename?: () => boolean;
  renameFailMsg: string;
  folderId?: string;
  folderSection?: EditorFolderSection;
  emptyDeletes?: () => void;
  isRename: boolean;
  focusOnError?: boolean;
};

export type ConfirmEntityHandlers = {
  reject: (msg: string, focus?: boolean) => void;
  cancel: () => void;
  moveToFolder: (section: EditorFolderSection, name: string, folderId: string) => void;
};

/** Shared create/rename confirm path. Returns true if handled (always). */
function runCreateOrRenameMutations(
  value: string,
  opts: ConfirmEntityOpts,
  handlers: ConfirmEntityHandlers,
): boolean {
  if (opts.isRename) {
    if (opts.rename && !opts.rename()) {
      handlers.reject(opts.renameFailMsg, false);
      return false;
    }
    return true;
  }
  if (opts.create && !opts.create()) {
    handlers.reject(opts.createFailMsg, false);
    return false;
  }
  if (opts.folderId && opts.folderSection) {
    handlers.moveToFolder(opts.folderSection, value, opts.folderId);
  }
  return true;
}

export function confirmCreateOrRenameEntity(
  value: string,
  opts: ConfirmEntityOpts,
  handlers: ConfirmEntityHandlers,
): void {
  const focusOnError = opts.focusOnError !== false;
  if (!value) {
    if (opts.isRename && opts.emptyDeletes) {
      opts.emptyDeletes();
    }
    handlers.cancel();
    return;
  }
  const err = opts.validate?.(value);
  if (err) {
    handlers.reject(err, focusOnError);
    return;
  }
  if (opts.taken) {
    handlers.reject(opts.takenMsg, focusOnError);
    return;
  }
  if (!runCreateOrRenameMutations(value, opts, handlers)) {
    return;
  }
  handlers.cancel();
}

const CREATE_NAMING_MODES = new Set([
  'create-page',
  'create-scenario',
  'create-module',
  'create-fuzzer',
  'create-resource',
]);

export function namingSessionKey(naming: NamingState | null): string | null {
  if (!naming) {
    return null;
  }
  if (CREATE_NAMING_MODES.has(naming.mode)) {
    return naming.mode;
  }
  if (naming.mode === 'rename-page') {
    return `rename-page:${naming.pageId}`;
  }
  if (naming.mode === 'rename-scenario') {
    return `rename-scenario:${String(naming.scenarioIndex)}`;
  }
  if (naming.mode === 'rename-module') {
    return `rename-module:${String(naming.moduleIndex)}`;
  }
  if (naming.mode === 'rename-fuzzer') {
    return `rename-fuzzer:${String(naming.fuzzerIndex)}`;
  }
  if (naming.mode === 'create-folder') {
    return `create-folder:${naming.section}`;
  }
  if (naming.mode === 'rename-folder') {
    return `rename-folder:${naming.section}:${naming.folderId}`;
  }
  return `rename-resource:${String((naming as { resourceIndex: number }).resourceIndex)}`;
}

export function creationFolderId(
  naming: NamingState | null,
  section: EditorFolderSection,
): string | undefined {
  if (section === 'pages' && naming?.mode === 'create-page') {
    return naming.folderId;
  }
  if (section === 'scenarios' && naming?.mode === 'create-scenario') {
    return naming.folderId;
  }
  if (section === 'modules' && naming?.mode === 'create-module') {
    return naming.folderId;
  }
  return undefined;
}
