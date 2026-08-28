/**
 * COS-F5: Pipeline DAG Visualization.
 *
 * Визуализация DAG: узлы (Batches) + рёбра (depends_on).
 * Статус каждого Batch: pending/running/passed/failed/blocked.
 * Gates между Batches с индикаторами.
 * Цветовая схема: passed=зелёный, failed=красный, blocked=оранжевый, running=синий.
 */
import { useMemo } from 'react';
import { Tag, Tooltip, Typography, Empty } from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, SyncOutlined, ClockCircleFilled, MinusCircleFilled,
} from '@ant-design/icons';

export type BatchStatus = 'pending' | 'running' | 'passed' | 'failed' | 'blocked';

export interface DAGBatch {
  id: string;
  name: string;
  status: BatchStatus;
  kind: string;          // e.g. SAST, SCA, Build, DAST, Gate
  dependsOn?: string[];  // upstream batch ids
  progress?: number;     // 0..100 when running
  gateResult?: 'pass' | 'fail' | 'watch' | null;
}

const MOCK_DAG: DAGBatch[] = [
  { id: 'b1', name: 'Checkout & Build', status: 'passed', kind: 'Build' },
  { id: 'b2', name: 'SAST: Semgrep', status: 'passed', kind: 'SAST', dependsOn: ['b1'], gateResult: 'pass' },
  { id: 'b3', name: 'SCA: Dep Check', status: 'passed', kind: 'SCA', dependsOn: ['b1'], gateResult: 'pass' },
  { id: 'b4', name: 'Deploy to Stage', status: 'running', kind: 'Deploy', dependsOn: ['b2', 'b3'], progress: 65 },
  { id: 'b5', name: 'DAST: scanner Scan', status: 'pending', kind: 'DAST', dependsOn: ['b4'] },
  { id: 'b6', name: 'Quality Gate', status: 'pending', kind: 'Gate', dependsOn: ['b5'], gateResult: null },
];

const STATUS_CONFIG: Record<BatchStatus, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  pending:  { color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: <ClockCircleFilled />, label: 'Pending' },
  running:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   icon: <SyncOutlined spin />, label: 'Running' },
  passed:   { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    icon: <CheckCircleFilled />, label: 'Passed' },
  failed:   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    icon: <CloseCircleFilled />, label: 'Failed' },
  blocked:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   icon: <MinusCircleFilled />, label: 'Blocked' },
};

const GATE_LABELS: Record<string, string> = { pass: '✓ Gate', fail: '✗ Gate', watch: '⚠ Gate' };
const GATE_COLORS: Record<string, string> = { pass: '#22c55e', fail: '#ef4444', watch: '#f59e0b' };

interface DAGLayoutPos {
  x: number;
  y: number;
}

function layoutDAG(batches: DAGBatch[]): Map<string, DAGLayoutPos> {
  const positions = new Map<string, DAGLayoutPos>();
  const resolved = new Set<string>();
  let maxDepth = 0;

  // DFS to compute depth
  const depthMap = new Map<string, number>();
  const computeDepth = (id: string, visited: Set<string>): number => {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);
    const batch = batches.find((b) => b.id === id);
    if (!batch || !batch.dependsOn || batch.dependsOn.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...batch.dependsOn.map((dep) => computeDepth(dep, new Set(visited))));
    depthMap.set(id, d);
    maxDepth = Math.max(maxDepth, d);
    return d;
  };

  batches.forEach((b) => computeDepth(b.id, new Set()));

  // Place nodes by depth
  const depthSlots = new Map<number, number>();
  for (const batch of batches) {
    const depth = depthMap.get(batch.id) ?? 0;
    const slot = depthSlots.get(depth) ?? 0;
    positions.set(batch.id, { x: depth * 220 + 20, y: slot * 120 + 20 });
    depthSlots.set(depth, slot + 1);
    resolved.add(batch.id);
  }
  return positions;
}

export interface PipelineDAGProps {
  batches?: DAGBatch[];
  onSelectBatch?: (batchId: string) => void;
}

export function PipelineDAG({ batches = MOCK_DAG, onSelectBatch }: PipelineDAGProps) {
  const positions = useMemo(() => layoutDAG(batches), [batches]);

  const edges = useMemo(() => {
    const result: { from: string; to: string; fromPos: DAGLayoutPos; toPos: DAGLayoutPos }[] = [];
    for (const b of batches) {
      if (b.dependsOn) {
        for (const depId of b.dependsOn) {
          const fromPos = positions.get(depId);
          const toPos = positions.get(b.id);
          if (fromPos && toPos) {
            result.push({ from: depId, to: b.id, fromPos, toPos });
          }
        }
      }
    }
    return result;
  }, [batches, positions]);

  const svgW = Math.max(...Array.from(positions.values()).map((p) => p.x + 200), 400);
  const svgH = Math.max(...Array.from(positions.values()).map((p) => p.y + 80), 400);

  if (batches.length === 0) return <Empty description="Нет данных DAG" />;

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#070B14', padding: 12 }}>
      <svg width={svgW} height={svgH} style={{ minWidth: '100%', minHeight: 300 }}>
        {/* Edges */}
        {edges.map((e, i) => {
          const startX = e.fromPos.x + 180;
          const startY = e.fromPos.y + 30;
          const endX = e.toPos.x;
          const endY = e.toPos.y + 30;
          const midX = (startX + endX) / 2;
          return (
            <g key={`edge-${i}`}>
              <path
                d={`M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`}
                fill="none"
                stroke="#334155"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        })}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#334155" />
          </marker>
        </defs>

        {/* Nodes */}
        {batches.map((b) => {
          const pos = positions.get(b.id);
          if (!pos) return null;
          const cfg = STATUS_CONFIG[b.status];
          const hasGate = b.gateResult && b.kind === 'Gate';
          return (
            <foreignObject key={b.id} x={pos.x} y={pos.y} width={180} height={72}>
              <div
                onClick={() => onSelectBatch?.(b.id)}
                style={{
                  width: 170,
                  height: 64,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `2px solid ${cfg.color}40`,
                  background: cfg.bg,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                title={`${b.name}\nStatus: ${cfg.label}${b.progress !== undefined ? ` (${b.progress}%)` : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
                  <Typography.Text
                    strong
                    style={{ fontSize: 11, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {b.name}
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag color={cfg.color === '#22c55e' ? 'green' : cfg.color === '#ef4444' ? 'red' : cfg.color === '#3b82f6' ? 'blue' : cfg.color === '#f59e0b' ? 'orange' : 'default'} style={{ fontSize: 10, lineHeight: '14px', margin: 0 }}>
                    {b.kind}
                  </Tag>
                  {b.progress !== undefined && (
                    <Typography.Text style={{ fontSize: 10, color: '#64748b' }}>{b.progress}%</Typography.Text>
                  )}
                  {hasGate && (
                    <Tag color={b.gateResult === 'pass' ? 'green' : b.gateResult === 'fail' ? 'red' : 'orange'} style={{ fontSize: 10, lineHeight: '14px', margin: 0 }}>
                      {b.gateResult?.toUpperCase()}
                    </Tag>
                  )}
                </div>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}