/**
 * CRAWL-11: State graph visualization — read-only визуализация графа обхода.
 *
 * Узлы = состояния (сгруппированы по route)
 * Рёбра = действия (action type + target)
 * Цвет узла = глубина/статус
 *
 * Интерактив:
 *  - клик по узлу → превью snapshot
 *  - клик по ребру → превью action
 *  - фильтр по персоне (если CRAWL-9 выполнен)
 */
import { useMemo, useState, useCallback } from 'react';
import { Tag, Typography, Card, Space, Select, Empty, Badge } from 'antd';
import {
  NodeIndexOutlined, LinkOutlined, AimOutlined,
  CheckCircleFilled, CloseCircleFilled, MinusCircleFilled,
} from '@ant-design/icons';

export type VerdictIcon = 'safe' | 'dangerous' | 'out_of_scope' | 'blocked';

export interface GraphNode {
  id: string;
  route: string;
  label: string;
  title: string;
  depth: number;
  status: 'discovered' | 'visited' | 'blocked' | 'error';
  elements: number;
  /** Детали для превью snapshot. */
  snapshot?: { url: string; title: string; elementCount: number; at: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  action: string;
  actionTarget: string;
  verdict: VerdictIcon;
  /** Детали для превью action. */
  preview?: { actionType: string; target: string; outcome: string };
}

export interface CrawlGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  personaId?: string;
}

export interface StateGraphProps {
  graph: CrawlGraph;
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
}

const DEPTH_COLORS = ['#22d3ee', '#a855f7', '#f59e0b', '#ef4444', '#64748b'];
const STATUS_COLORS: Record<string, string> = {
  discovered: '#38bdf8', visited: '#22c55e', blocked: '#f59e0b', error: '#ef4444',
};
const VERDICT_ICONS: Record<VerdictIcon, React.ReactNode> = {
  safe: <CheckCircleFilled style={{ color: '#22c55e', fontSize: 10 }} />,
  dangerous: <CloseCircleFilled style={{ color: '#ef4444', fontSize: 10 }} />,
  out_of_scope: <MinusCircleFilled style={{ color: '#f59e0b', fontSize: 10 }} />,
  blocked: <MinusCircleFilled style={{ color: '#f59e0b', fontSize: 10 }} />,
};

function layoutNodes(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const depthSlots = new Map<number, number>();
  for (const n of nodes) {
    const d = n.depth;
    const slot = depthSlots.get(d) ?? 0;
    pos.set(n.id, { x: d * 200 + 40, y: slot * 80 + 30 });
    depthSlots.set(d, slot + 1);
  }
  return pos;
}

const DEMO_GRAPH: CrawlGraph = {
  nodes: [
    { id: 's1', route: '/#/', label: 'Home', title: 'Главная', depth: 0, status: 'visited', elements: 8,
      snapshot: { url: '/#/', title: 'Главная страница', elementCount: 8, at: Date.now() } },
    { id: 's2', route: '/#/login', label: 'Login', title: 'Вход', depth: 1, status: 'visited', elements: 4 },
    { id: 's3', route: '/#/dashboard', label: 'Dashboard', title: 'Дашборд', depth: 1, status: 'visited', elements: 12 },
    { id: 's4', route: '/#/', label: 'Settings Modal', title: 'Настройки (модалка)', depth: 2, status: 'visited', elements: 5 },
    { id: 's5', route: '/#/dashboard', label: 'Profile Tab', title: 'Профиль (таб)', depth: 2, status: 'visited', elements: 6 },
  ],
  edges: [
    { id: 'e1', source: 's1', target: 's2', action: 'click', actionTarget: 'Логин', verdict: 'safe' },
    { id: 'e2', source: 's1', target: 's3', action: 'click', actionTarget: 'Дашборд', verdict: 'safe' },
    { id: 'e3', source: 's1', target: 's4', action: 'click', actionTarget: 'Настройки', verdict: 'safe' },
    { id: 'e4', source: 's3', target: 's5', action: 'click', actionTarget: 'Профиль', verdict: 'safe' },
    { id: 'e5', source: 's1', target: 's1', action: 'click', actionTarget: 'Выйти', verdict: 'blocked',
      preview: { actionType: 'click', target: 'Выйти', outcome: 'blocked: dangerous_action' } },
    { id: 'e6', source: 's1', target: 's1', action: 'click', actionTarget: 'Удалить аккаунт', verdict: 'dangerous',
      preview: { actionType: 'click', target: 'Удалить аккаунт', outcome: 'blocked: dangerous_action' } },
  ],
};

export function StateGraphVisualization({
  graph = DEMO_GRAPH,
  onSelectNode, onSelectEdge,
}: StateGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const layout = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNode(id); setSelectedEdge(null);
    onSelectNode?.(id);
  }, [onSelectNode]);

  const handleEdgeClick = useCallback((id: string) => {
    setSelectedEdge(id); setSelectedNode(null);
    onSelectEdge?.(id);
  }, [onSelectEdge]);

  const nodeData = selectedNode ? graph.nodes.find((n) => n.id === selectedNode) : null;
  const edgeData = selectedEdge ? graph.edges.find((e) => e.id === selectedEdge) : null;

  if (graph.nodes.length === 0) return <Empty description="Нет данных графа" />;

  const maxY = Math.max(...Array.from(layout.values()).map((p) => p.y), 100) + 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#070B14', fontFamily: 'Golos UI, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid #1e293b', background: '#0A0E1A' }}>
        <NodeIndexOutlined style={{ color: '#a855f7' }} />
        <Typography.Text strong style={{ color: '#e2e8f0', fontSize: 13 }}>Граф обхода</Typography.Text>
        <Tag color="cyan">{graph.nodes.length} состояний</Tag>
        <Tag color="blue">{graph.edges.length} переходов</Tag>
        {graph.personaId && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>Персона: {graph.personaId}</span>}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', padding: 16 }}>
        <svg width="100%" height={maxY}>
          {/* Рёбра */}
          {graph.edges.map((e) => {
            const from = layout.get(e.source);
            const to = layout.get(e.target);
            if (!from || !to) return null;
            const isSelf = e.source === e.target;
            const active = selectedEdge === e.id;
            return (
              <g key={e.id} onClick={() => handleEdgeClick(e.id)} style={{ cursor: 'pointer' }}>
                {isSelf ? (
                  <path
                    d={`M${from.x + 140},${from.y + 16} C${from.x + 180},${from.y - 16} ${from.x + 180},${from.y + 36} ${from.x + 140},${from.y + 16}`}
                    fill="none" stroke={active ? '#38bdf8' : '#334155'} strokeWidth={active ? 2.5 : 1.5}
                    markerEnd="url(#arrowhead)"
                  />
                ) : (
                  <path
                    d={`M${from.x + 140},${from.y + 16} C${from.x + 170},${from.y + 16} ${to.x - 30},${to.y + 16} ${to.x - 10},${to.y + 16}`}
                    fill="none" stroke={active ? '#38bdf8' : '#334155'} strokeWidth={active ? 2.5 : 1.5}
                    markerEnd="url(#arrowhead)"
                  />
                )}
                <text x={(from.x + (to ? to.x : from.x)) / 2 + 70} y={from.y + 10}
                  fontSize={8} fill="#64748b" textAnchor="middle">
                  {e.actionTarget.slice(0, 12)}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#334155" />
            </marker>
          </defs>

          {/* Узлы */}
          {graph.nodes.map((n) => {
            const pos = layout.get(n.id);
            if (!pos) return null;
            const active = selectedNode === n.id;
            const color = DEPTH_COLORS[n.depth % DEPTH_COLORS.length] ?? '#64748b';
            const statusColor = STATUS_COLORS[n.status] ?? '#64748b';
            return (
              <g key={n.id} onClick={() => handleNodeClick(n.id)} style={{ cursor: 'pointer' }}>
                <rect x={pos.x} y={pos.y} width={140} height={36} rx={6}
                  fill={active ? 'rgba(56,189,248,0.1)' : '#0F172A'}
                  stroke={active ? '#38bdf8' : color} strokeWidth={1.5} />
                <circle cx={pos.x + 12} cy={pos.y + 18} r={4} fill={statusColor} />
                <text x={pos.x + 24} y={pos.y + 13} fontSize={10} fill="#e2e8f0" fontWeight={600}>{n.label}</text>
                <text x={pos.x + 24} y={pos.y + 27} fontSize={9} fill="#64748b">{n.route} · {n.elements} эл.</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Preview панель */}
      {(nodeData || edgeData) && (
        <Card size="small" style={{ margin: '8px 12px', background: '#0F172A', borderColor: '#1E293B' }}>
          {nodeData?.snapshot ? (
            <div>
              <Typography.Text strong style={{ color: '#38bdf8', fontSize: 12 }}>Состояние: {nodeData.label}</Typography.Text>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <Tag color="purple">{nodeData.route}</Tag>
                <Tag color="blue">{nodeData.snapshot.elementCount} элементов</Tag>
                <Tag color="grey">{new Date(nodeData.snapshot.at).toLocaleTimeString()}</Tag>
              </div>
            </div>
          ) : edgeData?.preview ? (
            <div>
              <Typography.Text strong style={{ color: '#f59e0b', fontSize: 12 }}>
                Переход: {edgeData.preview.actionType} → {edgeData.preview.target}
              </Typography.Text>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {VERDICT_ICONS[edgeData.verdict]}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{edgeData.preview.outcome}</span>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}