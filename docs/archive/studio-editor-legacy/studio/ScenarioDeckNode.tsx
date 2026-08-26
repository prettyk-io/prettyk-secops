import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepPillRow } from "./StepPillRow";
import type { ScenarioStepModel } from "./scenarioStepModel";
import { useScenarioDeckStore } from "./ScenarioDeckStore";

export interface ScenarioDeckNodeData { deckId:string; title:string; description:string; stepCount:number; }

export function ScenarioDeckNode({data}: NodeProps & { position?: { x: number; y: number } }){
  const d = data as unknown as ScenarioDeckNodeData;
  const decks = useScenarioDeckStore(s=>s.decks); const addStep = useScenarioDeckStore(s=>s.addStep);
  const removeStep = useScenarioDeckStore(s=>s.removeStep); const updateStep = useScenarioDeckStore(s=>s.updateStep);
  const moveStep = useScenarioDeckStore(s=>s.moveStep); const toggleCollapsed = useScenarioDeckStore(s=>s.toggleCollapsed);
  const setStepLed = useScenarioDeckStore(s=>s.setStepLed);
  const deck = decks.find(sd=>sd.id===d.deckId); if(!deck) return null;
  const collapsed = deck.collapsed; const steps = deck.steps;

  const handleDebug = (step:ScenarioStepModel)=>{
    setStepLed(d.deckId,step.id,"running");
    fetch("/api/run/step",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:step.action,strategy:step.strategy,strategy_value:step.strategyValue,payload:step.payload,step_id:step.id})})
      .then(r=>r.json()).then((result:any)=>{setStepLed(d.deckId,step.id,result.ok?"success":"failure",result.ok?"ok":"fail");})
      .catch(()=>{setStepLed(d.deckId,step.id,"failure","fail");});
  };

  return (
    <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,minWidth:460,maxWidth:520,fontFamily:"Golos UI, sans-serif",color:"#e2e8f0"}}>
      <Handle type="target" position={Position.Top} style={{background:"#38bdf8",width:8,height:8}}/>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style={{borderBottom:collapsed?"none":"1px solid #1e293b"}} onClick={()=>toggleCollapsed(d.deckId)}>
        <span style={{color:"#64748b"}}>{collapsed?<ChevronRight className="size-3.5"/>:<ChevronDown className="size-3.5"/>}</span>
        <div className="flex items-center justify-center rounded size-6 shrink-0" style={{background:"linear-gradient(135deg, #0ea5e9, #7c3aed)"}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>
        </div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{d.title}</div>{d.description&&<div className="text-[10px] truncate" style={{color:"#64748b"}}>{d.description}</div>}</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{background:"#1e293b",color:"#64748b"}}>{steps.length} шагов</span>
      </div>
      {!collapsed&&<div className="py-1">
        {steps.map((step,i)=><StepPillRow key={step.id} step={step} index={i} onChange={p=>updateStep(d.deckId,step.id,p)} onDelete={()=>removeStep(d.deckId,step.id)} onMoveUp={()=>moveStep(d.deckId,step.id,"up")} onMoveDown={()=>moveStep(d.deckId,step.id,"down")} onDebug={()=>handleDebug(step)}/>)}
        {steps.length===0&&<div className="px-3 py-4 text-center text-xs" style={{color:"#475569"}}>Нет шагов. Добавьте первый шаг ниже.</div>}
        <div className="px-3 pt-1">
          <Button variant="ghost" size="sm" className="w-full justify-center gap-1.5 text-xs h-7" style={{color:"#64748b"}} onClick={e=>{e.stopPropagation();addStep(d.deckId);}}><Plus className="size-3"/>Добавить шаг</Button>
        </div>
      </div>}
      <Handle type="source" position={Position.Bottom} style={{background:"#38bdf8",width:8,height:8}}/>
    </div>);
}