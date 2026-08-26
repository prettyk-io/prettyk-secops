/**
 * SANCTUARY-MAP — полноэкранный тактический радар Обители (#/sanctuary/map).
 *
 * B1 — карта из единого описания sanctuary/system-map.json (через @sanctuary alias),
 *      валидация битых ссылок/маршрутов, фильтр по линзе.
 * B2 — семантический зум L0→L1→L2 (focusPath), кластеризация при отдалении,
 *      детерминированная сетка без пересечения связей.
 * B3 — живой опрос портов, честный статус живой/упавший/не-рантаймный.
 * J1 — телепортация на канонический маршрут (не -v2), стабильность 100+ связей.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronLeft, RotateCcw, Map as MapIcon, Home } from 'lucide-react';

import systemMapJson from '@sanctuary/system-map.json';
import {
  loadSystemMap,
  classifyRoute,
  collectLenses,
  type SanctuarySystemMap,
  type SanctuaryMapEdgeType,
  type MapLens,
  type LensVisibility,
} from './systemMapModel';
import {
  computeView,
  drillDown,
  drillUp,
  drillTo,
} from './mapLayout';
import { useLivePortStatus } from './useLivePortStatus';
import { SanctuaryMapNode, type SanctuaryMapNodeData } from './SanctuaryMapNode';
import { parseHash, navigateHash } from '../checks/hashRoute';
import { getActiveCheckId } from '../checks/checksStore';

const LENS_META: { id: MapLens; label: string; key: string }[] = [
  { id: 'all', label: 'Все', key: '0' },
  { id: 'architecture', label: 'Архитектура', key: '1' },
  { id: 'flow', label: 'Поток', key: '2' },
  { id: 'runtime', label: 'Рантайм', key: '3' },
  { id: 'parity', label: 'Паритет', key: '4' },
  { id: 'ideas', label: 'Идеи', key: '5' },
];

const EDGE_STYLE: Record<
  SanctuaryMapEdgeType,
  { stroke: string; dash?: string; animated: boolean; marker: string }
> = {
  data_stream: { stroke: '#22D3EE', animated: true, marker: '#22D3EE' },
  dependency: { stroke: '#475569', animated: false, marker: '#475569' },
  airgap_barrier: { stroke: '#F59E0B', dash: '6,4', animated: false, marker: '#F59E0B' },
  user_step: { stroke: '#10B981', animated: true, marker: '#10B981' },
};

/** Разрешить маршрут узла для телепортации (подставить активный checkId). */
function resolveTeleportRoute(route: string): string | null {
  if (!route.includes('<id>')) return route;
  const id = getActiveCheckId();
  if (!id) return null;
  return route.replace(/<id>/g, id);
}

function buildEdges(edges: SanctuarySystemMap['edges']): Edge[] {
  return edges.map((e) => {
    const style = EDGE_STYLE[e.type];
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'default',
      animated: style.animated,
      style: {
        stroke: style.stroke,
        strokeDasharray: style.dash,
        strokeWidth: e.type === 'user_step' ? 2 : 1.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.marker, width: 14, height: 14 },
      labelStyle: { fill: '#64748B', fontSize: 9, fontFamily: 'Golos UI, sans-serif' },
      labelBgStyle: { fill: '#0B0F17', fillOpacity: 0.9 },
    };
  });
}

function SanctuaryMapInner(): React.JSX.Element {
  const { fitView } = useReactFlow();

  const { ok, map, issues } = useMemo(() => loadSystemMap(systemMapJson), []);
  const [lens, setLens] = useState<MapLens>('architecture');
  const [focusPath, setFocusPath] = useState<string[]>([]);

  const availableLenses = useMemo(() => (map ? collectLenses(map) : []), [map]);

  // B3: живой опрос статусов рантайм-узлов (всех, независимо от линзы).
  const allNodes = useMemo(() => map?.nodes ?? [], [map]);
  const portStatus = useLivePortStatus(allNodes);

  const view = useMemo(
    () => (map ? computeView(map, lens, focusPath) : null),
    [map, lens, focusPath],
  );

  const handleDrill = useCallback((id: string) => {
    setFocusPath((p) => drillDown(p, id));
  }, []);

  const handleAscend = useCallback(() => {
    setFocusPath((p) => drillUp(p));
  }, []);

  const handleReset = useCallback(() => {
    setFocusPath([]);
  }, []);

  const handleTeleport = useCallback((route: string) => {
    const resolved = resolveTeleportRoute(route);
    if (!resolved) {
      // Нет активной проверки для <id> → ведём честно к истории, а не «в пустоту».
      navigateHash({ kind: 'history' });
      return;
    }
    navigateHash(parseHash(resolved));
  }, []);

  // Мгновенный фокус при смене уровня/линзы.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ duration: 260, padding: 0.2, maxZoom: 1.2 });
    }, 30);
    return () => window.clearTimeout(t);
  }, [view?.zoomLevel, lens, focusPath.length, fitView]);

  // Горячие клавиши линз (0–5) и Backspace — наверх.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const meta = LENS_META.find((l) => l.key === e.key);
      if (meta) {
        e.preventDefault();
        setLens(meta.id);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Escape') {
        handleAscend();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAscend]);

  if (!ok || !map || !view) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3" style={{ background: '#06090F', color: '#64748B', fontFamily: 'Golos UI, sans-serif' }}>
        <MapIcon className="size-10" style={{ color: '#334155' }} />
        <div className="text-sm font-semibold" style={{ color: '#94A3B8' }}>
          Карта не загружена
        </div>
        <ul className="text-xs space-y-1 text-left">
          {issues.map((i, idx) => (
            <li key={idx} style={{ color: i.severity === 'error' ? '#EF4444' : '#F59E0B' }}>
              {i.message} {i.refId ? `(${i.refId})` : ''}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const nodes: Node[] = view.placed.map((p) => {
    const brokenRoute = p.node.route ? classifyRoute(p.node.route) === 'broken' : false;
    const data: SanctuaryMapNodeData = {
      node: p.node,
      health: portStatus[p.node.id] ?? 'non-runtime',
      isDrillable: view.drillableIds.has(p.node.id),
      isCluster: view.clusterIds.has(p.node.id),
      isFocused: focusPath[focusPath.length - 1] === p.node.id,
      brokenRoute,
      onDrill: handleDrill,
      onTeleport: handleTeleport,
    };
    return {
      id: p.node.id,
      type: 'sanctuaryNode',
      position: { x: p.x, y: p.y },
      data: data as unknown as Record<string, unknown>,
      draggable: false,
      selectable: true,
    };
  });

  const edges = buildEdges(view.edges);

  const zoomLabel = view.zoomLevel === 0 ? 'L0 · Обитель' : view.zoomLevel === 1 ? 'L1 · PrettyK' : 'L2 · Поверхность';

  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: '#06090F' }}>
      {/* Верхняя панель: линзы + хлебные крошки + управление зумом */}
      <div
        className="shrink-0 flex items-center gap-3 px-3 h-12"
        style={{ background: '#0B0F17', borderBottom: '1px solid #1E293B' }}
      >
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: '#E2E8F0', fontFamily: 'Golos UI, sans-serif' }}
          onClick={() => navigateHash({ kind: 'home' })}
          title="На главную"
        >
          <span className="flex items-center justify-center rounded size-6" style={{ background: 'linear-gradient(135deg, #0ea5e9, #7c3aed)' }}>
            <Home className="size-3.5 text-white" />
          </span>
          Радар
        </button>

        <div className="flex items-center gap-0.5 h-8 rounded" style={{ background: '#0B101C', border: '1px solid #1E293B', padding: 2 }}>
          {LENS_META.filter((l) => l.id === 'all' || (availableLenses as LensVisibility[]).includes(l.id as LensVisibility)).map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLens(l.id)}
              className="px-2.5 h-6 rounded text-[11px] font-medium transition-colors"
              style={{
                background: lens === l.id ? 'rgba(56,189,248,0.15)' : 'transparent',
                color: lens === l.id ? '#38BDF8' : '#64748B',
                fontFamily: 'Golos UI, sans-serif',
              }}
            >
              {l.label}
              <span className="ml-1 opacity-50">{l.key}</span>
            </button>
          ))}
        </div>

        {/* Хлебные крошки семантического зума */}
        <div className="flex items-center gap-1 text-[11px] min-w-0 overflow-hidden" style={{ fontFamily: 'Golos UI, sans-serif' }}>
          <button type="button" onClick={handleReset} className="flex items-center" style={{ color: '#64748B' }} title="L0">
            Обитель
          </button>
          {view.breadcrumbs.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1 shrink-0">
              <span style={{ color: '#334155' }}>›</span>
              <button
                type="button"
                onClick={() => setFocusPath(drillTo(focusPath, b.id))}
                style={{ color: i === view.breadcrumbs.length - 1 ? '#38BDF8' : '#94A3B8' }}
              >
                {b.label}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: '#0B101C', color: '#64748B' }}>
          {zoomLabel}
        </span>
        <button type="button" onClick={handleAscend} title="Назад (Backspace)" className="flex items-center justify-center size-7 rounded" style={{ color: '#94A3B8', background: '#0B101C', border: '1px solid #1E293B' }}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" onClick={handleReset} title="Сброс (L0)" className="flex items-center justify-center size-7 rounded" style={{ color: '#94A3B8', background: '#0B101C', border: '1px solid #1E293B' }}>
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {/* Канвас */}
      <div className="flex-1 relative min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ sanctuaryNode: SanctuaryMapNode }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          minZoom={0.15}
          maxZoom={2}
          fitView
          onNodeDoubleClick={(_e, node) => handleDrill(node.id)}
        >
          <Background color="#1E293B" gap={28} />
          <Controls
            className="!bg-[#0B0F17] !border-[#1E293B] !rounded-md [&>button]:!border-[#1E293B] [&>button]:!bg-[#0B101C] [&>button]:!text-[#94A3B8] [&>button:hover]:!bg-[#1E293B]"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-[#0B0F17] !border-[#1E293B]"
            nodeColor={(n) => STATUS_NODE_COLOR(n as Node)}
            maskColor="rgba(6,9,15,0.85)"
            pannable
            zoomable
          />
          <Panel position="bottom-center" className="!m-0 !p-0">
            <div className="text-[10px] font-mono px-3 py-1.5 rounded-t-md" style={{ background: '#0B0F17', color: '#475569', borderTop: '1px solid #1E293B', borderLeft: '1px solid #1E293B', borderRight: '1px solid #1E293B' }}>
              узлов {nodes.length} · связей {edges.length} · клик — провалиться · двойной клик — провалиться · Backspace — наверх
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

function STATUS_NODE_COLOR(n: Node): string {
  const d = n.data as unknown as SanctuaryMapNodeData | undefined;
  switch (d?.node.status) {
    case 'native_v2':
      return '#10B981';
    case 'hybrid_mock':
      return '#F59E0B';
    case 'legacy_only':
      return '#EF4444';
    case 'infrastructure':
      return '#38BDF8';
    case 'sealed_canon':
      return '#A855F7';
    default:
      return '#64748B';
  }
}

export function SanctuaryMap(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <SanctuaryMapInner />
    </ReactFlowProvider>
  );
}
