/**
 * Редактор: дерево suites → PrettyK | WireK | панель ресурса / Fuzzer.
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { editor, IRange, IPosition } from 'monaco-editor';
import { App as AntdApp, Button, Empty, Segmented, Tabs, Typography, Modal, Form, Input, Select, Switch, InputNumber } from 'antd';
import { ImportOutlined, MergeCellsOutlined, UnorderedListOutlined } from '@ant-design/icons';
import {
  ConstructorNoPenguin,
  type ValidationFeedback,
} from '../components/ConstructorNoPenguin';
import { useKeywords } from '../keywords/KeywordsContext';
import {
  constructorValidationText,
  looksLikeLanguageScript,
  type ConstructorDiagnostic,
} from '../keywords/constructor';
import {
  validateAuthModuleBackend,
  validateConstructorBackend,
  type ConstructorBatchFail,
} from '../api/editorValidate';
import { applyDiagnostics, CONSTRUCTOR_MARKER_OWNER } from '../monaco/constructorLanguage';
import { PRETTYK_LANGUAGE_ID } from '../monaco/setup';
import { formatCursorHud } from '../monaco/studioCursorSymbol';
import { applyConstructorLedDecorations } from '../monaco/constructorLedDecorations';
import { useThemeMode } from '../theme/ThemeProvider';
import {
  collectStudioNodes,
  findNodeByTabId,
  pageConstructorPointer,
  setAtPointer,
  tabFromNode,
} from './collectStudioNodes';
import { withScenarioFailsafeFlag } from '../keywords/scenarioFailsafe';
import { padConstructorCanvas } from './defaultConstructor';
import { StudioLaunchpad } from './StudioLaunchpad';
import { freshCheckWiredData } from '../shell/freshCheck';
import {
  normalizeConnectorFields,
  updateConnectorModule,
  type ConnectorFieldsPatch,
} from './connectorFields';
import {
  StudioActionHub,
  type HubActionId,
  type HubSubmitPayload,
} from './StudioActionHub';
import { StudioActionForm } from './StudioActionForm';
import {
  normalizeGraphqlFields,
  normalizeGrpcFields,
  normalizeOpenApiFields,
  updateGraphqlModule,
  updateGrpcModule,
  updateOpenApiModule,
} from './apiModuleFields';
import {
  normalizeChainFields,
  updateChainModule,
} from './chainModuleFields';
import {
  authModuleConstructorText,
  isAuthActionConstructor,
  isAuthFormConstructor,
  updateAuthModuleConstructor,
} from './authFormFields';
import {
  StudioBlocksTree,
  type ExplorerRevealRequest,
  type TreeDropDestination,
} from './StudioBlocksTree';
import { StudioGraphExplorer } from './graph/StudioGraphExplorer';
import { GraphWaveOverlay } from './graph/GraphWaveOverlay';
import { useGraphIdle } from './graph/useGraphIdle';
import { PreflightAdvisoryStrip } from '../admin/PreflightAdvisoryStrip';
import { useGraphTelemetry } from './graph/useGraphTelemetry';
import {
  documentTabIdFromNodeKey,
  nextTabDropHint,
  tabIdFromTabsEventTarget,
} from './studioTabDrag';
import { reorderStudioTabs, tabDropEdgeFromPoint, type TabDropEdge } from './studioTabOrder';
import addTabIcon from '../assets/PrettyK/editor/icons8-add-new-96.png';
import {
  createEditorFolder,
  moveEditorFolderMember,
  readEditorFolders,
  removeEditorFolder,
  renameEditorFolder,
  replaceEditorFolderMember,
  type EditorFolderSection,
} from './studioFolders';
import type { StudioTreeSection } from './studioTreeOrder';
import {
  addFuzzer,
  normalizeFuzzer,
  removeFuzzer,
  renameFuzzer,
  updateFuzzer,
  type FuzzerPatch,
} from './studioFuzzers';
import { StudioImportDialog } from './StudioImportDialog';
import { StudioLocatorHealBanner } from './StudioLocatorHealBanner';
import { StudioLocatorLabelBanner } from './StudioLocatorLabelBanner';
import type { LocatorLabelProposal } from './locatorLabelPropose';
import { ScenarioPhaseFolder } from './ScenarioPhaseFolder';
import { useLocale } from '../locales';
import { studioOffEmptyDescription, studioSuiteMode } from './studioMode';
import { setStudioCommandHost } from '../shell/studioCommandHost';
import type { LocatorHealProposal } from './locatorHealPropose';
import {
  addAuthModule,
  addChainModule,
  addConnectorModule,
  addGraphqlModule,
  addGrpcModule,
  addModule,
  addOpenApiModule,
  CHAIN_MODULE_TYPE,
  CONNECTOR_MODULE_TYPE,
  GRAPHQL_MODULE_TYPE,
  GRPC_MODULE_TYPE,
  OPENAPI_MODULE_TYPE,
  moduleRecordAt,
  removeModule,
  renameModuleLabel,
} from './studioModules';
import {
  isAuthStudioConstructorTab,
  isPlainStudioConstructorTab,
  studioTabWireDiagnostics,
} from './studioDiagnostics';
import { resourceLanguageFromPath } from './studioWorkspacePaneMeta';
import {
  addPage,
  normalizePagesInData,
  pageDisplayError,
  removePage,
  renamePageTitle,
} from './studioPages';
import {
  removeContentKey,
  renameContentKey,
  type ResourceContentsMap,
} from './resourceContents';
import {
  appendHarImportSeed,
  buildHarImportSeedLines,
} from './seedHarImport';
import {
  attachResourceRejectMessage,
  importKindFromFileName,
  isAttachableResourceFileName,
  resourcePathForAttachedFile,
  uniqueResourceAsName,
} from './studioResourceAttach';
import {
  addResource,
  listResourceAsNames,
  normalizeImport,
  removeResource,
  renameResource,
  sanitizeFilenameToAs,
  updateResource,
  type ImportKind,
} from './studioResources';
import {
  addScenario,
  ensureScenarioStep0,
  removeScenario,
  renameScenario,
} from './studioScenarios';
import {
  disposeStudioModel,
  modelPathForTab,
  pushTextToModel,
  readModelText,
  tabIdFromSuiteModelUri,
} from './studioModels';
import {
  compareProblemMarkers,
} from './studioProblems';
import {
  actionHubDraftTab,
  fuzzerTabId,
  isDocumentStudioTab,
  isStudioTabId,
  moduleIndexFromTabId,
  moduleTabId,
  pageIdFromTabId,
  pageTabId,
  resourceTabId,
  scenarioIndexFromTabId,
  scenarioTabId,
  type StudioTab,
  type StudioTabId,
} from './studioTabs';
import {
  editorPositionFromFail,
  resolveNodeForValidationFail,
} from './studioValidationNavigate';
import { applyHubSubmit } from './studioWorkspaceHub';
import {
  mergeEditorBlocks,
  type ImportBlocksPayload,
} from './studioTransfer';
import {
  resolveFolderModuleIndicesDesc,
  resolveFolderPages,
  resolveFolderScenarioIndicesDesc,
} from './studioWorkspaceDeleteFolder';
import {
  openFuzzerIdsFromTabs,
  openModuleIdsFromTabs,
  openResourceAsFromTabs,
  openScenarioTitlesFromTabs,
  rebuildFuzzerTabs,
  rebuildModuleTabs,
  rebuildResourceTabs,
  rebuildScenarioTabs,
} from './studioWorkspaceKindDelete';
import {
  applyTreeMemberDrop,
} from './studioWorkspaceFolderDrop';
import { scenarioTabAfterCreate } from './studioWorkspaceCreateScenario';
import { planOpenHubDraftTab } from './studioWorkspaceHubOpen';
import {
  constructorTextOrDefault,
  ensureConstructorOnOpen,
  firstStudioNode,
  readConstructorSlice,
  stripLegacyAtSeed,
} from './studioWorkspaceOpenConstructor';
import { PLAIN_TEXT_LANGUAGE } from './studioWorkspacePaneMeta';
import {
  applyActiveTabAfterMerge,
  mergeTabsAfterKindDelete,
} from './studioWorkspaceTabs';
import { resolveStudioFormFlags } from './studioWorkspaceFormFlags';
import {
  PrettyPaneLabel,
  renderStudioPrettyActiveBody,
} from './studioWorkspaceActiveBody';
import { StudioPresetBar } from './StudioPresetBar';
import {
  attachChainPlayFuzz,
  ensureHarResourceForPlay,
  seedChainPlayIntoScenario,
} from './studioWorkspaceChainPlay';
import { parseAtDirectives } from './parseAtDirectives';

/** Debounce записи в formData — чаще = лаг Backspace (перерисовка App/RJSF). */
const SYNC_MS = 320;
/** Backend validate активной вкладки: короткий debounce, но не ожидание Enter/blur. */
const BACKEND_VALIDATE_MS = 250;

export interface StudioWorkspaceProps {
  formData: unknown;
  onFormDataChange: (next: unknown) => void;
  resourceContents: ResourceContentsMap;
  onResourceContentsChange: (next: ResourceContentsMap) => void;
  validationFeedback?: ValidationFeedback;
  validationSuccessVersion: number;
  onCloseValidationFeedback: () => void;
  /** Header Validate — второй слой cmdk. */
  onCmdValidate?: () => void;
  /** Pipeline / Baseline — второй слой cmdk (если в контексте). */
  onCmdBaseline?: () => void;
  /** Управление режимом «Студия / Редактор» снаружи (из глобального хедера). */
  studioMode?: StudioMode;
  onStudioModeChange?: (next: StudioMode) => void;
}

function isConnectorModuleTab(tab: StudioTab | undefined, formData: unknown): boolean {
  if (!tab) {
    return false;
  }
  if (tab.path.includes('/connector_fields/')) {
    return true;
  }
  const idx = moduleIndexFromTabId(tab.id);
  if (idx === undefined) {
    return false;
  }
  return moduleRecordAt(formData, idx)?.module_type === CONNECTOR_MODULE_TYPE;
}

function moduleTypeAtTab(
  tab: StudioTab | undefined,
  formData: unknown,
): string | undefined {
  if (!tab) {
    return undefined;
  }
  const idx = moduleIndexFromTabId(tab.id);
  if (idx === undefined) {
    return undefined;
  }
  const t = moduleRecordAt(formData, idx)?.module_type;
  return typeof t === 'string' ? t : undefined;
}

function StudioWorkspaceInner({
  formData,
  onFormDataChange,
  resourceContents,
  onResourceContentsChange,
  validationFeedback,
  validationSuccessVersion,
  onCloseValidationFeedback,
  onCmdValidate,
  onCmdBaseline,
  studioMode: controlledStudioMode,
  onStudioModeChange: controlledOnStudioModeChange,
}: StudioWorkspaceProps): React.JSX.Element {
  const { message } = AntdApp.useApp();
  const { themeId } = useThemeMode();
  const { catalog, variables, monaco } = useKeywords();
  const { dict } = useLocale();
  const suiteMode = useMemo(() => studioSuiteMode(formData), [formData]);
  const tree = useMemo(() => collectStudioNodes(formData), [formData]);
  const folders = useMemo(() => readEditorFolders(formData), [formData]);
  const studioProjectId = useMemo(() => {
    const root = formData as { meta?: { project_id?: unknown } } | undefined;
    return typeof root?.meta?.project_id === 'string' ? root.meta.project_id : 'draft';
  }, [formData]);
  const resourceContentsRef = useRef(resourceContents);
  resourceContentsRef.current = resourceContents;
  const onResourceContentsChangeRef = useRef(onResourceContentsChange);
  onResourceContentsChangeRef.current = onResourceContentsChange;
  const [openTabs, setOpenTabs] = useState<StudioTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<StudioTabId | undefined>(undefined);
  /** Form-popup после клика по action; каталог живёт на невидимом черновике action-hub. */
  const [hubFormActionId, setHubFormActionId] = useState<HubActionId | null>(null);
  const [hubFormEpoch, setHubFormEpoch] = useState(0);
  const [showHubOverlay, setShowHubOverlay] = useState(false);
  const [explorerReveal, setExplorerReveal] = useState<ExplorerRevealRequest | null>(null);
  /** IMPX-4: диалог «Импорт из проверки». */
  const [showImportDialog, setShowImportDialog] = useState(false);
  /** STU-SPLIT: режим рабочей области — «Студия» (front) или «Редактор» (editor). */
  const [internalStudioMode, setInternalStudioMode] = useState<StudioMode>(() => {
    if (typeof window === 'undefined') {
      return 'front';
    }
    const stored = window.localStorage.getItem(STUDIO_MODE_STORAGE_KEY);
    return stored === 'editor' ? 'editor' : 'front';
  });

  const studioMode = controlledStudioMode ?? internalStudioMode;
  const isEditorMode = studioMode === 'editor';

  const handleStudioModeChange = useCallback((next: StudioMode) => {
    if (controlledOnStudioModeChange) {
      controlledOnStudioModeChange(next);
    } else {
      setInternalStudioMode(next);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STUDIO_MODE_STORAGE_KEY, next);
    }
  }, [controlledOnStudioModeChange]);
  /** Зеркало активного model для диагностики — не SoT документа. */
  const [liveText, setLiveText] = useState('');
  const [scenarioPhaseView, setScenarioPhaseView] = useState(false);
  const [suiteSetupActive, setSuiteSetupActive] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [gearInitialValues, setGearInitialValues] = useState<Record<string, unknown>>({});
  const [backendDiagnostics, setBackendDiagnostics] = useState<ConstructorDiagnostic[] | null>(
    null,
  );
  const backendTimerRef = useRef(0);
  /** Поздний ответ на прошлую версию текста не имеет права вернуть старую ошибку. */
  const backendValidationRevisionRef = useRef(0);
  /** HUD строка:столбец — DOM, без setState (иначе Backspace → лишний re-render студии). */
  const cursorHudRef = useRef<HTMLDivElement | null>(null);
  const liveTextRef = useRef('');
  const lastEmittedRef = useRef('');
  const activeTabIdRef = useRef(activeTabId);
  const formDataRef = useRef(formData);
  const syncTimerRef = useRef<number | undefined>(undefined);
  const onFormDataChangeRef = useRef(onFormDataChange);
  const bootstrappedRef = useRef(false);
  const normalizedRef = useRef(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  /** После go-to-definition на другой URI — tab open async, selection догоняем. */
  const pendingRevealRef = useRef<{
    path: string;
    selection: IRange | IPosition;
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const prettyPaneRef = useRef<HTMLElement>(null);
  const { isIdle: isWorkspaceIdle } = useGraphIdle(workspaceRef, 20_000);
  const openTabsRef = useRef(openTabs);
  const ignoreModelEchoRef = useRef(false);

  const paintCursorHud = useCallback((line: number, column: number, symbol?: string) => {
    const el = cursorHudRef.current;
    if (el) {
      el.textContent = formatCursorHud(line, column, symbol ?? '');
    }
  }, []);

  /** Смена вкладки / внешний sync — сразу. */
  const setLiveTextNow = useCallback((next: string) => {
    liveTextRef.current = next;
    backendValidationRevisionRef.current += 1;
    setBackendDiagnostics(null);
    setLiveText(next);
  }, []);

  /** Keystroke сразу меняет диагностику Monaco; запись в formData всё ещё debounce. */
  const setLiveTextFromTyping = useCallback((next: string) => {
    liveTextRef.current = next;
    backendValidationRevisionRef.current += 1;
    // Do not keep markers produced for the previous text while backend validation is pending.
    setBackendDiagnostics(null);
    setLiveText(next);
  }, []);

  onFormDataChangeRef.current = onFormDataChange;
  activeTabIdRef.current = activeTabId;
  formDataRef.current = formData;
  openTabsRef.current = openTabs;

  useEffect(() => {
    if (normalizedRef.current || suiteMode === 'off') {
      return;
    }
    normalizedRef.current = true;
    const normalized = normalizePagesInData(formData);
    if (normalized !== formData) {
      onFormDataChange(normalized);
    }
  }, [formData, onFormDataChange, suiteMode]);

  const activeTab = openTabs.find((tab) => tab.id === activeTabId);
  const isScenarioTab = (activeTab?.kind as string) === 'scenario';
  const isConnectorModuleActive = isConnectorModuleTab(activeTab, formData);
  const activeModuleType = moduleTypeAtTab(activeTab, formData);
  const isAuthModuleActive = isAuthStudioConstructorTab(formData, activeTab);
  const authFormCtorText = useMemo(() => {
    if (!isAuthModuleActive || !activeTab) {
      return '';
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return '';
    }
    return authModuleConstructorText(formData, idx);
  }, [activeTab, formData, isAuthModuleActive]);
  const {
    isResourceTab,
    isFuzzerTab,
    isOpenApiModuleActive,
    isGraphqlModuleActive,
    isGrpcModuleActive,
    isChainModuleActive,
    isAuthFormUiActive,
    isAuthActionUiActive,
    isFormOnlyTab,
  } = resolveStudioFormFlags({
    activeTab,
    isConnectorModuleActive,
    activeModuleType,
    openApiType: OPENAPI_MODULE_TYPE,
    graphqlType: GRAPHQL_MODULE_TYPE,
    grpcType: GRPC_MODULE_TYPE,
    chainType: CHAIN_MODULE_TYPE,
    isAuthFormUiActive:
      isAuthModuleActive && isAuthFormConstructor(authFormCtorText),
    isAuthActionUiActive:
      isAuthModuleActive && isAuthActionConstructor(authFormCtorText),
  });
  const isPlainDataActive = isPlainStudioConstructorTab(formData, activeTab);
  const activeLanguageId = isResourceTab
    ? resourceLanguageFromPath(activeTab?.path)
    : isPlainDataActive
      ? PLAIN_TEXT_LANGUAGE
      : PRETTYK_LANGUAGE_ID;
  const activeModelPath = activeTab ? modelPathForTab(activeTab) : undefined;
  const activeDefaultValue =
    activeTab &&
    activeTab.kind !== 'resource' &&
    activeTab.kind !== 'fuzzer' &&
    !isConnectorModuleActive
      ? constructorTextOrDefault(formData, activeTab.path, isPlainDataActive)
      : '';

  const graphTelemetry = useGraphTelemetry(30_000);
  useEffect(() => {
    applyConstructorLedDecorations(editorRef.current, graphTelemetry);
  }, [graphTelemetry]);

  useLayoutEffect(() => {
    if (!activeModelPath || isFormOnlyTab) {
      return;
    }
    const pos = editorRef.current?.getPosition();
    paintCursorHud(pos?.lineNumber ?? 1, pos?.column ?? 1);
  }, [activeModelPath, isFormOnlyTab, paintCursorHud]);

  const pushTabModel = useCallback(
    (tab: StudioTab, text: string) => {
      const path = modelPathForTab(tab);
      if (!path) {
        return;
      }
      const plain = isPlainStudioConstructorTab(formDataRef.current, tab);
      ignoreModelEchoRef.current = true;
      pushTextToModel(
        monaco,
        path,
        plain ? stripLegacyAtSeed(text) : padConstructorCanvas(text),
        plain ? PLAIN_TEXT_LANGUAGE : PRETTYK_LANGUAGE_ID,
      );
      window.requestAnimationFrame(() => {
        ignoreModelEchoRef.current = false;
      });
    },
    [monaco],
  );

  const syncLiveFromTab = useCallback(
    (tab: StudioTab | undefined) => {
      if (!tab || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        setLiveTextNow('');
        lastEmittedRef.current = '';
        return;
      }
      const path = modelPathForTab(tab);
      const plain = isPlainStudioConstructorTab(formDataRef.current, tab);
      const fromModel = readModelText(monaco, path);
      const fromForm = constructorTextOrDefault(formDataRef.current, tab.path, plain);
      const next = fromModel ?? fromForm;
      lastEmittedRef.current = next;
      setLiveTextNow(next);
    },
    [monaco, setLiveTextNow],
  );

  const remountPageTab = useCallback(
    (fromId: string, toId: string, data: unknown) => {
      const oldTabId = pageTabId(fromId);
      const oldTab = openTabs.find((item) => item.id === oldTabId);
      if (oldTab) {
        disposeStudioModel(monaco, modelPathForTab(oldTab));
      }
      const node = collectStudioNodes(data).pages.find((item) => item.pageId === toId);
      if (!node) {
        return;
      }
      const newTab = tabFromNode(node);
      pushTabModel(newTab, readConstructorSlice(data, newTab.path));
      setOpenTabs((prev) => prev.map((tab) => (tab.id === oldTabId ? newTab : tab)));
      if (activeTabIdRef.current === oldTabId) {
        setActiveTabId(newTab.id);
        syncLiveFromTab(newTab);
      }
    },
    [monaco, openTabs, pushTabModel, syncLiveFromTab],
  );

  const commitConstructorText = useCallback(
    (tab: StudioTab, text: string) => {
      const plain = isPlainStudioConstructorTab(formDataRef.current, tab);
      const canvas = plain ? text : padConstructorCanvas(text);
      // formData-effect иначе видит pad≠editor и pushTabModel «резинит» пустые строки.
      lastEmittedRef.current = canvas;
      let data: unknown = setAtPointer(formDataRef.current, tab.path, canvas);
      // Scenario `<!>` в†’ SoT continue_on_failure (scenario failsafe).
      data = withScenarioFailsafeFlag(data, tab.path, canvas);
      // @-directives: extract Description/Title from scenario step 0 constructor
      const sm = tab.path.match(/^\/test_suites\/scenarios\/(\d+)\/steps\/0\/constructor$/);
      if (sm?.[1]) {
        const scenarioIndex = parseInt(sm[1], 10);
        const at = parseAtDirectives(canvas);
        if (at.description !== undefined || at.title !== undefined) {
          const root = (data as Record<string, unknown>) ?? {};
          const suites = (root.test_suites as Record<string, unknown>) ?? {};
          const scenarios = Array.isArray(suites.scenarios) ? [...suites.scenarios] as Array<Record<string, unknown>> : [];
          if (scenarioIndex < scenarios.length) {
            const scenario = scenarios[scenarioIndex] ?? {};
            const nextScenario = { ...scenario };
            if (at.description !== undefined) {
              nextScenario.description = at.description;
            }
            if (at.title !== undefined) {
              nextScenario.scenario_name = at.title;
            }
            scenarios[scenarioIndex] = nextScenario;
            data = { ...root, test_suites: { ...suites, scenarios } };
          }
        }
      }
      formDataRef.current = data;
      onFormDataChangeRef.current(data);
    },
    [],
  );

  const acceptLocatorHeal = useCallback(
    (nextText: string, _proposal: LocatorHealProposal) => {
      const tab = openTabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab?.path || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        message.warning('Открой вкладку PrettyK со сценарием');
        return;
      }
      const path = modelPathForTab(tab);
      if (!path) {
        return;
      }
      const model = monaco.editor.getModel(monaco.Uri.parse(path));
      if (model) {
        ignoreModelEchoRef.current = true;
        model.setValue(nextText);
        ignoreModelEchoRef.current = false;
      }
      commitConstructorText(tab, nextText);
      setLiveTextNow(nextText);
      message.success('HEAL принят в конструктор');
    },
    [commitConstructorText, message, monaco, setLiveTextNow],
  );

  const acceptLocatorLabel = useCallback(
    (nextText: string, _proposal: LocatorLabelProposal) => {
      const tab = openTabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab?.path || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        message.warning('Открой вкладку PrettyK со сценарием');
        return;
      }
      const path = modelPathForTab(tab);
      if (!path) {
        return;
      }
      const model = monaco.editor.getModel(monaco.Uri.parse(path));
      if (model) {
        ignoreModelEchoRef.current = true;
        model.setValue(nextText);
        ignoreModelEchoRef.current = false;
      }
      commitConstructorText(tab, nextText);
      setLiveTextNow(nextText);
      message.success('LABEL принят в конструктор');
    },
    [commitConstructorText, message, monaco, setLiveTextNow],
  );

  const flushTab = useCallback(
    (tab: StudioTab | undefined) => {
      window.clearTimeout(syncTimerRef.current);
      if (!tab?.path || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        return;
      }
      const path = modelPathForTab(tab);
      const text = readModelText(monaco, path) ?? lastEmittedRef.current;
      if (text === lastEmittedRef.current) {
        const slice = readConstructorSlice(formDataRef.current, tab.path);
        if (text === slice) {
          return;
        }
      }
      lastEmittedRef.current = text;
      commitConstructorText(tab, text);
    },
    [commitConstructorText, monaco],
  );

  const scheduleFlush = useCallback(
    (tab: StudioTab | undefined, text: string) => {
      window.clearTimeout(syncTimerRef.current);
      if (!tab?.path || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        return;
      }
      // lastEmitted трогает только commit (с pad) — иначе formData-effect резинит 32 строки.
      syncTimerRef.current = window.setTimeout(() => {
        commitConstructorText(tab, text);
      }, SYNC_MS);
    },
    [commitConstructorText],
  );

  useEffect(() => {
    return () => {
      window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const clearEditor = useCallback(() => {
    setLiveTextNow('');
    lastEmittedRef.current = '';
    setActiveTabId(undefined);
  }, [setLiveTextNow]);

  /** Нет документных вкладок → невидимый Hub (каталог), не пустой канвас. */
  const activateHubWhenNoDocuments = useCallback(
    (tabs: readonly StudioTab[]): StudioTab[] => {
      if (tabs.some(isDocumentStudioTab)) {
        return [...tabs];
      }
      const next = tabs.some((tab) => tab.id === 'action-hub')
        ? [...tabs]
        : [...tabs, actionHubDraftTab()];
      setHubFormActionId(null);
      setLiveTextNow('');
      lastEmittedRef.current = '';
      setActiveTabId('action-hub');
      return next;
    },
    [setLiveTextNow],
  );

  const openTab = useCallback(
    (tab: StudioTab) => {
      const current = openTabs.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      if (tab.kind !== 'resource' && tab.kind !== 'fuzzer' && tab.path) {
        const ensured = ensureConstructorOnOpen(formDataRef.current, tab);
        if (ensured.mutated) {
          formDataRef.current = ensured.data;
          onFormDataChangeRef.current(ensured.data);
        }
        pushTabModel(tab, ensured.text);
      }
      setHubFormActionId(null);
      setOpenTabs((prev) => (prev.some((item) => item.id === tab.id) ? prev : [...prev, tab]));
      setActiveTabId(tab.id);
      syncLiveFromTab(tab);
    },
    [flushTab, openTabs, pushTabModel, syncLiveFromTab],
  );

  const openTabById = useCallback(
    (tabId: StudioTabId) => {
      const scenarioIndex = scenarioIndexFromTabId(tabId);
      if (scenarioIndex !== undefined) {
        const ensured = ensureScenarioStep0(formDataRef.current, scenarioIndex);
        if (ensured !== undefined && ensured !== formDataRef.current) {
          formDataRef.current = ensured;
          onFormDataChangeRef.current(ensured);
        }
        const scenario = collectStudioNodes(formDataRef.current).scenarios.find(
          (item) => item.scenarioIndex === scenarioIndex,
        );
        if (scenario) {
          openTab(tabFromNode(scenario));
          return;
        }
      }
      const node = findNodeByTabId(tree, tabId);
      if (node) {
        openTab(tabFromNode(node));
        return;
      }
      const pageId = pageIdFromTabId(tabId);
      if (pageId !== undefined) {
        const idError = pageId.length === 0 ? 'РЈРєР°Р¶РёС‚Рµ РёРјСЏ РјРѕРґРµР»Рё РґР°РЅРЅС‹С…' : pageDisplayError(pageId);
        openTab(
          tabFromNode({
            kind: 'page',
            key: tabId,
            pageId,
            path: pageConstructorPointer(pageId),
            title: pageId || 'Р±РµР· РёРјРµРЅРё',
            tabId,
            needsName: pageId.length === 0,
            invalidId: idError !== undefined,
            idError,
          }),
        );
      }
    },
    [openTab, tree],
  );

  /** Monaco по умолчанию не телепортит на чужой model — открываем вкладку Studio. */
  useEffect(() => {
    const disposable = monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const tabId = tabIdFromSuiteModelUri(resource);
        if (!tabId) {
          return false;
        }
        const path = resource.toString().split(/[?#]/, 1)[0] ?? resource.toString();
        if (selectionOrPosition) {
          pendingRevealRef.current = { path, selection: selectionOrPosition };
        } else {
          pendingRevealRef.current = null;
        }
        const existing = openTabsRef.current.find((tab) => tab.id === tabId);
        if (existing) {
          setActiveTabId(tabId);
          syncLiveFromTab(existing);
        } else {
          openTabById(tabId);
        }
        return true;
      },
    });
    return () => {
      disposable.dispose();
    };
  }, [monaco, openTabById, syncLiveFromTab]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending || !activeModelPath) {
      return;
    }
    const pendingPath = pending.path;
    const activePath = monaco.Uri.parse(activeModelPath).toString().split(/[?#]/, 1)[0];
    const pendingNorm = monaco.Uri.parse(pendingPath).toString().split(/[?#]/, 1)[0];
    if (activePath !== pendingNorm) {
      return;
    }
    const apply = (): boolean => {
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (!ed || !model) {
        return false;
      }
      const modelPath = model.uri.toString().split(/[?#]/, 1)[0];
      if (modelPath !== pendingNorm) {
        return false;
      }
      const sel = pending.selection;
      if ('startLineNumber' in sel) {
        ed.setSelection(sel);
        ed.revealRangeInCenter(sel);
      } else {
        ed.setPosition(sel);
        ed.revealPositionInCenter(sel);
      }
      ed.focus();
      pendingRevealRef.current = null;
      return true;
    };
    if (apply()) {
      return;
    }
    const timer = window.setTimeout(() => {
      apply();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeModelPath, activeTabId, monaco]);

  useEffect(() => {
    bootstrappedRef.current = false;
  }, [suiteMode]);

  useEffect(() => {
    if (suiteMode === 'off' || bootstrappedRef.current) {
      return;
    }
    const node = firstStudioNode(tree);
    if (!node) {
      return;
    }
    bootstrappedRef.current = true;
    openTab(tabFromNode(node));
  }, [monaco, openTab, suiteMode, tree]);

  useEffect(() => {
    const current = openTabs.find((item) => item.id === activeTabIdRef.current);
    if (!current || current.kind === 'resource' || current.kind === 'fuzzer') {
      return;
    }
    const plain = isPlainStudioConstructorTab(formData, current);
    const next = constructorTextOrDefault(formData, current.path, plain);
    if (next === lastEmittedRef.current) {
      return;
    }
    pushTabModel(current, next);
    lastEmittedRef.current = next;
    setLiveTextNow(next);
  }, [formData, openTabs, pushTabModel, setLiveTextNow]);

  const localDiagnostics = useMemo(
    () =>
      isFormOnlyTab
        ? []
        : studioTabWireDiagnostics(
            formData,
            activeTab,
            liveText,
            catalog,
            variables,
          ),
    [activeTab, catalog, formData, isFormOnlyTab, liveText, variables],
  );

  // G-57: backend validate активной вкладки → union с client → маркеры Monaco.
  useEffect(() => {
    window.clearTimeout(backendTimerRef.current);
    const revision = backendValidationRevisionRef.current + 1;
    backendValidationRevisionRef.current = revision;
    if (isFormOnlyTab) {
      setBackendDiagnostics([]);
      return;
    }
    if (isAuthModuleActive) {
      const validationText = constructorValidationText(liveText);
      backendTimerRef.current = window.setTimeout(() => {
        void validateAuthModuleBackend(validationText || liveText || '', '').then(
          (diags) => {
            if (backendValidationRevisionRef.current === revision) {
              setBackendDiagnostics(diags);
            }
          },
        );
      }, BACKEND_VALIDATE_MS);
      return () => {
        window.clearTimeout(backendTimerRef.current);
      };
    }
    if (isPlainDataActive) {
      setBackendDiagnostics([]);
      return;
    }
    const validationText = constructorValidationText(liveText);
    if (!validationText) {
      setBackendDiagnostics([]);
      return;
    }
    backendTimerRef.current = window.setTimeout(() => {
      const coordinateSpace = looksLikeLanguageScript(liveText) ? 'model' : 'logical';
      void validateConstructorBackend(validationText, coordinateSpace).then((diags) => {
        if (backendValidationRevisionRef.current === revision) {
          setBackendDiagnostics(diags);
        }
      });
    }, BACKEND_VALIDATE_MS);
    return () => {
      window.clearTimeout(backendTimerRef.current);
    };
  }, [isAuthModuleActive, isPlainDataActive, isFormOnlyTab, liveText]);

  const diagnostics = useMemo((): ConstructorDiagnostic[] => {
    if (backendDiagnostics === null) {
      return localDiagnostics;
    }
    const localErrors = localDiagnostics.filter((item) => item.severity === 'error');
    if (backendDiagnostics.length === 0) {
      return localErrors;
    }
    if (localErrors.length === 0) {
      return backendDiagnostics;
    }
    const seen = new Set(
      backendDiagnostics.map((d) => `${d.start}|${d.end}|${d.message}`),
    );
    const extra = localErrors.filter(
      (d) => !seen.has(`${d.start}|${d.end}|${d.message}`),
    );
    return [...backendDiagnostics, ...extra];
  }, [backendDiagnostics, localDiagnostics]);

  useEffect(() => {
    if (!activeModelPath || isFormOnlyTab) {
      return;
    }
    const model = monaco.editor.getModel(monaco.Uri.parse(activeModelPath));
    if (!model) {
      return;
    }
    if (isAuthModuleActive) {
      if (model.getLanguageId() !== PLAIN_TEXT_LANGUAGE) {
        monaco.editor.setModelLanguage(model, PLAIN_TEXT_LANGUAGE);
      }
      applyDiagnostics(monaco, model, diagnostics);
      return;
    }
    if (isPlainDataActive) {
      if (model.getLanguageId() !== PLAIN_TEXT_LANGUAGE) {
        monaco.editor.setModelLanguage(model, PLAIN_TEXT_LANGUAGE);
      }
      monaco.editor.setModelMarkers(model, CONSTRUCTOR_MARKER_OWNER, []);
      return;
    }
    applyDiagnostics(monaco, model, diagnostics);
  }, [
    activeModelPath,
    diagnostics,
    isAuthModuleActive,
    isPlainDataActive,
    isFormOnlyTab,
    monaco,
  ]);

  // PURE: security diagnostics muted — auth/base_url hints are irrelevant for operator flow.
  // При custom-деплое: раскомментировать.
  // useEffect(() => {
  //   if (!activeModelPath || isFormOnlyTab || isPlainDataActive) return;
  //   const model = monaco.editor.getModel(monaco.Uri.parse(activeModelPath));
  //   if (!model) return;
  //   applySecurityDiagnostics(monaco, model, formData);
  // }, [activeModelPath, formData, isFormOnlyTab, isPlainDataActive, monaco]);

  const activeProblemMarkers = useMemo(() => {
    if (!activeModelPath || isFormOnlyTab || (isPlainDataActive && !isAuthModuleActive)) {
      return [];
    }
    const model = monaco.editor.getModel(monaco.Uri.parse(activeModelPath));
    if (!model) {
      return [];
    }
    return monaco.editor
      .getModelMarkers({ resource: model.uri })
      .filter((m) => m.owner === CONSTRUCTOR_MARKER_OWNER)
      .sort(compareProblemMarkers);
  }, [
    activeModelPath,
    diagnostics,
    isAuthModuleActive,
    isPlainDataActive,
    isFormOnlyTab,
    monaco,
  ]);
  const problemSignature = useMemo(
    () =>
      activeProblemMarkers
        .map(
          (marker) =>
            `${String(marker.startLineNumber)}:${String(marker.startColumn)}:${marker.message}`,
        )
        .join('|'),
    [activeProblemMarkers],
  );
  const [handledValidationSuccessVersion, setHandledValidationSuccessVersion] = useState(0);
  const [dismissedProblemSignature, setDismissedProblemSignature] = useState('');
  const [studioPinguin, setStudioPinguin] = useState<ValidationFeedback | null>(null);
  const studioPinguinTimer = useRef<number | undefined>(undefined);
  const prevProblemSignature = useRef('');

  // Studio mode: show pinguin when problems appear, auto-dismiss after 2s when clear
  useEffect(() => {
    if (isEditorMode) {
      prevProblemSignature.current = problemSignature;
      return;
    }
    if (problemSignature !== prevProblemSignature.current) {
      prevProblemSignature.current = problemSignature;
      if (activeProblemMarkers.length > 0) {
        const errors = activeProblemMarkers.filter(
          (m) => m.severity === monaco.MarkerSeverity.Error || m.owner === CONSTRUCTOR_MARKER_OWNER,
        );
        const warnings = activeProblemMarkers.filter(
          (m) => m.severity !== monaco.MarkerSeverity.Error && m.owner !== CONSTRUCTOR_MARKER_OWNER,
        );
        setStudioPinguin({
          title: errors.length > 0 ? 'Ошибки валидации' : 'Рекомендации',
          description: `${activeProblemMarkers.length} problem(s)`,
          errorCount: errors.length,
          samples: activeProblemMarkers.map((m) => `Строка ${m.startLineNumber}: ${m.message}`),
          samplesHint: 'строка — сообщение',
          fails: [],
        });
      } else {
        window.clearTimeout(studioPinguinTimer.current);
        studioPinguinTimer.current = window.setTimeout(() => {
          setStudioPinguin(null);
        }, 2000);
      }
    }
  }, [activeProblemMarkers, isEditorMode, monaco.MarkerSeverity.Error, problemSignature]);

  // Cleanup timer
  useEffect(() => {
    return () => window.clearTimeout(studioPinguinTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (validationSuccessVersion <= handledValidationSuccessVersion) {
      return;
    }
    setHandledValidationSuccessVersion(validationSuccessVersion);
    setDismissedProblemSignature(problemSignature);
  }, [handledValidationSuccessVersion, problemSignature, validationSuccessVersion]);

  const showProblems =
    activeProblemMarkers.length > 0 && problemSignature !== dismissedProblemSignature;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Flush РІРєР»Р°РґРєРё; Save entity Р»РѕРІРёС‚ App (Ctrl+S). РќРµ stopPropagation.
      const isModS =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.code === 'KeyS' || event.key.toLowerCase() === 's');
      if (!isModS) {
        return;
      }
      const root = document.querySelector('.pk-studio-workspace');
      if (!root) {
        return;
      }
      const target = event.target;
      const inWorkspace =
        (target instanceof Node && root.contains(target)) ||
        Boolean(root.querySelector('.monaco-editor.focused'));
      if (!inWorkspace) {
        return;
      }
      event.preventDefault();
      const current = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [flushTab]);

  const closeTabId = useCallback(
    (tabId: StudioTabId) => {
      const closing = openTabs.find((item) => item.id === tabId);
      if (closing) {
        flushTab(closing);
        disposeStudioModel(monaco, modelPathForTab(closing));
      }
      setOpenTabs((prev) => {
        const remaining = prev.filter((tab) => tab.id !== tabId);
        if (!remaining.some(isDocumentStudioTab)) {
          return activateHubWhenNoDocuments(remaining);
        }
        if (activeTabIdRef.current === tabId) {
          const fallback =
            remaining.find(isDocumentStudioTab) ?? remaining[0];
          setActiveTabId(fallback?.id);
          if (fallback) {
            syncLiveFromTab(fallback);
          } else {
            clearEditor();
          }
        }
        return remaining;
      });
    },
    [activateHubWhenNoDocuments, clearEditor, flushTab, monaco, openTabs, syncLiveFromTab],
  );

  const handleCreatePage = useCallback(
    (id: string, title: string): boolean => {
      if (studioSuiteMode(formDataRef.current) === 'off') {
        return false;
      }
      const next = addPage(formDataRef.current, id, title);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const displayTitle = title.trim() || id;
      const node =
        collectStudioNodes(next).pages.find((item) => item.pageId === id) ??
        collectStudioNodes(next).pages.find((item) => item.title === displayTitle);
      if (node) {
        openTab(tabFromNode(node));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateFolder = useCallback(
    (section: EditorFolderSection, title: string): boolean => {
      const created = createEditorFolder(formDataRef.current, section, title);
      if (!created) {
        return false;
      }
      formDataRef.current = created.data;
      onFormDataChangeRef.current(created.data);
      return true;
    },
    [],
  );

  const handleRenameFolder = useCallback(
    (section: EditorFolderSection, folderId: string, title: string): boolean => {
      const next = renameEditorFolder(formDataRef.current, section, folderId, title);
      if (!next) {
        return false;
      }
      formDataRef.current = next;
      onFormDataChangeRef.current(next);
      return true;
    },
    [],
  );

  const handleMoveFolderMember = useCallback(
    (section: EditorFolderSection, member: string, folderId?: string): void => {
      const next = moveEditorFolderMember(formDataRef.current, section, member, folderId);
      if (!next) {
        return;
      }
      formDataRef.current = next;
      onFormDataChangeRef.current(next);
    },
    [],
  );

  const handleDropTreeMember = useCallback(
    (
      section: StudioTreeSection,
      member: string,
      destination: TreeDropDestination,
    ): void => {
      const next = applyTreeMemberDrop(formDataRef.current, section, member, destination);
      if (!next) {
        return;
      }
      formDataRef.current = next;
      onFormDataChangeRef.current(next);
    },
    [],
  );

  const handleRenamePage = useCallback(
    (pageId: string, displayTitle: string): boolean => {
      const current = openTabs.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      const next = renamePageTitle(formDataRef.current, pageId, displayTitle);
      if (next === undefined) {
        return false;
      }
      const nextWithFolders = replaceEditorFolderMember(
        next,
        'pages',
        pageId,
        displayTitle.trim(),
      );
      onFormDataChangeRef.current(nextWithFolders);
      formDataRef.current = nextWithFolders;
      const oldTabId = pageTabId(pageId);
      const node =
        collectStudioNodes(nextWithFolders).pages.find((item) => item.pageId === pageId) ??
        collectStudioNodes(nextWithFolders).pages.find((item) => item.title === displayTitle.trim());
      if (node) {
        if (node.pageId !== pageId) {
          remountPageTab(pageId, node.pageId, nextWithFolders);
        } else {
          const newTab = tabFromNode(node);
          setOpenTabs((prev) => prev.map((tab) => (tab.id === oldTabId ? newTab : tab)));
        }
      }
      return true;
    },
    [flushTab, remountPageTab],
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      closeTabId(pageTabId(pageId));
      const next = replaceEditorFolderMember(
        removePage(formDataRef.current, pageId),
        'pages',
        pageId,
      );
      formDataRef.current = next;
      onFormDataChangeRef.current(next);
    },
    [closeTabId],
  );

  const handleCreateScenario = useCallback(
    (id: string, description?: string): boolean => {
      const created = addScenario(formDataRef.current, id, description);
      if (created === undefined) {
        return false;
      }
      onFormDataChangeRef.current(created);
      formDataRef.current = created;
      const tab = scenarioTabAfterCreate(created, id);
      if (tab) {
        openTab(tab);
      }
      return true;
    },
    [openTab],
  );

  const handleRenameScenario = useCallback((scenarioIndex: number, name: string): boolean => {
    const oldName = collectStudioNodes(formDataRef.current).scenarios[scenarioIndex]?.title;
    const next = renameScenario(formDataRef.current, scenarioIndex, name);
    if (next === undefined) {
      return false;
    }
    const nextWithFolders = oldName
      ? replaceEditorFolderMember(next, 'scenarios', oldName, name.trim())
      : next;
    formDataRef.current = nextWithFolders;
    onFormDataChangeRef.current(nextWithFolders);
    const tabId = scenarioTabId(scenarioIndex);
    setOpenTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, title: name } : tab)),
    );
    return true;
  }, []);

  const handleDeleteScenario = useCallback(
    (scenarioIndex: number) => {
      const current = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      const treeBefore = collectStudioNodes(formDataRef.current);
      const oldName = treeBefore.scenarios[scenarioIndex]?.title;
      const openScenarioTitles = openScenarioTitlesFromTabs(openTabsRef.current, treeBefore);

      for (const tab of openTabsRef.current) {
        if (tab.id.startsWith('scenario:')) {
          disposeStudioModel(monaco, modelPathForTab(tab));
        }
      }

      const removed = removeScenario(formDataRef.current, scenarioIndex);
      const next = oldName
        ? replaceEditorFolderMember(removed, 'scenarios', oldName)
        : removed;
      formDataRef.current = next;
      onFormDataChangeRef.current(next);

      const nextTree = collectStudioNodes(next);
      const titlesToKeep = openScenarioTitles.filter((title) => title !== oldName);
      const scenarioTabs = rebuildScenarioTabs(nextTree, titlesToKeep);
      for (const tab of scenarioTabs) {
        pushTabModel(tab, readConstructorSlice(next, tab.path));
      }

      setOpenTabs((prev) => {
        const { tabs, activate } = mergeTabsAfterKindDelete({
          prev,
          kindPrefix: 'scenario:',
          replacementTabs: scenarioTabs,
          activeTabId: activeTabIdRef.current,
          activateHubWhenNoDocuments,
        });
        applyActiveTabAfterMerge(activate, setActiveTabId, syncLiveFromTab);
        return tabs;
      });
    },
    [activateHubWhenNoDocuments, flushTab, monaco, pushTabModel, syncLiveFromTab],
  );

  const handleCreateModule = useCallback(
    (displayLabel: string, _title?: string): boolean => {
      const next = addModule(formDataRef.current, displayLabel);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateAuth = useCallback(
    (displayLabel: string, _title?: string): boolean => {
      const next = addAuthModule(formDataRef.current, displayLabel);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateConnector = useCallback(
    (displayLabel: string, _title?: string): boolean => {
      const next = addConnectorModule(formDataRef.current, displayLabel);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateOpenApi = useCallback(
    (
      displayLabel: string,
      opts?: {
        specMode?: 'resource' | 'url_relative';
        specAs?: string;
        specPathRel?: string;
        authModuleId?: string;
      },
    ): boolean => {
      const next = addOpenApiModule(formDataRef.current, displayLabel, opts);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateGraphql = useCallback(
    (
      displayLabel: string,
      opts?: {
        schemaMode?: 'resource' | 'introspection_relative';
        sdlAs?: string;
        schemaPathRel?: string;
        endpointRel?: string;
        authModuleId?: string;
      },
    ): boolean => {
      const next = addGraphqlModule(formDataRef.current, displayLabel, opts);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateGrpc = useCallback(
    (
      displayLabel: string,
      opts?: { protoAs?: string; authModuleId?: string },
    ): boolean => {
      const next = addGrpcModule(formDataRef.current, displayLabel, opts);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleCreateChain = useCallback(
    (displayLabel: string, _title?: string): boolean => {
      const next = addChainModule(formDataRef.current, displayLabel);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const module = collectStudioNodes(next).modules.find(
        (item) => item.title === displayLabel.trim(),
      );
      if (module) {
        openTab(tabFromNode(module));
      }
      return true;
    },
    [openTab],
  );

  const handleRenameModule = useCallback(
    (moduleIndex: number, displayLabel: string): boolean => {
      const current = openTabs.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      const oldModuleId = collectStudioNodes(formDataRef.current).modules[moduleIndex]?.moduleId;
      const next = renameModuleLabel(formDataRef.current, moduleIndex, displayLabel);
      if (next === undefined) {
        return false;
      }
      const nextWithFolders = oldModuleId
        ? replaceEditorFolderMember(next, 'modules', oldModuleId, displayLabel.trim())
        : next;
      formDataRef.current = nextWithFolders;
      onFormDataChangeRef.current(nextWithFolders);
      const tabId = moduleTabId(moduleIndex);
      const module = collectStudioNodes(nextWithFolders).modules.find(
        (item) => item.moduleIndex === moduleIndex,
      );
      if (module) {
        const newTab = tabFromNode(module);
        setOpenTabs((prev) => prev.map((tab) => (tab.id === tabId ? newTab : tab)));
        if (activeTabIdRef.current === tabId) {
          syncLiveFromTab(newTab);
        }
      }
      return true;
    },
    [flushTab, syncLiveFromTab],
  );

  const handleDeleteModuleSimple = useCallback(
    (moduleIndex: number) => {
      const current = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      const treeBefore = collectStudioNodes(formDataRef.current);
      const oldModuleId = treeBefore.modules[moduleIndex]?.moduleId;
      const openModuleIds = openModuleIdsFromTabs(openTabsRef.current, treeBefore);

      for (const tab of openTabsRef.current) {
        if (tab.id.startsWith('module:')) {
          disposeStudioModel(monaco, modelPathForTab(tab));
        }
      }

      const removed = removeModule(formDataRef.current, moduleIndex);
      const next = oldModuleId
        ? replaceEditorFolderMember(removed, 'modules', oldModuleId)
        : removed;
      formDataRef.current = next;
      onFormDataChangeRef.current(next);

      const nextTree = collectStudioNodes(next);
      const idsToKeep = openModuleIds.filter((id) => id !== oldModuleId);
      const moduleTabs = rebuildModuleTabs(nextTree, idsToKeep);
      for (const tab of moduleTabs) {
        pushTabModel(tab, readConstructorSlice(next, tab.path));
      }

      setOpenTabs((prev) => {
        const { tabs, activate } = mergeTabsAfterKindDelete({
          prev,
          kindPrefix: 'module:',
          replacementTabs: moduleTabs,
          activeTabId: activeTabIdRef.current,
          activateHubWhenNoDocuments,
        });
        applyActiveTabAfterMerge(activate, setActiveTabId, syncLiveFromTab);
        return tabs;
      });
    },
    [activateHubWhenNoDocuments, flushTab, monaco, pushTabModel, syncLiveFromTab],
  );

  const handleDeleteFolder = useCallback(
    (section: EditorFolderSection, folderId: string): void => {
      const folder = readEditorFolders(formDataRef.current)[section].find(
        (item) => item.id === folderId,
      );
      if (!folder) {
        return;
      }
      const members = [...folder.members];
      const treeNow = collectStudioNodes(formDataRef.current);

      if (section === 'pages') {
        for (const page of resolveFolderPages(treeNow, members)) {
          closeTabId(pageTabId(page.pageId));
          formDataRef.current = replaceEditorFolderMember(
            removePage(formDataRef.current, page.pageId),
            'pages',
            page.pageId,
          );
        }
      } else if (section === 'scenarios') {
        for (const scenarioIndex of resolveFolderScenarioIndicesDesc(treeNow, members)) {
          handleDeleteScenario(scenarioIndex);
        }
      } else if (section === 'modules') {
        for (const moduleIndex of resolveFolderModuleIndicesDesc(treeNow, members)) {
          handleDeleteModuleSimple(moduleIndex);
        }
      }

      const next = removeEditorFolder(formDataRef.current, section, folderId);
      if (next) {
        formDataRef.current = next;
      }
      onFormDataChangeRef.current(formDataRef.current);
    },
    [closeTabId, handleDeleteModuleSimple, handleDeleteScenario],
  );


  const handleCreateFuzzer = useCallback(
    (id: string, _title?: string): boolean => {
      const added = addFuzzer(formDataRef.current, id);
      if (!added) {
        return false;
      }
      onFormDataChangeRef.current(added.data);
      formDataRef.current = added.data;
      const node = collectStudioNodes(added.data).fuzzers.find(
        (item) => item.fuzzerIndex === added.index,
      );
      if (node) {
        openTab(tabFromNode(node));
      }
      return true;
    },
    [openTab],
  );

  const handleRenameFuzzer = useCallback((fuzzerIndex: number, id: string): boolean => {
    const next = renameFuzzer(formDataRef.current, fuzzerIndex, id);
    if (next === undefined) {
      return false;
    }
    onFormDataChangeRef.current(next);
    formDataRef.current = next;
    const node = collectStudioNodes(next).fuzzers.find(
      (item) => item.fuzzerIndex === fuzzerIndex,
    );
    if (node) {
      const newTab = tabFromNode(node);
      setOpenTabs((prev) =>
        prev.map((tab) => (tab.id === fuzzerTabId(fuzzerIndex) ? newTab : tab)),
      );
    }
    return true;
  }, []);

  const handleDeleteFuzzer = useCallback(
    (fuzzerIndex: number) => {
      const treeBefore = collectStudioNodes(formDataRef.current);
      const oldId = treeBefore.fuzzers[fuzzerIndex]?.fuzzerId;
      const openFuzzerIds = openFuzzerIdsFromTabs(openTabsRef.current, treeBefore);

      const next = removeFuzzer(formDataRef.current, fuzzerIndex);
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const nextTree = collectStudioNodes(next);
      const idsToKeep = openFuzzerIds.filter((id) => id !== oldId);
      const fuzzerTabs = rebuildFuzzerTabs(nextTree, idsToKeep);

      setOpenTabs((prev) => {
        const { tabs, activate } = mergeTabsAfterKindDelete({
          prev,
          kindPrefix: 'fuzzer:',
          replacementTabs: fuzzerTabs,
          activeTabId: activeTabIdRef.current,
          activateHubWhenNoDocuments,
        });
        applyActiveTabAfterMerge(activate, setActiveTabId, syncLiveFromTab);
        return tabs;
      });
    },
    [activateHubWhenNoDocuments, syncLiveFromTab],
  );

  const handleCreateResource = useCallback(
    (
      as: string,
      kind:
        | 'data_file'
        | 'har_file'
        | 'proto_pack'
        | 'openapi_spec'
        | 'graphql_sdl' = 'data_file',
      _title?: string,
    ): boolean => {
      const added = addResource(formDataRef.current, as, kind);
      if (!added) {
        return false;
      }
      onFormDataChangeRef.current(added.data);
      const id = as.trim();
      if (!(id in resourceContentsRef.current)) {
        onResourceContentsChangeRef.current({
          ...resourceContentsRef.current,
          [id]: '',
        });
      }
      const node = collectStudioNodes(added.data).resources.find(
        (item) => item.resourceIndex === added.index,
      );
      if (node) {
        openTab(tabFromNode(node));
      }
      return true;
    },
    [openTab],
  );

  const handleAttachResourceFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      void (async () => {
        let data = formDataRef.current;
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
          if (!added) {
            continue;
          }
          data = updateResource(added.data, added.index, {
            path: resourcePathForAttachedFile(as, file.name),
          })!;
          taken.add(as);
          contents = { ...contents, [as]: text };
          lastIndex = added.index;
        }
        const rejectMsg = attachResourceRejectMessage(rejected, list.length);
        if (rejectMsg) {
          void message.error(rejectMsg);
        }
        onFormDataChangeRef.current(data);
        onResourceContentsChangeRef.current(contents);
        if (lastIndex !== undefined) {
          const node = collectStudioNodes(data).resources.find(
            (item) => item.resourceIndex === lastIndex,
          );
          if (node) {
            openTab(tabFromNode(node));
          }
        }
      })();
    },
    [message, openTab],
  );

  const handleRenameResource = useCallback(
    (resourceIndex: number, as: string): boolean => {
      const imports = (
        formDataRef.current as { test_suites?: { imports?: unknown[] } } | undefined
      )?.test_suites?.imports;
      const prevAs =
        Array.isArray(imports) && imports[resourceIndex]
          ? normalizeImport(imports[resourceIndex]).as
          : '';
      const next = renameResource(formDataRef.current, resourceIndex, as);
      if (next === undefined) {
        return false;
      }
      onFormDataChangeRef.current(next);
      if (prevAs && prevAs !== as.trim()) {
        onResourceContentsChangeRef.current(
          renameContentKey(resourceContentsRef.current, prevAs, as.trim()),
        );
      }
      const node = collectStudioNodes(next).resources.find(
        (item) => item.resourceIndex === resourceIndex,
      );
      if (node) {
        const newTab = tabFromNode(node);
        setOpenTabs((prev) =>
          prev.map((tab) => (tab.id === resourceTabId(resourceIndex) ? newTab : tab)),
        );
      }
      return true;
    },
    [],
  );

  const handleDeleteResource = useCallback(
    (resourceIndex: number) => {
      const treeBefore = collectStudioNodes(formDataRef.current);
      const prevAs = treeBefore.resources[resourceIndex]?.as ?? '';
      const openResourceAs = openResourceAsFromTabs(openTabsRef.current, treeBefore);

      const next = removeResource(formDataRef.current, resourceIndex);
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      if (prevAs) {
        onResourceContentsChangeRef.current(
          removeContentKey(resourceContentsRef.current, prevAs),
        );
      }
      const nextTree = collectStudioNodes(next);
      const asToKeep = openResourceAs.filter((as) => as !== prevAs);
      const resourceTabs = rebuildResourceTabs(nextTree, asToKeep);

      setOpenTabs((prev) => {
        const { tabs, activate } = mergeTabsAfterKindDelete({
          prev,
          kindPrefix: 'resource:',
          replacementTabs: resourceTabs,
          activeTabId: activeTabIdRef.current,
          activateHubWhenNoDocuments,
        });
        applyActiveTabAfterMerge(activate, setActiveTabId, syncLiveFromTab);
        return tabs;
      });
    },
    [activateHubWhenNoDocuments, syncLiveFromTab],
  );

  const activeResource = useMemo(() => {
    if (!activeTab || activeTab.kind !== 'resource' || activeTab.resourceIndex === undefined) {
      return undefined;
    }
    const imports = (formData as { test_suites?: { imports?: unknown[] } })?.test_suites?.imports;
    if (!Array.isArray(imports) || !imports[activeTab.resourceIndex]) {
      return undefined;
    }
    return normalizeImport(imports[activeTab.resourceIndex]);
  }, [activeTab, formData]);

  const activeFuzzer = useMemo(() => {
    if (!activeTab || activeTab.kind !== 'fuzzer' || activeTab.fuzzerIndex === undefined) {
      return undefined;
    }
    const fuzzers = (formData as { test_suites?: { fuzzers?: unknown[] } })?.test_suites
      ?.fuzzers;
    if (!Array.isArray(fuzzers) || !fuzzers[activeTab.fuzzerIndex]) {
      return undefined;
    }
    return normalizeFuzzer(fuzzers[activeTab.fuzzerIndex], activeTab.fuzzerIndex);
  }, [activeTab, formData]);

  const patchActiveFuzzer = useCallback(
    (patch: FuzzerPatch) => {
      if (!activeTab || activeTab.fuzzerIndex === undefined) {
        return;
      }
      const next = updateFuzzer(formDataRef.current, activeTab.fuzzerIndex, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
      const node = collectStudioNodes(next).fuzzers.find(
        (item) => item.fuzzerIndex === activeTab.fuzzerIndex,
      );
      if (node) {
        const newTab = tabFromNode(node);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.id === fuzzerTabId(activeTab.fuzzerIndex!) ? newTab : tab,
          ),
        );
      }
    },
    [activeTab],
  );

  const activeConnector = useMemo(() => {
    if (!isConnectorModuleActive || !activeTab) {
      return undefined;
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return undefined;
    }
    const mod = moduleRecordAt(formData, idx);
    if (!mod || mod.module_type !== CONNECTOR_MODULE_TYPE) {
      return undefined;
    }
    return normalizeConnectorFields(mod.connector_fields);
  }, [activeTab, formData, isConnectorModuleActive]);

  const patchActiveConnector = useCallback(
    (patch: ConnectorFieldsPatch) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateConnectorModule(formDataRef.current, idx, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const activeOpenApi = useMemo(() => {
    if (!isOpenApiModuleActive || !activeTab) {
      return undefined;
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return undefined;
    }
    return normalizeOpenApiFields(moduleRecordAt(formData, idx)?.openapi_fields);
  }, [activeTab, formData, isOpenApiModuleActive]);

  const activeGraphql = useMemo(() => {
    if (!isGraphqlModuleActive || !activeTab) {
      return undefined;
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return undefined;
    }
    return normalizeGraphqlFields(moduleRecordAt(formData, idx)?.graphql_fields);
  }, [activeTab, formData, isGraphqlModuleActive]);

  const activeGrpc = useMemo(() => {
    if (!isGrpcModuleActive || !activeTab) {
      return undefined;
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return undefined;
    }
    return normalizeGrpcFields(moduleRecordAt(formData, idx)?.grpc_fields);
  }, [activeTab, formData, isGrpcModuleActive]);

  const activeChain = useMemo(() => {
    if (!isChainModuleActive || !activeTab) {
      return undefined;
    }
    const idx = moduleIndexFromTabId(activeTab.id);
    if (idx === undefined) {
      return undefined;
    }
    return normalizeChainFields(moduleRecordAt(formData, idx)?.chain_fields);
  }, [activeTab, formData, isChainModuleActive]);

  const patchActiveOpenApi = useCallback(
    (patch: Parameters<typeof updateOpenApiModule>[2]) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateOpenApiModule(formDataRef.current, idx, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const patchActiveAuthFormConstructor = useCallback(
    (text: string) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateAuthModuleConstructor(formDataRef.current, idx, text);
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const patchActiveGraphql = useCallback(
    (patch: Parameters<typeof updateGraphqlModule>[2]) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateGraphqlModule(formDataRef.current, idx, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const patchActiveGrpc = useCallback(
    (patch: Parameters<typeof updateGrpcModule>[2]) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateGrpcModule(formDataRef.current, idx, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const patchActiveChain = useCallback(
    (patch: Parameters<typeof updateChainModule>[2]) => {
      if (!activeTab) {
        return;
      }
      const idx = moduleIndexFromTabId(activeTab.id);
      if (idx === undefined) {
        return;
      }
      const next = updateChainModule(formDataRef.current, idx, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      formDataRef.current = next;
    },
    [activeTab],
  );

  const handleChainApplyPlay = useCallback(
    (payload: {
      harAs: string;
      harText: string;
      seed: string;
      fuzzTargets: Array<{ method?: string; url?: string; body?: string }>;
    }) => {
      const harAs = payload.harAs.trim();
      if (!harAs) {
        void message.error('har_as пуст');
        return;
      }
      const ensured = ensureHarResourceForPlay(formDataRef.current, harAs, message);
      if (!ensured) {
        return;
      }
      formDataRef.current = ensured;
      onFormDataChangeRef.current(ensured);
      onResourceContentsChangeRef.current({
        ...resourceContentsRef.current,
        [harAs]: payload.harText,
      });
      seedChainPlayIntoScenario({
        seed: payload.seed,
        message,
        formDataRef,
        openTabsRef,
        activeTabIdRef,
        flushTab,
        commitConstructorText,
        openTab,
      });
      attachChainPlayFuzz({
        harAs,
        fuzzTargets: payload.fuzzTargets,
        message,
        formDataRef,
        onFormDataChange: onFormDataChangeRef.current,
      });
      void message.success(`Play: resources/${harAs}.har РіРѕС‚РѕРІ`);
    },
    [commitConstructorText, flushTab, message, openTab],
  );

  const activeResourceContent = useMemo(() => {
    if (!activeResource?.as) {
      return '';
    }
    return resourceContents[activeResource.as] ?? '';
  }, [activeResource, resourceContents]);

  const patchActiveResource = useCallback(
    (patch: {
      path?: string;
      kind?: ImportKind;
      as?: string;
      import_paths?: string[];
    }) => {
      if (!activeTab || activeTab.resourceIndex === undefined) {
        return;
      }
      const imports = (
        formDataRef.current as { test_suites?: { imports?: unknown[] } } | undefined
      )?.test_suites?.imports;
      const prevAs =
        Array.isArray(imports) && imports[activeTab.resourceIndex]
          ? normalizeImport(imports[activeTab.resourceIndex]).as
          : '';
      const next = updateResource(formDataRef.current, activeTab.resourceIndex, patch);
      if (!next) {
        return;
      }
      onFormDataChangeRef.current(next);
      const nextAs = (patch.as ?? prevAs).trim();
      if (patch.as !== undefined && prevAs && nextAs && prevAs !== nextAs) {
        onResourceContentsChangeRef.current(
          renameContentKey(resourceContentsRef.current, prevAs, nextAs),
        );
      }
      const node = collectStudioNodes(next).resources.find(
        (item) => item.resourceIndex === activeTab.resourceIndex,
      );
      if (node) {
        const newTab = tabFromNode(node);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.id === resourceTabId(activeTab.resourceIndex!) ? newTab : tab,
          ),
        );
      }
    },
    [activeTab],
  );

  const setActiveResourceContent = useCallback(
    (text: string) => {
      if (!activeResource?.as) {
        return;
      }
      onResourceContentsChangeRef.current({
        ...resourceContentsRef.current,
        [activeResource.as]: text,
      });
    },
    [activeResource],
  );

  const handleSeedHarImport = useCallback(
    (opts: { withSequenceScan: boolean }) => {
      if (!activeResource || activeResource.kind !== 'har_file') {
        return;
      }
      const seed = buildHarImportSeedLines({
        as: activeResource.as,
        path: activeResource.path,
        withSequenceScan: opts.withSequenceScan,
      }).join('\n');
      const scenarios = collectStudioNodes(formDataRef.current).scenarios;
      const openScenario = openTabsRef.current.find(
        (tab) => scenarioIndexFromTabId(tab.id) !== undefined,
      );
      const openIdx = openScenario ? scenarioIndexFromTabId(openScenario.id) : undefined;
      const target =
        (openIdx !== undefined
          ? scenarios.find((s) => s.scenarioIndex === openIdx)
          : undefined) || scenarios[0];
      if (!target?.path) {
        void message.error('Сначала создайте сценарий — туда вставятся шаги ВыполнитьЦепь');
        return;
      }
      const currentTab = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
      flushTab(currentTab);
      const prev = readConstructorSlice(formDataRef.current, target.path);
      const nextText = appendHarImportSeed(prev, seed);
      const scenarioTab = tabFromNode(target);
      commitConstructorText(scenarioTab, nextText);
      openTab(scenarioTab);
      void message.success('ВыполнитьЦепь вставлен в сценарий');
    },
    [activeResource, commitConstructorText, flushTab, message, openTab],
  );

  const closeHubForm = useCallback(() => {
    setShowHubOverlay(false);
    setHubFormActionId(null);
  }, []);

  /** IMPX-5: влить импортированные блоки в текущую проверку. */
  const handleImportBlocks = useCallback(
    (payload: ImportBlocksPayload) => {
      const { data } = mergeEditorBlocks(formDataRef.current, payload.blocks);
      formDataRef.current = data;
      onFormDataChangeRef.current(data);
      if (payload.resourceContents) {
        onResourceContentsChangeRef.current({
          ...resourceContentsRef.current,
          ...payload.resourceContents,
        });
      }
      setShowImportDialog(false);
    },
    [],
  );

  const openDraftHubTab = useCallback(() => {
    const current = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
    flushTab(current);
    const planned = planOpenHubDraftTab(openTabsRef.current);
    if (planned.tabs) {
      setOpenTabs(planned.tabs);
    }
    setShowHubOverlay(true);
    setHubFormActionId(null);
    setActiveTabId(planned.activeTabId);
  }, [flushTab, isEditorMode]);

  /* Старт Редактора / любые пути без документных вкладок → каталог Hub. */
  useEffect(() => {
    if (suiteMode === 'off' || !isEditorMode) {
      return;
    }
    if (openTabs.some(isDocumentStudioTab)) {
      return;
    }
    if (activeTabId === 'action-hub' && openTabs.some((tab) => tab.id === 'action-hub')) {
      return;
    }
    setOpenTabs((prev) => activateHubWhenNoDocuments(prev));
  }, [activateHubWhenNoDocuments, activeTabId, openTabs, suiteMode, isEditorMode]);

  const handleHubPickAction = useCallback((actionId: HubActionId) => {
    setHubFormEpoch((epoch) => epoch + 1);
    setShowHubOverlay(true);
    setHubFormActionId(actionId);
  }, [isEditorMode]);

  useEffect(() => {
    const entities = [
      ...tree.pages.map((node) => ({
        kind: 'page' as const,
        id: node.key,
        label: node.title.trim() || node.pageId || 'РјРѕРґРµР»СЊ',
        tabId: node.tabId,
      })),
      ...tree.scenarios.map((node) => ({
        kind: 'scenario' as const,
        id: node.key,
        label: node.title.trim() || `scenario_${String(node.scenarioIndex)}`,
        tabId: node.tabId,
      })),
      ...tree.modules.map((node) => ({
        kind: 'module' as const,
        id: node.key,
        label: node.title.trim() || node.moduleId || 'модуль',
        tabId: node.tabId,
      })),
      ...tree.fuzzers.map((node) => ({
        kind: 'fuzzer' as const,
        id: node.key,
        label: node.title.trim() || node.fuzzerId || 'fuzzer',
        tabId: node.tabId,
      })),
      ...tree.resources.map((node) => ({
        kind: 'resource' as const,
        id: node.key,
        label: node.title.trim() || node.as || 'ресурс',
        tabId: node.tabId,
      })),
    ];
    const tabs = openTabs
      .filter((tab) => tab.id !== 'action-hub')
      .map((tab) => ({ id: tab.id, title: tab.title }));

    setStudioCommandHost({
      entities,
      tabs,
      activeTabId,
      openEntity: (tabId) => {
        openTabById(tabId as StudioTabId);
      },
      create: (actionId) => {
        handleHubPickAction(actionId);
      },
      switchTab: (tabId) => {
        const existing = openTabsRef.current.find((tab) => tab.id === tabId);
        if (existing) {
          setActiveTabId(tabId as StudioTabId);
          syncLiveFromTab(existing);
          return;
        }
        openTabById(tabId as StudioTabId);
      },
      closeActiveTab: () => {
        const id = activeTabIdRef.current;
        if (id && id !== 'action-hub') {
          closeTabId(id);
        }
      },
      validate: () => {
        onCmdValidate?.();
      },
      baseline: onCmdBaseline,
      goToDefinition: () => {
        void editorRef.current?.getAction('editor.action.revealDefinition')?.run();
      },
      goToReferences: () => {
        void editorRef.current?.getAction('editor.action.goToReferences')?.run();
      },
      peekDefinition: () => {
        void editorRef.current?.getAction('editor.action.peekDefinition')?.run();
      },
      navigateBack: () => {
        void editorRef.current?.getAction('editor.action.navigateBack')?.run();
      },
      quickFix: () => {
        void editorRef.current?.getAction('editor.action.quickFix')?.run();
      },
      showOutline: () => {
        const ed = editorRef.current;
        const outline =
          ed?.getAction('editor.action.quickOutline') ??
          ed?.getAction('editor.action.gotoSymbol');
        void outline?.run();
      },
      gotoLine: () => {
        void editorRef.current?.getAction('editor.action.gotoLine')?.run();
      },
      selectHighlights: () => {
        void editorRef.current?.getAction('editor.action.selectHighlights')?.run();
      },
    });
    return () => {
      setStudioCommandHost(null);
    };
  }, [
    activeTabId,
    closeTabId,
    handleHubPickAction,
    onCmdBaseline,
    onCmdValidate,
    openTabById,
    openTabs,
    syncLiveFromTab,
    tree,
  ]);

  const handleHubSubmit = useCallback(
    (payload: HubSubmitPayload): boolean => {
      const result = applyHubSubmit(payload, {
        createScenario: handleCreateScenario,
        createPage: handleCreatePage,
        createModule: handleCreateModule,
        createAuth: handleCreateAuth,
        createConnector: handleCreateConnector,
        createOpenApi: handleCreateOpenApi,
        createGraphql: handleCreateGraphql,
        createGrpc: handleCreateGrpc,
        createChain: handleCreateChain,
        createFuzzer: handleCreateFuzzer,
        createResource: handleCreateResource,
        moveFolderMember: handleMoveFolderMember,
      });
      if (!result.ok) {
        return false;
      }
      setShowHubOverlay(false);
      setHubFormActionId(null);
      if (result.reveal) {
        setExplorerReveal(result.reveal);
      }
      return true;
    },
    [
      handleCreateScenario,
      handleCreatePage,
      handleCreateModule,
      handleCreateAuth,
      handleCreateConnector,
      handleCreateOpenApi,
      handleCreateGraphql,
      handleCreateGrpc,
      handleCreateChain,
      handleCreateFuzzer,
      handleCreateResource,
      handleMoveFolderMember,
    ],
  );

  const handleHubExternal = useCallback((_actionId: HubActionId) => {
    /* Live / Результаты — отдельная вкладка шапки, не плитки хаба. */
  }, []);

  useEffect(() => {
    if (!hubFormActionId && !showHubOverlay) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowHubOverlay(false);
        setHubFormActionId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hubFormActionId, showHubOverlay]);

  const onTabChange = useCallback(
    (key: string) => {
      if (!isStudioTabId(key)) {
        return;
      }
      const current = openTabs.find((item) => item.id === activeTabIdRef.current);
      flushTab(current);
      const nextTab = openTabs.find((item) => item.id === key);
      setActiveTabId(key);
      syncLiveFromTab(nextTab);
    },
    [flushTab, openTabs, syncLiveFromTab],
  );

  const tabsContainerRef = useRef<HTMLDivElement | null>(null);
  const tabDragIdRef = useRef<StudioTabId | null>(null);
  const [tabDropHint, setTabDropHint] = useState<{
    id: StudioTabId;
    edge: TabDropEdge;
  } | null>(null);

  useLayoutEffect(() => {
    const root = tabsContainerRef.current;
    if (!root) {
      return;
    }
    root.querySelectorAll<HTMLElement>('.ant-tabs-tab').forEach((el) => {
      const key = el.getAttribute('data-node-key');
      const movable = Boolean(key && key !== 'action-hub' && isStudioTabId(key));
      if (movable) {
        el.setAttribute('draggable', 'true');
      } else {
        el.removeAttribute('draggable');
      }
      el.classList.toggle(
        'pk-studio-tab-drop-before',
        Boolean(tabDropHint && movable && key === tabDropHint.id && tabDropHint.edge === 'before'),
      );
      el.classList.toggle(
        'pk-studio-tab-drop-after',
        Boolean(tabDropHint && movable && key === tabDropHint.id && tabDropHint.edge === 'after'),
      );
      el.classList.toggle(
        'pk-studio-tab-dragging',
        Boolean(tabDragIdRef.current && key === tabDragIdRef.current),
      );
    });
  }, [openTabs, activeTabId, tabDropHint]);

  const clearTabDropHint = useCallback(() => {
    setTabDropHint(null);
  }, []);

  const tabDropHintRef = useRef(tabDropHint);
  tabDropHintRef.current = tabDropHint;

  /* Native listeners — JSX mouse/drag on bare div = Sonar S6847. */
  useEffect(() => {
    const root = tabsContainerRef.current;
    if (!root) {
      return;
    }
    const onMiddleClick = (event: MouseEvent) => {
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const tabId = tabIdFromTabsEventTarget(event.target);
      if (tabId) {
        closeTabId(tabId);
      }
    };
    const onDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.ant-tabs-tab-remove')) {
        event.preventDefault();
        return;
      }
      const tabEl = target?.closest('.ant-tabs-tab');
      const key = documentTabIdFromNodeKey(tabEl?.getAttribute('data-node-key'));
      if (!key) {
        event.preventDefault();
        return;
      }
      tabDragIdRef.current = key;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', key);
      }
      tabEl?.classList.add('pk-studio-tab-dragging');
    };
    const onDragOver = (event: DragEvent) => {
      const dragId = tabDragIdRef.current;
      if (!dragId) {
        return;
      }
      const tabEl = (event.target as HTMLElement | null)?.closest('.ant-tabs-tab');
      const key = documentTabIdFromNodeKey(tabEl?.getAttribute('data-node-key'));
      if (!tabEl || !key || key === dragId) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      const edge = tabDropEdgeFromPoint(tabEl as HTMLElement, event.clientX);
      setTabDropHint((prev) => nextTabDropHint(prev, key, edge));
    };
    const onDrop = (event: DragEvent) => {
      const dragId = tabDragIdRef.current;
      const hint = tabDropHintRef.current;
      tabDragIdRef.current = null;
      clearTabDropHint();
      if (!dragId || !hint) {
        return;
      }
      event.preventDefault();
      setOpenTabs((prev) => reorderStudioTabs(prev, dragId, hint.id, hint.edge));
    };
    const onDragEnd = () => {
      tabDragIdRef.current = null;
      clearTabDropHint();
    };
    const onDragLeave = (event: DragEvent) => {
      const related = event.relatedTarget as Node | null;
      if (!root.contains(related)) {
        clearTabDropHint();
      }
    };
    root.addEventListener('mousedown', onMiddleClick);
    root.addEventListener('auxclick', onMiddleClick);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    root.addEventListener('dragleave', onDragLeave);
    return () => {
      root.removeEventListener('mousedown', onMiddleClick);
      root.removeEventListener('auxclick', onMiddleClick);
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
      root.removeEventListener('dragleave', onDragLeave);
    };
  }, [clearTabDropHint, closeTabId]);

  const onTabEdit = useCallback(
    (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: 'add' | 'remove') => {
      if (action !== 'remove' || typeof targetKey !== 'string' || !isStudioTabId(targetKey)) {
        return;
      }
      closeTabId(targetKey);
    },
    [closeTabId],
  );

  const handleEditorChange = useCallback(
    (next: string | undefined) => {
      if (ignoreModelEchoRef.current) {
        return;
      }
      const tabId = activeTabIdRef.current;
      if (!tabId) {
        return;
      }
      const tab = openTabsRef.current.find((item) => item.id === tabId);
      if (!tab || tab.kind === 'resource' || tab.kind === 'fuzzer') {
        return;
      }
      const path = modelPathForTab(tab);
      const model = editorRef.current?.getModel();
      if (!path || !model) {
        return;
      }
      const expected = monaco.Uri.parse(path).toString();
      if (model.uri.toString() !== expected) {
        return;
      }
      const raw = next ?? '';
      setLiveTextFromTyping(raw);
      scheduleFlush(tab, raw);
    },
    [monaco, scheduleFlush, setLiveTextFromTyping],
  );

  const hubFolders = useMemo(() => readEditorFolders(formData), [formData]);

  /** До early return suiteMode=off — иначе fewer hooks при «Ручная проверка». */
  const handleSelectValidationFail = useCallback(
    (fail: ConstructorBatchFail) => {
      const targetNode = resolveNodeForValidationFail(tree, fail);
      if (targetNode) {
        openTab(tabFromNode(targetNode));
      }

      const { lineNumber, column } = editorPositionFromFail(fail);
      window.setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.setPosition({ lineNumber, column });
          editorRef.current.revealLineInCenter(lineNumber);
          editorRef.current.focus();
        }
      }, 50);
    },
    [openTab, tree],
  );

  /** STU-EDITOR-PURE: в Редакторе если нет активной вкладки, открываем первый сценарий/страницу/ресурс */
  useEffect(() => {
    if (!isEditorMode) {
      return;
    }
    if (activeTabId && activeTabId !== 'action-hub') {
      return;
    }
    // Если пользователь сам открыл action-hub (черновик/создание), не перебивать
    if (activeTabId === 'action-hub' && openTabs.some((t) => t.id === 'action-hub')) {
      return;
    }
    const node = tree.scenarios[0] ?? tree.pages[0] ?? tree.resources[0] ?? tree.modules[0];
    if (node) {
      openTab(tabFromNode(node));
    }
  }, [isEditorMode, activeTabId, tree, openTab, openTabs]);

  if (suiteMode === 'off') {
    return (
      <div className="pk-studio-workspace pk-studio-workspace-off" style={{ width: '100%', height: '100%' }}>
        <StudioLaunchpad
          onStartFresh={() => {
            const fresh = freshCheckWiredData();
            onFormDataChangeRef.current(fresh);
            formDataRef.current = fresh;
          }}
          onStartImported={(imported) => {
            onFormDataChangeRef.current(imported);
            formDataRef.current = imported;
          }}
        />
      </div>
    );
  }

  const prettyPane = (
      <section className={`pk-studio-editor-stack pk-studio-pane-prettyk ${isEditorMode && isWorkspaceIdle ? 'pk-studio-pane-prettyk--idle' : ''}`} ref={prettyPaneRef}>
        <GraphWaveOverlay
          containerRef={prettyPaneRef}
          isIdle={isEditorMode && isWorkspaceIdle}
          inverted
          delayOffset={0.5}
        />
        {isEditorMode ? (
          <div className="pk-studio-pane-head">
            <div className="pk-studio-pane-head-row pk-studio-canvas-head-row">
              <span className="pk-studio-pane-label">
                <PrettyPaneLabel
                  isResourceTab={isResourceTab}
                  isFuzzerTab={isFuzzerTab}
                  isConnectorModuleActive={isConnectorModuleActive}
                />
              </span>
              <button
                type="button"
                className="pk-studio-tab-add-btn"
                title="Добавить элемент"
                aria-label="Добавить элемент"
                onClick={openDraftHubTab}
              >
                <img
                  src={addTabIcon}
                  alt=""
                  className="pk-studio-tab-add-icon"
                  draggable={false}
                  aria-hidden
                />
              </button>
              <div
                ref={tabsContainerRef}
                className="pk-studio-tabs-container"
                aria-label="Вкладки документов"
              >
                <Tabs
                  type="editable-card"
                  hideAdd
                  size="small"
                  activeKey={
                    activeTabId && activeTabId !== 'action-hub' ? activeTabId : 'pk-no-document-tab'
                  }
                  onChange={onTabChange}
                  onEdit={onTabEdit}
                  items={openTabs
                    .filter((tab) => tab.id !== 'action-hub')
                    .map((tab) => ({
                      key: tab.id,
                      label: (
                        <span className="pk-studio-tab-label" title={tab.title.trim() || undefined}>
                          {tab.title.trim() ? tab.title : '\u00A0'}
                        </span>
                      ),
                      closable: true,
                    }))}
                  className="pk-studio-tabs pk-studio-tabs--inline"
                />
              </div>
            </div>
          </div>
        ) : null}
        {isEditorMode ? (
          <StudioLocatorHealBanner
            enabled={Boolean(
              activeTab &&
                activeTab.kind !== 'resource' &&
                activeTab.kind !== 'fuzzer' &&
                !isFormOnlyTab &&
                activeTabId !== 'action-hub',
            )}
            constructorText={liveText || activeDefaultValue}
            onAccept={acceptLocatorHeal}
          />
        ) : null}
        {isEditorMode ? (
          <StudioLocatorLabelBanner
            enabled={Boolean(
              activeTab &&
                activeTab.kind !== 'resource' &&
                activeTab.kind !== 'fuzzer' &&
                !isFormOnlyTab &&
                activeTabId !== 'action-hub',
            )}
            constructorText={liveText || activeDefaultValue}
            onAccept={acceptLocatorLabel}
          />
        ) : null}
          {isEditorMode && isScenarioTab ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 6px 6px 0' }}>
              <Button
                size="small"
                type="text"
                icon={scenarioPhaseView ? <UnorderedListOutlined /> : <MergeCellsOutlined />}
                onClick={() => setScenarioPhaseView(!scenarioPhaseView)}
                style={{ color: '#A78BFA', fontSize: 11 }}
              >
                {scenarioPhaseView ? 'Micro Steps' : 'Macro Phases'}
              </Button>
            </div>
          ) : null}
          {isEditorMode && isScenarioTab && scenarioPhaseView && (liveText || activeDefaultValue) ? (
            <ScenarioPhaseFolder constructorText={liveText || activeDefaultValue} />
          ) : (
          renderStudioPrettyActiveBody({
            activeTabId,
            openTabs,
            activeTab,
            formData,
            themeId,
            monaco,
            isResourceTab,
            isFuzzerTab,
            isConnectorModuleActive,
            isOpenApiModuleActive,
            isGraphqlModuleActive,
            isGrpcModuleActive,
            isChainModuleActive,
            isAuthFormUiActive,
            isAuthActionUiActive,
            isAuthModuleActive,
            isPlainDataActive,
            activeResource,
            activeResourceContent,
            activeFuzzer,
            activeConnector,
            activeOpenApi,
            activeGraphql,
            activeGrpc,
            activeChain,
            authFormCtorText,
            activeModelPath,
            activeLanguageId,
            activeDefaultValue,
            diagnostics,
            paintCursorHud,
            openTabsRef,
            activeTabIdRef,
            flushTab,
            editorRef,
            handleHubPickAction,
            handleHubExternal,
            hubFormActionId,
            hubFormEpoch,
            hubFolders,
            handleHubSubmit,
            closeHubForm,
            patchActiveResource,
            setActiveResourceContent,
            handleSeedHarImport,
            patchActiveFuzzer,
            patchActiveConnector,
            patchActiveOpenApi,
            patchActiveGraphql,
            patchActiveGrpc,
            patchActiveChain,
            handleChainApplyPlay,
            patchActiveAuthFormConstructor,
            handleEditorChange,
            isEditorMode,
          }))}
        {/* hubFormActionId renders in-place in studioWorkspaceActiveBody instead of overlay popup */}
      </section>
  );

  const importDialog = (
    <StudioImportDialog
      open={showImportDialog}
      onClose={() => setShowImportDialog(false)}
      onImport={handleImportBlocks}
    />
  );

  const problemsPane = showProblems ? (
    <section className="pk-studio-problems-panel" aria-label="Проблемы валидации">
      <div className="pk-studio-pane-head">
        <div className="pk-studio-pane-head-row">
          <Typography.Text className="pk-studio-pane-label">Проблемы</Typography.Text>
        </div>
      </div>
      <ol className="pk-studio-problem-list">
        {activeProblemMarkers.map((marker, index) => (
          <li key={`${marker.startLineNumber}:${marker.startColumn}:${marker.message}`}>
            <Button
              type="link"
              size="small"
              onClick={() => {
                editorRef.current?.setPosition({
                  lineNumber: marker.startLineNumber,
                  column: marker.startColumn,
                });
                editorRef.current?.revealLineInCenter(marker.startLineNumber);
                editorRef.current?.focus();
              }}
            >
              {`Строка ${String(marker.startLineNumber)}`}
            </Button>
            <Typography.Text
              type={marker.severity === monaco.MarkerSeverity.Error ? 'danger' : 'secondary'}
            >
              {marker.message}
            </Typography.Text>
            {index < activeProblemMarkers.length - 1 ? <span aria-hidden>В·</span> : null}
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  const validationPane = validationFeedback ? (
    <ConstructorNoPenguin
      {...validationFeedback}
      onClose={onCloseValidationFeedback}
      onSelectFail={handleSelectValidationFail}
    />
  ) : null;

  return (
    <div
      className={`pk-studio-workspace ${
        isEditorMode ? 'pk-studio-workspace--editor' : 'pk-studio-workspace--studio'
      }`}
      ref={workspaceRef}
    >
      {isEditorMode ? (
        <StudioBlocksTree
          mode={suiteMode}
          tree={tree}
          folders={folders}
          projectId={studioProjectId}
          editorMode={isEditorMode}
          isIdle={isEditorMode && isWorkspaceIdle}
          selectedTabId={activeTabId === 'action-hub' ? undefined : activeTabId}
          onSelectTab={openTabById}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveFolderMember={handleMoveFolderMember}
          onDropTreeMember={handleDropTreeMember}
          onCreatePage={handleCreatePage}
          onRenamePage={handleRenamePage}
          onDeletePage={handleDeletePage}
          onCreateScenario={handleCreateScenario}
          onRenameScenario={handleRenameScenario}
          onDeleteScenario={handleDeleteScenario}
          onCreateModule={handleCreateModule}
          onRenameModule={handleRenameModule}
          onDeleteModule={handleDeleteModuleSimple}
          onCreateFuzzer={handleCreateFuzzer}
          onRenameFuzzer={handleRenameFuzzer}
          onDeleteFuzzer={handleDeleteFuzzer}
          onCreateResource={handleCreateResource}
          onAttachResourceFiles={handleAttachResourceFiles}
          onRenameResource={handleRenameResource}
          onDeleteResource={handleDeleteResource}
          revealRequest={explorerReveal}
        />
      ) : (
        <>
          <PreflightAdvisoryStrip wired={formData} />
          <StudioGraphExplorer
          tree={tree}
          selectedNodeId={activeTabId === 'action-hub' ? undefined : activeTabId}
          onSelectTab={openTabById}
          onOpenSettings={() => {
            const root = formData as Record<string,unknown>;
            const infra = (root.infrastructure as Record<string,unknown> | undefined) ?? {};
            setGearInitialValues({
              webswing: infra.zap_mode === 'webswing',
              sessionTimeout: infra.webswing_session_timeout_min ?? 60,
              idleTimeout: infra.idle_timeout_min ?? 10,
            });
            setSettingsModalOpen(true);
          }}
          onCategoryClick={(categoryId) => {
            if (categoryId === 'scenarios') setSuiteSetupActive(!suiteSetupActive);
          }}
          isAddOpen={showHubOverlay}
          onAdd={() => {
            setShowHubOverlay(true);
            setHubFormActionId(null);
          }}
          onCloseAdd={closeHubForm}
          onRename={(node) => {
            const next = window.prompt('Новое имя', node.title);
            if (!next?.trim()) return;
            if (node.kind === 'page') handleRenamePage(node.id.slice(5), next);
            else if (node.kind === 'scenario') handleRenameScenario(Number(node.id.slice(9)), next);
            else if (node.kind === 'module') handleRenameModule(Number(node.id.slice(7)), next);
            else if (node.kind === 'fuzzer') handleRenameFuzzer(Number(node.id.slice(7)), next);
            else if (node.kind === 'resource') handleRenameResource(Number(node.id.slice(9)), next);
          }}
          onDelete={(node) => {
            if (node.kind === 'page') handleDeletePage(node.id.slice(5));
            else if (node.kind === 'scenario') handleDeleteScenario(Number(node.id.slice(9)));
            else if (node.kind === 'module') handleDeleteModuleSimple(Number(node.id.slice(7)));
            else if (node.kind === 'fuzzer') handleDeleteFuzzer(Number(node.id.slice(7)));
            else if (node.kind === 'resource') handleDeleteResource(Number(node.id.slice(9)));
          }}
          overlay={showHubOverlay ? (
            <div
              className="pk-studio-graph-overlay"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={closeHubForm}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    fontSize: 22,
                    lineHeight: 1,
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                  aria-label="Закрыть"
                  title="Закрыть (Esc)"
                >
                  ×
                </button>
              </div>
              {hubFormActionId && hubFolders && handleHubSubmit ? (
                <StudioActionForm
                  key={hubFormEpoch}
                  actionId={hubFormActionId}
                  pageFolders={hubFolders.pages}
                  scenarioFolders={hubFolders.scenarios}
                  formData={formData}
                  onSubmit={(payload) => {
                    handleHubSubmit(payload);
                    closeHubForm();
                  }}
                  onCancel={closeHubForm}
                />
              ) : (
                <StudioActionHub
                  onPickAction={handleHubPickAction}
                  onExternal={handleHubExternal}
                />
              )}
            </div>
          ) : null}
        />
        </>
      )}
      {isEditorMode ? (
      <div className="pk-studio-main">
        <div className="pk-studio-editors" style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, minHeight: 0 }}>
          {prettyPane}
          {Boolean(activeTab && !isFormOnlyTab && activeModelPath) ? (
            <div
              ref={cursorHudRef}
              className="pk-studio-cursor-pos"
              aria-hidden
            />
          ) : null}
        </div>
        {validationPane ?? problemsPane}
      </div>
      ) : (
      <div className="pk-studio-main">
        {suiteSetupActive ? (() => {
            const root = formData as Record<string, unknown>;
            const infra = (root.infrastructure as Record<string, unknown> | undefined) ?? {};
            return (
          <section className="pk-studio-editor-stack pk-studio-pane-prettyk" style={{ padding: 16 }}>
            <div className="pk-studio-pane-head">
              <span className="pk-studio-pane-label">{dict.studio.suite?.setupTitle ?? 'Suite Setup'}</span>
              <Button size="small" type="text" onClick={() => setSuiteSetupActive(false)} style={{ color: '#94A3B8' }}>×</Button>
            </div>
            <Form layout="vertical" style={{ marginTop: 12, maxWidth: 520 }}
              initialValues={{
                url: infra.base_url_override ?? '',
                additionalUrls: infra.allowed_extra_domains ?? '',
                blockedUrls: (Array.isArray(infra.blocked_urls_list) ? (infra.blocked_urls_list as string[]) : []).join('\n'),
                browser: infra.browser_type ?? 'chrome-headless',
                debugMode: infra.debug_mode ?? false,
              }}
              onValuesChange={(_, all) => {
                const next = JSON.parse(JSON.stringify(root));
                const nextInfra = (next.infrastructure ??= {}) as Record<string, unknown>;
                nextInfra.base_url_override = String(all.url ?? '');
                nextInfra.allowed_extra_domains = String(all.additionalUrls ?? '');
                nextInfra.blocked_urls_list = String(all.blockedUrls ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean);
                nextInfra.browser_type = String(all.browser ?? 'chrome-headless');
                nextInfra.debug_mode = Boolean(all.debugMode);
                onFormDataChange(next);
              }}
            >
              <Form.Item name="url" label={dict.studio.suite?.url ?? 'Target URL'}>
                <Input placeholder="http://juice-shop:3000" />
              </Form.Item>
              <Form.Item name="additionalUrls" label={dict.studio.suite?.additionalUrls ?? 'Additional Allowed URLs'}>
                <Input.TextArea rows={2} placeholder="https://example.com|*.internal.org" />
              </Form.Item>
              <Form.Item name="blockedUrls" label={dict.studio.suite?.blockedUrls ?? 'Blocked URLs'}>
                <Input.TextArea rows={3} placeholder="One URL per line..." />
              </Form.Item>
              <Form.Item name="browser" label={dict.studio.suite?.browser ?? 'Browser'}>
                <Select options={[
                  { value: 'chrome', label: 'Chrome' },
                  { value: 'chrome-headless', label: 'Chrome (headless)' },
                  { value: 'firefox', label: 'Firefox' },
                  { value: 'firefox-headless', label: 'Firefox (headless)' },
                ]} />
              </Form.Item>
              <Form.Item name="debugMode" label={dict.studio.suite?.debugMode ?? 'Debug mode'} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Form>
          </section>
          ); })() : prettyPane}
        <div style={{ marginTop: 12 }}>
          {studioPinguin ? (
            <ConstructorNoPenguin
              {...studioPinguin}
              onClose={() => setStudioPinguin(null)}
            />
          ) : problemsPane}
        </div>
      </div>
      )}
      {importDialog}

      <Modal
        title={dict.studio.suite?.setupTitle ?? 'Suite Settings'}
        open={settingsModalOpen}
        onOk={() => {
          const next = JSON.parse(JSON.stringify(formData as Record<string, unknown>));
          const infra = (next.infrastructure ??= {}) as Record<string, unknown>;
          infra.zap_mode = gearInitialValues.webswing ? 'webswing' : 'demon';
          infra.webswing_session_timeout_min = Number(gearInitialValues.sessionTimeout ?? 60);
          infra.idle_timeout_min = Number(gearInitialValues.idleTimeout ?? 10);
          onFormDataChange(next);
          setSettingsModalOpen(false);
        }}
        onCancel={() => setSettingsModalOpen(false)}
        okText={dict.common.save}
        cancelText={dict.common.cancel}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={dict.studio.suite?.webswing ?? 'Webswing mode'}>
            <Switch
              checked={Boolean(gearInitialValues.webswing)}
              onChange={(v) => setGearInitialValues((prev) => ({ ...prev, webswing: v }))}
            />
          </Form.Item>
          <Form.Item label={dict.studio.suite?.webswingTimeout ?? 'Session timeout (min)'}>
            <InputNumber
              min={30} max={180} style={{ width: '100%' }}
              value={Number(gearInitialValues.sessionTimeout ?? 60)}
              onChange={(v) => setGearInitialValues((prev) => ({ ...prev, sessionTimeout: v ?? 60 }))}
            />
          </Form.Item>
          <Form.Item label={dict.studio.suite?.idleTimeout ?? 'Idle timeout (min)'}>
            <InputNumber
              min={5} max={30} style={{ width: '100%' }}
              value={Number(gearInitialValues.idleTimeout ?? 10)}
              onChange={(v) => setGearInitialValues((prev) => ({ ...prev, idleTimeout: v ?? 10 }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export type StudioMode = 'front' | 'editor';

export const STUDIO_MODE_STORAGE_KEY = 'pk-studio-mode';

/** memo: СЃРјРµРЅР° Segmented/chrome РІ App РЅРµ РґРѕР»Р¶РЅР° РіРѕРЅСЏС‚СЊ Monaco. */
export const StudioWorkspace = memo(StudioWorkspaceInner);



