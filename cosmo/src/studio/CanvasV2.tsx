import { useState, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileText, Share2 } from "lucide-react";
import { ScenarioFlow } from "./ScenarioFlow";

function CornerNode({ data }: { data: { label: string; color: string; count: number } }) {
  const c = data.color;
  return <div style={{ background: "#0f172a", border: `1px solid ${c}33`, borderTop: `2px solid ${c}`, borderRadius: 4, width: 220, minHeight: 80, padding: "8px 12px", fontFamily: "Golos UI, sans-serif", color: "#e2e8f0", fontSize: 12 }}>
    <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: c }}>{data.label}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#1e293b", color: "#64748b" }}>{data.count}</span></div>
    <div className="space-y-1"><div className="h-1.5 rounded" style={{ background: `${c}22`, width: "80%" }} /><div className="h-1.5 rounded" style={{ background: `${c}22`, width: "60%" }} /></div>
  </div>;
}

export function CanvasV2() {
  const [mode, setMode] = useState<"entity" | "scenarios">("entity");

  const nodes = useMemo(() => [
    { id: "page-models", type: "default", position: { x: 0, y: 0 }, data: { label: "Модели страниц", color: "#38bdf8", count: 3 }, draggable: false },
    { id: "data-models", type: "default", position: { x: 480, y: 0 }, data: { label: "Модули данных", color: "#22c55e", count: 4 }, draggable: false },
    { id: "fuzzers", type: "default", position: { x: 0, y: 240 }, data: { label: "Фаззеры", color: "#f59e0b", count: 2 }, draggable: false },
    { id: "connectors", type: "default", position: { x: 480, y: 240 }, data: { label: "Коннекторы", color: "#a855f7", count: 1 }, draggable: false },
    { id: "scenarios", type: "default", position: { x: 160, y: 310 }, data: { label: "Сценарии", color: "#38bdf8", count: 2 }, draggable: false },
    { id: "auth", type: "default", position: { x: 380, y: 310 }, data: { label: "Авторизация", color: "#a855f7", count: 1 }, draggable: false },
  ] satisfies Node[], []);
  const [enodes, setEnodes, onEnodesChange] = useNodesState(nodes);

  if (mode === "scenarios") {
    return <ScenarioFlow />;
  }

  return <div className="flex-1 w-full h-full flex flex-col">
    <div className="flex items-center gap-2 px-3 h-8 shrink-0" style={{ background: "#0f172a", borderBottom: "1px solid #1e293b" }}>
      <button
        className="flex items-center gap-1.5 px-2.5 h-6 rounded text-[11px] font-medium"
        style={{ background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontFamily: "Golos UI, sans-serif" }}
        onClick={() => setMode("entity")}
      ><Share2 className="size-3" />Сущности</button>
      <button
        className="flex items-center gap-1.5 px-2.5 h-6 rounded text-[11px] font-medium"
        style={{ color: "#64748b", fontFamily: "Golos UI, sans-serif" }}
        onClick={() => setMode("scenarios")}
      ><FileText className="size-3" />Сценарии</button>
    </div>
    <div className="flex-1 relative min-h-0">
      <ReactFlow nodes={enodes} edges={[]} onNodesChange={onEnodesChange} fitView nodesConnectable={false} nodesDraggable={false} proOptions={{ hideAttribution: true }} style={{ background: "#09090b" }} minZoom={0.3} maxZoom={1.5}>
        <Background color="#1e293b" gap={24} />
        <Controls className="!bg-[#1e293b] !border-[#334155] !rounded-md [&>button]:!border-[#334155] [&>button]:!bg-[#1e293b] [&>button]:!text-[#94a3b8] [&>button:hover]:!bg-[#334155]" showInteractive={false} />
        <MiniMap className="!bg-[#1e293b] !border-[#334155]" nodeColor={()=>"#38bdf8"} maskColor="rgba(9,9,11,0.8)" />
      </ReactFlow>
    </div>
  </div>;
}