/**
 * Узлы дерева Редактора из formData: pages, scenarios, modules, fuzzers, resources.
 * Шаги в дереве не показываем — сценарий открывает constructor steps[0].
 */
import { isPlaceholderAdditionalKey } from '../utils/keys';
import {
  fuzzerDisplayName,
  fuzzerIdError,
  normalizeFuzzer,
} from './studioFuzzers';
import { moduleDisplayError, moduleEditorPointer } from './studioModules';
import { pageDisplayError } from './studioPages';
import { normalizeImport, resourceAsError, resourceDisplayName } from './studioResources';
import { scenarioNameError } from './studioScenarios';
import { folderForMember, readEditorFolders, type EditorFolderSection } from './studioFolders';
import {
  getAtPointerTokens,
  pointerTokens,
  setAtTokens,
} from './studioJsonPointer';
import { findEditableByTabId, tabFromEditableNode } from './studioTabFromNode';
import {
  fuzzerTabId,
  moduleTabId,
  pageTabId,
  resourceTabId,
  scenarioConstructorPointer,
  scenarioTabId,
  type StudioTab,
  type StudioTabId,
} from './studioTabs';

export interface StudioPageNode {
  kind: 'page';
  key: string;
  pageId: string;
  path: string;
  title: string;
  tabId: StudioTabId;
  needsName: boolean;
  invalidId: boolean;
  idError?: string;
  groupId?: string;
}

export interface StudioScenarioNode {
  kind: 'scenario';
  key: string;
  scenarioIndex: number;
  title: string;
  path: string;
  tabId: StudioTabId;
  invalidId: boolean;
  idError?: string;
  groupId?: string;
}

export interface StudioModuleNode {
  kind: 'module';
  key: string;
  moduleIndex: number;
  moduleId: string;
  moduleType: string;
  /** connector_fields.connector_type — для иконки в Explorer. */
  connectorType?: string;
  path: string;
  title: string;
  tabId: StudioTabId;
  invalidId: boolean;
  idError?: string;
  groupId?: string;
}

export interface StudioResourceNode {
  kind: 'resource';
  key: string;
  resourceIndex: number;
  title: string;
  tabId: StudioTabId;
  path: string;
  kindImport: string;
  as: string;
  invalidId: boolean;
  idError?: string;
  groupId?: string;
}

export interface StudioFuzzerNode {
  kind: 'fuzzer';
  key: string;
  fuzzerIndex: number;
  title: string;
  tabId: StudioTabId;
  fuzzerId: string;
  invalidId: boolean;
  idError?: string;
  groupId?: string;
}

export interface StudioFolderGroup {
  /** Section-qualified UI id, so equally named folders never merge. */
  id: string;
  /** Raw editor_folders id used to establish cross-section relationships. */
  folderId: string;
  section: EditorFolderSection;
  title: string;
  memberTabIds: string[];
}

export interface StudioTree {
  pages: StudioPageNode[];
  scenarios: StudioScenarioNode[];
  modules: StudioModuleNode[];
  fuzzers: StudioFuzzerNode[];
  resources: StudioResourceNode[];
  /** Authoring groups normalised from test_suites.editor_folders. */
  groups?: StudioFolderGroup[];
}

export type StudioEditableNode =
  | StudioPageNode
  | StudioScenarioNode
  | StudioModuleNode
  | StudioFuzzerNode
  | StudioResourceNode;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/** Pointer до constructor страницы (пустой ключ Form → `/pages//constructor`). */
export function pageConstructorPointer(pageId: string): string {
  return `/test_suites/pages/${pageId}/constructor`;
}

function collectPageNodes(pagesRaw: Record<string, unknown> | undefined): StudioPageNode[] {
  const pages: StudioPageNode[] = [];
  if (!pagesRaw) {
    return pages;
  }
  for (const pageId of Object.keys(pagesRaw)) {
    const body = asRecord(pagesRaw[pageId]);
    const titled =
      typeof body?.title === 'string' && body.title.trim().length > 0 ? body.title.trim() : '';
    const needsName = isPlaceholderAdditionalKey(pageId) && !titled;
    const idError = needsName ? 'Укажите имя модели данных' : pageDisplayError(pageId);
    const tabId = pageTabId(pageId);
    pages.push({
      kind: 'page',
      key: tabId,
      pageId,
      path: pageConstructorPointer(pageId),
      title: needsName ? 'без имени' : pageId,
      tabId,
      needsName,
      invalidId: idError !== undefined,
      idError,
    });
  }
  return pages;
}

function collectScenarioNodes(scenariosRaw: unknown): StudioScenarioNode[] {
  const scenarios: StudioScenarioNode[] = [];
  if (!Array.isArray(scenariosRaw)) {
    return scenarios;
  }
  scenariosRaw.forEach((item, scenarioIndex) => {
    const scenario = asRecord(item);
    const rawName =
      typeof scenario?.scenario_name === 'string' ? scenario.scenario_name.trim() : '';
    const name = rawName.length > 0 ? rawName : `scenario_${String(scenarioIndex + 1)}`;
    const idError = scenarioNameError(name);
    const tabId = scenarioTabId(scenarioIndex);
    scenarios.push({
      kind: 'scenario',
      key: tabId,
      scenarioIndex,
      title: name,
      path: scenarioConstructorPointer(scenarioIndex),
      tabId,
      invalidId: idError !== undefined,
      idError,
    });
  });
  return scenarios;
}

function collectModuleNodes(modulesRaw: unknown): StudioModuleNode[] {
  const modules: StudioModuleNode[] = [];
  if (!Array.isArray(modulesRaw)) {
    return modules;
  }
  modulesRaw.forEach((item, moduleIndex) => {
    const module = asRecord(item) ?? {};
    const moduleId = typeof module.id === 'string' ? module.id : '';
    const moduleType = typeof module.module_type === 'string' ? module.module_type : '';
    const cf = asRecord(module.connector_fields);
    const connectorType =
      typeof cf?.connector_type === 'string' ? cf.connector_type : undefined;
    const idError = moduleId ? moduleDisplayError(moduleId) : 'Укажите имя модуля';
    const tabId = moduleTabId(moduleIndex);
    modules.push({
      kind: 'module',
      key: tabId,
      moduleIndex,
      moduleId,
      moduleType,
      connectorType,
      path: moduleEditorPointer(moduleIndex, moduleType || 'Модуль работы с данными'),
      title: moduleId || `module_${String(moduleIndex + 1)}`,
      tabId,
      invalidId: idError !== undefined,
      idError,
    });
  });
  return modules;
}

function collectFuzzerNodes(fuzzersRaw: unknown): StudioFuzzerNode[] {
  const fuzzers: StudioFuzzerNode[] = [];
  if (!Array.isArray(fuzzersRaw)) {
    return fuzzers;
  }
  fuzzersRaw.forEach((item, fuzzerIndex) => {
    const fields = normalizeFuzzer(item, fuzzerIndex);
    const tabId = fuzzerTabId(fuzzerIndex);
    const idError = fuzzerIdError(fields.id);
    fuzzers.push({
      kind: 'fuzzer',
      key: tabId,
      fuzzerIndex,
      title: fuzzerDisplayName(fields, fuzzerIndex),
      tabId,
      fuzzerId: fields.id,
      invalidId: idError !== undefined,
      idError,
    });
  });
  return fuzzers;
}

function collectResourceNodes(importsRaw: unknown): StudioResourceNode[] {
  const resources: StudioResourceNode[] = [];
  if (!Array.isArray(importsRaw)) {
    return resources;
  }
  importsRaw.forEach((item, resourceIndex) => {
    const fields = normalizeImport(item);
    const tabId = resourceTabId(resourceIndex);
    const idError = resourceAsError(fields.as);
    resources.push({
      kind: 'resource',
      key: tabId,
      resourceIndex,
      title: resourceDisplayName(fields, resourceIndex),
      tabId,
      path: fields.path,
      kindImport: fields.kind,
      as: fields.as,
      invalidId: idError !== undefined,
      idError,
    });
  });
  return resources;
}

function applyFolderGroups(formData: unknown, tree: Omit<StudioTree, 'groups'>): StudioTree {
  const folders = readEditorFolders(formData);
  const groups: StudioFolderGroup[] = [];
  const apply = <T extends StudioEditableNode>(
    section: EditorFolderSection,
    nodes: T[],
    memberOf: (node: T) => string,
  ): T[] => {
    const byMember = new Map<string, StudioFolderGroup>();
    for (const folder of folders[section]) {
      const id = `${section}:${folder.id}`;
      const group: StudioFolderGroup = { id, folderId: folder.id, section, title: folder.title, memberTabIds: [] };
      groups.push(group);
      folder.members.forEach((member) => byMember.set(member, group));
    }
    return nodes.map((node) => {
      const group = byMember.get(memberOf(node));
      if (!group) return node;
      group.memberTabIds.push(node.tabId);
      return { ...node, groupId: group.id };
    });
  };
  const grouped = {
    pages: apply('pages', tree.pages, (node) => node.pageId),
    scenarios: apply('scenarios', tree.scenarios, (node) => node.title),
    modules: apply('modules', tree.modules, (node) => node.moduleId),
    fuzzers: apply('fuzzers', tree.fuzzers, (node) => node.fuzzerId),
    resources: apply('resources', tree.resources, (node) => node.as),
  };
  return { ...grouped, groups: groups.filter((group) => group.memberTabIds.length > 0) };
}
export function collectStudioNodes(formData: unknown): StudioTree {
  const root = asRecord(formData);
  const suites = asRecord(root?.test_suites);
  return applyFolderGroups(formData, {
    pages: collectPageNodes(asRecord(suites?.pages)),
    scenarios: collectScenarioNodes(suites?.scenarios),
    modules: collectModuleNodes(suites?.test_data_constructor),
    fuzzers: collectFuzzerNodes(suites?.fuzzers),
    resources: collectResourceNodes(suites?.imports),
  });
}

export function tabFromNode(node: StudioEditableNode): StudioTab {
  return tabFromEditableNode(node);
}

export function findNodeByTabId(
  tree: StudioTree,
  tabId: StudioTabId,
): StudioEditableNode | undefined {
  const groups: readonly (readonly StudioEditableNode[])[] = [
    tree.pages,
    tree.scenarios,
    tree.modules,
    tree.fuzzers,
    tree.resources,
  ];
  const found = findEditableByTabId(groups, tabId);
  return found as StudioEditableNode | undefined;
}

/** Immutable set по JSON Pointer (`/a/b/0`, `/pages//constructor`). */
export function setAtPointer(data: unknown, pointer: string, value: unknown): unknown {
  const tokens = pointerTokens(pointer);
  if (tokens.length === 0) {
    return value;
  }
  return setAtTokens(data, tokens, value, asRecord);
}

export function getAtPointer(data: unknown, pointer: string): unknown {
  return getAtPointerTokens(data, pointerTokens(pointer), asRecord);
}
