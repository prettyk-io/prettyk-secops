/**
 * Editor Workbench (PK-EC-1 & PK-EC-5, PK-WB-A1 Gate)
 *
 * Root 3-panel layout shell for the PrettyK Editor.
 *
 * Two modes:
 * 1. CONTROLLED (formData is provided) — reads/writes DSL through wiredDslCodec,
 *    shares single source of truth with StudioWorkspace.
 * 2. STANDALONE (no formData) — legacy prototype mode with local code state.
 *
 * Layout: Left Explorer, Center Monaco, Right Context, Bottom Drawer.
 * All panels collapse, resize with drag handles, persist in Zustand store.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import {
  Play,
  Square,
  Save,
  Home,
  Layers,
  FolderTree,
  Code2,
  Activity,
  Monitor,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottom,
  ChevronDown,
  Sparkles,
  Search,
  Zap,
  Sliders,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Terminal as TerminalIcon,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceStore, type WorkspaceDensity } from './workspaceStore';
import {
  META_DARK_MONACO_THEME_ID,
  registerMonacoMetaThemes,
} from '../monaco/metaDarkTheme';
import { DARK_THEME_ID, PRETTYK_LANGUAGE_ID } from '../monaco/setup';
import { COMPACT_EDITOR_OPTIONS } from '../monaco/editorOptions';
import { bindRunGutter } from '../monaco/runGutter';
import { setupMonaco } from '../monaco/setup';
import {
  registerConstructorLanguageFeatures,
  applyDiagnostics,
} from '../monaco/constructorLanguage';
import { registerScriptLanguageFeatures } from '../monaco/scriptLanguage';
import { keywordCatalog } from '../keywords/catalog';
import { collectVariables } from '../keywords/variables';
import { collectPageIds } from '../keywords/pages';
import { studioTabWireDiagnostics } from '../studio/studioDiagnostics';
import { flashDiscoveredLine } from '../monaco/discoveredPulse';
import { VALIDATE_CONSTRUCTOR_COMMAND_ID } from '../monaco/scenarioValidateCodeLens';
import { applySugarDiagnostics } from '../monaco/MonacoDiagnostics';
import { getActiveCheckId, getCheck } from '../checks/checksStore';
import { parseWired } from '../wired/parse';
import {
  type DslTabRef,
  readConstructorText,
  writeConstructorText,
  listEditableDslTabs,
  firstDslTab,
  dslTabForStudioTabId,
  resolveNeighborDslTab,
} from '../wired/wiredDslCodec';
import { StudioExplorer } from '../studio/StudioExplorer';
import { collectStudioNodes, findNodeByTabId, tabFromNode } from '../studio/collectStudioNodes';
import type { StudioTabId } from '../studio/studioTabs';
import { BrowserStage, type BrowserStageMode } from '../terminal/BrowserStage';
import { useCdpRecorder, type CdpStepResult } from '../terminal/useCdpRecorder';
import { DSLProposalBanner } from '../terminal/DiscoveryOverlay';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';
import type { ScenarioStepModel, StrategyKind } from '../studio/scenarioStepModel';
import { parseWireDocument, documentToScenarioDecks, fastContentHash } from '../editor/wireDocumentParser';
import { applyCanvasStepPatch } from '../editor/wireDocumentSerializer';
import { StudioEditorSwitch } from '../terminal/StudioEditorSwitch';
import {
  buildEvidenceChain,
  buildStepEvidenceSummary,
  buildPolicyLens,
  countFindingsBySeverity,
} from '../terminal/evidenceBridge';
import type { FindingRecord, EvidenceRecord, RunRecord } from '../ci/types';

// ── B4 (STU-RAILS): инженерная проекция — PrettyK-язык (autocomplete/diagnostics).
// Monaco инициализируется один раз на модуль (идемпотентно), как в Studio.
const monaco = setupMonaco();
registerConstructorLanguageFeatures(monaco);
registerScriptLanguageFeatures(monaco);

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface EditorWorkbenchProps {
  /* ── Controlled mode (connected to App.tsx ── */
  formData?: unknown;
  onFormDataChange?: (next: unknown) => void;
  resourceContents?: Record<string, string>;
  onResourceContentsChange?: (next: Record<string, string>) => void;
  onCmdSave?: () => void;
  onCmdRun?: () => void;
  onCmdValidate?: () => void;

  /* ── Legacy standalone mode ── */
  checkId?: string;
  initialCode?: string;
  onCodeChange?: (code: string) => void;
  onRun?: () => void;
  onSave?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_DSL_CODE = `# PrettyK SecOps DSL
# Open a scenario from the Explorer or create a new check.

Scenario "Empty" {
  Target "https://api.stage.internal"
}`;

/** Debounce before writing Monaco edits back to formData. */
const EDITOR_SYNC_MS = 320;
/** WIRE-SYNC-L2: debounce before syncing Monaco text → Canvas. */
const CANVAS_SYNC_MS = 150;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Determine if we are in controlled mode (formData provided). */
function isControlled(props: EditorWorkbenchProps): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return props.formData !== undefined && props.onFormDataChange !== undefined;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EditorWorkbench(props: EditorWorkbenchProps): React.JSX.Element {
  const {
    formData,
    onFormDataChange,
    resourceContents,
    onResourceContentsChange,
    onCmdSave,
    onCmdRun,
    onCmdValidate,
    checkId,
    initialCode,
    onCodeChange,
    onRun,
    onSave,
  } = props;

  const controlled = isControlled(props);

  /* ── Workspace layout store ── */
  const {
    leftPanel,
    rightPanel,
    bottomDrawer,
    density,
    activeCheck,
    lastStudioTabId,
    toggleLeft,
    toggleRight,
    toggleBottom,
    resizeLeft,
    resizeRight,
    resizeBottom,
    setBottomTab,
    setDensity,
    setActiveCheck,
    setLastStudioTabId,
  } = useWorkspaceStore();

  /* ── Controlled mode state ── */
  const [activeTab, setActiveTab] = useState<DslTabRef | null>(null);
  const [studioSelection, setStudioSelection] = useState<StudioTabId | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  /* ── CDP Recorder state (POC-CDP-1/2/3/4/5) ── */
  const [browserMode, setBrowserMode] = useState<BrowserStageMode>('author');
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const scenarioDeckId = activeTab?.entityId || '';  // WIRE-SYNC-L2: no cdp-poc zombie, only real entities

  // Ensure deck exists in ScenarioDeckStore — only for real entityId
  const ensureDeck = useScenarioDeckStore(s => s.setDecks);
  const decks = useScenarioDeckStore(s => s.decks);
  const insertStepToDeck = useScenarioDeckStore(s => s.insertStep);

  useEffect(() => {
    if (!scenarioDeckId || !activeTab) return;  // WIRE-SYNC-L2: no entityId → no deck
    const existing = decks.find(d => d.id === scenarioDeckId);
    if (!existing) {
      const initialText = formDataRef.current ? readConstructorText(formDataRef.current, activeTab.path) : '';
      const doc = parseWireDocument(initialText);
      const parsedDecks = documentToScenarioDecks(doc, scenarioDeckId);
      if (activeTab.label && !doc.meta.title) parsedDecks[0]!.title = activeTab.label;
      ensureDeck([...decks, parsedDecks[0]!]);
    }
  }, [scenarioDeckId, decks, ensureDeck, activeTab]);

  // Existing DSL lines for duplicate detection
  const existingDslLines = useMemo(() => {
    const deck = decks.find(d => d.id === scenarioDeckId);
    if (!deck) return [];
    return deck.steps.map(s => {
      const a = s.action; const sv = s.strategyValue; const p = s.payload;
      if (a === 'Click' || a === 'Type') return `${a} ${s.strategy} "${sv}" ${p}`.trim();
      return `${a} ${p}`.trim();
    });
  }, [decks, scenarioDeckId]);

  // Manual locators (for manual trust — POC-CDP-5)
  const manualLocators = useMemo(() => {
    const deck = decks.find(d => d.id === scenarioDeckId);
    if (!deck) return new Set<string>();
    return new Set(deck.steps.filter(s => s.led !== 'predicted').map(s => s.strategyValue));
  }, [decks, scenarioDeckId]);

  const {
    state: recorderState,
    startRecording,
    stopRecording,
    acceptProposal,
    rejectProposal,
  } = useCdpRecorder({
    deckId: scenarioDeckId || '',
    existingDslLines,
    existingManualLocators: manualLocators,
    onStepAccepted: useCallback((result: CdpStepResult) => {
      const deckId = scenarioDeckId || '';
      if (!deckId) return;
      // POC-CDP-3/4: Create canonical step
      insertStepToDeck(deckId, { ...result.step, led: 'predicted' as const });

      // POC-CDP-4: Write DSL line into Editor Monaco (same identity)
      if (activeTabRef.current && formDataRef.current) {
        const currentText = readConstructorText(formDataRef.current, activeTabRef.current.path);
        const provenanceComment = `# ${result.provenance}`;
        const dslLine = `${result.step.action} ${result.step.strategy} "${result.step.strategyValue}" ${result.step.payload}`.trim();
        const newText = currentText
          ? `${currentText}\n${provenanceComment}\n${dslLine}`
          : `${provenanceComment}\n${dslLine}`;
        const updated = writeConstructorText(formDataRef.current, activeTabRef.current.path, newText);
        onFormDataChangeRef.current?.(updated);
        formDataRef.current = updated;
        // Refresh Monaco display
        setDirty(false);
        lastEmittedRef.current = newText;
        editorRef.current?.setValue(newText);

        // POC-CDP-4: «✨ Discovered» pulse on the freshly drawn DSL line
        if (editorRef.current) {
          flashDiscoveredLine(editorRef.current, newText.split('\n').length);
        }
      }
    }, [scenarioDeckId, insertStepToDeck]),
    onStepRejected: useCallback(() => {
      // POC-CDP-3: Reject — nothing changes
    }, []),
  });

  // Start/stop recording based on browser mode
  useEffect(() => {
    if (browserMode === 'record') {
      startRecording();
    } else if (recorderState.recording) {
      stopRecording();
    }
  }, [browserMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Standalone mode state ── */
  const [code, setCode] = useState<string>(initialCode || DEFAULT_DSL_CODE);

  /* ── Editor refs ── */
  const [isRunning, setIsRunning] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const gutterDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const syncTimerRef = useRef<number | undefined>();
  const lastEmittedRef = useRef<string>('');
  const activeTabRef = useRef<DslTabRef | null>(null);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  /** WIRE-SYNC-L2: contentHash guard — prevents cyclic Monaco↔Canvas updates. */
  const canvasSyncHashRef = useRef<string>('');
  const canvasSyncTimerRef = useRef<number | undefined>();
  const onFormDataChangeRef = useRef(onFormDataChange);
  onFormDataChangeRef.current = onFormDataChange;
  const lastStudioTabIdRef = useRef(lastStudioTabId);
  lastStudioTabIdRef.current = lastStudioTabId;

  /* ── Drag state ── */
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const isDraggingBottom = useRef(false);

  /* ── List Monaco-editable tabs from the shared Studio tree (controlled) ── */
  const dslTabs = useMemo<DslTabRef[]>(() => {
    if (!controlled || !formData) return [];
    return listEditableDslTabs(formData);
  }, [controlled, formData]);

  /* ── Evidence demo data (PK-WB-E5) ── */
  const evidenceData = useMemo(() => {
    if (!controlled || !formData || !activeTab) return null;

    // Demo findings — in production replaced by CI run engine output
    const demoFindings: FindingRecord[] = [
      {
        dedupKey: 'fp:sql-injection-login',
        runId: 'run-2026-08-25-001',
        observedAt: '2026-08-25T14:32:00Z',
        payload: { endpoint: '/api/auth/login', param: 'username' },
        severity: 'CRITICAL',
        title: 'SQL Injection in login endpoint',
        stepId: activeTab.entityId,
      },
      {
        dedupKey: 'fp:xss-search',
        runId: 'run-2026-08-25-001',
        observedAt: '2026-08-25T14:35:00Z',
        payload: { endpoint: '/api/search', param: 'q' },
        severity: 'HIGH',
        title: 'Reflected XSS in search endpoint',
        stepId: activeTab.entityId,
      },
      {
        dedupKey: 'fp:open-redirect',
        runId: 'run-2026-08-25-001',
        observedAt: '2026-08-25T14:38:00Z',
        payload: { endpoint: '/api/redirect', param: 'url' },
        severity: 'MEDIUM',
        title: 'Open redirect in redirect handler',
        stepId: activeTab.entityId,
      },
    ];

    const demoEvidence: EvidenceRecord[] = [
      {
        dedupKey: 'ev:screenshot-login',
        runId: 'run-2026-08-25-001',
        observedAt: '2026-08-25T14:32:05Z',
        payload: {},
        kind: 'screenshot',
        checksum: 'a1b2c3d4e5f6a7b8',
        stepId: activeTab.entityId,
      },
      {
        dedupKey: 'ev:har-search',
        runId: 'run-2026-08-25-001',
        observedAt: '2026-08-25T14:35:10Z',
        payload: {},
        kind: 'har',
        checksum: 'b2c3d4e5f6a7b8c9',
        stepId: activeTab.entityId,
      },
    ];

    const demoRuns: RunRecord[] = [
      {
        id: 'run-2026-08-25-001',
        correlationId: 'corr-001',
        pipelineId: 'pipe-auth-scan',
        pipelineSnapshot: {
        id: 'pipe-auth-scan',
        irVersion: '1.0',
        name: 'Auth Scan',
        target: { id: 'tgt-1', name: 'api.stage.internal' },
        scope: { rules: [{ allowedHosts: ['api.stage.internal'] }] },
        policy: { id: 'pol-1', name: 'Default Policy', version: '1.0' },
        requiredCapabilities: ['checks:create'],
        steps: [],
        edges: [],
      },
        policySnapshot: { id: 'pol-1', name: 'Default Policy', version: '1.0' },
        state: 'succeeded',
        idempotencyKey: 'idem-001',
        attemptNumber: 1,
        actor: 'secops-operator',
        createdAt: '2026-08-25T14:30:00Z',
        updatedAt: '2026-08-25T14:45:00Z',
        timeline: [],
        toolVersions: {},
      },
    ];

    const chain = buildEvidenceChain(
      activeTab.entityId,
      activeTab.label,
      activeTab.path,
      demoRuns,
      demoFindings,
      demoEvidence,
    );

    const summary = buildStepEvidenceSummary(chain);

    const policyLens = buildPolicyLens(
      'Default Security Policy',
      true,
      [
        { severity: 'CRITICAL', maxAllowed: 1 },
        { severity: 'HIGH', maxAllowed: 5 },
        { severity: 'MEDIUM', maxAllowed: 10 },
      ],
      countFindingsBySeverity(demoFindings),
    );

    return { chain, summary, policyLens };
  }, [controlled, formData, activeTab]);

  /* ── Set initial active tab on first mount / formData change ── */
  useEffect(() => {
    if (!controlled || !formData) return;
    if (dslTabs.length === 0) {
      setActiveTab(null);
      return;
    }
    setActiveTab((prev) => {
      if (prev?.studioTabId) {
        const found = dslTabForStudioTabId(formData, prev.studioTabId);
        if (found) return found;
        // ER-2: entity deleted out from under us — resolve a neighbour instead
        // of silently jumping to the first tab or keeping a phantom tab.
        return resolveNeighborDslTab(formData, prev.studioTabId);
      }
      // ER-4: restore the last-selected entity across Studio ↔ Editor switches.
      const restoredId = lastStudioTabIdRef.current as StudioTabId | undefined;
      if (restoredId) {
        const dsl = dslTabForStudioTabId(formData, restoredId);
        if (dsl) return dsl;
        // form-surface entity (fuzzer/resource/…) — select it in the tree and
        // show the overlay instead of silently opening the first Monaco tab.
        const node = findNodeByTabId(collectStudioNodes(formData), restoredId);
        if (node) return null;
      }
      return firstDslTab(formData);
    });
  }, [controlled, formData, dslTabs.length]);

  /* ── ER-4: restore tree selection on mount from the persisted entity ── */
  useEffect(() => {
    if (!controlled || !formData) return;
    const restoredId = lastStudioTabIdRef.current as StudioTabId | undefined;
    if (!restoredId) return;
    const node = findNodeByTabId(collectStudioNodes(formData), restoredId);
    if (node) setStudioSelection(restoredId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  /* ── ER-2: clear tree selection when the selected entity is deleted ── */
  useEffect(() => {
    if (!controlled || !formData) return;
    setStudioSelection((prevSel) => {
      if (!prevSel) return prevSel;
      const node = findNodeByTabId(collectStudioNodes(formData), prevSel);
      if (node) return prevSel; // still exists
      const neighbor = resolveNeighborDslTab(formData, prevSel);
      return neighbor?.studioTabId;
    });
  }, [controlled, formData]);

  /**
   * Derived form-surface hint. Never stale: recomputed from the selected Studio
   * tab on every formData change (so a deleted fuzzer/resource clears itself).
   */
  const nonMonacoLabel = useMemo(() => {
    if (!controlled || !formData || !studioSelection) return null;
    const dsl = dslTabForStudioTabId(formData, studioSelection);
    if (dsl) return null; // Monaco-editable — not a form surface
    return findNodeByTabId(collectStudioNodes(formData), studioSelection)?.title ?? null;
  }, [controlled, formData, studioSelection]);

  /* ── Load active check metadata from checksStore ── */
  useEffect(() => {
    const targetId = checkId || getActiveCheckId();
    if (targetId) {
      const chk = getCheck(targetId);
      if (chk) {
        setActiveCheck({
          checkId: chk.check_id,
          checkTitle: chk.title,
          targetUrl: 'https://api.stage.internal',
        });
        // Standalone mode: seed from wired
        if (!controlled) {
          if (chk.wired) {
            const parsed = parseWired(chk.wired);
            if (parsed.ok && parsed.wired) {
              const firstScenario = parsed.wired.editor?.scenarios?.[0];
              if (firstScenario && firstScenario.steps) {
                const dslLines = firstScenario.steps
                  .map((st) => st.constructor || '')
                  .filter(Boolean);
                if (dslLines.length > 0) {
                  setCode(dslLines.join('\n'));
                }
              }
            }
          }
        }
      }
    }
  }, [checkId, setActiveCheck, controlled]);

  // Track activeTab ref
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  /* ── B4 (STU-RAILS): живая диагностика активной сущности (инженерная проекция) ── */
  const activeStudioTab = useMemo(() => {
    if (!controlled || !formData || !activeTab?.studioTabId) return undefined;
    const node = findNodeByTabId(collectStudioNodes(formData), activeTab.studioTabId);
    return node ? tabFromNode(node) : undefined;
  }, [controlled, formData, activeTab]);

  const liveDiagnostics = useMemo(() => {
    if (!controlled || !formData || !activeTab || !activeStudioTab) return [];
    return studioTabWireDiagnostics(
      formData,
      activeStudioTab,
      readConstructorText(formData, activeTab.path),
      keywordCatalog,
      collectVariables(formData),
    );
  }, [controlled, formData, activeTab, activeStudioTab]);

  /* ── Monaco mount ── */
  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    registerMonacoMetaThemes(monacoInstance);

    monacoInstance.editor.setTheme(DARK_THEME_ID);

    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    // B4: применить живую диагностику при mount
    const model = editorInstance.getModel();
    if (model) {
      applyDiagnostics(monacoInstance, model, liveDiagnostics);
      applySugarDiagnostics(monacoInstance, model); // DSL-F4
    }

    // E2: Gutter Run ▶ — play glyph + context menu
    const runHandler = controlled ? onCmdRun : onRun;
    gutterDisposableRef.current = bindRunGutter(editorInstance, monacoInstance, {
      onRunStep: (line) => {
        setCursorPos({ line, col: 1 });
        runHandler?.();
      },
      onRunAll: () => { runHandler?.(); },
      onRunFromCursor: (_line) => { runHandler?.(); },
    });
  };

  /* ── B4: живое обновление маркеров при изменении диагностики ── */
  useEffect(() => {
    if (!controlled) return;
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (ed && model) {
      applyDiagnostics(monaco, model, liveDiagnostics);
      applySugarDiagnostics(monaco, model); // DSL-F4
    }
  }, [liveDiagnostics, controlled]);

  /* ── CodeLens 2.0: «Проверить конструктор» из Monaco → validate ── */
  useEffect(() => {
    const handler = () => {
      onCmdValidate?.();
    };
    window.addEventListener(VALIDATE_CONSTRUCTOR_COMMAND_ID, handler);
    return () => window.removeEventListener(VALIDATE_CONSTRUCTOR_COMMAND_ID, handler);
  }, [onCmdValidate]);

  /* ── WIRE-SYNC-F1: deep-link из ScenarioStepCard → Monaco линия ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ line: number }>).detail;
      if (!detail || typeof detail.line !== 'number') return;
      const ed = editorRef.current;
      if (!ed) return;
      ed.revealLineInCenter(detail.line);
      ed.setPosition({ lineNumber: detail.line, column: 1 });
      ed.focus();
    };
    window.addEventListener('pk-jump-to-line', handler);
    return () => window.removeEventListener('pk-jump-to-line', handler);
  }, []);

  /* ── Push text into Monaco (controlled mode). ── */
  const pushTextToEditor = useCallback(
    (text: string) => {
      const ed = editorRef.current;
      if (!ed) return;
      const current = ed.getValue();
      if (current !== text) {
        ed.setValue(text);
      }
    },
    [],
  );

  /* ── Read text from active tab (controlled mode) ── */
  const activeText = useMemo(() => {
    if (!controlled || !formData || !activeTab) return '';
    return readConstructorText(formData, activeTab.path);
  }, [controlled, formData, activeTab]);

  /* ── When activeText changes from outside (Studio mutation → formData → new activeText),
   *    push into Monaco if editor text differs from what we last emitted. ── */
  const prevFormDataTextRef = useRef<string>('');
  useEffect(() => {
    if (!controlled || !activeTab) return;
    const text = activeText;
    const ed = editorRef.current;
    if (!ed) {
      prevFormDataTextRef.current = text;
      return;
    }
    const editorVal = ed.getValue();
    // Only push if text changed externally (not from editor's own writing)
    if (text !== editorVal && text !== prevFormDataTextRef.current) {
      pushTextToEditor(text);
    }
    prevFormDataTextRef.current = text;
  }, [controlled, activeTab, activeText, pushTextToEditor]);

  /* ── Commit editor text back to formData (controlled mode) ── */
  const commitToFormData = useCallback(
    (text: string) => {
      if (!controlled || !formData || !onFormDataChange || !activeTab) return;
      if (text === lastEmittedRef.current) return;
      lastEmittedRef.current = text;
      const next = writeConstructorText(formData, activeTab.path, text);
      onFormDataChange(next);
    },
    [controlled, formData, onFormDataChange, activeTab],
  );

  /* ── Debounced flush from Monaco → formData ── */
  const scheduleFlush = useCallback(
    (raw: string) => {
      setDirty(true);
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        commitToFormData(raw);
        setDirty(false);
      }, EDITOR_SYNC_MS) as unknown as number;
    },
    [commitToFormData],
  );

  /* ── Handle editor changes ── */
  const handleEditorChange = (val?: string) => {
    const nextVal = val ?? '';
    if (controlled) {
      scheduleFlush(nextVal);
    } else {
      setCode(nextVal);
      onCodeChange?.(nextVal);
    }
  };

  /* ── ER-2 dirty-guard: flush pending Monaco edits before a tree mutation ── */
  const flushPendingEdits = useCallback((): unknown => {
    window.clearTimeout(syncTimerRef.current);
    setDirty(false);
    const ed = editorRef.current;
    const tab = activeTabRef.current;
    const data = formDataRef.current;
    if (!controlled || !ed || !tab) return data;
    const current = ed.getValue();
    if (current === lastEmittedRef.current) return data;
    lastEmittedRef.current = current;
    return writeConstructorText(data, tab.path, current);
  }, [controlled]);

  /* ── Select a Studio tab from the shared tree (controlled) ── */
  const handleSelectTab = useCallback(
    (tabId: StudioTabId) => {
      setStudioSelection(tabId);
      setLastStudioTabId(tabId);
      // Flush current Monaco tab before switching
      const ed = editorRef.current;
      if (ed && controlled) {
        const current = ed.getValue();
        commitToFormData(current);
      }
      const dsl = dslTabForStudioTabId(formData, tabId);
      setActiveTab(dsl);
      setDirty(false);
    },
    [controlled, commitToFormData, formData, setLastStudioTabId],
  );

  /* ── Derived display text (controlled uses formData, standalone uses local state) ── */
  const displayText = controlled ? activeText : code;

  // ── WIRE-SYNC-L2: Monaco → Canvas (150ms debounce) ──
  useEffect(() => {
    if (!controlled || !activeTab || !displayText || !scenarioDeckId) return;
    // Content hash guard: same text → no Canvas update
    const newHash = fastContentHash(displayText);
    if (newHash === canvasSyncHashRef.current) return;
    canvasSyncHashRef.current = newHash;

    // Debounce 150ms before updating Canvas
    window.clearTimeout(canvasSyncTimerRef.current);
    canvasSyncTimerRef.current = window.setTimeout(() => {
      const doc = parseWireDocument(displayText);
      const parsedDecks = documentToScenarioDecks(doc, scenarioDeckId);
      if (activeTab?.label && !doc.meta.title) parsedDecks[0]!.title = activeTab.label;

      const currentDecks = useScenarioDeckStore.getState().decks;
      const otherDecks = currentDecks.filter(d => d.id !== scenarioDeckId);
      useScenarioDeckStore.getState().setDecks([...otherDecks, parsedDecks[0]!]);

      // Close the loop: store deck hash so Canvas→Monaco doesn't fire back
      const finalDeck = useScenarioDeckStore.getState().decks.find(d => d.id === scenarioDeckId);
      if (finalDeck) {
        const finalKey = finalDeck.steps.map(s => `${s.id}:${s.action}:${s.strategyValue}:${s.payload}:${s.continueOnError}`).join('|');
        canvasSyncHashRef.current = 'deck:' + finalKey + '|' + finalDeck.steps.length;
      }
    }, CANVAS_SYNC_MS) as unknown as number;
  }, [displayText, controlled, activeTab, scenarioDeckId]);

  // ── WIRE-SYNC-L2: Canvas → Monaco (card edit → Monaco text patch) ──
  useEffect(() => {
    if (!controlled || !activeTab || !scenarioDeckId) return;
    const deck = decks.find(d => d.id === scenarioDeckId);
    if (!deck) return;

    // Hash for Canvas state
    const stepsKey = deck.steps.map(s => `${s.id}:${s.action}:${s.strategyValue}:${s.payload}:${s.continueOnError}`).join('|');
    const deckHash = 'deck:' + stepsKey + '|' + deck.steps.length;
    if (deckHash === canvasSyncHashRef.current) return;
    canvasSyncHashRef.current = deckHash;

    // Canvas changed → push to Monaco
    const ed = editorRef.current;
    if (!ed) return;
    const currentMonaco = ed.getValue();
    if (deck.steps.length === 0) return;

    // Use surgical AST patching
    const doc = parseWireDocument(currentMonaco);
    let patchedText = currentMonaco;
    for (const step of deck.steps) {
      const patchRes = applyCanvasStepPatch(doc, step.id, step);
      if (patchRes.patchedNode) {
        patchedText = patchRes.newText;
      }
    }

    if (patchedText === currentMonaco) return;
    const cursorPos = ed.getPosition();
    ed.setValue(patchedText);
    if (cursorPos) ed.setPosition(cursorPos);
    lastEmittedRef.current = patchedText;

    // Close the loop: store text hash so Monaco→Canvas doesn't fire back
    canvasSyncHashRef.current = fastContentHash(patchedText);
  }, [decks, controlled, activeTab, scenarioDeckId]);

  /* ── Mouse resize handlers ── */
  const handleMouseDownLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingLeft.current = true;
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingLeft.current) resizeLeft(moveEvent.clientX);
    };
    const onMouseUp = () => {
      isDraggingLeft.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleMouseDownRight = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRight.current = true;
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingRight.current) {
        resizeRight(window.innerWidth - moveEvent.clientX);
      }
    };
    const onMouseUp = () => {
      isDraggingRight.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleMouseDownBottom = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingBottom.current = true;
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingBottom.current) {
        resizeBottom(window.innerHeight - moveEvent.clientY);
      }
    };
    const onMouseUp = () => {
      isDraggingBottom.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  /* ── Action handlers ── */
  const handleRunToggle = () => {
    setIsRunning((prev) => !prev);
    if (controlled) {
      onCmdRun?.();
    } else {
      onRun?.();
    }
  };

  const handleSaveClick = () => {
    // Flush pending editor text first
    const ed = editorRef.current;
    if (ed && controlled) {
      const current = ed.getValue();
      commitToFormData(current);
    }
    if (controlled) {
      onCmdSave?.();
    } else {
      onSave?.();
    }
  };

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  /* ── Cleanup debounce timer + ER-4 dirty-guard: flush pending Monaco edits
   *    before unmount (Studio ↔ Editor switch) so a pending edit is never lost. ── */
  useEffect(() => {
    return () => {
      window.clearTimeout(syncTimerRef.current);
      const flushed = flushPendingEdits();
      if (flushed !== undefined && flushed !== formDataRef.current) {
        onFormDataChangeRef.current?.(flushed);
      }
    };
  }, [flushPendingEdits]);

  /* ── Cleanup gutter run ── */
  useEffect(() => {
    return () => {
      gutterDisposableRef.current?.dispose();
    };
  }, []);

  /* ── Render ── */

  return (
    <div
      data-testid="editor-workbench-shell"
      className="flex flex-col h-screen w-screen overflow-hidden bg-[#080c16] text-slate-100 font-sans select-none"
    >
      {/* 1. Global Top Workbench Header Bar — только в standalone mode.
           Controlled mode (App.tsx) рендерит единый глобальный pk-header
           (check-бейдж + Run/Save + переключатель Студия/Редактор) — PURGE-B4. */}
      {!controlled && (
      <header className="h-11 px-3 border-b border-white/10 bg-[#0b101c] flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          {/* Masterbrand Clickable Logo -> Home */}
          <button
            type="button"
            data-testid="workbench-home-logo"
            onClick={() => { window.location.hash = '#/home'; }}
            className="flex items-center gap-2 group p-0.5 -ml-1 rounded-md hover:bg-white/5 transition-all cursor-pointer border-0 bg-transparent focus:outline-none"
            title="pretty< Home"
          >
            <img
              src="/brand/prettyk-logo-temp.png"
              alt="pretty<"
              className="h-[21px] w-auto object-contain transition-transform group-hover:scale-105 group-hover:brightness-110 drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]"
            />
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)] flex items-center gap-1 group-hover:border-cyan-400/50 transition-colors">
              EDITOR <span className="text-cyan-400 font-semibold">&lt;/&gt;</span>
            </span>
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Active Check Badge */}
          <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-xs backdrop-blur-xs">
            <div className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-cyan-500"></span>
              </span>
              <Shield className="size-3 text-cyan-400" />
              <span className="font-semibold text-slate-200 max-w-[200px] truncate" title={activeCheck.checkTitle || 'Security Check Pipeline'}>
                {activeCheck.checkTitle || 'Security Check Pipeline'}
              </span>
            </div>

            {activeCheck.checkId && (
              <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                {activeCheck.checkId}
              </span>
            )}

            {activeCheck.targetUrl && (
              <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 pl-1.5 border-l border-white/10 font-mono">
                <Globe className="size-3 text-slate-400" />
                <span className="text-slate-300 truncate max-w-[180px]" title={activeCheck.targetUrl}>
                  {activeCheck.targetUrl.replace(/^https?:\/\//, '')}
                </span>
              </div>
            )}
          </div>

          {/* STU-RAILS F1: переключатель Студия/Редактор (сохраняет instance id) */}
          <div className="h-4 w-px bg-white/10" />
          <StudioEditorSwitch
            mode="editor"
            hasDirty={dirty}
            onChange={(mode) => {
              const cid = checkId ?? activeCheck.checkId ?? undefined;
              window.location.hash = mode === 'studio'
                ? (cid ? `#/checks/${cid}/studio` : '#/checks')
                : (cid ? `#/checks/${cid}/editor` : '#/checks');
            }}
          />

          {/* Controlled mode: show active tab name */}
          {controlled && activeTab && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-[11px] font-mono text-slate-400">
                {activeTab.label}
              </span>
              {dirty && (
                <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30">
                  ●
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Center: Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRunToggle}
            aria-label={isRunning ? 'Остановить проверку' : 'Запустить проверку'}
            className={`h-7 px-3 text-xs font-semibold shadow-md transition-all ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                : 'bg-gradient-to-r from-sky-500 via-cyan-500 to-indigo-600 text-white hover:opacity-95 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
            }`}
          >
            {isRunning ? (
              <>
                <Square className="size-3 mr-1.5 fill-amber-300 animate-pulse" /> Stop Run
              </>
            ) : (
              <>
                <Play className="size-3 mr-1.5 fill-white" /> Run Check
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveClick}
            aria-label="Сохранить"
            className="h-7 px-2.5 text-xs border-white/10 bg-white/[0.02] text-slate-300 hover:text-white hover:bg-white/5 flex items-center gap-1.5"
          >
            <Save className="size-3" />
            <span>Save</span>
            <span className="text-[9px] font-mono text-slate-400 bg-white/5 px-1 rounded border border-white/5">⌘S</span>
          </Button>
        </div>

        {/* Right: Layout & Density Toggles */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            title={`Density: ${density}`}
            className="size-7 text-slate-400 hover:text-white hover:bg-white/5"
          >
            <Sliders className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLeft}
            title={leftPanel.open ? 'Collapse Left Panel' : 'Expand Left Panel'}
            className={`size-7 ${leftPanel.open ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'} hover:text-white hover:bg-white/5`}
          >
            {leftPanel.open ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleRight}
            title={rightPanel.open ? 'Collapse Right Panel' : 'Expand Right Panel'}
            className={`size-7 ${rightPanel.open ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'} hover:text-white hover:bg-white/5`}
          >
            {rightPanel.open ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBottom}
            title={bottomDrawer.open ? 'Collapse Bottom Drawer' : 'Expand Bottom Drawer'}
            className={`size-7 ${bottomDrawer.open ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'} hover:text-white hover:bg-white/5`}
          >
            <PanelBottom className="size-3.5" />
          </Button>
        </div>
      </header>
      )}

      {/* 2. Main 3-Panel Body Container */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* LEFT PANEL: Explorer */}
        {leftPanel.open && (
          <aside
            data-testid="workbench-left-panel"
            style={{ width: leftPanel.width }}
            className="shrink-0 flex flex-col bg-[#0b101c] border-r border-white/10 overflow-hidden select-none"
          >
            <div className="h-9 px-3 border-b border-white/10 flex items-center shrink-0 bg-[#080c16]/50">
              <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
                <FolderTree className="size-3.5 text-cyan-400" /> Explorer
              </span>
            </div>

            {/* Explorer: shared StudioBlocksTree (ER-1 — single source of truth) */}
            <div className="flex-1 overflow-hidden min-h-0">
              {controlled && formData ? (
                <StudioExplorer
                  formData={formData}
                  onFormDataChange={onFormDataChange!}
                  resourceContents={resourceContents ?? {}}
                  onResourceContentsChange={onResourceContentsChange ?? (() => {})}
                  selectedTabId={studioSelection ?? activeTab?.studioTabId}
                  onSelectTab={handleSelectTab}
                  beforeMutate={flushPendingEdits}
                />
              ) : (
                /* Standalone mode: static mock explorer */
                <div className="overflow-y-auto p-2 space-y-1 text-xs">
                  <div className="px-2 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-medium flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Code2 className="size-3.5 text-cyan-400" />
                      <span>Main Scenario</span>
                    </span>
                    <Badge variant="cyan" className="text-[9px] px-1 py-0">Active</Badge>
                  </div>
                  <div className="px-2 py-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-slate-200 font-medium flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Zap className="size-3.5 text-amber-400" />
                      <span>Token Fuzzer Matrix</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">3 probes</span>
                  </div>
                  <div className="px-2 py-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-slate-200 font-medium flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Monitor className="size-3.5 text-indigo-400" />
                      <span>Authoring Browser</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Left Resize Splitter Handle */}
        {leftPanel.open && (
          <div
            onMouseDown={handleMouseDownLeft}
            className="w-1 hover:w-1.5 bg-transparent hover:bg-cyan-500/50 cursor-col-resize transition-all z-20 shrink-0"
          />
        )}

        {/* CENTER PANEL: Monaco DSL Editor */}
        <main
          data-testid="workbench-center-panel"
          className="flex-1 flex flex-col min-w-0 bg-[#080c16] overflow-hidden"
        >
          {/* Breadcrumb Bar */}
          <div className="h-9 px-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0b101c]/60">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="hover:text-slate-200 cursor-pointer">Workspace</span>
              <span>/</span>
              <span className="text-slate-200 font-medium">
                {controlled
                  ? (activeTab?.label ?? nonMonacoLabel ?? 'No entity')
                  : 'Scenario.prettyk'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
                DSL v1.0
              </Badge>
              <span className="text-[10px] font-mono text-slate-500">
                Ln {cursorPos.line}, Col {cursorPos.col}
              </span>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 min-h-0 relative">
            <Editor
              height="100%"
              width="100%"
              defaultLanguage="prettyk"
              value={displayText}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              theme={DARK_THEME_ID}
              options={{
                ...COMPACT_EDITOR_OPTIONS,
                glyphMargin: true, // E2: Gutter Run ▶
                automaticLayout: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                fontSize: density === 'compact' ? 12 : 13,
                lineHeight: density === 'compact' ? 18 : 20,
              }}
            />
            {controlled && nonMonacoLabel && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#080c16] text-slate-500">
                <FileText className="size-8 opacity-30" />
                <p className="text-sm font-semibold text-slate-400">{nonMonacoLabel}</p>
                <p className="text-[11px]">
                  Эта сущность настраивается в форме — открой её в Студии для редактирования.
                </p>
              </div>
            )}
          </div>

          {/* Editor Status / HUD Bar */}
          <div className="h-6 px-3 border-t border-white/10 bg-[#0b101c] flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-400" />
                <span>0 syntax errors</span>
              </span>
              {controlled ? (
                <span>{activeTab ? activeTab.path : 'no tab'}</span>
              ) : (
                <span>32 lines canon</span>
              )}
            </div>
            <div>
              <span>UTF-8</span>
            </div>
          </div>
        </main>

        {/* Right Resize Splitter Handle */}
        {rightPanel.open && (
          <div
            onMouseDown={handleMouseDownRight}
            className="w-1 hover:w-1.5 bg-transparent hover:bg-cyan-500/50 cursor-col-resize transition-all z-20 shrink-0"
          />
        )}

        {/* RIGHT PANEL: Browser (reveal по кнопке toggleRight) */}
        {rightPanel.open && (
          <aside
            data-testid="workbench-right-panel"
            style={{ width: browserFullscreen ? '100%' : rightPanel.width }}
            className="shrink-0 flex flex-col bg-[#0b101c] border-l border-white/10 overflow-hidden select-none transition-all duration-200"
          >
            <BrowserStage
              mode={browserMode}
              onModeChange={setBrowserMode}
              targetUrl="http://juice-shop:3000"
              collapsed={false}
              embedded={true}
              fullscreen={browserFullscreen}
              onToggleFullscreen={() => setBrowserFullscreen(v => !v)}
              cdpConnected={recorderState.cdpConnected}
              cdpObserving={recorderState.recording}
              recorderError={recorderState.error}
            />
            {/* POC-CDP-2/3: Proposal banner */}
            {recorderState.ambiguous && (
              <div className="px-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[10px] text-amber-400">
                  <span>⚠ Ambiguous locator — review needed. Two elements share the same weak selector.</span>
                </div>
              </div>
            )}
            {recorderState.proposal && (
              <div className="px-2 shrink-0">
                <DSLProposalBanner
                  proposal={recorderState.proposal}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                />
              </div>
            )}
            {recorderState.error && (
              <div className="px-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-[10px] text-red-400">
                  <span>Authoring: {recorderState.error}</span>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 3. BOTTOM DRAWER: Terminal / Logs / Timeline */}
      {bottomDrawer.open && (
        <div
          data-testid="workbench-bottom-drawer"
          className="flex flex-col shrink-0 border-t border-white/10" style={{ height: bottomDrawer.height }}>
          {/* Drawer Resize Handle */}
          <div
            onMouseDown={handleMouseDownBottom}
            className="h-1 hover:h-1.5 bg-transparent hover:bg-cyan-500/50 cursor-row-resize transition-all z-20 shrink-0"
          />

          {/* Drawer Tabs */}
          <div className="h-8 border-b border-white/10 flex items-center px-1 bg-[#0b101c]">
            {[
              { id: 'terminal', label: 'Terminal :3002', icon: <TerminalIcon className="size-3" /> },
              { id: 'logs', label: 'Live Logs', icon: <FileText className="size-3" /> },
              { id: 'timeline', label: 'Timeline', icon: <Activity className="size-3" /> },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBottomTab(t.id)}
                className={`px-3 py-1 text-[11px] font-semibold flex items-center gap-1.5 transition-all rounded ${
                  bottomDrawer.activeTab === t.id
                    ? 'text-cyan-400 border-b-2 border-cyan-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-2 text-xs font-mono text-slate-400 bg-[#080c16]">
            {bottomDrawer.activeTab === 'terminal' && (
              <div className="space-y-1">
                <div className="text-cyan-400">prettyk@workbench:~$ _</div>
                <div className="text-slate-500 italic mt-4">
                  Terminal connected to ws://127.0.0.1:3002
                </div>
              </div>
            )}
            {bottomDrawer.activeTab === 'logs' && (
              <div className="text-slate-500 italic">Live log stream...</div>
            )}
            {bottomDrawer.activeTab === 'timeline' && (
              <div className="text-slate-500 italic">Timeline — no active run.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}