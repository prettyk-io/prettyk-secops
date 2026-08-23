import {create} from "zustand";
import type {ActionKind, ScenarioStepModel, StepLedState} from "./scenarioStepModel";
import {emptyStep, stepToDSL} from "./scenarioStepModel";
import type {StrategyKind} from "./scenarioStepModel";
export interface ScenarioDeckData {id:string;title:string;description:string;continueOnError:boolean;steps:ScenarioStepModel[];collapsed:boolean;}
export interface ScenarioDeckStore {
  decks:ScenarioDeckData[];
  setDecks:(decks:ScenarioDeckData[])=>void;
  addStep:(deckId:string)=>void;
  removeStep:(deckId:string,stepId:string)=>void;
  updateStep:(deckId:string,stepId:string,patch:Partial<ScenarioStepModel>)=>void;
  moveStep:(deckId:string,stepId:string,direction:"up"|"down")=>void;
  setStepLed:(deckId:string,stepId:string,led:StepLedState,debugResult?:"ok"|"fail"|null)=>void;
  toggleCollapsed:(deckId:string)=>void;
  deckDSL:(deckId:string)=>string[];
  warRoom:boolean;
  setWarRoom:(active:boolean)=>void;
  runPhase:'idle'|'warming'|'executing'|'synthesizing'|'passed'|'failed';
  cameraFocus:string|null;
  requestCameraFocus:(nodeId?:string)=>void;
  consumeCameraFocus:()=>string|null;
}
let n=0;function id():string{n++;return`step-${Date.now()}-${n}`;}
export const useScenarioDeckStore = create<ScenarioDeckStore>((set,get)=>({
  decks:[],setDecks:(decks)=>set({decks}),
  addStep:(deckId)=>set(s=>({decks:s.decks.map(d=>d.id===deckId?{...d,steps:[...d.steps,emptyStep(id())]}:d)})),
  removeStep:(deckId,stepId)=>set(s=>({decks:s.decks.map(d=>d.id===deckId?{...d,steps:d.steps.filter(st=>st.id!==stepId)}:d)})),
  updateStep:(deckId,stepId,patch)=>set(s=>({decks:s.decks.map(d=>d.id===deckId?{...d,steps:d.steps.map(st=>st.id===stepId?{...st,...patch}:st)}:d)})),
  moveStep:(deckId,stepId,direction)=>{set(s=>({decks:s.decks.map(d=>{if(d.id!==deckId)return d;const idx=d.steps.findIndex(st=>st.id===stepId);if(idx<0)return d;const t=direction==="up"?idx-1:idx+1;if(t<0||t>=d.steps.length)return d;const nx=[...d.steps];[nx[idx],nx[t]]=[nx[t]!,nx[idx]!];return{...d,steps:nx};})}));},
  setStepLed:(deckId,stepId,led,debugResult)=>set(s=>({decks:s.decks.map(d=>d.id===deckId?{...d,steps:d.steps.map(st=>st.id===stepId?{...st,led,debugResult:debugResult??st.debugResult}:st)}:d)})),
  toggleCollapsed:(deckId)=>set(s=>({decks:s.decks.map(d=>d.id===deckId?{...d,collapsed:!d.collapsed}:d)})),
  deckDSL:(deckId)=>{const deck=get().decks.find(d=>d.id===deckId);if(!deck)return[];return deck.steps.map(st=>stepToDSL(st));},
  warRoom:false,setWarRoom:(active)=>set({warRoom:active}),
  runPhase:'idle',cameraFocus:null,
  requestCameraFocus:(nodeId)=>{set(s=>({cameraFocus:nodeId??s.cameraFocus}));},
  consumeCameraFocus:()=>{const f=get().cameraFocus;if(f!==null)set({cameraFocus:null});return f;}
}));