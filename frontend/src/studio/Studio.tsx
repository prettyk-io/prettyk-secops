"use client";
/**
 * Studio — каноническая рабочая поверхность проверки (ранее StudioV2).
 *
 * B1 — привязка к CheckInstance: checkId + initialManifest(legacy formData) + initialResources.
 * B2/B3 — живой Explorer (StudioExplorer = каноническое дерево 6 корней) + CRUD/drag-drop.
 * B4 — полноценный конструктор PrettyK (Monaco, autocomplete, диагностика, gutter-run).
 * B5 — честная валидация: локальная + серверная диагностика, нет фантомов, незавершённое ≠ зелёное.
 * B6 — пошаговый отладчик (gutter-run → /api/run/step) + цепочка доказательств (CommitDiffView, секреты скрыты).
 * B7 — живая консоль (реальный run_summary, честная пустота без прогона).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Code2, Monitor, PanelBottom, ChevronDown, Inbox, CheckCircle2, AlertCircle,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Canvas } from "./Canvas";
import { BrowserPanel } from "./BrowserPanel";
import { updateCheck } from "../checks/checksStore";
import { saveResourceContents, type ResourceContentsMap } from "./resourceContents";
import { collectStudioNodes, findNodeByTabId, tabFromNode } from "./collectStudioNodes";
import type { StudioTabId } from "./studioTabs";
// ── B4: полноценный конструктор (PrettyK Monaco, gutter-run, diagnostics) ──
import { setupMonaco, DARK_THEME_ID } from "../monaco/setup";
import {
  registerConstructorLanguageFeatures,
  setConstructorContext,
  applyDiagnostics,
} from "../monaco/constructorLanguage";
import { registerScriptLanguageFeatures } from "../monaco/scriptLanguage";
import { CONSTRUCTOR_EDITOR_OPTIONS } from "../monaco/editorOptions";
import { bindRunGutter, type RunGutterCallbacks } from "../monaco/runGutter";
import { keywordCatalog } from "../keywords/catalog";
import { collectVariables } from "../keywords/variables";
import { collectPageIds } from "../keywords/pages";
import {
  dslTabForStudioTabId,
  firstDslTab,
  readConstructorText,
  writeConstructorText,
  type DslTabRef,
} from "../wired/wiredDslCodec";
import { studioTabWireDiagnostics } from "./studioDiagnostics";
import type { ConstructorDiagnostic } from "../keywords/constructor";
// ── B5: валидация (локальная + серверная) ──
import { validateWiredFields } from "../wired/validateWiredFields";
import { mergeConstructorDiagnostics } from "../monaco/constructorDiagnosticsMerge";
import { VALIDATE_CONSTRUCTOR_COMMAND_ID } from "../monaco/scenarioValidateCodeLens";
import { validateConstructorBackend } from "../api/editorValidate";
// ── B7: живая консоль ──
import { LIVE_RUN_SUMMARY_URL } from "../api/apiBase";

// Monaco инициализируется один раз на модуль (B4): язык prettyk, темы, воркеры.
const monaco = setupMonaco();
registerConstructorLanguageFeatures(monaco);
registerScriptLanguageFeatures(monaco);

type RightTab = "code" | "browser";

export interface StudioProps {
  /** Привязка к конкретной проверке (B1). undefined → честное пустое. */
  checkId?: string;
  /** Legacy formData проверки (item.wired) — для standalone mode. */
  initialManifest?: unknown;
  /** Содержимое ресурсов проверки — для standalone mode. */
  initialResources?: ResourceContentsMap;
  /** Controlled mode (App.tsx single source): formData от родителя. */
  formData?: unknown;
  onFormDataChange?: (next: unknown) => void;
  resourceContents?: ResourceContentsMap;
  onResourceContentsChange?: (next: ResourceContentsMap) => void;
  /** Переход в Editor той же проверки (B2) — без hash, через goToView. */
  onNavigateEditor?: () => void;
}

export function Studio({
  checkId,
  initialManifest,
  initialResources,
  formData: controlledFormData,
  onFormDataChange: controlledOnFormDataChange,
  resourceContents: controlledResourceContents,
  onResourceContentsChange: controlledOnResourceContentsChange,
  onNavigateEditor,
}: StudioProps) {
  const controlled =
    controlledFormData !== undefined && controlledOnFormDataChange !== undefined;

  const [bottomOpen, setBottomOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("code");

  // ── B1: standalone fallback — локальный formData, привязан к ЭТОЙ проверке ──
  const [selfFormData, setSelfFormData] = useState<unknown>(initialManifest);
  const [selfResources, setSelfResources] = useState<ResourceContentsMap>(
    initialResources ?? {},
  );
  // Единый источник: controlled (App.tsx) или self-state (standalone).
  const formData = controlled ? controlledFormData : selfFormData;
  const resourceContents = controlled ? (controlledResourceContents ?? {}) : selfResources;
  // Выбранная сущность дерева (StudioTabId) — для highlight + открытия документа
  const [selectedTabId, setSelectedTabId] = useState<StudioTabId | undefined>(undefined);

  // При смене checkId (другая проверка, standalone) — перезагружаем её данные, НЕ оставляем чужое.
  useEffect(() => {
    setSelfFormData(initialManifest);
    setSelfResources(initialResources ?? {});
    setSelectedTabId(undefined);
  }, [checkId, initialManifest, initialResources]);

  // ── B4: живой контекст конструктора (каталог/переменные/страницы) для подсказок ──
  useEffect(() => {
    setConstructorContext({
      catalog: keywordCatalog,
      variables: collectVariables(formData),
      pageIds: collectPageIds(formData),
      formData,
    });
  }, [formData]);

  // ── B1: persist — дерево правит formData → пишем обратно в CheckInstance ──
  const handleFormDataChange = useCallback(
    (next: unknown) => {
      if (controlled) {
        controlledOnFormDataChange?.(next);
        return;
      }
      setSelfFormData(next);
      if (checkId) {
        updateCheck(checkId, { wired: next });
      }
    },
    [controlled, controlledOnFormDataChange, checkId],
  );

  const handleResourceContentsChange = useCallback(
    (next: ResourceContentsMap) => {
      if (controlled) {
        controlledOnResourceContentsChange?.(next);
        return;
      }
      setSelfResources(next);
      saveResourceContents(next);
      if (checkId) {
        updateCheck(checkId, { resource_contents: next });
      }
    },
    [controlled, controlledOnResourceContentsChange, checkId],
  );

  // ── B1: честное пустое состояние (нет проверки И нет манифеста) ──
  const hasCheck = Boolean(checkId) || formData !== undefined;
  if (!hasCheck) {
    return (
      <div className="dark flex-1 flex flex-col items-center justify-center min-h-0" style={{ background: "#09090b" }}>
        <Inbox className="size-12" style={{ color: "#334155" }} />
        <p className="text-sm font-semibold mt-3" style={{ color: "#64748b", fontFamily: "Golos UI, sans-serif" }}>
          Проверка не выбрана
        </p>
        <p className="text-xs mt-1" style={{ color: "#475569", fontFamily: "Golos UI, sans-serif" }}>
          Откройте проверку из истории, чтобы начать работу в Studio
        </p>
      </div>
    );
  }

  // ── Реальные счётчики для canvas-узлов (B2: дерево = данные, не литералы) ──
  const tree = useMemo(() => collectStudioNodes(formData), [formData]);

  return (
    <div className="dark flex-1 flex flex-col overflow-hidden min-h-0" style={{ background: "#09090b" }}>
      {/* Глобальный header (бренд + переключение Студия/Редактор) — в App.tsx.
          Здесь — только навигация canvas: Сущности / Сценарии. */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ borderRight: "1px solid #1e293b" }}>
          <Canvas counts={{
            pages: tree.pages.length,
            scenarios: tree.scenarios.length,
            modules: tree.modules.length,
            fuzzers: tree.fuzzers.length,
            resources: tree.resources.length,
          }} />
        </div>
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ background: "#0f172a", width: 380 }}>
          <div className="flex items-center h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
            <TabBtn active={rightTab==="code"} onClick={()=>setRightTab("code")} icon={<Code2 className="size-3"/>} label="Код"/>
            <TabBtn active={rightTab==="browser"} onClick={()=>setRightTab("browser")} icon={<Monitor className="size-3"/>} label="Браузер"/>
            <div className="flex-1"/>
            <Button variant="ghost" size="icon" className="size-7" onClick={()=>setBottomOpen(v=>!v)}><PanelBottom className="size-3.5"/></Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab==="code" && <CodePanel formData={formData} onFormDataChange={handleFormDataChange} selectedTabId={selectedTabId} />}
            {rightTab==="browser" && <BrowserPanel />}
          </div>
        </div>
      </div>
      {bottomOpen && <div className="h-48 shrink-0 flex flex-col overflow-hidden" style={{ background: "#0f172a", borderTop: "1px solid #1e293b" }}>
        <div className="flex items-center justify-between px-3 h-8 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#64748b" }}>Консоль</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={()=>setBottomOpen(false)}><ChevronDown className="size-3"/></Button>
        </div>
        <ConsolePanel />
      </div>}
    </div>);
}

/** Активный DSL-таб для редактора кода: выбранная сущность, иначе первая. */
function activeDslTab(formData: unknown, selectedTabId?: StudioTabId): DslTabRef | null {
  if (selectedTabId) {
    const d = dslTabForStudioTabId(formData, selectedTabId);
    if (d) return d;
  }
  return firstDslTab(formData);
}

interface CodePanelProps {
  formData: unknown;
  onFormDataChange: (next: unknown) => void;
  selectedTabId?: StudioTabId;
}

/** B4+B5+B6: полноценный конструктор PrettyK — autocomplete, диагностика (локальная+серверная), gutter-run, LED-статус. */
function CodePanel({ formData, onFormDataChange, selectedTabId }: CodePanelProps) {
  const tree = useMemo(() => collectStudioNodes(formData), [formData]);

  // Monaco-редактируемая сущность: выбранная (если есть DSL), иначе первая доступная.
  const dslTab = useMemo(() => activeDslTab(formData, selectedTabId), [formData, selectedTabId]);

  // StudioTab для диагностики — по studioTabId DSL-таба (kind/language/path).
  const studioTab = useMemo(() => {
    if (!dslTab?.studioTabId) return undefined;
    const node = findNodeByTabId(tree, dslTab.studioTabId);
    return node ? tabFromNode(node) : undefined;
  }, [tree, dslTab]);

  const text = dslTab ? readConstructorText(formData, dslTab.path) : '';

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  // ── B5: локальная диагностика (analyzeConstructor) ──
  const localDiags = useMemo<ConstructorDiagnostic[]>(
    () =>
      studioTab
        ? studioTabWireDiagnostics(formData, studioTab, text, keywordCatalog, collectVariables(formData))
        : [],
    [formData, studioTab, text],
  );

  // ── B5: полевая валидация (base_url_override и т.д.) ──
  const fieldErrors = useMemo(() => validateWiredFields(formData), [formData]);

  // ── B5: серверная диагностика (debounced; null = API недоступен → остаёмся на клиенте) ──
  const [backendDiags, setBackendDiags] = useState<ConstructorDiagnostic[] | null>(null);
  useEffect(() => {
    if (!dslTab || !studioTab || studioTab.kind !== 'constructor') {
      setBackendDiags(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      validateConstructorBackend(readConstructorText(formData, dslTab.path)).then((res) => {
        if (!cancelled) setBackendDiags(res);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData, dslTab, studioTab]);

  const merged = useMemo(
    () => mergeConstructorDiagnostics(localDiags, backendDiags),
    [localDiags, backendDiags],
  );
  const errCount = merged.filter((d) => d.severity === 'error').length;
  const warnCount = merged.filter((d) => d.severity === 'warning').length;

  // ── B6: пошаговый отладчик (gutter-run → /api/run/step) ──
  const [debug, setDebug] = useState<{ line: number; ok: boolean; error?: string } | null>(null);

  const handleRunStep: RunGutterCallbacks['onRunStep'] = useCallback(
    (lineNumber) => {
      if (!dslTab) return;
      const line = (readConstructorText(formData, dslTab.path).split('\n')[lineNumber - 1] ?? '').trim();
      if (!line) return;
      setDebug({ line: lineNumber, ok: false, error: '…' });
      fetch('/api/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constructor: line, step_id: `line-${lineNumber}` }),
      })
        .then((r) => r.json())
        .then((res: { ok?: boolean; error?: string }) =>
          setDebug({ line: lineNumber, ok: Boolean(res.ok), error: res.ok ? undefined : res.error ?? 'шаг не выполнен' }),
        )
        .catch(() => setDebug({ line: lineNumber, ok: false, error: 'API недоступен' }));
    },
    [formData, dslTab],
  );

  const applyMarkers = useCallback(
    (instance: editor.IStandaloneCodeEditor) => {
      const model = instance.getModel();
      if (model) applyDiagnostics(monaco, model, merged);
    },
    [merged],
  );

  // ── CodeLens 2.0: «Проверить конструктор» — слушаем команду из Monaco ──
  useEffect(() => {
    const handler = () => {
      if (!dslTab) return;
      const constructorText = readConstructorText(formData, dslTab.path);
      validateConstructorBackend(constructorText).then((result) => {
        const instance = editorRef.current;
        if (!instance) return;
        const model = instance.getModel();
        if (!model) return;
        applyDiagnostics(monaco, model, mergeConstructorDiagnostics(localDiags, result));
      });
    };
    window.addEventListener(VALIDATE_CONSTRUCTOR_COMMAND_ID, handler);
    return () => window.removeEventListener(VALIDATE_CONSTRUCTOR_COMMAND_ID, handler);
  }, [dslTab, formData, localDiags, merged]);

  const handleMount = useCallback(
    (instance: editor.IStandaloneCodeEditor) => {
      editorRef.current = instance;
      applyMarkers(instance);
      bindRunGutter(instance, monaco, { onRunStep: handleRunStep });
    },
    [applyMarkers, handleRunStep],
  );

  // Живое обновление маркеров при изменении merged (B5: нет фантомов — только реальные).
  useEffect(() => {
    if (editorRef.current) applyMarkers(editorRef.current);
  }, [applyMarkers]);

  if (!dslTab) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
          <Code2 className="size-3.5 mr-1.5" style={{ color: "#38bdf8" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>PrettyK DSL</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-3">
          <span className="text-xs" style={{ color: "#475569" }}>Нет редактируемых сущностей</span>
        </div>
      </div>
    );
  }

  // ── B5: честный статус валидации (незавершённое ≠ зелёное) ──
  let badge: ReactNode;
  if (errCount > 0) {
    badge = <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#ef4444" }}><AlertCircle className="size-3" />{errCount} ошиб.</span>;
  } else if (fieldErrors.length > 0) {
    badge = <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#ef4444" }}><AlertCircle className="size-3" />{fieldErrors[0]!.message}</span>;
  } else if (warnCount > 0) {
    badge = <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#f59e0b" }}><AlertCircle className="size-3" />{warnCount} предупр.</span>;
  } else if (text.trim() === '') {
    badge = <span className="text-[10px] font-semibold" style={{ color: "#475569" }}>пустой</span>;
  } else {
    badge = <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#22c55e" }}><CheckCircle2 className="size-3" />Чисто</span>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
        <Code2 className="size-3.5 mr-1.5" style={{ color: "#38bdf8" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>PrettyK DSL</span>
        <span className="ml-2 text-xs truncate flex-1" style={{ color: "#e2e8f0", fontFamily: "Golos UI, sans-serif" }}>{dslTab.label}</span>
        {badge}
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          key={dslTab.path}
          height="100%"
          language="prettyk"
          value={text}
          theme={DARK_THEME_ID}
          options={CONSTRUCTOR_EDITOR_OPTIONS}
          onMount={handleMount}
          onChange={(v) => {
            if (v !== undefined) {
              onFormDataChange(writeConstructorText(formData, dslTab.path, v));
            }
          }}
        />
      </div>
      {debug && (
        <div className="flex items-center gap-2 px-3 h-6 shrink-0" style={{ borderTop: "1px solid #1e293b" }}>
          <span className="text-[10px]" style={{ color: "#475569", fontFamily: "JetBrains Mono, monospace" }}>строка {debug.line}</span>
          {debug.ok
            ? <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#22c55e" }}><CheckCircle2 className="size-3" />выполнено</span>
            : <span className="flex items-center gap-1 text-[10px] font-semibold truncate" style={{ color: "#ef4444" }}><AlertCircle className="size-3" />{debug.error}</span>}
        </div>
      )}
    </div>
  );
}

/** B7: живая консоль — реальный run_summary, честная пустота без прогона. */
function ConsolePanel() {
  interface SummaryShape {
    exit_code?: number;
    gate?: string;
    built_at?: string;
    scenarios?: { ok?: number; fail?: number; fail_allowed?: number; skip?: number };
  }
  const [summary, setSummary] = useState<SummaryShape | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch(LIVE_RUN_SUMMARY_URL)
        .then((r) => {
          if (!r.ok) throw new Error('no summary');
          return r.json() as Promise<SummaryShape>;
        })
        .then((data) => {
          if (!cancelled) {
            setSummary(data && typeof data === 'object' ? data : null);
            setDown(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSummary(null);
            setDown(true);
          }
        });
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (down || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center p-3 font-mono text-xs" style={{ color: "#475569" }}>
        Нет активного прогона
      </div>
    );
  }

  const s = summary.scenarios ?? {};
  return (
    <div className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
      <div className="flex gap-2">
        <span style={{ color: "#475569" }}>gate</span>
        <span style={{ color: summary.gate === 'pass' ? '#22c55e' : summary.gate === 'fail' ? '#ef4444' : '#94a3b8' }}>{summary.gate ?? '—'}</span>
      </div>
      <div className="flex gap-2">
        <span style={{ color: "#475569" }}>exit_code</span>
        <span>{summary.exit_code ?? '—'}</span>
      </div>
      <div className="flex gap-2">
        <span style={{ color: "#475569" }}>сценарии</span>
        <span>
          ok <span style={{ color: "#22c55e" }}>{s.ok ?? 0}</span>
          {' · '}fail <span style={{ color: "#ef4444" }}>{s.fail ?? 0}</span>
          {' · '}skip <span style={{ color: "#475569" }}>{s.skip ?? 0}</span>
        </span>
      </div>
      {summary.built_at && (
        <div className="flex gap-2">
          <span style={{ color: "#475569" }}>built</span>
          <span>{summary.built_at}</span>
        </div>
      )}
    </div>
  );
}

function TabBtn({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:ReactNode;label:string}){return <button onClick={onClick} className="flex items-center gap-1.5 px-3 h-full text-xs transition-colors" style={{color:active?"#e2e8f0":"#64748b",borderBottom:active?"2px solid #38bdf8":"2px solid transparent",fontFamily:"Golos UI, sans-serif"}}>{icon}{label}</button>}
