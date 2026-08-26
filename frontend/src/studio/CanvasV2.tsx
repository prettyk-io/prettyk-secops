import { useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ScenarioFlow } from "./ScenarioFlow";

/**
 * STU-V2 B2: CanvasV2 — узлы сущностей из РЕАЛЬНЫХ счётчиков (не литералы).
 * mode: 'entity' | 'scenarios'. counts из collectStudioNodes.
 */
export interface CanvasV2Counts {
  pages: number;
  scenarios: number;
  modules: number;
  fuzzers: number;
  resources: number;
}

function CornerNode({ data }: { data: { label: string; color: string; count: number } }) {
  const c = data.color;
  return <div style={{ background: "#0f172a", border: `1px solid ${c}33`, borderTop: `2px solid ${c}`, borderRadius: 4, width: 220, minHeight: 80, padding: "8px 12px", fontFamily: "Golos UI, sans-serif", color: "#e2e8f0", fontSize: 12 }}>
    <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: c }}>{data.label}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#1e293b", color: "#64748b" }}>{data.count}</span></div>
    <div className="space-y-1"><div className="h-1.5 rounded" style={{ background: `${c}22`, width: "80%" }} /><div className="h-1.5 rounded" style={{ background: `${c}22`, width: "60%" }} /></div>
  </div>;
}

export interface CanvasV2Props {
  mode?: "entity" | "scenarios";
  counts?: CanvasV2Counts;
}

export function CanvasV2({ mode: externalMode, counts }: CanvasV2Props) {
  const mode = externalMode ?? "entity";

  const nodes = useMemo(() => {
    const c = counts ?? { pages: 0, scenarios: 0, modules: 0, fuzzers: 0, resources: 0 };
    return [
      { id: "page-models", type: "default", position: { x: 0, y: 0 }, data: { label: "Модели страниц", color: "#38bdf8", count: c.pages }, draggable: false },
      { id: "data-models", type: "default", position: { x: 480, y: 0 }, data: { label: "Модули данных", color: "#22c55e", count: c.modules }, draggable: false },
      { id: "fuzzers", type: "default", position: { x: 0, y: 240 }, data: { label: "Фаззеры", color: "#f59e0b", count: c.fuzzers }, draggable: false },
      { id: "connectors", type: "default", position: { x: 480, y: 240 }, data: { label: "Коннекторы и интеграции", color: "#a855f7", count: c.resources }, draggable: false },
      { id: "scenarios", type: "default", position: { x: 160, y: 310 }, data: { label: "Сценарии", color: "#38bdf8", count: c.scenarios }, draggable: false },
      { id: "auth", type: "default", position: { x: 380, y: 310 }, data: { label: "Профили авторизации", color: "#a855f7", count: 0 }, draggable: false },
    ] satisfies Node[];
  }, [counts]);
  const [enodes, setEnodes, onEnodesChange] = useNodesState(nodes);

  if (mode === "scenarios") {
    return <ScenarioFlow />;
  }

  return <div className="flex-1 w-full h-full flex flex-col">
    <div className="flex-1 relative min-h-0">
      <ReactFlow nodes={enodes} edges={[]} onNodesChange={onEnodesChange} fitView nodesConnectable={false} nodesDraggable={false} proOptions={{ hideAttribution: true }} style={{ background: "#09090b" }} minZoom={0.3} maxZoom={1.5}>
        <Background color="#1e293b" gap={24} />
        <Controls className="!bg-[#1e293b] !border-[#334155] !rounded-md [&>button]:!border-[#334155] [&>button]:!bg-[#1e293b] [&>button]:!text-[#94a3b8] [&>button:hover]:!bg-[#334155]" showInteractive={false} />
        <MiniMap className="!bg-[#1e293b] !border-[#334155]" nodeColor={()=>"#38bdf8"} maskColor="rgba(9,9,11,0.8)" />
      </ReactFlow>
    </div>
  </div>;
}
