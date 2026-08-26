/**
 * useStudioTreeActions — shared glue for the Studio tree (ER-1).
 *
 * Wraps the PURE formData mutations (studioPages / studioScenarios / studioModules /
 * studioFuzzers / studioResources / studioFolders) into the callback surface that
 * `StudioBlocksTree` expects. The tree itself + the pure mutations are the single
 * source of truth; this hook is only the adapter for a given surface.
 *
 * It does NOT touch Monaco models or open-tab bookkeeping — a surface passes
 * `onOpened` to react to create (open the created entity in its own editor).
 *
 * StudioWorkspace keeps its own in-place handlers for now (they additionally manage
 * Monaco multi-model state); both paths delegate to the same pure mutation modules.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  collectStudioNodes,
  tabFromNode,
} from './collectStudioNodes';
import {
  createEditorFolder,
  moveEditorFolderMember,
  readEditorFolders,
  removeEditorFolder,
  renameEditorFolder,
  replaceEditorFolderMember,
  type EditorFolderSection,
} from './studioFolders';
import {
  applyTreeMemberDrop,
  type TreeDropDestination,
} from './studioWorkspaceFolderDrop';
import { resolveFolderModuleIndicesDesc, resolveFolderPages, resolveFolderScenarioIndicesDesc } from './studioWorkspaceDeleteFolder';
import {
  addPage,
  removePage,
  renamePageTitle,
} from './studioPages';
import {
  addScenario,
  removeScenario,
  renameScenario,
} from './studioScenarios';
import {
  addModule,
  removeModule,
  renameModuleLabel,
} from './studioModules';
import {
  addFuzzer,
  removeFuzzer,
  renameFuzzer,
} from './studioFuzzers';
import {
  addResource,
  listResourceAsNames,
  normalizeImport,
  removeResource,
  renameResource,
  sanitizeFilenameToAs,
  updateResource,
} from './studioResources';
import {
  renameContentKey,
  removeContentKey,
  type ResourceContentsMap,
} from './resourceContents';
import {
  attachResourceRejectMessage,
  importKindFromFileName,
  isAttachableResourceFileName,
  resourcePathForAttachedFile,
  uniqueResourceAsName,
} from './studioResourceAttach';
import { studioSuiteMode } from './studioMode';
import type { StudioTab, StudioTabId } from './studioTabs';
import type { StudioTreeSection } from './studioTreeOrder';
import type { ExplorerRevealRequest } from './StudioBlocksTree';

/** Tiny useState returning a stable setter — keeps `revealRequest` local. */
function useStateRef<T>(initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const setter = useCallback((next: T) => setValue(next), []);
  return [value, setter];
}

export interface UseStudioTreeActionsArgs {
  formData: unknown;
  onFormDataChange: (next: unknown) => void;
  resourceContents: ResourceContentsMap;
  onResourceContentsChange: (next: ResourceContentsMap) => void;
  /** Currently selected Studio tab id (drives Explorer highlight). */
  selectedTabId?: StudioTabId;
  /** Optional — surface reacts to create by opening the created entity. */
  onOpened?: (tab: StudioTab) => void;
  /** Optional — surface can surface a toast on file-attach reject. */
  notifyError?: (message: string) => void;
  /**
   * ER-2 dirty-guard. Called BEFORE any tree mutation commits. The surface
   * flushes pending Monaco edits and returns the freshest formData (with those
   * edits applied). The hook adopts that as the mutation base, so a pending
   * debounced write can never land on a stale/deleted path (silent overwrite).
   */
  beforeMutate?: () => unknown;
}

export interface UseStudioTreeActionsResult {
  tree: ReturnType<typeof collectStudioNodes>;
  folders: ReturnType<typeof readEditorFolders>;
  projectId: string;
  revealRequest: ExplorerRevealRequest | null;
  requestReveal: (section: ExplorerRevealRequest['section'], folderId?: string) => void;
  handlers: {
    onCreateFolder: (section: EditorFolderSection, title: string) => boolean;
    onRenameFolder: (section: EditorFolderSection, folderId: string, title: string) => boolean;
    onDeleteFolder: (section: EditorFolderSection, folderId: string) => void;
    onMoveFolderMember: (section: EditorFolderSection, member: string, folderId?: string) => void;
    onDropTreeMember: (section: StudioTreeSection, member: string, destination: TreeDropDestination) => void;
    onCreatePage: (id: string, title: string) => boolean;
    onRenamePage: (pageId: string, displayTitle: string) => boolean;
    onDeletePage: (pageId: string) => void;
    onCreateScenario: (id: string, description?: string) => boolean;
    onRenameScenario: (scenarioIndex: number, name: string) => boolean;
    onDeleteScenario: (scenarioIndex: number) => void;
    onCreateModule: (displayLabel: string) => boolean;
    onRenameModule: (moduleIndex: number, displayLabel: string) => boolean;
    onDeleteModule: (moduleIndex: number) => void;
    onCreateFuzzer: (id: string) => boolean;
    onRenameFuzzer: (fuzzerIndex: number, id: string) => boolean;
    onDeleteFuzzer: (fuzzerIndex: number) => void;
    onCreateResource: (as: string) => boolean;
    onAttachResourceFiles: (files: FileList | File[]) => void;
    onRenameResource: (resourceIndex: number, as: string) => boolean;
    onDeleteResource: (resourceIndex: number) => void;
  };
}

export function useStudioTreeActions({
  formData,
  onFormDataChange,
  resourceContents,
  onResourceContentsChange,
  selectedTabId,
  onOpened,
  notifyError,
  beforeMutate,
}: UseStudioTreeActionsArgs): UseStudioTreeActionsResult {
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const onFormDataChangeRef = useRef(onFormDataChange);
  onFormDataChangeRef.current = onFormDataChange;
  const resourceContentsRef = useRef(resourceContents);
  resourceContentsRef.current = resourceContents;
  const onResourceContentsChangeRef = useRef(onResourceContentsChange);
  onResourceContentsChangeRef.current = onResourceContentsChange;
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  const beforeMutateRef = useRef(beforeMutate);
  beforeMutateRef.current = beforeMutate;

  const tree = useMemo(() => collectStudioNodes(formData), [formData]);
  const folders = useMemo(() => readEditorFolders(formData), [formData]);
  const projectId = useMemo(() => {
    const root = formData as { meta?: { project_id?: unknown } } | undefined;
    return typeof root?.meta?.project_id === 'string' ? root.meta.project_id : 'draft';
  }, [formData]);

  const [revealRequest, setRevealRequest] = useStateRef<ExplorerRevealRequest | null>(null);
  const revealTokenRef = useRef(0);
  const requestReveal = useCallback(
    (section: ExplorerRevealRequest['section'], folderId?: string) => {
      revealTokenRef.current += 1;
      setRevealRequest({ token: revealTokenRef.current, section, folderId });
    },
    [setRevealRequest],
  );

  const commit = useCallback((next: unknown) => {
    formDataRef.current = next;
    onFormDataChangeRef.current(next);
  }, []);

  /**
   * ER-2 dirty-guard: flush pending surface edits, adopt the freshest formData,
   * and return it. Every mutating handler MUST read its base through this, so a
   * pending Monaco debounce can never be lost or written to a stale path.
   */
  const beginMutation = useCallback((): unknown => {
    const flushed = beforeMutateRef.current?.();
    if (flushed !== undefined) {
      formDataRef.current = flushed;
    }
    return formDataRef.current;
  }, []);

  const openCreated = useCallback((data: unknown, find: (t: ReturnType<typeof collectStudioNodes>) => Parameters<typeof tabFromNode>[0] | undefined) => {
    const node = find(collectStudioNodes(data));
    if (node) {
      onOpenedRef.current?.(tabFromNode(node));
    }
  }, []);

  /* ── folders ── */

  const onCreateFolder = useCallback(
    (section: EditorFolderSection, title: string): boolean => {
      const data = beginMutation();
      const created = createEditorFolder(data, section, title);
      if (!created) return false;
      commit(created.data);
      return true;
    },
    [beginMutation, commit],
  );

  const onRenameFolder = useCallback(
    (section: EditorFolderSection, folderId: string, title: string): boolean => {
      const data = beginMutation();
      const next = renameEditorFolder(data, section, folderId, title);
      if (!next) return false;
      commit(next);
      return true;
    },
    [beginMutation, commit],
  );

  const onDeleteFolder = useCallback(
    (section: EditorFolderSection, folderId: string): void => {
      let data = beginMutation();
      const folder = readEditorFolders(data)[section].find(
        (item) => item.id === folderId,
      );
      if (!folder) return;
      const members = [...folder.members];
      const treeNow = collectStudioNodes(data);

      if (section === 'pages') {
        for (const page of resolveFolderPages(treeNow, members)) {
          data = replaceEditorFolderMember(
            removePage(data, page.pageId),
            'pages',
            page.pageId,
          );
        }
      } else if (section === 'scenarios') {
        for (const scenarioIndex of resolveFolderScenarioIndicesDesc(treeNow, members)) {
          const oldName = treeNow.scenarios[scenarioIndex]?.title;
          const removed = removeScenario(data, scenarioIndex);
          data = oldName
            ? replaceEditorFolderMember(removed, 'scenarios', oldName)
            : removed;
        }
      } else if (section === 'modules') {
        for (const moduleIndex of resolveFolderModuleIndicesDesc(treeNow, members)) {
          const oldId = treeNow.modules[moduleIndex]?.moduleId;
          const removed = removeModule(data, moduleIndex);
          data = oldId ? replaceEditorFolderMember(removed, 'modules', oldId) : removed;
        }
      }

      const next = removeEditorFolder(data, section, folderId);
      commit(next ?? data);
    },
    [beginMutation, commit],
  );

  const onMoveFolderMember = useCallback(
    (section: EditorFolderSection, member: string, folderId?: string): void => {
      const data = beginMutation();
      const next = moveEditorFolderMember(data, section, member, folderId);
      if (!next) return;
      commit(next);
    },
    [beginMutation, commit],
  );

  const onDropTreeMember = useCallback(
    (section: StudioTreeSection, member: string, destination: TreeDropDestination): void => {
      const data = beginMutation();
      const next = applyTreeMemberDrop(data, section, member, destination);
      if (!next) return;
      commit(next);
    },
    [beginMutation, commit],
  );

  /* ── pages ── */

  const onCreatePage = useCallback(
    (id: string, title: string): boolean => {
      const data = beginMutation();
      if (studioSuiteMode(data) === 'off') return false;
      const next = addPage(data, id, title);
      if (next === undefined) return false;
      commit(next);
      const displayTitle = title.trim() || id;
      openCreated(next, (t) =>
        t.pages.find((item) => item.pageId === id) ??
        t.pages.find((item) => item.title === displayTitle),
      );
      return true;
    },
    [beginMutation, commit, openCreated],
  );

  const onRenamePage = useCallback(
    (pageId: string, displayTitle: string): boolean => {
      const data = beginMutation();
      const next = renamePageTitle(data, pageId, displayTitle);
      if (next === undefined) return false;
      const nextWithFolders = replaceEditorFolderMember(
        next,
        'pages',
        pageId,
        displayTitle.trim(),
      );
      commit(nextWithFolders);
      return true;
    },
    [beginMutation, commit],
  );

  const onDeletePage = useCallback(
    (pageId: string): void => {
      const data = beginMutation();
      commit(
        replaceEditorFolderMember(
          removePage(data, pageId),
          'pages',
          pageId,
        ),
      );
    },
    [beginMutation, commit],
  );

  /* ── scenarios ── */

  const onCreateScenario = useCallback(
    (id: string, description?: string): boolean => {
      const data = beginMutation();
      const created = addScenario(data, id, description);
      if (created === undefined) return false;
      commit(created);
      openCreated(created, (t) => t.scenarios.find((item) => item.title === id.trim()));
      return true;
    },
    [beginMutation, commit, openCreated],
  );

  const onRenameScenario = useCallback(
    (scenarioIndex: number, name: string): boolean => {
      const data = beginMutation();
      const oldName = collectStudioNodes(data).scenarios[scenarioIndex]?.title;
      const next = renameScenario(data, scenarioIndex, name);
      if (next === undefined) return false;
      const nextWithFolders = oldName
        ? replaceEditorFolderMember(next, 'scenarios', oldName, name.trim())
        : next;
      commit(nextWithFolders);
      return true;
    },
    [beginMutation, commit],
  );

  const onDeleteScenario = useCallback(
    (scenarioIndex: number): void => {
      const data = beginMutation();
      const oldName = collectStudioNodes(data).scenarios[scenarioIndex]?.title;
      const removed = removeScenario(data, scenarioIndex);
      commit(oldName ? replaceEditorFolderMember(removed, 'scenarios', oldName) : removed);
    },
    [beginMutation, commit],
  );

  /* ── modules ── */

  const onCreateModule = useCallback(
    (displayLabel: string): boolean => {
      const data = beginMutation();
      const next = addModule(data, displayLabel);
      if (next === undefined) return false;
      commit(next);
      openCreated(next, (t) => t.modules.find((item) => item.title === displayLabel.trim()));
      return true;
    },
    [beginMutation, commit, openCreated],
  );

  const onRenameModule = useCallback(
    (moduleIndex: number, displayLabel: string): boolean => {
      const data = beginMutation();
      const oldModuleId = collectStudioNodes(data).modules[moduleIndex]?.moduleId;
      const next = renameModuleLabel(data, moduleIndex, displayLabel);
      if (next === undefined) return false;
      const nextWithFolders = oldModuleId
        ? replaceEditorFolderMember(next, 'modules', oldModuleId, displayLabel.trim())
        : next;
      commit(nextWithFolders);
      return true;
    },
    [beginMutation, commit],
  );

  const onDeleteModule = useCallback(
    (moduleIndex: number): void => {
      const data = beginMutation();
      const oldModuleId = collectStudioNodes(data).modules[moduleIndex]?.moduleId;
      const removed = removeModule(data, moduleIndex);
      commit(oldModuleId ? replaceEditorFolderMember(removed, 'modules', oldModuleId) : removed);
    },
    [beginMutation, commit],
  );

  /* ── fuzzers ── */

  const onCreateFuzzer = useCallback(
    (id: string): boolean => {
      const data = beginMutation();
      const added = addFuzzer(data, id);
      if (!added) return false;
      commit(added.data);
      openCreated(added.data, (t) => t.fuzzers.find((item) => item.fuzzerIndex === added.index));
      return true;
    },
    [beginMutation, commit, openCreated],
  );

  const onRenameFuzzer = useCallback(
    (fuzzerIndex: number, id: string): boolean => {
      const data = beginMutation();
      const next = renameFuzzer(data, fuzzerIndex, id);
      if (next === undefined) return false;
      commit(next);
      return true;
    },
    [beginMutation, commit],
  );

  const onDeleteFuzzer = useCallback(
    (fuzzerIndex: number): void => {
      const data = beginMutation();
      commit(removeFuzzer(data, fuzzerIndex));
    },
    [beginMutation, commit],
  );

  /* ── resources ── */

  const onCreateResource = useCallback(
    (as: string): boolean => {
      const data = beginMutation();
      const added = addResource(data, as);
      if (!added) return false;
      commit(added.data);
      const id = as.trim();
      if (!(id in resourceContentsRef.current)) {
        onResourceContentsChangeRef.current({
          ...resourceContentsRef.current,
          [id]: '',
        });
      }
      openCreated(added.data, (t) => t.resources.find((item) => item.resourceIndex === added.index));
      return true;
    },
    [beginMutation, commit, openCreated],
  );

  const onAttachResourceFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      void (async () => {
        let data = beginMutation();
        let contents = { ...resourceContentsRef.current };
        const taken = new Set(listResourceAsNames(data));
        let lastIndex: number | undefined;
        let rejected = 0;
        for (const file of list) {
          if (!isAttachableResourceFileName(file.name)) {
            rejected += 1;
            continue;
          }
          const text = await file.text();
          const as = uniqueResourceAsName(sanitizeFilenameToAs(file.name), taken);
          const kind = importKindFromFileName(file.name);
          const added = addResource(data, as, kind);
          if (!added) continue;
          data = updateResource(added.data, added.index, {
            path: resourcePathForAttachedFile(as, file.name),
          })!;
          taken.add(as);
          contents = { ...contents, [as]: text };
          lastIndex = added.index;
        }
        const rejectMsg = attachResourceRejectMessage(rejected, list.length);
        if (rejectMsg) notifyError?.(rejectMsg);
        formDataRef.current = data;
        onFormDataChangeRef.current(data);
        onResourceContentsChangeRef.current(contents);
        if (lastIndex !== undefined) {
          openCreated(data, (t) =>
            t.resources.find((item) => item.resourceIndex === lastIndex),
          );
        }
      })();
    },
    [beginMutation, notifyError, openCreated],
  );

  const onRenameResource = useCallback(
    (resourceIndex: number, as: string): boolean => {
      const data = beginMutation();
      const imports = (
        data as { test_suites?: { imports?: unknown[] } } | undefined
      )?.test_suites?.imports;
      const prevAs =
        Array.isArray(imports) && imports[resourceIndex]
          ? normalizeImport(imports[resourceIndex]).as
          : '';
      const next = renameResource(data, resourceIndex, as);
      if (next === undefined) return false;
      commit(next);
      if (prevAs && prevAs !== as.trim()) {
        onResourceContentsChangeRef.current(
          renameContentKey(resourceContentsRef.current, prevAs, as.trim()),
        );
      }
      return true;
    },
    [beginMutation, commit],
  );

  const onDeleteResource = useCallback(
    (resourceIndex: number): void => {
      const data = beginMutation();
      const prevAs = collectStudioNodes(data).resources[resourceIndex]?.as ?? '';
      commit(removeResource(data, resourceIndex));
      if (prevAs) {
        onResourceContentsChangeRef.current(
          removeContentKey(resourceContentsRef.current, prevAs),
        );
      }
    },
    [beginMutation, commit],
  );

  const handlers = useMemo(
    () => ({
      onCreateFolder,
      onRenameFolder,
      onDeleteFolder,
      onMoveFolderMember,
      onDropTreeMember,
      onCreatePage,
      onRenamePage,
      onDeletePage,
      onCreateScenario,
      onRenameScenario,
      onDeleteScenario,
      onCreateModule,
      onRenameModule,
      onDeleteModule,
      onCreateFuzzer,
      onRenameFuzzer,
      onDeleteFuzzer,
      onCreateResource,
      onAttachResourceFiles,
      onRenameResource,
      onDeleteResource,
    }),
    [
      onCreateFolder,
      onRenameFolder,
      onDeleteFolder,
      onMoveFolderMember,
      onDropTreeMember,
      onCreatePage,
      onRenamePage,
      onDeletePage,
      onCreateScenario,
      onRenameScenario,
      onDeleteScenario,
      onCreateModule,
      onRenameModule,
      onDeleteModule,
      onCreateFuzzer,
      onRenameFuzzer,
      onDeleteFuzzer,
      onCreateResource,
      onAttachResourceFiles,
      onRenameResource,
      onDeleteResource,
    ],
  );

  return {
    tree,
    folders,
    projectId,
    revealRequest,
    requestReveal,
    handlers,
  };
}
