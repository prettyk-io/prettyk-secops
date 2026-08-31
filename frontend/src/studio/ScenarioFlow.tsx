import { useMemo, useEffect, useRef, useCallback } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, type Node, useNodesState, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ScenarioDeckNode } from "./ScenarioDeckNode";
import type { ScenarioDeckNodeData } from "./ScenarioDeckNode";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { useWarRoomTelemetry } from "./useWarRoomTelemetry";
import { FuzzerStrikeOverlay } from "./FuzzerStrikeOverlay";
import type { ActionKind, ScenarioStepModel, StrategyKind } from "./scenarioStepModel";
import { ScanLine, X, ShieldCheck, ShieldAlert } from "lucide-react";

const nodeTypes = { scenarioDeck: ScenarioDeckNode };

function initDemoStore(){
  const {decks,setDecks}=useScenarioDeckStore.getState();
  if(decks.length>0)return;
  const demoSteps:ScenarioStepModel[]=[
    {id:"s1",action:"Open" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"",payload:"http://juice-shop:3000/#/login",continueOnError:false,led:"queued",debugResult:null},
    {id:"s2",action:"Click" as ActionKind,strategy:"css" as StrategyKind,strategyValue:".close-dialog",payload:"",continueOnError:true,led:"queued",debugResult:null},
    {id:"s3",action:"Type" as ActionKind,strategy:"label" as StrategyKind,strategyValue:"Email",payload:"$user_email",continueOnError:false,led:"queued",debugResult:null},
    {id:"s4",action:"Type" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"#password",payload:"$password_ref",continueOnError:false,led:"queued",debugResult:null},
    {id:"s5",action:"Click" as ActionKind,strategy:"role" as StrategyKind,strategyValue:"button Log in",payload:"",continueOnError:false,led:"queued",debugResult:null},
    {id:"s6",action:"Wait" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"",payload:"2000",continueOnError:false,led:"queued",debugResult:null},
    {id:"s7",action:"Crawl" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"",payload:"",continueOnError:false,led:"queued",debugResult:null},
    {id:"s8",action:"FuzzWave" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"",payload:"xss_corpus",continueOnError:false,led:"queued",debugResult:null},
    {id:"s9",action:"ActiveScan" as ActionKind,strategy:"css" as StrategyKind,strategyValue:"",payload:"",continueOnError:false,led:"queued",debugResult:null},
  ];
  setDecks([{id:"deck-1",title:"Juice Shop — Auth & Scan",description:"Логин, crawl, фаззинг, активное сканирование",continueOnError:true,steps:demoSteps,collapsed:false}]);
}

function buildDeckNodes():Node[]{return useScenarioDeckStore.getState().decks.map((deck,i)=>({id:deck.id,type:"scenarioDeck",position:{x:60,y:20+i*620},data:{deckId:deck.id,title:deck.title,description:deck.description,stepCount:deck.steps.length} satisfies ScenarioDeckNodeData,draggable:true}));}

function SynthesisBar(){
  const runPhase=useScenarioDeckStore(s=>s.runPhase);const warRoom=useScenarioDeckStore(s=>s.warRoom);const setWarRoom=useScenarioDeckStore(s=>s.setWarRoom);
  if(!warRoom&&runPhase==="idle")return null;
  const isDone=runPhase==="passed"||runPhase==="failed";const isRunning=runPhase==="warming"||runPhase==="executing"||runPhase==="synthesizing";
  return <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{background:isDone?(runPhase==="passed"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"):"rgba(56,189,248,0.06)",borderBottom:"1px solid #1e293b"}}>
    <div className="flex items-center gap-2">
      {isRunning&&<><ScanLine className="size-4" style={{color:"#38bdf8"}}/><span className="text-xs font-semibold" style={{color:"#38bdf8"}}>WAR ROOM</span></>}
      {runPhase==="passed"&&<><ShieldCheck className="size-4" style={{color:"#22c55e"}}/><span className="text-xs font-semibold" style={{color:"#22c55e"}}>VERDICT: PASSED</span></>}
      {runPhase==="failed"&&<><ShieldAlert className="size-4" style={{color:"#ef4444"}}/><span className="text-xs font-semibold" style={{color:"#ef4444"}}>VERDICT: FAILED</span></>}
    </div>
    <div className="flex items-center gap-2">
      {isRunning&&<span className="text-[11px]" style={{color:"#64748b"}}>{runPhase==="warming"?"Прогрев...":runPhase==="executing"?"Выполнение...":"Синтез..."}</span>}
      {isDone&&<button className="text-[11px] px-2.5 py-1 rounded hover:bg-white/5 transition-colors" style={{color:"#e2e8f0"}} onClick={()=>window.location.hash="#/results"}>Результаты →</button>}
      {warRoom&&<button className="p-1 rounded hover:bg-white/5 transition-colors" style={{color:"#64748b"}} onClick={()=>setWarRoom(false)} title="Закрыть War Room"><X className="size-4"/></button>}
    </div>
  </div>;
}

function CameraDirector(){
  const {fitView}=useReactFlow();
  useEffect(()=>{const i=setInterval(()=>{const f=useScenarioDeckStore.getState().consumeCameraFocus();if(f)try{fitView({duration:500,padding:0.2,maxZoom:1.0});}catch(e){}},300);return()=>clearInterval(i);},[fitView]);
  return null;
}

export function ScenarioFlow(){
  initDemoStore();
  const initial=useMemo(()=>buildDeckNodes(),[]);
  const [nodes,setNodes,onNodesChange]=useNodesState(initial);
  const warRoom=useScenarioDeckStore(s=>s.warRoom);
  useWarRoomTelemetry("deck-1");
  const activateWarRoom=useCallback(()=>{useScenarioDeckStore.getState().setWarRoom(true);},[]);
  return <ReactFlowProvider><div className={`flex-1 w-full h-full flex flex-col ${warRoom?"pk-war-room":""}`}>
    <SynthesisBar/>
    <div className="flex-1 relative min-h-0">
      <ReactFlow nodes={nodes} edges={[]} onNodesChange={onNodesChange} nodeTypes={nodeTypes} fitView nodesConnectable={false} elementsSelectable={true} proOptions={{hideAttribution:true}} style={{background:"#09090b"}} minZoom={0.3} maxZoom={1.5}>
        <CameraDirector/>
        <Background color="#1e293b" gap={24}/>
        <Controls className="!bg-[#1e293b] !border-[#334155] !rounded-md [&>button]:!border-[#334155] [&>button]:!bg-[#1e293b] [&>button]:!text-[#94a3b8] [&>button:hover]:!bg-[#334155]" showInteractive={false}/>
        <MiniMap className="!bg-[#1e293b] !border-[#334155]" nodeColor={()=>"#38bdf8"} maskColor="rgba(9,9,11,0.8)"/>
      </ReactFlow>
      {warRoom&&<FuzzerStrikeOverlay/>}
    </div>
    {!warRoom&&<div className="absolute bottom-4 right-4 z-20">
       <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all" style={{background:"linear-gradient(135deg, #0ea5e9, #7c3aed)",color:"#fff",boxShadow:"0 0 20px rgba(14,165,233,0.3)"}} onClick={activateWarRoom}><ScanLine className="size-4"/>WAR ROOM</button>
    </div>}
  </div></ReactFlowProvider>;
}