/**
 * SANCTUARY-MAP — узел тактического радара (ReactFlow custom node).
 *
 * Карточка с LED-статусом рантайма, светофором готовности (native/mock/legacy),
 * маркером битой ссылки и индикатором «можно провалиться». Не рисует свои данные —
 * всё приходит из единого описания через `data.node`.
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';
import type { SanctuaryMapNode as SanctuaryNodeSpec, NodeStatus } from './systemMapModel';
import type { PortHealth } from './useLivePortStatus';

export interface SanctuaryMapNodeData {
  node: SanctuaryNodeSpec;
  health: PortHealth;
  isDrillable: boolean;
  isCluster: boolean;
  isFocused: boolean;
  brokenRoute: boolean;
  onDrill: (id: string) => void;
  onTeleport: (route: string) => void;
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  native_v2: '#10B981',
  hybrid_mock: '#F59E0B',
  legacy_only: '#EF4444',
  infrastructure: '#38BDF8',
  sealed_canon: '#A855F7',
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  native_v2: 'Native v2',
  hybrid_mock: 'Hybrid / Mock',
  legacy_only: 'Legacy Only',
  infrastructure: 'Infra',
  sealed_canon: 'Sealed Canon',
};

const HEALTH_COLOR: Record<PortHealth, string | null> = {
  alive: '#22D3EE',
  down: '#EF4444',
  unknown: '#64748B',
  'non-runtime': null,
};

const HEALTH_LABEL: Record<PortHealth, string> = {
  alive: 'жив',
  down: 'упал',
  unknown: 'нет доступа',
  'non-runtime': '',
};

function levelTag(level: string): string {
  switch (level) {
    case 'landscape':
      return 'L0';
    case 'system':
      return 'L1';
    case 'surface':
      return 'L2';
    default:
      return 'L3';
  }
}

function SanctuaryMapNodeInner({ data }: NodeProps) {
  const d = data as unknown as SanctuaryMapNodeData;
  const { node, health, isDrillable, isCluster, isFocused, brokenRoute } = d;
  const accent = STATUS_COLOR[node.status];
  const healthColor = HEALTH_COLOR[health];
  const port = node.portMeta?.port;

  return (
    <div
      data-testid={`map-node-${node.id}`}
      data-drillable={isDrillable || undefined}
      data-cluster={isCluster || undefined}
      data-broken={brokenRoute || undefined}
      className="cursor-pointer select-none"
      style={{
        background: '#0B0F17',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: isFocused ? accent : '#1E293B',
        borderTopWidth: 2,
        borderTopColor: accent,
        borderRadius: 8,
        minWidth: isCluster ? 150 : 220,
        maxWidth: 240,
        padding: '8px 12px',
        fontFamily: 'Golos UI, sans-serif',
        color: '#E2E8F0',
        fontSize: 12,
        boxShadow: isFocused ? `0 0 16px ${accent}33` : 'none',
        opacity: isCluster ? 0.82 : 1,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isDrillable) d.onDrill(node.id);
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: accent, width: 6, height: 6, opacity: 0.6 }} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[9px] font-mono px-1 py-0.5 rounded"
            style={{ background: '#1E293B', color: '#64748B' }}
          >
            {levelTag(node.level)}
          </span>
          <span className="text-[13px] font-semibold truncate">{node.label}</span>
        </div>
        {healthColor ? (
          <span
            data-testid={`led-${node.id}`}
            className="size-2 rounded-full shrink-0"
            style={{
              background: healthColor,
              boxShadow: `0 0 6px ${healthColor}`,
              animation: health === 'alive' ? 'pk-pulse 1.6s ease-in-out infinite' : 'none',
            }}
            title={health === 'non-runtime' ? '' : `${HEALTH_LABEL[health]} · :${port}`}
          />
        ) : null}
      </div>

      {node.subtitle ? (
        <div className="text-[10px] truncate mt-0.5" style={{ color: '#64748B' }}>
          {node.subtitle}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: accent }}>
          {STATUS_LABEL[node.status]}
        </span>
        <div className="flex items-center gap-1.5">
          {brokenRoute ? (
            <span title={`Битая ссылка: ${node.route}`} className="flex items-center gap-0.5 text-[9px]" style={{ color: '#EF4444' }}>
              <AlertTriangle className="size-3" />
            </span>
          ) : null}
          {node.route ? (
            <button
              type="button"
              data-testid={`teleport-${node.id}`}
              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(56,189,248,0.1)', color: '#38BDF8' }}
              title={`Перейти: ${node.route}`}
              onClick={(e) => {
                e.stopPropagation();
                d.onTeleport(node.route!);
              }}
            >
              <ExternalLink className="size-3" /> Перейти
            </button>
          ) : null}
          {isDrillable ? (
            <span className="flex items-center" style={{ color: '#64748B' }}>
              <ChevronRight className="size-3.5" />
            </span>
          ) : null}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: accent, width: 6, height: 6, opacity: 0.6 }} />
    </div>
  );
}

export const SanctuaryMapNode = memo(SanctuaryMapNodeInner);
