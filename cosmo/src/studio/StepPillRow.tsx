import { useCallback } from "react";
import { Play, X, Check } from "lucide-react";
import { type ActionKind, type ScenarioStepModel, type StrategyKind, ACTION_KINDS, STRATEGY_KINDS, actionColor, actionLabel, requiresStrategy, requiresPayload } from "./scenarioStepModel";

interface StepPillRowProps { step:ScenarioStepModel; index:number; onChange:(patch:Partial<ScenarioStepModel>)=>void; onDelete:()=>void; onMoveUp:()=>void; onMoveDown:()=>void; onDebug:()=>void; }

const DS:React.CSSProperties = {appearance:"none",WebkitAppearance:"none",background:"#0f172a",border:"1px solid #1e293b",borderRadius:4,color:"#e2e8f0",fontSize:12,fontFamily:"Golos UI, sans-serif",padding:"2px 6px",height:24,cursor:"pointer",outline:"none"};
const IS:React.CSSProperties = {background:"transparent",border:"1px solid #1e293b",borderRadius:4,color:"#e2e8f0",fontSize:12,fontFamily:"JetBrains Mono, monospace",padding:"2px 6px",height:24,outline:"none"};

function Led({state}:{state:string}){const c:Record<string,string>={queued:"#475569",running:"#38bdf8",success:"#22c55e",warning:"#f59e0b",failure:"#ef4444",predicted:"#a855f7"};const a:Record<string,string>={queued:"none",running:"pk-led-pulse 1s ease-in-out infinite",success:"none",warning:"pk-led-breath 2s ease-in-out infinite",failure:"none",predicted:"pk-led-pulse 1.5s ease-in-out infinite"};return <span className="shrink-0 rounded-full" style={{width:6,height:6,background:c[state]??"#475569",animation:a[state]??"none",boxShadow:state==="running"?`0 0 4px ${c[state]}`:"none"}}/>;}

export function StepPillRow({step,index,onChange,onDelete,onMoveUp,onMoveDown,onDebug}:StepPillRowProps){
  const color=actionColor(step.action); const showStrategy=requiresStrategy(step.action); const showPayload=requiresPayload(step.action);
  const handleRowClick=useCallback(()=>{if(showStrategy&&step.strategyValue)console.log("[StepPillRow] highlight:",step.strategy,step.strategyValue);},[showStrategy,step.strategyValue,step.strategy]);
  return (
    <div className="flex items-center gap-1.5 py-1.5 px-1 rounded group hover:bg-white/5 transition-colors cursor-pointer" onClick={handleRowClick} title={showStrategy&&step.strategyValue?`Подсветить "${step.strategyValue}"`:undefined}>
      <Led state={step.led}/>
      <span className="text-[10px] w-5 text-right shrink-0 select-none" style={{color:"#475569",fontFamily:"JetBrains Mono, monospace"}}>{index+1}</span>
      <select value={step.action} onChange={e=>onChange({action:e.target.value as ActionKind})} style={{...DS,color,borderColor:color,minWidth:80,maxWidth:110}} className="shrink-0">
        {ACTION_KINDS.map(a=><option key={a} value={a} style={{color:actionColor(a),background:"#0f172a"}}>{actionLabel(a)}</option>)}
      </select>
      {showStrategy&&<>
        <select value={step.strategy} onChange={e=>onChange({strategy:e.target.value as StrategyKind})} style={{...DS,minWidth:55,maxWidth:70}} className="shrink-0">
          {STRATEGY_KINDS.map(s=><option key={s} value={s} style={{background:"#0f172a",color:"#e2e8f0"}}>{s}</option>)}
        </select>
        <input value={step.strategyValue} onChange={e=>onChange({strategyValue:e.target.value})} placeholder="selector" style={{...IS,width:100,maxWidth:160}}/>
      </>}
      {showPayload&&<input value={step.payload} onChange={e=>onChange({payload:e.target.value})}
        placeholder={step.action==="Open"?"https://...":step.action==="Wait"?"1000":step.action==="Let"?"$var = value":"$value"}
        style={{...IS,width:step.action==="Open"?180:120,maxWidth:220,color:step.payload.startsWith("$")?"#10b981":"#e2e8f0"}}/>}
      {step.debugResult&&<span className="shrink-0">{step.debugResult==="ok"?<Check className="size-3" style={{color:"#22c55e"}}/>:<X className="size-3" style={{color:"#ef4444"}}/>}</span>}
      <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Btn onClick={e=>{e.stopPropagation();onMoveUp();}} c="#64748b" t="Вверх"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2L2 6h6z" fill="currentColor"/></svg></Btn>
        <Btn onClick={e=>{e.stopPropagation();onMoveDown();}} c="#64748b" t="Вниз"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 8L2 4h6z" fill="currentColor"/></svg></Btn>
        <Btn onClick={e=>{e.stopPropagation();onDebug();}} c="#38bdf8" t="Запустить шаг"><Play className="size-3"/></Btn>
        <Btn onClick={e=>{e.stopPropagation();onDelete();}} c="#ef4444" t="Удалить"><X className="size-3"/></Btn>
      </div>
    </div>);
}

function Btn({onClick,c,children,t}:{onClick:(e:React.MouseEvent)=>void;c:string;children:React.ReactNode;t:string}){return <button onClick={onClick} className="p-0.5 rounded hover:bg-white/10" style={{color:c}} title={t}>{children}</button>;}