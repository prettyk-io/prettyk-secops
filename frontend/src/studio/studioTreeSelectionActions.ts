/**
 * Explorer selection → delete/rename dispatch (S3776).
 */
import type { EditorFolderSection } from './studioFolders';
import { parseFolderKey } from './studioTreeKeys';
import type { NamingState } from './studioTreeNaming';

export type TreeLeafRef = { tabId: string; title: string };

export type TreeSelectionTree = {
  pages: Array<TreeLeafRef & { pageId: string }>;
  scenarios: Array<TreeLeafRef & { scenarioIndex: number }>;
  modules: Array<TreeLeafRef & { moduleIndex: number }>;
  fuzzers: Array<TreeLeafRef & { fuzzerIndex: number; fuzzerId?: string }>;
  resources: Array<TreeLeafRef & { resourceIndex: number; as?: string }>;
};

export type FolderLite = { id: string; title: string };

export type DeleteSelectionHandlers = {
  confirmDeleteFolder: (section: EditorFolderSection, folder: FolderLite) => void;
  confirmDeleteLeaf: (title: string, name: string, run: () => void) => void;
  onDeletePage: (pageId: string) => void;
  onDeleteScenario: (index: number) => void;
  onDeleteModule: (index: number) => void;
  onDeleteFuzzer: (index: number) => void;
  onDeleteResource: (index: number) => void;
  folders: Record<EditorFolderSection, FolderLite[]>;
};

function findByTabId<T extends TreeLeafRef>(items: T[], tabId: string): T | undefined {
  return items.find((item) => item.tabId === tabId);
}

function confirmLeafDeletion(
  treeSelection: string,
  tree: TreeSelectionTree,
  handlers: DeleteSelectionHandlers,
): boolean {
  if (treeSelection.startsWith('page:')) {
    const page = findByTabId(tree.pages, treeSelection);
    if (page) {
      handlers.confirmDeleteLeaf('Удалить модель страницы', page.title, () => {
        handlers.onDeletePage(page.pageId);
      });
    }
    return true;
  }
  if (treeSelection.startsWith('scenario:')) {
    const scenario = findByTabId(tree.scenarios, treeSelection);
    if (scenario) {
      handlers.confirmDeleteLeaf('Удалить сценарий', scenario.title, () => {
        handlers.onDeleteScenario(scenario.scenarioIndex);
      });
    }
    return true;
  }
  if (treeSelection.startsWith('module:')) {
    const module = findByTabId(tree.modules, treeSelection);
    if (module) {
      handlers.confirmDeleteLeaf('Удалить модуль', module.title, () => {
        handlers.onDeleteModule(module.moduleIndex);
      });
    }
    return true;
  }
  if (treeSelection.startsWith('fuzzer:')) {
    const fuzzer = findByTabId(tree.fuzzers, treeSelection);
    if (fuzzer) {
        handlers.confirmDeleteLeaf('Удалить фаззер', fuzzer.title, () => {
          handlers.onDeleteFuzzer(fuzzer.fuzzerIndex);
      });
    }
    return true;
  }
  if (treeSelection.startsWith('resource:')) {
    const resource = findByTabId(tree.resources, treeSelection);
    if (resource) {
      handlers.confirmDeleteLeaf('Удалить ресурс', resource.title, () => {
        handlers.onDeleteResource(resource.resourceIndex);
      });
    }
    return true;
  }
  return false;
}

export function confirmTreeSelectionDeletion(
  treeSelection: string | null | undefined,
  tree: TreeSelectionTree,
  handlers: DeleteSelectionHandlers,
): void {
  if (!treeSelection) {
    return;
  }
  const folderRef = parseFolderKey(treeSelection);
  if (folderRef) {
    const folder = handlers.folders[folderRef.section].find((item) => item.id === folderRef.folderId);
    if (folder) {
      handlers.confirmDeleteFolder(folderRef.section, folder);
    }
    return;
  }
  confirmLeafDeletion(treeSelection, tree, handlers);
}

export type RenameSelectionHandlers = {
  startNaming: (state: NamingState) => void;
  beginRenamePage: (pageId: string, needsName: boolean, title: string) => void;
  beginRenameScenario: (index: number, title: string) => void;
  folders: Record<EditorFolderSection, FolderLite[]>;
};

export type RenameSelectionTree = {
  pages: Array<TreeLeafRef & { pageId: string; needsName: boolean }>;
  scenarios: Array<TreeLeafRef & { scenarioIndex: number }>;
  modules: Array<TreeLeafRef & { moduleIndex: number }>;
  fuzzers: Array<TreeLeafRef & { fuzzerIndex: number; fuzzerId?: string }>;
  resources: Array<TreeLeafRef & { resourceIndex: number; as?: string }>;
};

function beginLeafRename(
  treeSelection: string,
  tree: RenameSelectionTree,
  handlers: RenameSelectionHandlers,
): boolean {
  if (treeSelection.startsWith('page:')) {
    const page = findByTabId(tree.pages, treeSelection);
    if (page) {
      handlers.beginRenamePage(page.pageId, page.needsName, page.title);
    }
    return true;
  }
  if (treeSelection.startsWith('module:')) {
    const module = findByTabId(tree.modules, treeSelection);
    if (module) {
      handlers.startNaming({
        mode: 'rename-module',
        moduleIndex: module.moduleIndex,
        value: module.title,
      });
    }
    return true;
  }
  if (treeSelection.startsWith('fuzzer:')) {
    const fuzzer = findByTabId(tree.fuzzers, treeSelection);
    if (fuzzer) {
      handlers.startNaming({
        mode: 'rename-fuzzer',
        fuzzerIndex: fuzzer.fuzzerIndex,
        value: fuzzer.fuzzerId || fuzzer.title,
      });
    }
    return true;
  }
  if (treeSelection.startsWith('resource:')) {
    const resource = findByTabId(tree.resources, treeSelection);
    if (resource) {
      handlers.startNaming({
        mode: 'rename-resource',
        resourceIndex: resource.resourceIndex,
        value: resource.as || resource.title,
      });
    }
    return true;
  }
  if (treeSelection.startsWith('scenario:')) {
    const scenario = findByTabId(tree.scenarios, treeSelection);
    if (scenario) {
      handlers.beginRenameScenario(scenario.scenarioIndex, scenario.title);
    }
    return true;
  }
  return false;
}

export function beginTreeSelectionRename(
  treeSelection: string | null | undefined,
  tree: RenameSelectionTree,
  handlers: RenameSelectionHandlers,
): void {
  if (!treeSelection) {
    return;
  }
  const folderRef = parseFolderKey(treeSelection);
  if (folderRef) {
    const folder = handlers.folders[folderRef.section].find((item) => item.id === folderRef.folderId);
    if (folder) {
      handlers.startNaming({
        mode: 'rename-folder',
        section: folderRef.section,
        folderId: folder.id,
        value: folder.title,
      });
    }
    return;
  }
  beginLeafRename(treeSelection, tree, handlers);
}
