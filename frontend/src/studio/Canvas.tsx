import { ReactFlow, Background, Panel, type Node, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ScenarioDeckNode, type ScenarioDeckNodeData } from "./ScenarioDeckNode";
import { AuthDeckNode, type AuthDeckNodeData } from "./AuthDeckNode";
import { useScenarioDeckStore } from "./ScenarioDeckStore";
import { useMemo } from "react";

/**
 * CANON: единый холст Studio.
 * - 4 угла (статичные формы): прибиты по краям вьюпорта (Panel), рамка интерфейса.
 * - Центр (сценарии + авторизация): свободно перемещаются по холсту (draggable).
 * - Зум: maxZoom=1.0 (текущий комфортный масштаб), minZoom=0.70 (залочен на -6 шагов).
 * - Фон: благородный глубокий сланец (#0C1322) со светлой сеткой (#24334F).
 * - Без кнопок зума, без фуллскрина, без миникарты.
 */

// ── Кастомные типы нод для центрального контента ──
const nodeTypes = {
  scenarioDeck: ScenarioDeckNode,
  authDeck: AuthDeckNode,
};

export interface CanvasCounts {
  pages: number;
  scenarios: number;
  modules: number;
  fuzzers: number;
  resources: number;
}

export interface CanvasProps {
  counts?: CanvasCounts;
}

/** Угловая статичная карточка-счётчик, приклеенная к краю экрана */
function CornerCard({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div
      style={{
        background: "rgba(11, 15, 23, 0.88)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${color}33`,
        borderTop: `2px solid ${color}`,
        borderRadius: 8,
        width: 220,
        minHeight: 68,
        padding: "8px 12px",
        fontFamily: "Golos UI, sans-serif",
        color: "#E2E8F0",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        userSelect: "none",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color }}
        >
          {label}
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${color}18`, color }}
        >
          {count}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="h-1.5 rounded" style={{ background: `${color}22`, width: "100%" }} />
        <div className="h-1.5 rounded" style={{ background: `${color}18`, width: "65%" }} />
        <div className="h-1.5 rounded" style={{ background: `${color}10`, width: "35%" }} />
      </div>
    </div>
  );
}

export function Canvas({ counts }: CanvasProps) {
  const c = counts ?? { pages: 0, scenarios: 0, modules: 0, fuzzers: 0, resources: 0 };

  // ── Сценарии из стора (демо-заполнение при первом входе) ──
  const decks = useScenarioDeckStore((s) => s.decks);
  const setDecks = useScenarioDeckStore((s) => s.setDecks);

  if (decks.length === 0) {
    setDecks([
      {
        id: "deck-1",
        title: "Juice Shop — Auth & Scan",
        description: "Логин, crawl, фаззинг, активное сканирование",
        continueOnError: true,
        steps: [],
        collapsed: false,
      },
    ]);
  }

  // ── Сценарии (draggable в центре) ──
  const scenarioNodes = useMemo<Node[]>(
    () =>
      decks.map((deck, i) => ({
        id: deck.id,
        type: "scenarioDeck",
        position: { x: 0, y: i * 440 },
        data: {
          deckId: deck.id,
          title: deck.title,
          description: deck.description,
          stepCount: deck.steps.length,
        } satisfies ScenarioDeckNodeData,
        draggable: true,
      })),
    [decks],
  );

  // ── Авторизация (draggable в центре под сценарием) ──
  const authNode = useMemo<Node>(
    () => ({
      id: "auth-profile",
      type: "authDeck",
      position: { x: 0, y: 160 },
      data: {
        title: "Профиль авторизации по умолчанию",
        method: "form" as const,
        description: "Login form / Bearer header",
      } satisfies AuthDeckNodeData,
      draggable: true,
    }),
    [],
  );

  const initialNodes = useMemo(
    () => [...scenarioNodes, authNode],
    [scenarioNodes, authNode],
  );

  const [enodes, _setEnodes, onEnodesChange] = useNodesState(initialNodes);
  const [eedges, _setEedges, _onEdgesChange] = useEdgesState([]);

  return (
    <div className="flex-1 w-full h-full flex flex-col relative overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <ReactFlow
          nodes={enodes}
          edges={eedges}
          onNodesChange={onEnodesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.4, maxZoom: 1.0, minZoom: 0.7 }}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#0C1322" }}
          minZoom={0.7}
          maxZoom={1.0}
        >
          {/* Сетка посветлее с хорошей видимостью точек */}
          <Background color="#24334F" gap={28} size={1.2} />

          {/* 4 угловые статичные формы, прибитые по краям вьюпорта */}
          <Panel position="top-left" className="!m-4 !p-0 pointer-events-none">
            <CornerCard label="Модели страниц" color="#38bdf8" count={c.pages} />
          </Panel>

          <Panel position="top-right" className="!m-4 !p-0 pointer-events-none">
            <CornerCard label="Модули данных" color="#22c55e" count={c.modules} />
          </Panel>

          <Panel position="bottom-left" className="!m-4 !p-0 pointer-events-none">
            <CornerCard label="Фаззеры" color="#f59e0b" count={c.fuzzers} />
          </Panel>

          <Panel position="bottom-right" className="!m-4 !p-0 pointer-events-none">
            <CornerCard label="Коннекторы и интеграции" color="#a855f7" count={c.resources} />
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
