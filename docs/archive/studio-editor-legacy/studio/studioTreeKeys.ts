/**
 * Ключи дерева Studio (folder / group / section) — S3776 extract.
 * Контракт строк как в StudioBlocksTree (не менять префиксы).
 */
import type { EditorFolderSection } from './studioFolders';
import type { StudioTabId } from './studioTabs';
import type { StudioTreeSection } from './studioTreeOrder';

export const GROUP_PAGES = 'group:pages';
export const GROUP_SCENARIOS = 'group:scenarios';
export const GROUP_FUZZERS = 'group:fuzzers';
export const GROUP_RESOURCES = 'group:resources';
export const GROUP_MODULES = 'group:modules';
export const GROUP_AUTH = 'group:auth';

export const ALL_GROUP_KEYS: string[] = [
  GROUP_PAGES,
  GROUP_SCENARIOS,
  GROUP_FUZZERS,
  GROUP_RESOURCES,
  GROUP_MODULES,
  GROUP_AUTH,
];

export function folderKey(section: EditorFolderSection, folderId: string): string {
  return `folder:${section}:${folderId}`;
}

export function folderDropZoneKey(section: EditorFolderSection, folderId: string): string {
  return `folder-drop-zone:${section}:${folderId}`;
}

export function parseFolderKey(
  key: string,
): { section: EditorFolderSection; folderId: string } | undefined {
  if (!key.startsWith('folder:')) {
    return undefined;
  }
  const rest = key.slice('folder:'.length);
  const colon = rest.indexOf(':');
  if (colon < 0) {
    return undefined;
  }
  const section = rest.slice(0, colon);
  const folderId = rest.slice(colon + 1);
  if (
    (section !== 'pages' && section !== 'scenarios' && section !== 'modules') ||
    !folderId
  ) {
    return undefined;
  }
  return { section, folderId };
}

export function parseFolderDropZoneKey(
  key: string,
): { section: EditorFolderSection; folderId: string } | undefined {
  if (!key.startsWith('folder-drop-zone:')) {
    return undefined;
  }
  const rest = key.slice('folder-drop-zone:'.length);
  const colon = rest.indexOf(':');
  if (colon < 0) {
    return undefined;
  }
  const section = rest.slice(0, colon);
  const folderId = rest.slice(colon + 1);
  if (
    (section !== 'pages' && section !== 'scenarios' && section !== 'modules') ||
    !folderId
  ) {
    return undefined;
  }
  return { section, folderId };
}

export function sectionForGroupKey(key: string): StudioTreeSection | undefined {
  if (key === GROUP_PAGES) {
    return 'pages';
  }
  if (key === GROUP_SCENARIOS) {
    return 'scenarios';
  }
  if (key === GROUP_MODULES) {
    return 'modules';
  }
  if (key === GROUP_FUZZERS) {
    return 'fuzzers';
  }
  if (key === GROUP_RESOURCES) {
    return 'resources';
  }
  if (key === GROUP_AUTH) {
    return 'modules';
  }
  return undefined;
}

/** Folder DnD/create только pages + scenarios (как в дереве). */
export function isFolderSection(section: StudioTreeSection): section is EditorFolderSection {
  return section === 'pages' || section === 'scenarios';
}

export function folderEntityLabel(section: EditorFolderSection): string {
  if (section === 'pages') {
    return 'модель страницы';
  }
  if (section === 'scenarios') {
    return 'сценарий';
  }
  return 'модуль';
}

export function groupKeyForSection(section: StudioTreeSection): string | undefined {
  if (section === 'pages') {
    return GROUP_PAGES;
  }
  if (section === 'scenarios') {
    return GROUP_SCENARIOS;
  }
  if (section === 'modules') {
    return GROUP_MODULES;
  }
  if (section === 'fuzzers') {
    return GROUP_FUZZERS;
  }
  if (section === 'resources') {
    return GROUP_RESOURCES;
  }
  return undefined;
}

/** Tab id → selectable tree key (Hub и прочие не-листья → undefined). */
export function selectedTreeKey(tabId: StudioTabId | undefined): string | undefined {
  if (!tabId) {
    return undefined;
  }
  if (
    tabId.startsWith('page:') ||
    tabId.startsWith('module:') ||
    tabId.startsWith('fuzzer:') ||
    tabId.startsWith('resource:') ||
    /^scenario:\d+$/.test(tabId)
  ) {
    return tabId;
  }
  return undefined;
}
