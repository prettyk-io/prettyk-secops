import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { ChevronDown, ChevronRight, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenarioStepCard } from "./ScenarioStepCard";
import type { ScenarioStepModel } from "./scenarioStepModel";
import { useScenarioDeckStore, type DeckDslMeta } from "./ScenarioDeckStore";
import { scanDeckDsl } from "./StepDslScanner";

export interface ScenarioDeckNodeData { deckId:string; title:string; description:string; stepCount:number; }

/** WIRE-SYNC-F1: отправить deep-link событие для перехода к строке Monaco. */
function jumpToMonacoLine(line: number) {
  window.dispatchEvent(new CustomEvent('pk-jump-to-line', { detail: { line } }));
}

export function ScenarioDeckNode({data}: NodeProps & { position?: { x: number; y: number } }){
  const d = data as unknown as ScenarioDeckNodeData;
  const decks = useScenarioDeckStore(s=>s.decks); const addStep = useScenarioDeckStore(s=>s.addStep);
  const removeStep = useScenarioDeckStore(s=>s.removeStep); const updateStep = useScenarioDeckStore(s=>s.updateStep);
  const moveStep = useScenarioDeckStore(s=>s.moveStep); const toggleCollapsed = useScenarioDeckStore(s=>s.toggleCollapsed);
  const setStepLed = useScenarioDeckStore(s=>s.setStepLed);
  const deck = decks.find(sd=>sd.id===d.deckId); if(!deck) return null;
  const collapsed = deck.collapsed; const steps = deck.steps;

  // WIRE-SYNC-F1: метаданные блоков DSL
  const dslMeta: DeckDslMeta | null = deck.dslMeta ?? scanDeckDsl(steps);

  const handleDebug = (step:ScenarioStepModel)=>{
    setStepLed(d.deckId,step.id,"running");
    fetch("/api/run/step",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:step.action,strategy:step.strategy,strategy_value:step.strategyValue,payload:step.payload,step_id:step.id})})
      .then(r=>r.json()).then((result:any)=>{setStepLed(d.deckId,step.id,result.ok?"success":"failure",result.ok?"ok":"fail");})
      .catch(()=>{setStepLed(d.deckId,step.id,"failure","fail");});
  };

  return (
    <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,minWidth:460,maxWidth:560,fontFamily:"Golos UI, sans-serif",color:"#e2e8f0"}}>
      <Handle type="target" position={Position.Top} style={{background:"#38bdf8",width:8,height:8}}/>
      {/* Шапка деки */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style={{borderBottom:collapsed?"none":"1px solid #1e293b"}} onClick={()=>toggleCollapsed(d.deckId)}>
        <span style={{color:"#64748b"}}>{collapsed?<ChevronRight className="size-3.5"/>:<ChevronDown className="size-3.5"/>}</span>
        <div className="flex items-center justify-center rounded size-6 shrink-0" style={{background:"linear-gradient(135deg, #0ea5e9, #7c3aed)"}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>
        </div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{d.title}</div>{d.description&&<div className="text-[10px] truncate" style={{color:"#64748b"}}>{d.description}</div>}</div>
        {/* WIRE-SYNC-F1: SCENARIO FAILSAFE бейдж в шапке */}
        {dslMeta?.scenarioFailsafe && (
          <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)",fontWeight:600}} title="<!> Scenario Failsafe: прогон продолжается при ошибке шага">
            <ShieldAlert className="size-2.5"/> FAILSAFE
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{background:"#1e293b",color:"#64748b"}}>{steps.length} шагов</span>
      </div>
      {/* Тело деки */}
      {!collapsed&&<div className="py-1">
        {steps.map((step,i)=>{
          // WIRE-SYNC-F1: TRY-BLOCK — пунктирная рамка группы
          const inTryBlock = dslMeta?.tryBlockRanges?.some(r=>i>=r.start&&i<=r.end);
          const tryBlockStart = dslMeta?.tryBlockRanges?.find(r=>r.start===i);
          return (
            <div key={step.id} className="pk-deck-step-row" style={{margin: inTryBlock ? '2px 6px' : '0'}}>
              {tryBlockStart && (
                <div className="flex items-center gap-2 px-3 py-0.5" style={{background:"rgba(168,85,247,0.06)",borderTop:"1.5px dashed #a855f7",borderLeft:"1.5px dashed #a855f7",borderRight:"1.5px dashed #a855f7",borderRadius:"6px 6px 0 0"}}>
                  <span className="text-[9px] font-semibold" style={{color:"#a855f7",fontFamily:"Golos UI, sans-serif"}}>TRY-BLOCK</span>
                  <span className="text-[8px]" style={{color:"#64748b"}}>try/catch</span>
                </div>
              )}
              <ScenarioStepCard
                step={step}
                index={i}
                onChange={p=>updateStep(d.deckId,step.id,p)}
                onDelete={()=>removeStep(d.deckId,step.id)}
                onMoveUp={()=>moveStep(d.deckId,step.id,"up")}
                onMoveDown={()=>moveStep(d.deckId,step.id,"down")}
                onDebug={()=>handleDebug(step)}
                onJumpToLine={(line)=>jumpToMonacoLine(line)}
              />
              {/* TRY-BLOCK закрытие */}
              {dslMeta?.tryBlockRanges?.some(r=>r.end===i) && (
                <div style={{height:4,borderLeft:"1.5px dashed #a855f7",borderRight:"1.5px dashed #a855f7",borderBottom:"1.5px dashed #a855f7",borderRadius:"0 0 6px 6px"}}/>
              )}
            </div>
          );
        })}
        {steps.length===0&&<div className="px-3 py-4 text-center text-xs" style={{color:"#475569"}}>Нет шагов. Добавьте первый шаг ниже.</div>}
        <div className="px-3 pt-1">
          <Button variant="ghost" size="sm" className="w-full justify-center gap-1.5 text-xs h-7" style={{color:"#64748b"}} onClick={e=>{e.stopPropagation();addStep(d.deckId);}}><Plus className="size-3"/>Добавить шаг</Button>
        </div>
      </div>}
      <Handle type="source" position={Position.Bottom} style={{background:"#38bdf8",width:8,height:8}}/>
    </div>);
}