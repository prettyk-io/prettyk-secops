"use client";
import { useState, type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Play, Square, Save, Settings, Shield, Code2, FolderTree, Info, Monitor,
  PanelBottom, ChevronDown, Layers, Zap, Box, Share2, Plus,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { CanvasV2 } from "./CanvasV2";
import { BrowserPanel } from "./BrowserPanel";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { stepToDSL, type ActionKind, type StrategyKind } from "./scenarioStepModel";
import { getActiveCheckId, getCheck } from "../checks/checksStore";
import { parseWired } from "../wired/parse";
import { BuddyDockController } from "./buddy/BuddyDockController";

type RightTab = "code" | "tree" | "inspector" | "browser";

export function StudioV2() {
  const [bottomOpen, setBottomOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("code");

  useEffect(() => {
    const checkId = getActiveCheckId();
    if (!checkId) return;
    const check = getCheck(checkId);
    if (!check?.wired) return;
    const r = parseWired(check.wired);
    if (!r.ok || !r.wired) return;
    const scenarios = r.wired.editor?.scenarios ?? [];
    const decks = scenarios.map((s, i) => ({
      id: s.scenario_id || `deck-${Date.now()}-${i}`,
      title: s.title || "Сценарий",
      description: s.description || "",
      continueOnError: s.continue_on_error ?? true,
      steps: (s.steps || []).map((st, j) => ({
        id: st.step_id || `s${Date.now()}-${j}`,
        action: "Type" as ActionKind,
        strategy: "css" as StrategyKind,
        strategyValue: "",
        payload: st.constructor || "",
        continueOnError: st.continue_on_error ?? false,
        led: "queued" as const,
        debugResult: null as null,
      })),
      collapsed: false,
    }));
    if (decks.length > 0) {
      useScenarioDeckStore.getState().setDecks(decks);
    }
  }, []);
  return (
    <div className="dark flex-1 flex flex-col overflow-hidden min-h-0" style={{ background: "#09090b" }}>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ borderRight: "1px solid #1e293b" }}><CanvasV2 /></div>
        <div className="shrink-0 flex flex-col overflow-hidden" style={{ background: "#0f172a", width: 380 }}>
          <div className="flex items-center h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
            <TabBtn active={rightTab==="code"} onClick={()=>setRightTab("code")} icon={<Code2 className="size-3"/>} label="Код"/>
            <TabBtn active={rightTab==="tree"} onClick={()=>setRightTab("tree")} icon={<FolderTree className="size-3"/>} label="Дерево"/>
            <TabBtn active={rightTab==="inspector"} onClick={()=>setRightTab("inspector")} icon={<Info className="size-3"/>} label="Инспектор"/>
            <TabBtn active={rightTab==="browser"} onClick={()=>setRightTab("browser")} icon={<Monitor className="size-3"/>} label="Браузер"/>
            <div className="flex-1"/>
            <Button variant="ghost" size="icon" className="size-7" onClick={()=>setBottomOpen(v=>!v)}><PanelBottom className="size-3.5"/></Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab==="code" && <CodePanel />}
            {rightTab==="tree" && <TreePanel />}
            {rightTab==="inspector" && <InspectorPanel />}
            {rightTab==="browser" && <BrowserPanel />}
          </div>
        </div>
        <BuddyDockController />
      </div>
      {bottomOpen && <div className="h-48 shrink-0 flex flex-col overflow-hidden" style={{ background: "#0f172a", borderTop: "1px solid #1e293b" }}>
        <div className="flex items-center justify-between px-3 h-8 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#64748b" }}>Консоль</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={()=>setBottomOpen(false)}><ChevronDown className="size-3"/></Button>
        </div>
        <div className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
          <L t="14:32:02" text="Шаг 1/7: Открытие главной страницы" c="#22c55e"/>
          <L t="14:32:05" text="Шаг 3/7: Spider scan (34 URLs)" c="#38bdf8"/>
          <L t="14:32:14" text="  → WARNING: reflected XSS candidate" c="#f59e0b"/>
        </div>
      </div>}
    </div>);
}

function CodePanel() {
  const decks = useScenarioDeckStore(s=>s.decks);
  const deck = decks[0];
  const dsl = deck ? deck.steps.map(s=>stepToDSL(s)).join("\n") : "";
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 h-9 shrink-0" style={{ borderBottom: "1px solid #1e293b" }}>
        <Code2 className="size-3.5 mr-1.5" style={{ color: "#38bdf8" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>PrettyK DSL</span>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          value={dsl}
          theme="vs-dark"
          options={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, lineNumbers: "on", scrollBeyondLastLine: false, wordWrap: "on", readOnly: false, padding: { top: 8 } }}
          onChange={(v) => {
            if (v && deck) {
              const lines = v.split("\n").filter(l=>l.trim());
              const store = useScenarioDeckStore.getState();
              const steps = store.decks.find(d=>d.id===deck.id)?.steps ?? [];
              if (lines.length === steps.length) {
                lines.forEach((line, i) => {
                  if (steps[i]) store.updateStep(deck.id, steps[i].id, { payload: line });
                });
              }
            }
          }}
        />
      </div>
    </div>
  );
}

function TabBtn({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:ReactNode;label:string}){return <button onClick={onClick} className="flex items-center gap-1.5 px-3 h-full text-xs transition-colors" style={{color:active?"#e2e8f0":"#64748b",borderBottom:active?"2px solid #38bdf8":"2px solid transparent",fontFamily:"Golos UI, sans-serif"}}>{icon}{label}</button>}
function L({t,text,c}:{t:string;text:string;c?:string}){return <div className="flex gap-2"><span style={{color:"#475569"}}>{t}</span><span style={{color:c??"#94a3b8"}}>{text}</span></div>}

function TreePanel(){return <div className="flex flex-col h-full"><div className="flex items-center px-3 h-9 shrink-0" style={{borderBottom:"1px solid #1e293b"}}><FolderTree className="size-3.5 mr-1.5" style={{color:"#38bdf8"}}/><span className="text-xs font-semibold uppercase tracking-wider" style={{color:"#64748b"}}>Проект</span></div><div className="flex-1 overflow-auto py-1"><TR icon={<FolderTree className="size-3.5"/>} label="Сценарии" n={2} active/><TR icon={<Layers className="size-3.5"/>} label="Модели страниц" n={2} indent/><TR icon={<Box className="size-3.5"/>} label="Модули данных" n={4} indent/><TR icon={<Zap className="size-3.5"/>} label="Фаззеры" n={3} indent/><TR icon={<Share2 className="size-3.5"/>} label="Коннекторы" n={1} indent/><TR icon={<Shield className="size-3.5"/>} label="Авторизация" n={1} indent/></div></div>}
function TR({icon,label,n,indent,active}:{icon:ReactNode;label:string;n?:number;indent?:boolean;active?:boolean}){return <div className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm select-none ${indent?"pl-7":""} ${active?"":"hover:bg-white/5"}`} style={{color:active?"#e2e8f0":"#94a3b8",background:active?"rgba(56,189,248,0.08)":"transparent",borderLeft:active?"2px solid #38bdf8":"2px solid transparent"}}><span style={{color:active?"#38bdf8":"#64748b"}}>{icon}</span><span className="truncate flex-1" style={{fontFamily:"Golos UI, sans-serif"}}>{label}</span>{n!==undefined && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{background:"#1e293b",color:"#64748b"}}>{n}</span>}</div>}
function PR({label,value,color}:{label:string;value:string;color?:string}){return <div className="flex items-center justify-between text-xs"><span style={{color:"#64748b"}}>{label}</span><span style={{color:color??"#e2e8f0"}}>{value}</span></div>}

function InspectorPanel(){const decks=useScenarioDeckStore(s=>s.decks);const deck=decks[0];if(!deck)return <div className="flex-1 flex items-center justify-center p-3"><span className="text-xs" style={{color:"#475569"}}>Нет сценариев</span></div>;const passed=deck.steps.filter(s=>s.led==="success").length;const failed=deck.steps.filter(s=>s.led==="failure").length;return <div className="flex flex-col h-full"><div className="flex items-center px-3 h-9 shrink-0" style={{borderBottom:"1px solid #1e293b"}}><Info className="size-3.5 mr-1.5" style={{color:"#38bdf8"}}/><span className="text-xs font-semibold uppercase tracking-wider" style={{color:"#64748b"}}>Инспектор</span></div><div className="flex-1 overflow-auto p-3 space-y-3"><div className="space-y-1"><Label>Сценарий</Label><p className="text-sm font-semibold" style={{color:"#e2e8f0"}}>{deck.title}</p><p className="text-xs" style={{color:"#64748b"}}>{deck.description}</p></div><hr style={{borderColor:"#1e293b"}}/><div className="space-y-2"><Label>Статистика</Label><PR label="Всего шагов" value={String(deck.steps.length)}/><PR label="Пройдено" value={String(passed)} color="#22c55e"/><PR label="Ошибок" value={String(failed)} color={failed>0?"#ef4444":"#64748b"}/><PR label="Ожидают" value={String(deck.steps.length-passed-failed)} color="#475569"/></div></div></div>}
function Label({children}:{children:ReactNode}){return <span className="text-[10px] uppercase tracking-wider font-semibold block" style={{color:"#475569"}}>{children}</span>}