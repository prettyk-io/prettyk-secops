/**
 * Дерево Редактора: модели / сценарии / модули / Fuzzers / ресурсы.
 * Создание и rename — ПКМ / F2; группы всегда раскрыты.
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type Key,
  type ReactNode,
  type Ref,
} from 'react';
import { App, Dropdown, Input, Modal, Tree } from 'antd';
import type { InputRef, MenuProps, TreeProps } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { isPlaceholderAdditionalKey } from '../utils/keys';
import type { StudioTree } from './collectStudioNodes';
import type { StudioSuiteMode } from './studioMode';
import {
  compareEditorFolderMembers,
  type EditorFolder,
  type EditorFolders,
  type EditorFolderSection,
} from './studioFolders';
import type { StudioTreeSection } from './studioTreeOrder';
import { type StudioTabId } from './studioTabs';
import {
  applyTreePointerLeave,
  applyTreePointerMove,
  syncTreeGuides,
} from './studioTreeGuides';
import {
  ALL_GROUP_KEYS,
  GROUP_AUTH,
  GROUP_FUZZERS,
  GROUP_MODULES,
  GROUP_PAGES,
  GROUP_RESOURCES,
  GROUP_SCENARIOS,
  folderDropZoneKey,
  folderEntityLabel,
  folderKey,
  groupKeyForSection,
  isFolderSection,
  sectionForGroupKey,
  selectedTreeKey,
} from './studioTreeKeys';
import {
  parseStoredTreeExpansion,
  serializeTreeExpansion,
} from './studioTreeExpansion';
import { renderStudioTreeSwitcherIcon } from './studioTreeSwitcherIcon';
import {
  creationFolderId,
  namingSessionKey,
  namingValueHasError,
  type NamingState,
} from './studioTreeNaming';
import { runConfirmNaming } from './studioTreeNamingConfirm';
import { folderDeleteMemberLabels } from './studioTreeFolderLabels';
import { folderMoveMenuSpecs } from './studioTreeFolderMoveMenu';
import {
  entityLeafClassName,
  moduleLeafClassName,
  pageLeafClassName,
  scenarioLeafClassName,
} from './studioTreeLeafClass';
import {
  childNodesForFolder,
  explorerLeafKindForSection,
  rootFolderEntries,
  withRootChildClass,
  type ExplorerLeafKind,
  type FolderEntry,
} from './studioTreeNest';
import {
  beginTreeSelectionRename,
  confirmTreeSelectionDeletion,
} from './studioTreeSelectionActions';
import {
  allowStudioTreeDrop,
  isStudioTreeNodeDraggable,
  resolveAntTreeDropDestination,
  resolveNativeDropDestination,
  treeMemberForTreeKey as resolveTreeMemberForKey,
  type TreeMember,
} from './studioTreeDropResolve';
import type { TreeDropDestination } from './studioWorkspaceFolderDrop';
import { explorerLeafTitleNode, type LeafIconSrc } from './studioTreeLeafChrome';
import {
  AUTH_MODULE_TYPE,
  CONNECTOR_MODULE_TYPE,
  GRAPHQL_MODULE_TYPE,
  GRPC_MODULE_TYPE,
  OPENAPI_MODULE_TYPE,
} from './studioModules';
import { connectorLeafKindFromType } from './connectorLeafKind';
import { GraphWaveOverlay } from './graph/GraphWaveOverlay';
import { useThemeMode } from '../theme/ThemeProvider';
/** Dark / light — разные файлы; общие имена без `-light` только в dark-пакете. */
import modelGraphIcon from '../assets/icons/model-graph.png';
import modelGraphLightIcon from '../assets/icons/model-graph-light.png';
import scenarioCodeIcon from '../assets/icons/scenario-code.svg';
import scenarioCodeLightIcon from '../assets/icons/scenario-code-light.png';
import fuzzerTargetIcon from '../assets/icons/fuzzer-target.png';
import fuzzerTargetLightIcon from '../assets/icons/fuzzer-target-light.png';
import resourceFolderIcon from '../assets/icons/resource-folder.png';
import resourceFolderLightIcon from '../assets/icons/resource-folder-light.png';
import moduleCubeIcon from '../assets/icons/module-cube.png';
import moduleCubeLightIcon from '../assets/icons/module-cube-light.png';
import authAccountIcon from '../assets/PrettyK/editor/icons8-test-account-96.png';
import connectorNetworkIcon from '../assets/PrettyK/editor/icons8-centralized-network-96.png';
import connectorDbIcon from '../assets/icons/connectors/postgresql.png';
import connectorPromIcon from '../assets/icons/connectors/prometheus.png';
import connectorSshIcon from '../assets/icons/connectors/openssh.png';
import connectorSiemIcon from '../assets/PrettyK/editor/icons8-graph-report-96.png';
import connectorMqIcon from '../assets/PrettyK/editor/icons8-multicast-96.png';

const DRAFT_PAGES = 'draft:page';
const DRAFT_SCENARIOS = 'draft:scenario';
const DRAFT_MODULES = 'draft:module';
const DRAFT_FUZZERS = 'draft:fuzzer';
const DRAFT_RESOURCES = 'draft:resource';
const DRAFT_AUTH = 'draft:auth';

/**
 * Light PNG на чёрном поле: только CSS screen, без пережатия байтов.
 * Не вешать keepOnLight на dark-файлы и не шарить dark-PNG в LEAF_ICONS_LIGHT.
 */
const KEEP_ON_LIGHT: ReadonlySet<ExplorerLeafKind> = new Set([
  'page',
  'scenario',
  'fuzzer',
  'module',
  'auth',
  'connector',
  'connectorDb',
  'connectorSiem',
  'connectorProm',
  'connectorSsh',
  'connectorMq',
  'openapi',
  'graphql',
  'grpc',
]);

const CONNECTOR_LEAF_ICONS = {
  connector: connectorNetworkIcon,
  connectorDb: connectorDbIcon,
  connectorSiem: connectorSiemIcon,
  connectorProm: connectorPromIcon,
  connectorSsh: connectorSshIcon,
  connectorMq: connectorMqIcon,
} as const;

const LEAF_ICONS_DARK: LeafIconSrc = {
  page: modelGraphIcon,
  scenario: scenarioCodeIcon,
  fuzzer: fuzzerTargetIcon,
  resource: resourceFolderIcon,
  module: moduleCubeIcon,
  auth: authAccountIcon,
  openapi: fuzzerTargetIcon,
  graphql: fuzzerTargetIcon,
  grpc: connectorNetworkIcon,
  ...CONNECTOR_LEAF_ICONS,
};

const LEAF_ICONS_LIGHT: LeafIconSrc = {
  page: modelGraphLightIcon,
  scenario: scenarioCodeLightIcon,
  fuzzer: fuzzerTargetLightIcon,
  resource: resourceFolderLightIcon,
  module: moduleCubeLightIcon,
  auth: authAccountIcon,
  openapi: fuzzerTargetLightIcon,
  graphql: fuzzerTargetLightIcon,
  grpc: connectorNetworkIcon,
  ...CONNECTOR_LEAF_ICONS,
  keepOnLight: KEEP_ON_LIGHT,
};

/** ПКМ по всей ширине лепестка, не только по тексту. */
function leafContextTitle(
  menu: MenuProps['items'],
  className: string,
  titleAttr: string | undefined,
  treeKey: string,
  children: ReactNode,
): React.JSX.Element {
  return (
    <Dropdown trigger={['contextMenu']} menu={{ items: menu }}>
      <div
        className={`${className} pk-studio-tree-leaf-hit`}
        data-pk-tree-key={treeKey}
        title={titleAttr}
      >
        {children}
      </div>
    </Dropdown>
  );
}

function explorerLeafTitle(
  kind: ExplorerLeafKind,
  title: ReactNode,
  treeKey: string,
  icons: LeafIconSrc,
): React.JSX.Element {
  return explorerLeafTitleNode(kind, title, treeKey, icons);
}

type ExplorerNamingInputProps = {
  mode: NamingState['mode'];
  defaultValue: string;
  inputRef: Ref<InputRef>;
  onConfirm: (raw: string) => void;
  onEscape: () => void;
  onBlurApply: () => void;
};

/** Uncontrolled + локальный error: keystroke не пересобирает Ant Tree. */
const ExplorerNamingInput = memo(function ExplorerNamingInput({
  mode,
  defaultValue,
  inputRef,
  onConfirm,
  onEscape,
  onBlurApply,
}: ExplorerNamingInputProps): React.JSX.Element {
  const [isError, setIsError] = useState(() => namingValueHasError(mode, defaultValue));

  return (
    <Input
      ref={inputRef}
      size="small"
      variant="borderless"
      className={
        isError ? 'pk-studio-name-input pk-studio-name-input-error' : 'pk-studio-name-input'
      }
      defaultValue={defaultValue}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onChange={(event) => {
        setIsError(namingValueHasError(mode, event.target.value));
      }}
      onPressEnter={(event) => {
        event.preventDefault();
        onConfirm(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          onConfirm(event.currentTarget.value);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscape();
        }
      }}
      onBlur={() => {
        onBlurApply();
      }}
    />
  );
});

export type { TreeDropDestination } from './studioWorkspaceFolderDrop';

export interface StudioBlocksTreeProps {
  mode: StudioSuiteMode;
  tree: StudioTree;
  folders: EditorFolders;
  projectId: string;
  selectedTabId?: StudioTabId;
  onSelectTab: (tabId: StudioTabId) => void;
  onCreateFolder: (section: EditorFolderSection, title: string) => boolean;
  onRenameFolder: (section: EditorFolderSection, folderId: string, title: string) => boolean;
  onDeleteFolder: (section: EditorFolderSection, folderId: string) => void;
  onMoveFolderMember: (
    section: EditorFolderSection,
    member: string,
    folderId?: string,
  ) => void;
  onDropTreeMember: (
    section: StudioTreeSection,
    member: string,
    destination: TreeDropDestination,
  ) => void;
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
  /** После Hub create: раскрыть раздел; при folderId — ещё и папку (2 уровня). */
  revealRequest?: ExplorerRevealRequest | null;
  /** STU-EDITOR-PURE: режим «Редактор» — только модели данных и сценарии. */
  editorMode?: boolean;
  isIdle?: boolean;
}

export type ExplorerRevealRequest = {
  token: number;
  section: EditorFolderSection | 'fuzzers' | 'resources';
  folderId?: string;
};

/** memo: keystroke в PrettyK не должен пересобирать дерево. */
export const StudioBlocksTree = memo(function StudioBlocksTree({
  mode,
  tree,
  folders,
  projectId,
  selectedTabId,
  onSelectTab,
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
  revealRequest = null,
  editorMode = false,
  isIdle = false,
}: StudioBlocksTreeProps): React.JSX.Element {
  const { mode: themeMode } = useThemeMode();
  const leafIcons = themeMode === 'light' ? LEAF_ICONS_LIGHT : LEAF_ICONS_DARK;
  const treeRootRef = useRef<HTMLElement>(null);
  const resourceFileInputRef = useRef<HTMLInputElement>(null);
  const nativeDragMemberRef = useRef<TreeMember | undefined>(undefined);
  const nativeDropTargetRef = useRef<HTMLElement | undefined>(undefined);
  const hoveredSectionKeyRef = useRef<string | undefined>(undefined);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const isAnimatingRef = useRef(false);
  const animationTimerRef = useRef<number | undefined>(undefined);
  const syncGuidesRef = useRef<(() => void) | undefined>(undefined);
  const { message } = App.useApp();
  const [naming, setNaming] = useState<NamingState | null>(null);
  const [createModal, setCreateModal] = useState<{
    type: 'page' | 'scenario';
    folderId?: string;
    section?: EditorFolderSection;
  } | null>(null);
  const [createModalTitle, setCreateModalTitle] = useState('');
  const [createModalId, setCreateModalId] = useState('');
  const [treeSelection, setTreeSelection] = useState<string | undefined>(() =>
    selectedTreeKey(selectedTabId),
  );

  const openCreateModal = (type: 'page' | 'scenario', folderId?: string, section?: EditorFolderSection) => {
    setCreateModal({ type, folderId, section });
    setCreateModalTitle('');
    setCreateModalId('');
  };

  const sanitizeToPythonId = (raw: string): string => {
    let s = raw
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (!s || /^[0-9]/.test(s)) {
      s = '_' + (s || 'item');
    }
    return s;
  };

  const handleCreateModalSubmit = () => {
    const type = createModal?.type;
    if (!type) return;
    const id = createModalId.trim();
    const title = createModalTitle.trim();
    if (!id) return;
    if (type === 'page') {
      if (!onCreatePage(id, title)) {
        message.error('Не удалось создать модель страницы');
        return;
      }
    } else {
      if (!onCreateScenario(id, title || undefined)) {
        message.error('Не удалось создать сценарий');
        return;
      }
    }
    if (createModal?.folderId && createModal?.section) {
      onMoveFolderMember(createModal.section, id, createModal.folderId);
    }
    setCreateModal(null);
  };

  useEffect(() => {
    setTreeSelection(selectedTreeKey(selectedTabId));
  }, [selectedTabId]);

  const confirmDeleteLeaf = (
    title: string,
    entityLabel: string,
    onOk: () => void,
  ): void => {
    Modal.confirm({
      title,
      content: `Удалить «${entityLabel}»? Это действие нельзя отменить.`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      centered: true,
      onOk,
    });
  };

  const confirmDeleteFolder = (
    section: EditorFolderSection,
    folder: EditorFolder,
  ): void => {
    const memberLabels = folderDeleteMemberLabels(section, folder, tree);
    if (memberLabels.length === 0) {
      confirmDeleteLeaf('Удалить группу', folder.title, () => {
        onDeleteFolder(section, folder.id);
      });
      return;
    }
    Modal.confirm({
      title: 'Удалить группу и содержимое',
      content: (
        <div className="pk-studio-delete-folder-dialog">
          <p>
            Группа «{folder.title}» будет удалена вместе со всеми элементами внутри. Отменить
            нельзя.
          </p>
          <p className="pk-studio-delete-folder-dialog-caption">Будут уничтожены:</p>
          <ul className="pk-studio-delete-folder-dialog-list">
            {memberLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ),
      okText: 'Удалить всё',
      okType: 'danger',
      cancelText: 'Отмена',
      centered: true,
      onOk: () => {
        onDeleteFolder(section, folder.id);
      },
    });
  };
  const inputRef = useRef<InputRef>(null);
  const confirmLockRef = useRef(false);
  const isCancelingRef = useRef(false);
  /** StrictMode/remount: blur при размонтировании не должен confirm/cancel naming. */
  const ignoreNamingBlurRef = useRef(false);
  const autoRenameDoneRef = useRef<string | null>(null);
  const showPages = mode === 'on';
  const namingKey = namingSessionKey(naming);
  const folderStorageKey = `prettyk:studio-folder-expansion:${projectId}`;
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<Key[]>([]);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Key[]>([]);
  const visibleGroupKeys = showPages
    ? ALL_GROUP_KEYS
    : ALL_GROUP_KEYS.filter((key) => key !== GROUP_PAGES);
  const persistTreeExpansion = (folders: readonly Key[], collapsedGroups: readonly Key[]): void => {
    try {
      window.localStorage.setItem(
        folderStorageKey,
        serializeTreeExpansion(folders.map(String), collapsedGroups.map(String)),
      );
    } catch {
      // Local view-state не должен мешать работе дерева в privacy mode.
    }
  };
  useEffect(() => {
    const expansion = parseStoredTreeExpansion(window.localStorage.getItem(folderStorageKey));
    setExpandedFolderKeys(expansion.folders);
    setCollapsedGroupKeys(expansion.collapsedGroups);
  }, [folderStorageKey, folders]);
  const expandedKeys = useMemo(
    () => [
      ...visibleGroupKeys.filter((key) => !collapsedGroupKeys.includes(key)),
      ...expandedFolderKeys,
    ],
    [collapsedGroupKeys, expandedFolderKeys, visibleGroupKeys],
  );

  useLayoutEffect(() => {
    const treeElement = treeRootRef.current?.querySelector<HTMLElement>('.pk-studio-tree-list');
    if (!treeElement) {
      return;
    }

    const syncGuides = (): void => {
      syncTreeGuides({
        treeElement,
        pointerPos: pointerPosRef.current,
        hoveredSectionKey: hoveredSectionKeyRef.current,
        isAnimating: isAnimatingRef.current,
        setHoveredSectionKey: (key) => {
          hoveredSectionKeyRef.current = key;
        },
        requestRetry: () => {
          window.requestAnimationFrame(() => {
            syncGuidesRef.current?.();
          });
        },
      });
    };

    syncGuides();
    syncGuidesRef.current = syncGuides;
    const frame = window.requestAnimationFrame?.(syncGuides);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncGuides);
    observer?.observe(treeElement);
    window.addEventListener('resize', syncGuides);

    const onPointerMove = (event: PointerEvent): void => {
      const pointerState = {
        pointerPos: pointerPosRef.current,
        hoveredSectionKey: hoveredSectionKeyRef.current,
      };
      applyTreePointerMove(treeElement, pointerState, event);
      pointerPosRef.current = pointerState.pointerPos;
      hoveredSectionKeyRef.current = pointerState.hoveredSectionKey;
      syncGuides();
    };

    const onPointerLeave = (event: PointerEvent): void => {
      const pointerState = {
        pointerPos: pointerPosRef.current,
        hoveredSectionKey: hoveredSectionKeyRef.current,
      };
      if (!applyTreePointerLeave(pointerState, treeElement, event)) {
        return;
      }
      pointerPosRef.current = pointerState.pointerPos;
      hoveredSectionKeyRef.current = pointerState.hoveredSectionKey;
      syncGuides();
    };

    treeElement.addEventListener('pointermove', onPointerMove);
    treeElement.addEventListener('pointerover', onPointerMove);
    treeElement.addEventListener('pointerleave', onPointerLeave);

    return () => {
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      window.removeEventListener('resize', syncGuides);
      treeElement.removeEventListener('pointermove', onPointerMove);
      treeElement.removeEventListener('pointerover', onPointerMove);
      treeElement.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [expandedKeys, folders, naming, tree, treeSelection]);

  const markAnimationInFlight = (): void => {
    isAnimatingRef.current = true;
    if (animationTimerRef.current !== undefined) {
      window.clearTimeout(animationTimerRef.current);
    }
    animationTimerRef.current = window.setTimeout(() => {
      animationTimerRef.current = undefined;
      isAnimatingRef.current = false;
      syncGuidesRef.current?.();
    }, 220);
  };

  const expandFolder = (section: EditorFolderSection, folderId: string): void => {
    const key = folderKey(section, folderId);
    setExpandedFolderKeys((previous) => {
      if (previous.includes(key)) {
        return previous;
      }
      markAnimationInFlight();
      const next = [...previous, key];
      persistTreeExpansion(next, collapsedGroupKeys);
      return next;
    });
  };

  const expandGroup = (groupKey: Key): void => {
    setCollapsedGroupKeys((previous) => {
      if (!previous.includes(groupKey)) {
        return previous;
      }
      markAnimationInFlight();
      const next = previous.filter((key) => key !== groupKey);
      persistTreeExpansion(expandedFolderKeys, next);
      return next;
    });
  };

  useEffect(() => {
    if (!revealRequest) {
      return;
    }
    if (revealRequest.section === 'pages' && !showPages) {
      return;
    }
    const groupKey = groupKeyForSection(revealRequest.section);
    if (!groupKey) {
      return;
    }
    expandGroup(groupKey);
    if (
      revealRequest.folderId &&
      (revealRequest.section === 'pages' ||
        revealRequest.section === 'scenarios' ||
        revealRequest.section === 'modules')
    ) {
      expandFolder(revealRequest.section, revealRequest.folderId);
    }
  }, [revealRequest]);

  const toggleSection = (groupKey: Key): void => {
    setCollapsedGroupKeys((previous) => {
      const isCollapsed = previous.includes(groupKey);
      if (isCollapsed) {
        markAnimationInFlight();
        const next = previous.filter((key) => key !== groupKey);
        persistTreeExpansion(expandedFolderKeys, next);
        return next;
      }
      const next = [...previous, groupKey];
      persistTreeExpansion(expandedFolderKeys, next);
      return next;
    });
  };

  const cancelNaming = (): void => {
    isCancelingRef.current = true;
    confirmLockRef.current = false;
    setNaming(null);
  };

  const startNaming = (next: NamingState): void => {
    isCancelingRef.current = false;
    confirmLockRef.current = false;
    setNaming(next);
  };

  const beginCreateFolder = (section: EditorFolderSection): void => {
    const groupKey = section === 'pages' ? GROUP_PAGES : GROUP_SCENARIOS;
    expandGroup(groupKey);
    startNaming({ mode: 'create-folder', section, value: '' });
  };

  const beginCreate = (groupKey: Key, next: NamingState): void => {
    expandGroup(groupKey);
    startNaming(next);
  };

  const beginCreateInFolder = (section: EditorFolderSection, folderId: string): void => {
    let groupKey: Key = GROUP_MODULES;
    if (section === 'pages') {
      groupKey = GROUP_PAGES;
      expandGroup(groupKey);
      expandFolder(section, folderId);
      openCreateModal('page', folderId, section);
      return;
    }
    if (section === 'scenarios') {
      groupKey = GROUP_SCENARIOS;
      expandGroup(groupKey);
      expandFolder(section, folderId);
      openCreateModal('scenario', folderId, section);
      return;
    }
    expandGroup(groupKey);
    expandFolder(section, folderId);
    startNaming({ mode: 'create-module', value: '', folderId });
  };

  useEffect(() => {
    if (!namingKey) {
      return;
    }
    ignoreNamingBlurRef.current = true;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      ignoreNamingBlurRef.current = false;
    }, 0);
    return () => {
      ignoreNamingBlurRef.current = true;
      window.clearTimeout(timer);
    };
  }, [namingKey]);

  useEffect(() => {
    if (!showPages || naming) {
      return;
    }
    const pending = tree.pages.find((page) => page.needsName);
    if (!pending) {
      autoRenameDoneRef.current = null;
      return;
    }
    const stamp = pending.pageId.length === 0 ? '__empty__' : pending.pageId;
    if (autoRenameDoneRef.current === stamp) {
      return;
    }
    autoRenameDoneRef.current = stamp;
    startNaming({
      mode: 'rename-page',
      pageId: pending.pageId,
      value: '',
      removeIfEmpty: true,
    });
  }, [naming, showPages, tree.pages]);

  const readNamingValue = (): string => inputRef.current?.input?.value ?? naming?.value ?? '';

  const rejectNaming = (msg: string, focus = true): void => {
    void message.error(msg);
    if (!focus) {
      return;
    }
    ignoreNamingBlurRef.current = false;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirmNaming = (rawValue?: string): void => {
    if (!naming || confirmLockRef.current || isCancelingRef.current) {
      return;
    }
    confirmLockRef.current = true;
    const value = (rawValue ?? readNamingValue()).trim();
    try {
      runConfirmNaming(naming, value, tree, {
        reject: rejectNaming,
        cancel: cancelNaming,
        moveToFolder: onMoveFolderMember,
        createFolder: onCreateFolder,
        renameFolder: onRenameFolder,
        createPage: onCreatePage,
        renamePage: onRenamePage,
        deletePage: onDeletePage,
        createScenario: onCreateScenario,
        renameScenario: onRenameScenario,
        deleteScenario: onDeleteScenario,
        createModule: onCreateModule,
        renameModule: onRenameModule,
        createFuzzer: onCreateFuzzer,
        renameFuzzer: onRenameFuzzer,
        createResource: onCreateResource,
        renameResource: onRenameResource,
      });
    } finally {
      window.setTimeout(() => {
        confirmLockRef.current = false;
      }, 0);
    }
  };

  const applyNamingFromOutside = (): void => {
    if (!naming || ignoreNamingBlurRef.current || isCancelingRef.current) {
      return;
    }
    const val = readNamingValue().trim();
    if (!val) {
      if (
        (naming.mode === 'rename-page' && naming.removeIfEmpty) ||
        (naming.mode === 'rename-scenario' && naming.removeIfEmpty)
      ) {
        confirmNaming('');
        return;
      }
      cancelNaming();
      return;
    }
    confirmNaming(val);
  };

  useEffect(() => {
    if (!namingKey) {
      return;
    }
    /* VS Code: клик вне инпута = apply (не только blur — Tree/Dropdown могут съесть фокус). */
    const onPointerDownCapture = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const inputEl = inputRef.current?.input;
      if (inputEl && (target === inputEl || inputEl.contains(target))) {
        return;
      }
      if (target instanceof Element && target.closest('.ant-message, .ant-modal-root')) {
        return;
      }
      applyNamingFromOutside();
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
    };
  }, [namingKey]);

  const handleNamingEscape = (): void => {
    if (naming?.mode === 'rename-page' && naming.removeIfEmpty) {
      onDeletePage(naming.pageId);
    }
    if (naming?.mode === 'rename-scenario' && naming.removeIfEmpty) {
      onDeleteScenario(naming.scenarioIndex);
    }
    cancelNaming();
  };

  const handleNamingBlur = (): void => {
    if (ignoreNamingBlurRef.current || isCancelingRef.current) {
      return;
    }
    window.setTimeout(() => {
      if (ignoreNamingBlurRef.current || isCancelingRef.current) {
        return;
      }
      if (inputRef.current?.input && document.activeElement === inputRef.current.input) {
        return;
      }
      applyNamingFromOutside();
    }, 0);
  };

  const namingInput = (): React.JSX.Element => {
    if (!naming || !namingKey) {
      return <span />;
    }
    return (
      <ExplorerNamingInput
        key={namingKey}
        mode={naming.mode}
        defaultValue={naming.value}
        inputRef={inputRef}
        onConfirm={confirmNaming}
        onEscape={handleNamingEscape}
        onBlurApply={handleNamingBlur}
      />
    );
  };

  const draftLeaf = (key: Key, kind?: ExplorerLeafKind): DataNode => ({
    key,
    isLeaf: true,
    className: 'pk-studio-tree-node pk-studio-tree-naming-active',
    title: kind ? explorerLeafTitle(kind, namingInput(), String(key), leafIcons) : namingInput(),
  });

  const beginRenamePage = (pageId: string, needsName: boolean, title: string): void => {
    startNaming({
      mode: 'rename-page',
      pageId,
      value: needsName ? '' : title,
      removeIfEmpty: needsName || isPlaceholderAdditionalKey(pageId),
    });
  };

  const beginRenameScenario = (scenarioIndex: number, name: string): void => {
    startNaming({
      mode: 'rename-scenario',
      scenarioIndex,
      value: name,
      removeIfEmpty: false,
    });
  };

  const folderMemberMenu = (
    section: EditorFolderSection,
    member: string,
  ): NonNullable<MenuProps['items']> => {
    const destinations = folderMoveMenuSpecs(section, member, folders).map((spec) => ({
      key: spec.key,
      label: spec.label,
      onClick: () => {
        onMoveFolderMember(section, member, spec.folderId);
      },
    }));
    return destinations.length > 0 ? [{ type: 'divider' }, ...destinations] : [];
  };

  const folderNode = (
    section: EditorFolderSection,
    folder: EditorFolder,
    children: DataNode[],
  ): DataNode => {
    const menu: MenuProps['items'] = [
      {
        key: `create-member:${section}:${folder.id}`,
        label: `Добавить ${folderEntityLabel(section)}`,
        onClick: () => {
          beginCreateInFolder(section, folder.id);
        },
      },
      {
        key: `rename-folder:${section}:${folder.id}`,
        label: 'Переименовать группу',
        extra: 'F2',
        onClick: () => {
          startNaming({ mode: 'rename-folder', section, folderId: folder.id, value: folder.title });
        },
      },
      { type: 'divider' },
      {
        key: `delete-folder:${section}:${folder.id}`,
        label: 'Удалить группу',
        danger: true,
        onClick: () => {
          confirmDeleteFolder(section, folder);
        },
      },
    ];
    const isFolderNaming =
      naming?.mode === 'rename-folder' &&
      naming.section === section &&
      naming.folderId === folder.id;
    return {
      key: folderKey(section, folder.id),
      isLeaf: false,
      selectable: true,
      className: isFolderNaming
        ? 'pk-studio-tree-folder-node pk-studio-tree-naming-active'
        : 'pk-studio-tree-folder-node',
      title:
        naming?.mode === 'rename-folder' &&
        naming.section === section &&
        naming.folderId === folder.id ? (
          namingInput()
        ) : (
          <Dropdown trigger={['contextMenu']} menu={{ items: menu }}>
            <span
              className="pk-studio-tree-folder pk-studio-tree-folder-hit"
              data-pk-tree-key={folderKey(section, folder.id)}
              title={folder.title}
            >
              <span className="pk-studio-tree-label">{folder.title}</span>
            </span>
          </Dropdown>
        ),
      children: [
        ...children,
        {
          key: folderDropZoneKey(section, folder.id),
          isLeaf: true,
          selectable: false,
          className: `pk-studio-tree-folder-drop-zone-node pk-studio-tree-folder-drop-zone-${section}`,
          title: (
            <span
              className="pk-studio-tree-folder-drop-zone"
              data-pk-tree-key={folderDropZoneKey(section, folder.id)}
              aria-hidden
            />
          ),
        } satisfies DataNode,
      ],
    };
  };

  const nestFolderNodes = (
    section: EditorFolderSection,
    entries: FolderEntry[],
    drafts: DataNode[] = [],
  ): DataNode[] => {
    const targetFolderId = creationFolderId(naming, section);
    const sectionKind = explorerLeafKindForSection(section);
    return [
      ...folders[section].map((folder) =>
        folderNode(section, folder, [
          ...childNodesForFolder(folder, entries),
          ...(targetFolderId === folder.id
            ? [draftLeaf(`draft:member:${section}`, sectionKind)]
            : []),
        ]),
      ),
      ...(naming?.mode === 'create-folder' && naming.section === section
        ? [
            {
              key: `draft:folder:${section}`,
              selectable: false,
              className: 'pk-studio-tree-folder-node pk-studio-tree-naming-active',
              title: namingInput(),
              children: [],
            } satisfies DataNode,
          ]
        : []),
      ...rootFolderEntries(folders[section], entries).map((entry) =>
        withRootChildClass(entry.node),
      ),
      ...(targetFolderId
        ? []
        : drafts.map((draft) => withRootChildClass(draft))),
    ];
  };

  const pageChildren: DataNode[] = showPages
    ? tree.pages.map((page) => {
        const className = pageLeafClassName(page, naming);
        const menu: MenuProps['items'] = [
          {
            key: 'rename-page',
            label: 'Переименовать',
            extra: 'F2',
            onClick: () => {
              beginRenamePage(page.pageId, page.needsName, page.title);
            },
          },
          {
            key: 'create-page',
            label: 'Создать модель страницы',
            onClick: () => {
              openCreateModal('page');
            },
          },
          ...folderMemberMenu('pages', page.pageId),
          { type: 'divider' },
          {
            key: 'delete-page',
            label: 'Удалить модель страницы',
            danger: true,
            onClick: () => {
              confirmDeleteLeaf('Удалить модель страницы', page.title, () => {
                onDeletePage(page.pageId);
              });
            },
          },
        ];
        return {
          key: page.key,
          isLeaf: true,
          title:
            naming?.mode === 'rename-page' && naming.pageId === page.pageId ? (
              explorerLeafTitle('page', namingInput(), page.key, leafIcons)
            ) : (
              leafContextTitle(
                menu,
                className,
                page.idError,
                page.key,
                explorerLeafTitle('page', page.title, page.key, leafIcons),
              )
            ),
        };
      })
    : [];
  const scenarioChildren: DataNode[] = tree.scenarios.map((scenario) => {
    const className = scenarioLeafClassName(scenario, naming);
    const menu: MenuProps['items'] = [
      {
        key: 'rename-scenario',
        label: 'Переименовать',
        extra: 'F2',
        onClick: () => {
          beginRenameScenario(scenario.scenarioIndex, scenario.title);
        },
      },
      {
        key: 'create-scenario',
        label: 'Создать сценарий',
        onClick: () => {
          openCreateModal('scenario');
        },
      },
      ...folderMemberMenu('scenarios', scenario.title),
      { type: 'divider' },
      {
        key: 'delete-scenario',
        label: 'Удалить сценарий',
        danger: true,
        onClick: () => {
          confirmDeleteLeaf('Удалить сценарий', scenario.title, () => {
            onDeleteScenario(scenario.scenarioIndex);
          });
        },
      },
    ];
    return {
      key: scenario.key,
      isLeaf: true,
      title:
        naming?.mode === 'rename-scenario' && naming.scenarioIndex === scenario.scenarioIndex ? (
          explorerLeafTitle('scenario', namingInput(), scenario.key, leafIcons)
        ) : (
          leafContextTitle(
            menu,
            className,
            scenario.idError,
            scenario.key,
            explorerLeafTitle('scenario', scenario.title, scenario.key, leafIcons),
          )
        ),
    };
  });
  const moduleChildren: DataNode[] = tree.modules
    .filter((m) => m.moduleType !== AUTH_MODULE_TYPE)
    .map((module) => {
    const className = moduleLeafClassName(module, naming);
    let leafKind: ExplorerLeafKind = 'module';
    if (module.moduleType === CONNECTOR_MODULE_TYPE) {
      leafKind = connectorLeafKindFromType(module.connectorType);
    } else if (module.moduleType === OPENAPI_MODULE_TYPE) {
      leafKind = 'openapi';
    } else if (module.moduleType === GRAPHQL_MODULE_TYPE) {
      leafKind = 'graphql';
    } else if (module.moduleType === GRPC_MODULE_TYPE) {
      leafKind = 'grpc';
    }
    const menu: MenuProps['items'] = [
      {
        key: 'rename-module',
        label: 'Переименовать',
        extra: 'F2',
        onClick: () => {
          startNaming({
            mode: 'rename-module',
            moduleIndex: module.moduleIndex,
            value: module.title,
          });
        },
      },
      {
        key: 'create-module',
        label: 'Создать модуль',
        onClick: () => {
          beginCreate(GROUP_MODULES, { mode: 'create-module', value: '' });
        },
      },
      { type: 'divider' },
      {
        key: 'delete-module',
        label: 'Удалить модуль',
        danger: true,
        onClick: () => {
          confirmDeleteLeaf('Удалить модуль', module.title, () => {
            onDeleteModule(module.moduleIndex);
          });
        },
      },
    ];
    return {
      key: module.key,
      isLeaf: true,
      title:
        naming?.mode === 'rename-module' && naming.moduleIndex === module.moduleIndex ? (
          explorerLeafTitle(leafKind, namingInput(), module.key, leafIcons)
        ) : (
          leafContextTitle(
            menu,
            className,
            module.idError,
            module.key,
            explorerLeafTitle(leafKind, module.title, module.key, leafIcons),
          )
        ),
    };
  });
  const authChildren: DataNode[] = tree.modules
    .filter((m) => m.moduleType === AUTH_MODULE_TYPE)
    .map((module) => {
      const className = moduleLeafClassName(module, naming);
      const menu: MenuProps['items'] = [
        {
          key: 'rename-module',
          label: 'Переименовать',
          extra: 'F2',
          onClick: () => {
            startNaming({
              mode: 'rename-module',
              moduleIndex: module.moduleIndex,
              value: module.title,
            });
          },
        },
        {
          key: 'create-auth',
          label: 'Создать профиль',
          onClick: () => {
            beginCreate(GROUP_AUTH, { mode: 'create-auth', value: '' });
          },
        },
        { type: 'divider' },
        {
          key: 'delete-module',
          label: 'Удалить профиль',
          danger: true,
          onClick: () => {
            confirmDeleteLeaf('Удалить профиль', module.title, () => {
              onDeleteModule(module.moduleIndex);
            });
          },
        },
      ];
      return {
        key: module.key,
        isLeaf: true,
        title:
          naming?.mode === 'rename-module' && naming.moduleIndex === module.moduleIndex ? (
            explorerLeafTitle('auth', namingInput(), module.key, leafIcons)
          ) : (
            leafContextTitle(
              menu,
              className,
              module.idError,
              module.key,
              explorerLeafTitle('auth', module.title, module.key, leafIcons),
            )
          ),
      };
    });
  const fuzzerChildren: DataNode[] = tree.fuzzers.map((fuzzer) => {
    const className = entityLeafClassName(
      fuzzer,
      naming?.mode === 'rename-fuzzer' && naming.fuzzerIndex === fuzzer.fuzzerIndex,
    );
    const menu: MenuProps['items'] = [
      {
        key: 'rename-fuzzer',
        label: 'Переименовать',
        extra: 'F2',
        onClick: () => {
          startNaming({
            mode: 'rename-fuzzer',
            fuzzerIndex: fuzzer.fuzzerIndex,
            value: fuzzer.fuzzerId || fuzzer.title,
          });
        },
      },
      {
        key: 'create-fuzzer',
        label: 'Создать фаззер',
        onClick: () => {
          beginCreate(GROUP_FUZZERS, { mode: 'create-fuzzer', value: '' });
        },
      },
      { type: 'divider' },
      {
        key: 'delete-fuzzer',
        label: 'Удалить фаззер',
        danger: true,
        onClick: () => {
          confirmDeleteLeaf('Удалить фаззер', fuzzer.title, () => {
            onDeleteFuzzer(fuzzer.fuzzerIndex);
          });
        },
      },
    ];
    return {
      key: fuzzer.key,
      isLeaf: true,
      title:
        naming?.mode === 'rename-fuzzer' && naming.fuzzerIndex === fuzzer.fuzzerIndex ? (
          explorerLeafTitle('fuzzer', namingInput(), fuzzer.key, leafIcons)
        ) : (
          leafContextTitle(
            menu,
            className,
            fuzzer.idError,
            fuzzer.key,
            explorerLeafTitle('fuzzer', fuzzer.title, fuzzer.key, leafIcons),
          )
        ),
    };
  });
  const openResourcePicker = (): void => {
    resourceFileInputRef.current?.click();
  };

  const resourceChildren: DataNode[] = tree.resources.map((resource) => {
    const className = entityLeafClassName(
      resource,
      naming?.mode === 'rename-resource' && naming.resourceIndex === resource.resourceIndex,
    );
    const menu: MenuProps['items'] = [
      {
        key: 'attach-resource',
        label: 'Прикрепить файл…',
        onClick: () => {
          openResourcePicker();
        },
      },
      {
        key: 'create-resource-empty',
        label: 'Пустой .txt / .har',
        onClick: () => {
          beginCreate(GROUP_RESOURCES, { mode: 'create-resource', value: '' });
        },
      },
      {
        key: 'rename-resource',
        label: 'Переименовать (as)',
        extra: 'F2',
        onClick: () => {
          startNaming({
            mode: 'rename-resource',
            resourceIndex: resource.resourceIndex,
            value: resource.as || resource.title,
          });
        },
      },
      { type: 'divider' },
      {
        key: 'delete-resource',
        label: 'Удалить ресурс',
        danger: true,
        onClick: () => {
          confirmDeleteLeaf('Удалить ресурс', resource.title, () => {
            onDeleteResource(resource.resourceIndex);
          });
        },
      },
    ];
    return {
      key: resource.key,
      isLeaf: true,
      title:
        naming?.mode === 'rename-resource' && naming.resourceIndex === resource.resourceIndex ? (
          explorerLeafTitle('resource', namingInput(), resource.key, leafIcons)
        ) : (
          leafContextTitle(
            menu,
            className,
            resource.idError,
            resource.key,
            explorerLeafTitle('resource', resource.title, resource.key, leafIcons),
          )
        ),
    };
  });
  const pageExplorerChildren = nestFolderNodes(
    'pages',
    tree.pages.map((page, index) => ({ member: page.pageId, node: pageChildren[index]! })),
    naming?.mode === 'create-page' ? [draftLeaf(DRAFT_PAGES)] : [],
  );
  const scenarioExplorerChildren = nestFolderNodes(
    'scenarios',
    tree.scenarios.map((scenario, index) => ({
      member: scenario.title,
      node: scenarioChildren[index]!,
    })),
    naming?.mode === 'create-scenario' ? [draftLeaf(DRAFT_SCENARIOS)] : [],
  );
  const moduleExplorerChildren: DataNode[] = [
    ...tree.modules
      .filter((m) => m.moduleType !== AUTH_MODULE_TYPE)
      .map((module, index) => ({ member: module.moduleId, node: moduleChildren[index]! }))
      .sort((left, right) => compareEditorFolderMembers(left.member, right.member))
      .map((entry) => ({
        ...entry.node,
        className: `${entry.node.className ?? ''} pk-studio-tree-root-child-node`.trim(),
      })),
    ...(naming?.mode === 'create-module'
      ? [draftLeaf(DRAFT_MODULES, 'module')].map((draft) => ({
          ...draft,
          className: `${draft.className ?? ''} pk-studio-tree-root-child-node`.trim(),
        }))
      : []),
  ];
  const fuzzerExplorerChildren: DataNode[] = [
    ...tree.fuzzers
      .map((fuzzer, index) => ({ member: fuzzer.fuzzerId || fuzzer.title, node: fuzzerChildren[index]! }))
      .sort((left, right) => compareEditorFolderMembers(left.member, right.member))
      .map((entry) => ({
        ...entry.node,
        className: `${entry.node.className ?? ''} pk-studio-tree-root-child-node`.trim(),
      })),
    ...(naming?.mode === 'create-fuzzer'
      ? [draftLeaf(DRAFT_FUZZERS, 'fuzzer')].map((draft) => ({
          ...draft,
          className: `${draft.className ?? ''} pk-studio-tree-root-child-node`.trim(),
        }))
      : []),
  ];
  const resourceExplorerChildren: DataNode[] = [
    ...tree.resources
      .map((resource, index) => ({ member: resource.as || resource.title, node: resourceChildren[index]! }))
      .sort((left, right) => compareEditorFolderMembers(left.member, right.member))
      .map((entry) => ({
        ...entry.node,
        className: `${entry.node.className ?? ''} pk-studio-tree-root-child-node`.trim(),
      })),
    ...(naming?.mode === 'create-resource'
      ? [draftLeaf(DRAFT_RESOURCES, 'resource')].map((draft) => ({
          ...draft,
          className: `${draft.className ?? ''} pk-studio-tree-root-child-node`.trim(),
        }))
      : []),
  ];
  const authExplorerChildren: DataNode[] = [
    ...tree.modules
      .filter((m) => m.moduleType === AUTH_MODULE_TYPE)
      .map((module, index) => ({ member: module.moduleId, node: authChildren[index]! }))
      .sort((left, right) => compareEditorFolderMembers(left.member, right.member))
      .map((entry) => ({
        ...entry.node,
        className: `${entry.node.className ?? ''} pk-studio-tree-root-child-node`.trim(),
      })),
    ...(naming?.mode === 'create-auth'
      ? [draftLeaf(DRAFT_AUTH, 'auth')].map((draft) => ({
          ...draft,
          className: `${draft.className ?? ''} pk-studio-tree-root-child-node`.trim(),
        }))
      : []),
  ];

  const treeMemberForTreeKey = (key: string): TreeMember | undefined =>
    resolveTreeMemberForKey(tree, key);

  const clearNativeDropTarget = (): void => {
    nativeDropTargetRef.current?.classList.remove('pk-studio-tree-native-drop-target');
    nativeDropTargetRef.current = undefined;
  };

  const clearNativeTreeDrag = (): void => {
    nativeDragMemberRef.current = undefined;
    clearNativeDropTarget();
    treeRootRef.current?.classList.remove(
      'pk-studio-tree-dragging-pages',
      'pk-studio-tree-dragging-scenarios',
      'pk-studio-tree-dragging-modules',
    );
  };

  const keyFromDragEvent = (event: ReactDragEvent<HTMLElement>): string | undefined => {
    if (!(event.target instanceof Element)) {
      return undefined;
    }
    return event.target.closest<HTMLElement>('[data-pk-tree-key]')?.dataset.pkTreeKey;
  };

  const nativeDropDestination = (
    member: TreeMember,
    targetKey: string,
  ): TreeDropDestination | undefined =>
    resolveNativeDropDestination(member, targetKey, folders, tree);

  const showNativeDropTarget = (target: EventTarget | null): void => {
    const row =
      target instanceof Element
        ? target.closest<HTMLElement>('[role="treeitem"]')
        : undefined;
    if (!row) {
      clearNativeDropTarget();
      return;
    }
    clearNativeDropTarget();
    row.classList.add('pk-studio-tree-native-drop-target');
    nativeDropTargetRef.current = row;
  };

  const allowTreeDrop: NonNullable<TreeProps['allowDrop']> = ({
    dragNode,
    dropNode,
    dropPosition,
  }) =>
    allowStudioTreeDrop({
      member: treeMemberForTreeKey(String(dragNode.key)),
      targetKey: String(dropNode.key),
      dropPosition,
      folders,
      tree,
    });

  const handleTreeDrop: NonNullable<TreeProps['onDrop']> = (info) => {
    const member = treeMemberForTreeKey(String(info.dragNode.key));
    treeRootRef.current?.classList.remove(
      'pk-studio-tree-dragging-pages',
      'pk-studio-tree-dragging-scenarios',
      'pk-studio-tree-dragging-modules',
    );
    const destination = resolveAntTreeDropDestination({
      member,
      targetKey: String(info.node.key),
      dropToGap: Boolean(info.dropToGap),
      folders,
      tree,
    });
    if (!member || !destination) {
      return;
    }
    onDropTreeMember(member.section, member.member, destination);
  };

  const treeData: DataNode[] = [];
  if (showPages) {
    treeData.push({
      key: GROUP_PAGES,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'create-page',
                label: 'Создать модель страницы',
                onClick: () => {
                  beginCreate(GROUP_PAGES, { mode: 'create-page', value: '' });
                },
              },
              {
                key: 'create-page-folder',
                label: 'Добавить группу',
                onClick: () => {
                  beginCreateFolder('pages');
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_PAGES}>
            Модели страниц
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: pageExplorerChildren,
    });
  }

  treeData.push(
    {
      key: GROUP_SCENARIOS,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'create-scenario',
                label: 'Создать сценарий',
                onClick: () => {
                  beginCreate(GROUP_SCENARIOS, { mode: 'create-scenario', value: '' });
                },
              },
              {
                key: 'create-scenario-folder',
                label: 'Добавить группу',
                onClick: () => {
                  beginCreateFolder('scenarios');
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_SCENARIOS}>
            Сценарии
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: scenarioExplorerChildren,
    },
    {
      key: GROUP_FUZZERS,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'create-fuzzer',
                label: 'Создать фаззер',
                onClick: () => {
                  beginCreate(GROUP_FUZZERS, { mode: 'create-fuzzer', value: '' });
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_FUZZERS}>
            Фаззеры
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: fuzzerExplorerChildren,
    },
    {
      key: GROUP_RESOURCES,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'attach-resource',
                label: 'Прикрепить файл…',
                onClick: () => {
                  expandGroup(GROUP_RESOURCES);
                  openResourcePicker();
                },
              },
              {
                key: 'create-resource-empty',
                label: 'Пустой .txt / .har',
                onClick: () => {
                  beginCreate(GROUP_RESOURCES, { mode: 'create-resource', value: '' });
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_RESOURCES}>
            Модули данных
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: resourceExplorerChildren,
    },
    {
      key: GROUP_MODULES,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'create-module',
                label: 'Создать коннектор/интеграцию',
                onClick: () => {
                  beginCreate(GROUP_MODULES, { mode: 'create-module', value: '' });
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_MODULES}>
            Коннекторы и Интеграции
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: moduleExplorerChildren,
    },
    {
      key: GROUP_AUTH,
      selectable: true,
      className: 'pk-studio-tree-section-node',
      title: (
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: [
              {
                key: 'create-auth',
                label: 'Создать профиль авторизации',
                onClick: () => {
                  beginCreate(GROUP_AUTH, { mode: 'create-auth', value: '' });
                },
              },
            ],
          }}
        >
          <span className="pk-studio-tree-group" data-pk-tree-key={GROUP_AUTH}>
            Профили авторизации
          </span>
        </Dropdown>
      ),
      isLeaf: false,
      children: authExplorerChildren,
    },
  );

  const selected = treeSelection;

  const finalTreeData: DataNode[] = treeData;

  /** Delete/F2 — по выделению Explorer (`treeSelection`), не по активной вкладке редактора. */
  const confirmSelectedDeletion = (): void => {
    confirmTreeSelectionDeletion(treeSelection, tree, {
      confirmDeleteFolder: (section, folder) => confirmDeleteFolder(section, folder as EditorFolder),
      confirmDeleteLeaf,
      onDeletePage,
      onDeleteScenario,
      onDeleteModule,
      onDeleteFuzzer,
      onDeleteResource,
      folders,
    });
  };

  const beginRenameSelected = (): void => {
    beginTreeSelectionRename(treeSelection, tree, {
      startNaming,
      beginRenamePage,
      beginRenameScenario,
      folders,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && naming) {
        event.preventDefault();
        event.stopPropagation();
        if (naming.mode === 'rename-page' && naming.removeIfEmpty) {
          onDeletePage(naming.pageId);
        }
        if (naming.mode === 'rename-scenario' && naming.removeIfEmpty) {
          onDeleteScenario(naming.scenarioIndex);
        }
        cancelNaming();
        return;
      }
      if ((event.key !== 'F2' && event.key !== 'Delete') || naming) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.monaco-editor'))
      ) {
        return;
      }
      if (!treeSelection) {
        return;
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        confirmSelectedDeletion();
        return;
      }
      event.preventDefault();
      beginRenameSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmSelectedDeletion, naming, treeSelection, tree, folders]);

  return (
    <aside
      ref={treeRootRef}
      className={`pk-studio-tree ${isIdle ? 'pk-studio-tree--idle' : ''}`}
      onContextMenu={(event) => {
        // Зазор между узлами / пустое место: сущности нет — без native Windows menu.
        // Dropdown на листьях свой preventDefault уже делает; здесь глушим остальное.
        event.preventDefault();
      }}
      onDragStartCapture={(event) => {
        const key = keyFromDragEvent(event);
        const member = key ? treeMemberForTreeKey(key) : undefined;
        clearNativeTreeDrag();
        if (!member) {
          return;
        }
        nativeDragMemberRef.current = member;
        if (isFolderSection(member.section)) {
          treeRootRef.current?.classList.add(`pk-studio-tree-dragging-${member.section}`);
        }
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOverCapture={(event) => {
        const member = nativeDragMemberRef.current;
        const key = keyFromDragEvent(event);
        const destination = member && key
          ? nativeDropDestination(member, key)
          : undefined;
        if (!member || !key) {
          return;
        }
        if (destination) {
          showNativeDropTarget(event.target);
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        } else {
          clearNativeDropTarget();
        }
      }}
      onDropCapture={(event) => {
        const member = nativeDragMemberRef.current;
        const key = keyFromDragEvent(event);
        const destination = member && key
          ? nativeDropDestination(member, key)
          : undefined;
        if (!member || !destination) {
          clearNativeTreeDrag();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        clearNativeTreeDrag();
        onDropTreeMember(member.section, member.member, destination);
      }}
      onDragEndCapture={clearNativeTreeDrag}
    >
      <GraphWaveOverlay containerRef={treeRootRef} isIdle={Boolean(isIdle)} />
      <Tree
        showLine={false}
        blockNode
        expandAction={false}
        draggable={{
          icon: false,
          /*
           * rc-tree требует draggable у drop-target. allowDrop запрещает
           * перенос всего, кроме листьев.
           */
          nodeDraggable: (node) => isStudioTreeNodeDraggable(String(node.key), tree),
        }}
        allowDrop={allowTreeDrop}
        onDrop={handleTreeDrop}
        dropIndicatorRender={() => null}
        switcherIcon={(node) => renderStudioTreeSwitcherIcon(node as { eventKey?: string | number; expanded?: boolean }, toggleSection)}
        treeData={finalTreeData}
        expandedKeys={expandedKeys}
        selectedKeys={selected ? [selected] : []}
        className="pk-studio-tree-list"
        onExpand={(keys, info) => {
          if (info.expanded) {
            markAnimationInFlight();
          }
          const nextFolders = keys
            .map(String)
            .filter((key) => key.startsWith('folder:'));
          const expandedGroupKey = String(info.node.key);
          let nextCollapsedGroups = collapsedGroupKeys;
          if (sectionForGroupKey(expandedGroupKey)) {
            if (info.expanded) {
              nextCollapsedGroups = collapsedGroupKeys.filter((key) => key !== expandedGroupKey);
            } else {
              nextCollapsedGroups = [...new Set([...collapsedGroupKeys, expandedGroupKey])];
            }
          }
          setExpandedFolderKeys(nextFolders);
          setCollapsedGroupKeys(nextCollapsedGroups);
          persistTreeExpansion(nextFolders, nextCollapsedGroups);
        }}
        onSelect={(keys) => {
          const key = String(keys[0] ?? '');
          setTreeSelection(key || undefined);
          syncGuidesRef.current?.();
          if (
            key.startsWith('page:') ||
            key.startsWith('module:') ||
            key.startsWith('fuzzer:') ||
            key.startsWith('resource:') ||
            /^scenario:\d+$/.test(key)
          ) {
            onSelectTab(key as StudioTabId);
          }
        }}
      />
      <input
        ref={resourceFileInputRef}
        type="file"
        accept=".txt,.har,text/plain,application/json,application/har+json"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            onAttachResourceFiles(files);
          }
          event.target.value = '';
        }}
      />
      {createModal ? (
        <Modal
          title={createModal.type === 'page' ? 'Создать модель страницы' : 'Создать сценарий'}
          open
          onOk={handleCreateModalSubmit}
          onCancel={() => setCreateModal(null)}
          okText="Создать"
          cancelText="Отмена"
          okButtonProps={{ disabled: !createModalId.trim() }}
        >
          <div className="pk-studio-create-modal">
            <label className="pk-studio-create-modal-field">
              <span className="pk-studio-create-modal-label">Название</span>
              <Input
                autoFocus
                value={createModalTitle}
                placeholder={createModal.type === 'page' ? 'Страница логина' : 'Дымовой тест'}
                onChange={(e) => {
                  const t = e.target.value;
                  setCreateModalTitle(t);
                  setCreateModalId(sanitizeToPythonId(t));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createModalId.trim()) {
                    e.preventDefault();
                    handleCreateModalSubmit();
                  }
                }}
              />
            </label>
            <label className="pk-studio-create-modal-field">
              <span className="pk-studio-create-modal-label">Идентификатор</span>
              <Input
                value={createModalId}
                placeholder="login_page"
                onChange={(e) => setCreateModalId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && createModalId.trim()) {
                    e.preventDefault();
                    handleCreateModalSubmit();
                  }
                }}
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </aside>
  );
});
