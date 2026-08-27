/**
 * Главный экран проверки: Регламент + Редактор + Результаты.
 * Без RJSF — форма через WiredForm (regulation.*), конструкторы через StudioWorkspace.
 * AppShell — роутер; App — workspace одного CheckInstance.
 */
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, App as AntdApp, Button, Modal, Segmented, Tooltip } from 'antd';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { WiredForm } from './wired/WiredForm';
import type { Wired } from './wired/types';
import { parseWired, mergeRegulationToLegacy } from './wired/parse';
import { validateWiredFields, type FieldError } from './wired/validateWiredFields';
import { setupMonaco } from './monaco/setup';
import {
  registerConstructorLanguageFeatures,
  setConstructorContext,
} from './monaco/constructorLanguage';
import { registerScriptLanguageFeatures } from './monaco/scriptLanguage';
import { keywordCatalog } from './keywords/catalog';
import { KeywordsContext, type KeywordsState } from './keywords/KeywordsContext';
import { collectVariables } from './keywords/variables';
import { collectPageIds } from './keywords/pages';
import { PrettyKMark } from './components/PrettyKMark';
import { Badge } from '@/components/ui/badge';
import { ShellAmbientVideo } from './shell/ShellAmbientVideo';
import { ThemeToggle } from './shell/ThemeToggle';
import { LogoutButton } from './shell/LogoutButton';
import { LanguageSwitcher } from './shell/LanguageSwitcher';
import { useThemeMode } from './theme/ThemeProvider';
import { useLocale } from './locales';
import { collectAllMonacoDiagnostics } from './monaco/penguinDiagnosticsGate';
import { readSession, capsForUser } from './shell/auth';
import { clampFormDataForRoleCaps, consumeRoleCapsThreat } from './utils/applyRoleCaps';
import { serializeCheckBuffer, type CheckCloseGuard } from './checks/closeGuard';
import {
  deleteCheck,
  deleteDraftCheck,
  getActiveCheckId,
  getCheck,
  saveCheckPrepared,
  updateCheck,
  upsertCheckRun,
} from './checks/checksStore';
import {
  scheduleDraftSave,
  flushDraft,
  restoreDraftIfNewer,
  markDraftClean,
  clearDraft,
} from './checks/draftPersistence';
import {
  scheduleRevisionedSave,
  flushDraftRevisioned,
  setDraftRevision,
  onDraftConflict,
  resolveConflict,
} from './checks/draftRevision';
import { consumePendingReplay, peekPendingReplay } from './checks/replayCheck';
import type { ResourceContentsMap } from './studio/resourceContents';
import { Studio } from './studio/Studio';
import { StudioWorkspace } from './studio/StudioWorkspace';
import { EditorWorkbench } from './workbench/EditorWorkbench';
import { PipelineLaunchButton } from './results/PipelineLaunchButton';
import { requestAwaitStart } from './results/awaitStartBus';
import {
  ResultsWorkspace,
  type DownloadActContext,
} from './results/ResultsWorkspace';
import { postRunStart } from './results/postRunStart';
import { buildMonitorUrl } from './results/monitorLink';
import { buildRunRecordFromLive } from './results/buildRunRecordFromLive';
import { buildBlankPayload } from './results/blankPayload';
import { downloadBlankHtml } from './results/blankHtml';
import { downloadWiredJson } from './app/appWiredDownload';
import { EditorViewSegmented } from './app/EditorViewSegmented';
import type { MonitorState } from './app/EditorViewSegmented';
import {
  scheduleDeferredEditorViewCommit,
  scheduleEditorViewPersist,
  withVisitedEditorView,
  shouldKeepEditorView,
  type EditorView,
} from './app/appEditorViews';
import { runConstructorPenguinGate } from './app/appConstructorPenguinGate';
import { runPipelineStart } from './app/appPipelineStart';
import { ensureValidOrFocusErrors } from './app/appEnsureValid';
import { bindPkGotoPage } from './app/appGotoPage';
import { scrollFirstFormErrorIntoView } from './app/appFormScroll';
import { attachFormNestedWheelBridge } from './app/appFormWheel';
import { readSecurityStrings } from './app/appSecurityContext';
import { renderBrandTitle } from './app/appBrandTitle';
import { editorViewHeaderTitle, validationButtonHint } from './app/appValidationChrome';
import {
  formSchemaErrorToast,
  wiredIssuesFeedback,
  pipelineRunAlreadyToast,
  pipelineRunFailedToast,
  pipelineRunPlaygroundDownToast,
  pipelineRunStartedToast,
  pipelineSchemaBlockedToast,
} from './app/appValidationFlow';
import type { wiredIssue } from './utils/wiredIssue';
import {
  ConstructorNoPenguin,
  type ValidationFeedback,
} from './components/ConstructorNoPenguin';
import { collectChainBindings } from './studio/chainModuleFields';
import validateWiredIcon from './assets/validate-wired-icon.png';
import validateWiredIconLight from './assets/validate-wired-icon-light.png';
import saveEntityIcon from './assets/icons/save-entity-icon.png';
import saveEntityIconLight from './assets/icons/save-entity-icon-light.png';
import saveEntityOkIcon from './assets/icons/save-entity-ok-icon.png';
import saveEntityOkIconLight from './assets/icons/save-entity-ok-icon-light.png';

const monaco = setupMonaco();
registerConstructorLanguageFeatures(monaco);
registerScriptLanguageFeatures(monaco);
setConstructorContext({ catalog: keywordCatalog, variables: [], pageIds: [] });

const VALIDATION_PASS_VISIBLE_MS = 2_000;
const SAVE_OK_FLASH_MS = 3_000;

function resolveSaveIconSrc(isLightTheme: boolean, saveOkFlash: boolean): string {
  if (saveOkFlash) return isLightTheme ? saveEntityOkIconLight : saveEntityOkIcon;
  return isLightTheme ? saveEntityIconLight : saveEntityIcon;
}

function resolveValidationResultIcon(
  validationStatus: string,
  validateIconSrc: string,
): ReactNode {
  if (validationStatus === 'pass')
    return <CheckCircleFilled className="pk-header-validation-result-icon" />;
  if (validationStatus === 'fail')
    return <CloseCircleFilled className="pk-header-validation-result-icon" />;
  return <img className="pk-header-validate-icon" src={validateIconSrc} alt="" />;
}

export type AppProps = {
  checkId: string;
  initialManifest: unknown;
  initialResources: ResourceContentsMap;
  initialView?: EditorView;
  onRegisterGuard?: (guard: CheckCloseGuard) => void;
  onViewChange?: (view: EditorView) => void;
  onRequestClose?: () => void;
  onBrandHome?: () => void;
  onCheckDeleted?: () => void;
  onLogout?: () => void;
};

export default function App({
  checkId,
  initialManifest,
  initialResources,
  initialView = 'studio',
  onRegisterGuard,
  onViewChange,
  onRequestClose,
  onBrandHome,
  onCheckDeleted,
  onLogout,
}: AppProps): React.JSX.Element {
  const { message } = AntdApp.useApp();
  const { mode: themeMode } = useThemeMode();
  const { dict } = useLocale();

  const openBaselineRef = useRef({
    wired: initialManifest,
    resources: { ...initialResources },
  });

  const [rawFormData, setRawFormData] = useState<unknown>(() =>
    clampFormDataForRoleCaps(initialManifest, capsForUser(readSession())),
  );

  const [showValidation, setShowValidation] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [validationStatus, setValidationStatus] = useState('default' as string);
  const [validationDrawer, setValidationDrawer] = useState<ValidationFeedback | undefined>();
  const [validationSuccessVersion, setValidationSuccessVersion] = useState(0);
  const [saveOkFlash, setSaveOkFlash] = useState(false);
  const [editorView, setEditorView] = useState<EditorView>(initialView);
  const [segmentView, setSegmentView] = useState<EditorView>(initialView);
  const [visitedViews, setVisitedViews] = useState<Set<EditorView>>(
    () => new Set([initialView]),
  );
  const [resourceContents, setResourceContents] = useState<ResourceContentsMap>(
    () => ({ ...initialResources }),
  );
  const formScrollRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef(editorView);
  const formDataRef = useRef(rawFormData);
  const resourceContentsRef = useRef(resourceContents);
  const validationStatusTimerRef = useRef<number | undefined>();
  const saveOkFlashTimerRef = useRef<number | undefined>();
  const viewCommitCancelRef = useRef<(() => void) | undefined>();
  editorViewRef.current = editorView;
  resourceContentsRef.current = resourceContents;

  const roleCaps = useMemo(() => capsForUser(readSession()), []);
  const [roleCapsThreat, setRoleCapsThreat] = useState<string | null>(
    () => consumeRoleCapsThreat(),
  );

  useEffect(() => {
    setRawFormData((prev: unknown) => {
      const next = clampFormDataForRoleCaps(prev, roleCaps);
      return next === prev ? prev : next;
    });
  }, [roleCaps]);

  formDataRef.current = rawFormData;

  // Parse legacy formData → typed Wired for WiredForm
  const parsedWired = useMemo<Wired | null>(() => {
    const result = parseWired(rawFormData);
    return result.ok ? result.wired : null;
  }, [rawFormData]);

  const variables = useMemo(() => collectVariables(rawFormData), [rawFormData]);
  const pageIds = useMemo(() => collectPageIds(rawFormData), [rawFormData]);
  const securityStrings = useMemo(() => readSecurityStrings(rawFormData), [rawFormData]);
  const { allowedExtraDomains, baseUrl } = securityStrings;

  const keywordsState = useMemo<KeywordsState>(
    () => ({
      catalog: keywordCatalog,
      variables,
      pageIds,
      allowedExtraDomains,
      baseUrl,
      monaco,
    }),
    [allowedExtraDomains, baseUrl, pageIds, variables],
  );

  useEffect(() => {
    setConstructorContext({
      catalog: keywordCatalog,
      variables,
      pageIds,
      formData: rawFormData,
    });
  }, [variables, pageIds, rawFormData]);

  useEffect(
    () =>
      bindPkGotoPage(
        () => formScrollRef.current,
        () => editorViewRef.current === 'studio',
      ),
    [],
  );

  // View navigation
  const goToView = useCallback((view: EditorView) => {
    setSegmentView(view);
    viewCommitCancelRef.current?.();
    viewCommitCancelRef.current = scheduleDeferredEditorViewCommit(() => {
      startTransition(() => {
        setEditorView(view);
        setVisitedViews((prev) => withVisitedEditorView(prev, view));
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      viewCommitCancelRef.current?.();
    };
  }, []);

  // Warm studio/results after mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisitedViews((prev) =>
        withVisitedEditorView(withVisitedEditorView(prev, 'studio'), 'results'),
      );
    }, 1200);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  // Validation status
  const resetValidationStatus = useCallback(() => {
    window.clearTimeout(validationStatusTimerRef.current);
    validationStatusTimerRef.current = undefined;
    setValidationStatus('default');
  }, []);

  const markValidationPassed = useCallback(() => {
    window.clearTimeout(validationStatusTimerRef.current);
    setValidationDrawer(undefined);
    setValidationSuccessVersion((v) => v + 1);
    setValidationStatus('pass');
    validationStatusTimerRef.current = window.setTimeout(() => {
      setValidationStatus('default');
      validationStatusTimerRef.current = undefined;
    }, VALIDATION_PASS_VISIBLE_MS);
  }, []);

  const markValidationFailed = useCallback((drawer: ValidationFeedback) => {
    window.clearTimeout(validationStatusTimerRef.current);
    setValidationStatus('fail');
    setValidationDrawer(drawer);
    validationStatusTimerRef.current = window.setTimeout(() => {
      setValidationStatus('default');
      validationStatusTimerRef.current = undefined;
    }, VALIDATION_PASS_VISIBLE_MS);
  }, []);

  const closeValidationDrawer = useCallback(() => {
    setValidationDrawer(undefined);
    resetValidationStatus();
  }, [resetValidationStatus]);

  useEffect(() => {
    return () => {
      window.clearTimeout(validationStatusTimerRef.current);
    };
  }, []);

  // Persist view changes
  useEffect(() => {
    onViewChange?.(editorView);
    return scheduleEditorViewPersist(() =>
      updateCheck(checkId, { view: editorView }),
    );
  }, [checkId, editorView, onViewChange]);

  // Debounced revisioned draft save to server (PK-WB-S2)
  useEffect(() => {
    scheduleRevisionedSave(checkId, rawFormData, resourceContents);
  }, [rawFormData, resourceContents, checkId]);

  // Debounced persist formData to checksStore (for registry updated_at + remote sync)
  const persistCheck = useCallback(
    (wired: unknown, resources: ResourceContentsMap) => {
      updateCheck(checkId, {
        wired,
        resource_contents: resources,
        view: editorViewRef.current,
      });
    },
    [checkId],
  );

  // Draft restore on mount — check server for newer draft (PK-WB-S1/S2)
  useEffect(() => {
    const item = getCheck(checkId);
    if (!item) return;
    restoreDraftIfNewer(checkId, item.updated_at)
      .then((draft) => {
        if (draft) {
          setRawFormData(
            clampFormDataForRoleCaps(draft.wired, roleCaps),
          );
          if (draft.resource_contents) {
            setResourceContents({ ...draft.resource_contents });
          }
          // Restore revision if server sent one (PK-WB-S2)
          if (typeof draft.meta?.revision === 'number') {
            setDraftRevision(checkId, draft.meta.revision);
          }
        } else {
          // Mark current state as clean baseline for draft tracking
          markDraftClean(checkId, rawFormData, resourceContents);
        }
      })
      .catch(() => {
        /* server offline — use local state */
        markDraftClean(checkId, rawFormData, resourceContents);
      });
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  // Conflict listener (PK-WB-S2)
  useEffect(() => {
    return onDraftConflict((conflict) => {
      if (conflict.checkId === checkId) {
        message.warning(
          `Черновик изменён в другой сессии. Следующее сохранение разрешит конфликт.`,
          5,
        );
      }
    });
  }, [checkId, message]);

  // Ctrl+S / explicit save
  const handleSaveEntity = useCallback(() => {
    const wired = formDataRef.current;
    const resources = resourceContentsRef.current;
    saveCheckPrepared(checkId, {
      wired,
      resource_contents: resources,
      view: editorViewRef.current,
    });
    // Flush revisioned draft to server immediately + mark clean (PK-WB-S2)
    void flushDraftRevisioned(checkId, wired, resources).then((result) => {
      if (result.ok) {
        markDraftClean(checkId, wired, resources);
        // ER-5: only flash "saved" after the server confirms — never on conflict.
        window.clearTimeout(saveOkFlashTimerRef.current);
        setSaveOkFlash(true);
        saveOkFlashTimerRef.current = window.setTimeout(() => {
          setSaveOkFlash(false);
          saveOkFlashTimerRef.current = undefined;
        }, SAVE_OK_FLASH_MS);
      }
      // result.ok === false → conflict; onDraftConflict listener already warns.
    });
    openBaselineRef.current = {
      wired,
      resources: { ...resources },
    };
  }, [checkId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveOkFlashTimerRef.current);
    };
  }, []);

  // Dirty guard — AppShell
  useEffect(() => {
    const guard: CheckCloseGuard = {
      isDirty: () => {
        const open = openBaselineRef.current;
        return (
          serializeCheckBuffer(
            formDataRef.current,
            resourceContentsRef.current,
          ) !== serializeCheckBuffer(open.wired, open.resources)
        );
      },
      save: () => {
        persistCheck(
          formDataRef.current,
          resourceContentsRef.current,
        );
        openBaselineRef.current = {
          wired: formDataRef.current,
          resources: { ...resourceContentsRef.current },
        };
      },
      discard: () => {
        const deleted = deleteDraftCheck(checkId);
        if (deleted) return { deleted: true };
        const open = openBaselineRef.current;
        const restored = clampFormDataForRoleCaps(open.wired, roleCaps);
        setRawFormData(restored);
        setResourceContents({ ...open.resources });
        persistCheck(restored, open.resources);
        return { deleted: false };
      },
    };
    onRegisterGuard?.(guard);
  }, [checkId, onRegisterGuard, persistCheck, roleCaps]);

  // WiredForm → merge regulation back to legacy formData
  const handleWiredChange = useCallback(
    (next: Wired) => {
      setRawFormData((prev: unknown) => {
        const merged = mergeRegulationToLegacy(next, prev);
        return clampFormDataForRoleCaps(merged, roleCaps);
      });
    },
    [roleCaps],
  );

  const setFormDataClamped = useCallback(
    (next: unknown) =>
      setRawFormData(clampFormDataForRoleCaps(next, roleCaps)),
    [roleCaps],
  );

  // Constructor penguin gate
  const gateConstructorsOrPenguin = useCallback(
    async (data: unknown = rawFormData): Promise<boolean> => {
      const diags = collectAllMonacoDiagnostics(monaco);
      if (diags.length > 0) {
        markValidationFailed({
          title: 'Ошибки в редакторе',
          description: 'Исправьте ошибки синтаксиса или безопасности перед проверкой.',
          errorCount: diags.length,
          samples: diags.slice(0, 5).map((d) => `Строка ${d.line}: ${d.message}`),
          samplesHint: 'Проверьте подчёркнутые строки в редакторе',
        });
        void message.error('В редакторе есть ошибки синтаксиса или безопасности.');
        return false;
      }
      return runConstructorPenguinGate(data, keywordCatalog, markValidationFailed);
    },
    [rawFormData, markValidationFailed, message],
  );

  // Schema validation — no RJSF, always empty
  const runValidation = useCallback((): wiredIssue[] => {
    const errors = validateWiredFields(rawFormData as Record<string, unknown>);
    setFieldErrors(errors);
    if (errors.length === 0) return [];
    return errors.map((e) => ({
      path: e.path,
      breadcrumb: e.path.replace(/_/g, ' '),
      message: e.message,
      keyword: 'required',
    }));
  }, [rawFormData]);

  // Validate + constructor gate
  const handleValidatePreview = useCallback(() => {
    void (async () => {
      resetValidationStatus();
      setValidationDrawer(undefined);
      if (!(await gateConstructorsOrPenguin())) return;
      markValidationPassed();
      void message.success('Проверка валидна.');
    })();
  }, [gateConstructorsOrPenguin, markValidationPassed, message, resetValidationStatus]);

  const ensureValidOrFocusErrorsFn = useCallback(
    (): Promise<boolean> =>
      ensureValidOrFocusErrors({
        gateConstructorsOrPenguin,
        runValidation,
        isStudioView: () => editorViewRef.current === 'studio',
        switchToForm: () => {},  // PURE: form view dead, stay in studio
        setShowValidation,
        scrollFormErrors: () =>
          scrollFirstFormErrorIntoView(formScrollRef.current, 50),
        markValidationFailed,
        schemaFeedback: (issues) =>
          wiredIssuesFeedback(
            issues,
            'В главной форме не заполнены обязательные поля.',
          ),
        onSchemaError: (issues) => {
          void message.error(formSchemaErrorToast(issues));
        },
      }),
    [gateConstructorsOrPenguin, goToView, markValidationFailed, message],
  );

  // Download wired JSON
  const handleDownload = useCallback(() => {
    void (async () => {
      if (!(await ensureValidOrFocusErrorsFn())) return;
      downloadWiredJson(rawFormData);
      void message.success('wired.json сохранён');
    })();
  }, [ensureValidOrFocusErrorsFn, rawFormData, message]);

  // Download act
  const handleDownloadAct = useCallback(
    (ctx: DownloadActContext) => {
      void (async () => {
        if (!(await ensureValidOrFocusErrorsFn())) return;
        const { fetchLiveRunSummary } = await import(
          './results/fetchLiveRunSummary'
        );
        const orchestratorSummary = await fetchLiveRunSummary();
        const run = buildRunRecordFromLive({
          meta: ctx.meta,
          hooks: ctx.hooks,
          orchestratorSummary,
        });
        const payload = buildBlankPayload({
          kind: 'act',
          formData: rawFormData,
          run,
        });
        downloadBlankHtml(payload, 'act.html');
        void message.success('Акт проверки сохранён (HTML, секреты redact)');
      })();
    },
    [ensureValidOrFocusErrorsFn, rawFormData, message],
  );

  const handleSavePackage = useCallback(() => {
    void (async () => {
      const { downloadRunPackage } = await import(
        './results/downloadRunPackage'
      );
      const result = await downloadRunPackage();
      if (result.ok) {
        void message.success(`Пакет сохранён: ${result.filename}`);
        return;
      }
      void message.error(result.error);
    })();
  }, [message]);

  // Pipeline start
  const [pipelineStarting, setPipelineStarting] = useState(false);

  const handlePipelineStart = useCallback(() => {
    void runPipelineStart({
      pipelineStarting,
      setPipelineStarting,
      gateConstructorsOrPenguin,
      runValidation,
      isCheckEmpty: () => {
        const root = formDataRef.current as Record<string, unknown> | null;
        const suites = root?.test_suites as Record<string, unknown> | undefined;
        const scenarios = Array.isArray(suites?.scenarios) ? suites!.scenarios : [];
        const hasNonEmptyScenario = scenarios.some((sc) => {
          const scObj = sc as Record<string, unknown>;
          const steps = Array.isArray(scObj.steps) ? scObj.steps : [];
          return steps.some((st) => {
            const ctor = (st as Record<string, unknown>)['constructor'];
            return typeof ctor === 'string' && ctor.trim().length > 0;
          });
        });
        const pages = suites?.pages as Record<string, unknown> | undefined;
        const hasNonEmptyPage = pages
          ? Object.values(pages).some((p) => {
              const ctor = (p as Record<string, unknown>)['constructor'];
              return typeof ctor === 'string' && ctor.trim().length > 0;
            })
          : false;
        const fuzzers = Array.isArray(suites?.fuzzers) ? suites!.fuzzers : [];
        return !hasNonEmptyScenario && !hasNonEmptyPage && fuzzers.length === 0;
      },
      onCheckEmpty: () => {
        void message.info('Заполните сценарий');
      },
      isStudioView: () => editorViewRef.current === 'studio',
      switchToForm: () => {},  // PURE: form view dead, stay in studio
      markValidationFailed,
      markValidationPassed,
      getFormData: () => formDataRef.current,
      startRun: (formData) =>
        postRunStart(
          formData,
          undefined,
          { ...resourceContentsRef.current },
          collectChainBindings(formData),
          checkId,
        ),
      switchToResults: () => goToView('results'),
      onBeginAwaitStart: () => requestAwaitStart(),
      onSchemaBlocked: () => {
        void message.error(pipelineSchemaBlockedToast());
      },
      onRunStarted: (runId, monitorToken) => {
        const activeId = getActiveCheckId();
        if (activeId) {
          upsertCheckRun(activeId, {
            run_id: runId,
            started_at: new Date().toISOString(),
            status: 'running',
            monitor_token: monitorToken,
          });
        }
        void message.success(pipelineRunStartedToast(runId));
      },
      onRunBlocked: (result) => {
        if (result.alreadyRunning) {
          void message.warning(pipelineRunAlreadyToast());
          return;
        }
        if (result.unreachable) {
          void message.warning(pipelineRunPlaygroundDownToast());
          return;
        }
        void message.error(pipelineRunFailedToast(result.error));
      },
      schemaFeedback: (issues) =>
        wiredIssuesFeedback(
          issues,
          'Исправьте форму перед запуском пайплайна.',
        ),
    });
  }, [
    gateConstructorsOrPenguin,
    goToView,
    markValidationFailed,
    markValidationPassed,
    message,
    pipelineStarting,
    runValidation,
  ]);

  // Delete check
  const handleDeleteCheck = useCallback(() => {
    Modal.confirm({
      title: 'Удалить проверку?',
      content: 'Проверка исчезнет из истории. Это нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => {
        deleteCheck(checkId);
        void message.success('Проверка удалена');
        onCheckDeleted?.();
      },
    });
  }, [checkId, message, onCheckDeleted]);

  // Monitor — открыть Live `?run_id=&token=` для текущего инстанса
  const handleOpenMonitor = useCallback(() => {
    const monitorUrl = buildMonitorUrl(checkId);
    window.open(monitorUrl, '_blank', 'noopener,noreferrer');
  }, [checkId]);

  // Monitor indicator state (серый → зелёный пульс → зелёный static)
  const [monitorState, setMonitorState] = useState<MonitorState>(() => {
    const instance = getCheck(checkId);
    const runs = instance?.runs ?? [];
    return runs.some((r) => r.status === 'running')
      ? 'running'
      : runs.length > 0
        ? 'done'
        : 'idle';
  });

  useEffect(() => {
    const refresh = () => {
      const instance = getCheck(checkId);
      const runs = instance?.runs ?? [];
      setMonitorState(
        runs.some((r) => r.status === 'running')
          ? 'running'
          : runs.length > 0
            ? 'done'
            : 'idle',
      );
    };
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [checkId]);

  // Replay from History — one-shot pipeline start after check open
  useEffect(() => {
    const pending = peekPendingReplay();
    if (!pending || pending !== checkId) return;
    consumePendingReplay();
    const t = window.setTimeout(() => {
      handlePipelineStart();
    }, 120);
    return () => window.clearTimeout(t);
  }, [checkId, handlePipelineStart]);

  // Ctrl/Cmd+S → explicit save
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isModS =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.code === 'KeyS' || event.key.toLowerCase() === 's');
      if (!isModS) return;
      event.preventDefault();
      handleSaveEntity();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleSaveEntity]);

  // Nested wheel → form column scroll bridge
  useEffect(() => {
    if (editorView !== 'form') return;
    const root = formScrollRef.current;
    if (!root) return;
    return attachFormNestedWheelBridge(root);
  }, [editorView]);

  // Header chrome
  const isLightTheme = themeMode === 'light';
  const validateIconSrc = isLightTheme
    ? validateWiredIconLight
    : validateWiredIcon;
  const saveIconSrc = resolveSaveIconSrc(isLightTheme, saveOkFlash);
  const validationButtonIcon = resolveValidationResultIcon(
    validationStatus,
    validateIconSrc,
  );
  const validationButtonHintText = validationButtonHint(validationStatus);
  const headerTitle = editorViewHeaderTitle(segmentView);
  const assessmentPurpose = (
    rawFormData as { meta?: { assessment_purpose?: string } } | null
  )?.meta?.assessment_purpose;
  const editorMuted = assessmentPurpose === 'manual';

  const goBrandHome =
    onBrandHome ??
    (() => {
      window.location.hash = '#/home';
    });
  const brandTitleNode = renderBrandTitle(
    headerTitle ?? undefined,
    // Кликабельный заголовок только в studio (вернуться на главную);
    // в form/results — невыделяемый текст (renderBrandTitle рендерит Typography.Text без onClick).
    segmentView === 'studio' ? goBrandHome : undefined,
  );

  return (
    <KeywordsContext.Provider value={keywordsState}>
      <div className="flex flex-col h-screen overflow-hidden pk-check-page">
        <ShellAmbientVideo />
        <header className={segmentView === 'studio' ? 'pk-header pk-header--studio' : 'pk-header'}>
          <div className="pk-brand">
            <div
              className={
                segmentView === 'studio'
                  ? 'pk-brand-row pk-brand-row--check pk-brand-row--studio'
                  : 'pk-brand-row pk-brand-row--check'
              }
            >
              <PrettyKMark
                variant={segmentView === 'studio' ? 'editor' : 'secops'}
                onClick={goBrandHome}
              />
              {brandTitleNode}
              {(segmentView === 'studio-old' || segmentView === 'editor-old') && (
                <Badge
                  variant="amber"
                  className="pk-legacy-header-badge select-none"
                  data-testid="legacy-header-badge"
                >
                  LEGACY · REFERENCE
                </Badge>
              )}
            </div>
          </div>
          <div className="pk-header-actions">
            <div className="pk-header-entity-actions">
              {segmentView === 'studio' || segmentView === 'editor' ? (
                <>
                  <Button
                    type="text"
                    className={`pk-header-validate pk-header-validate--${validationStatus}`}
                    aria-label={validationButtonHintText}
                    data-testid="entity-validate"
                    onClick={handleValidatePreview}
                    icon={validationButtonIcon}
                  />
                  <PipelineLaunchButton
                    onStart={handlePipelineStart}
                    starting={pipelineStarting}
                  />
                </>
              ) : null}
              <Button
                type="text"
                className="pk-header-save"
                aria-label="Сохранить"
                data-testid="entity-save"
                onClick={handleSaveEntity}
                icon={
                  <img
                    className="pk-header-save-icon"
                    src={saveIconSrc}
                    alt=""
                  />
                }
              />
            </div>
            <EditorViewSegmented
              value={segmentView}
              studioDisabled={editorMuted}
              onChange={goToView}
              onMonitorClick={handleOpenMonitor}
              monitorState={monitorState}
            />
            {/* Скачать проверку скрыт, но доступен программно при необходимости */}
            <Tooltip title="Провести валидацию и сохранить проверку">
              <Button
                type="primary"
                size="small"
                className="pk-header-download"
                style={{ display: 'none' }}
                onClick={handleDownload}
              >
                Скачать проверку
              </Button>
            </Tooltip>
            {/* Переключалка темы выпилена (to evolve) */}
            <LanguageSwitcher />
            {onLogout ? <LogoutButton onClick={onLogout} /> : null}
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col pk-view-host">
          {/* ── Регламент ── */}
          {shouldKeepEditorView('form', editorView, visitedViews) ? (
            <div
              className="flex-1 flex flex-col min-h-0 pk-content pk-content--portal pk-form-page pk-view-pane"
              hidden={editorView !== 'form'}
              aria-hidden={editorView !== 'form'}
            >
              <section className="pk-form-column">
                <div className="pk-shell-glass-wrap pk-form-glass-wrap">
                  <div className="pk-shell-panel pk-shell-glass-panel pk-form-glass-panel">
                    <div
                      className={
                        showValidation
                          ? 'pk-form-scroll pk-show-errors'
                          : 'pk-form-scroll'
                      }
                      ref={formScrollRef}
                    >
                      {roleCapsThreat ? (
                        <Alert
                          type="warning"
                          showIcon
                          closable
                          className="pk-role-caps-threat"
                          data-testid="role-caps-threat"
                          style={{ marginBottom: 12, borderRadius: 6 }}
                          message="Ограничение роли"
                          description={roleCapsThreat}
                          onClose={() => setRoleCapsThreat(null)}
                        />
                      ) : null}
                      {parsedWired ? (
                        <WiredForm
                          wired={parsedWired}
                          onChange={handleWiredChange}
                          fieldErrors={fieldErrors}
                        />
                      ) : (
                        <Alert
                          type="error"
                          message="Не удалось разобрать манифест"
                        />
                      )}
                      {validationDrawer && editorView === 'form' ? (
                        <ConstructorNoPenguin
                          {...validationDrawer}
                          onClose={closeValidationDrawer}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {/* ── Студия (новая, каноническая) ── */}
          {shouldKeepEditorView('studio', editorView, visitedViews) ? (
            <div
              className="pk-studio pk-view-pane"
              hidden={editorView !== 'studio'}
              aria-hidden={editorView !== 'studio'}
            >
              <Studio
                checkId={checkId}
                formData={rawFormData}
                onFormDataChange={setFormDataClamped}
                resourceContents={resourceContents}
                onResourceContentsChange={setResourceContents}
                onNavigateEditor={() => goToView('editor')}
              />
            </div>
          ) : null}

          {/* ── Редактор (новый, инженерная проекция) ── */}
          {shouldKeepEditorView('editor', editorView, visitedViews) ? (
            <div
              className="pk-studio pk-view-pane"
              hidden={editorView !== 'editor'}
              aria-hidden={editorView !== 'editor'}
            >
              <EditorWorkbench
                formData={rawFormData}
                onFormDataChange={setFormDataClamped}
                resourceContents={resourceContents}
                onResourceContentsChange={setResourceContents}
                onCmdSave={handleSaveEntity}
                onCmdRun={handlePipelineStart}
                onCmdValidate={handleValidatePreview}
                checkId={checkId}
              />
            </div>
          ) : null}

          {/* ── Старая Studio (reference) ── */}
          {shouldKeepEditorView('studio-old', editorView, visitedViews) ? (
            <div
              className="pk-studio pk-view-pane"
              hidden={editorView !== 'studio-old'}
              aria-hidden={editorView !== 'studio-old'}
            >
              <div className="pk-legacy-banner" role="note" data-testid="legacy-banner-studio-old">
                <span className="pk-legacy-banner-label">LEGACY · REFERENCE</span>
                <span className="pk-legacy-banner-hint">
                  Старая Студия — только для сверки. Работайте в новой Студии.
                </span>
              </div>
              <StudioWorkspace
                formData={rawFormData}
                onFormDataChange={setFormDataClamped}
                resourceContents={resourceContents}
                onResourceContentsChange={setResourceContents}
                validationFeedback={
                  editorView === 'studio-old' ? validationDrawer : undefined
                }
                validationSuccessVersion={validationSuccessVersion}
                onCloseValidationFeedback={closeValidationDrawer}
                onCmdValidate={handleValidatePreview}
                onCmdBaseline={handlePipelineStart}
                studioMode="front"
              />
            </div>
          ) : null}

          {/* ── Старый Editor (reference) ── */}
          {shouldKeepEditorView('editor-old', editorView, visitedViews) ? (
            <div
              className="pk-studio pk-view-pane"
              hidden={editorView !== 'editor-old'}
              aria-hidden={editorView !== 'editor-old'}
            >
              <div className="pk-legacy-banner" role="note" data-testid="legacy-banner-editor-old">
                <span className="pk-legacy-banner-label">LEGACY · REFERENCE</span>
                <span className="pk-legacy-banner-hint">
                  Старый Редактор — только для сверки. Работайте в новом Редакторе.
                </span>
              </div>
              <StudioWorkspace
                formData={rawFormData}
                onFormDataChange={setFormDataClamped}
                resourceContents={resourceContents}
                onResourceContentsChange={setResourceContents}
                validationFeedback={
                  editorView === 'editor-old' ? validationDrawer : undefined
                }
                validationSuccessVersion={validationSuccessVersion}
                onCloseValidationFeedback={closeValidationDrawer}
                onCmdValidate={handleValidatePreview}
                onCmdBaseline={handlePipelineStart}
                studioMode="editor"
              />
            </div>
          ) : null}

          {/* ── Результаты ── */}
          {shouldKeepEditorView('results', editorView, visitedViews) ? (
            <div
              className="pk-results-content pk-view-pane"
              hidden={editorView !== 'results'}
              aria-hidden={editorView !== 'results'}
            >
              <div className="pk-results-atmosphere" aria-hidden />
              <ResultsWorkspace
                onDownloadAct={handleDownloadAct}
                onSavePackage={handleSavePackage}
                onLaunch={handlePipelineStart}
                launchStarting={pipelineStarting}
                monitorUrl={buildMonitorUrl(checkId)}
                formData={rawFormData}
              />
            </div>
          ) : null}
        </div>
      </div>
    </KeywordsContext.Provider>
  );
}
