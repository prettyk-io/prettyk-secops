import { useEffect, useRef, useState, useCallback } from "react";

let _globalTrigger:((x:number,y:number,color:string)=>void)|null=null;
export function triggerShockwave(x:number,y:number,color:string){if(_globalTrigger)_globalTrigger(x,y,color);}

export function FuzzerStrikeOverlay(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [active,setActive]=useState(false);
  const shockwaveRef=useRef<{x:number;y:number;color:string;start:number}|null>(null);
  const animRef=useRef<number>(0);

  const trigger=useCallback((x:number,y:number,color:string)=>{shockwaveRef.current={x,y,color,start:performance.now()};},[]);
  _globalTrigger=trigger;

  useEffect(()=>{
    setActive(true);
    const t0=performance.now();
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const resize=()=>{const r=canvas.getBoundingClientRect();canvas.width=r.width;canvas.height=r.height;};
    resize();window.addEventListener("resize",resize);
    const render=(now:number)=>{
      const W=canvas.width;const H=canvas.height;const elapsed=now-t0;
      ctx.clearRect(0,0,W,H);
      if(elapsed<300){const a=elapsed/300;ctx.strokeStyle=`rgba(56,189,248,${a*0.6})`;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W*0.4,H*0.3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(W,0);ctx.lineTo(W*0.6,H*0.3);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,H);ctx.lineTo(W*0.4,H*0.7);ctx.stroke();
        ctx.beginPath();ctx.moveTo(W,H);ctx.lineTo(W*0.6,H*0.7);ctx.stroke();
      }
      else if(elapsed<800){const colors=["#38bdf8","#a855f7","#f59e0b"];for(let i=0;i<30;i++){
        const angle=(i/30)*Math.PI*0.6+Math.PI*0.2;const len=60+Math.sin(elapsed*0.01+i)*20;
        ctx.strokeStyle=colors[i%3]+"88";ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(W*0.5,H*0.5);ctx.lineTo(W*0.5+Math.cos(angle)*len,H*0.5+Math.sin(angle)*len);ctx.stroke();
      }}
      const sw=shockwaveRef.current;if(sw){const se=now-sw.start;if(se<400){const r=(se/400)*80;const a=1-(se/400);
        ctx.strokeStyle=`${sw.color}${Math.round(a*255).toString(16).padStart(2,"0")}`;ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(sw.x,sw.y,r,0,Math.PI*2);ctx.stroke();
      }else shockwaveRef.current=null;}
      animRef.current=requestAnimationFrame(render);
    };
    animRef.current=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(animRef.current);window.removeEventListener("resize",resize);_globalTrigger=null;};
  },[]);

  return <canvas ref={canvasRef} className={`absolute inset-0 z-30 ${active?"":"hidden"}`} style={{pointerEvents:"none",width:"100%",height:"100%"}}/>;
}