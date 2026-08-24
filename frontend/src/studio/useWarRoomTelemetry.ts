import { useEffect } from "react";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { LIVE_BASE } from "../api/apiBase";

interface TelemEvent { event_id:string; run_id:string; step_id?:string; seq:number; kind:string; status:string; duration_ms?:number|null; facts?:Record<string,unknown>; }

export function useWarRoomTelemetry(deckId:string){
  const setStepLed=useScenarioDeckStore(s=>s.setStepLed);
  const requestCameraFocus=useScenarioDeckStore(s=>s.requestCameraFocus);
  useEffect(()=>{
    if(typeof EventSource==="undefined")return;
    const src=new EventSource(`${LIVE_BASE}/api/diary?channel=telemetry`);
    const onMsg=(msg:MessageEvent<string>)=>{
      try{const ev:TelemEvent=JSON.parse(msg.data);
        if(ev.kind==="step.started"||ev.kind==="step_start"){if(ev.step_id)setStepLed(deckId,ev.step_id,"running");requestCameraFocus();}
        else if(ev.kind==="step.completed"||ev.kind==="step_end"){if(ev.step_id)setStepLed(deckId,ev.step_id,"success");}
        else if(ev.kind==="step.predicted"){if(ev.step_id)setStepLed(deckId,ev.step_id,"predicted");}
        else if(ev.kind==="fuzz.strike"||ev.kind==="fuzz.start"){requestCameraFocus();}
        else if(ev.kind==="anomaly.detect"||ev.kind==="finding.new"){requestCameraFocus();}
        else if(ev.kind==="run.ended"||ev.kind==="run.complete"){}
      }catch{}
    };
    src.addEventListener("message",onMsg as any);
    src.addEventListener("diary",onMsg as any);
    return()=>{src.close();};
  },[deckId,setStepLed,requestCameraFocus]);
}