/** Interactive fixed-world canvas for the Studio entity graph. */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { StudioTree } from '../collectStudioNodes';
import type { StudioTabId } from '../studioTabs';
import { buildGraphFromTree } from './graphAdapter';
import { GRAPH_CATEGORY_HEADER_HEIGHT, GRAPH_CATEGORY_PADDING, GRAPH_GROUP_HEADER_HEIGHT, GRAPH_GROUP_PADDING, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, GRAPH_SLOT_GAP, GRAPH_MIN_ZOOM, graphSlotCount, graphWorldBounds, isCornerCategory, layoutCategories, layoutGraph, operationalFrame } from './graphLayout';
import type { GraphCategory, GraphEdge, GraphGroup, GraphIconKey, GraphModel, GraphNode, GraphPosition } from './graphTypes';
import { useGraphStore } from './useGraphStore';
import { GraphCorners } from './GraphCorners';
import { GraphWaveOverlay } from './GraphWaveOverlay';
import { GraphTelemetryOverlay, adaptiveSpeed, photonColor, type PhotonTrailConfig } from './GraphTelemetryOverlay';
import { NodeHudWhisperer, type HUDWhisperData } from './NodeHudWhisperer';
import { StepLanternLed, type StepLedState } from './StepLanternLed';
import { useGraphTelemetry, type GraphTelemetryEvent } from './useGraphTelemetry';
import { useGraphIdle } from './useGraphIdle';
import { useLocale } from '../../locales';
import scenarioIcon from '../../assets/studio-icons/scenario-3d.png';
import authIcon from '../../assets/studio-icons/auth-vault-3d.png';
import pageIcon from '../../assets/studio-icons/page-model-3d.png';
import connectorIcon from '../../assets/studio-icons/connector-3d.png';
import moduleIcon from '../../assets/studio-icons/module-cube-neon-3d.png';
import fuzzerIcon from '../../assets/studio-icons/fuzzer-3d.png';
import resourceIcon from '../../assets/studio-icons/data-module-3d.png';
import dataModuleIcon from '../../assets/studio-icons/module-cube-neon-3d.png';

const ICON_MAP: Record<GraphIconKey, string> = { scenario: scenarioIcon, auth: authIcon, page: pageIcon, module: moduleIcon, connector: connectorIcon, openapi: connectorIcon, graphql: connectorIcon, grpc: connectorIcon, chain: connectorIcon, fuzzer: fuzzerIcon, resource: resourceIcon };
const CATEGORY_ICON: Record<string, string> = {
  scenarios: scenarioIcon,
  'data-models': dataModuleIcon,
  'page-models': pageIcon,
  fuzzers: fuzzerIcon,
  connectors: connectorIcon,
  'auth-profiles': authIcon,
};
const NODE_W = GRAPH_NODE_WIDTH;
const NODE_H = GRAPH_NODE_HEIGHT;
const MIN_ZOOM = GRAPH_MIN_ZOOM;
const MAX_ZOOM = 1.5;
const DRAG_THRESHOLD = 4;
type PreviewPositions = Map<string, GraphPosition> | null;
type GroupBox = { left: number; top: number; width: number; height: number; slotCount: number };
type CategoryBox = { left: number; top: number; width: number; height: number; directSlotCount: number };
type CategoryDrag = { box: CategoryBox; startX: number; startY: number; origins: Map<string, GraphPosition>; moved: boolean };
type PanState = { startX: number; startY: number; originX: number; originY: number };
export type StudioGraphExplorerProps = { tree: StudioTree; selectedNodeId?: string | null; onSelectTab: (tabId: StudioTabId) => void; onAdd: () => void; isAddOpen?: boolean; onCloseAdd?: () => void; overlay?: ReactNode; onRename?: (node: GraphNode) => void; onDelete?: (node: GraphNode) => void; onOpenSettings?: () => void; onCategoryClick?: (categoryId: string) => void; };

function positionFor(id: string, positions: Map<string, GraphPosition>, preview: PreviewPositions): GraphPosition | undefined { return preview?.get(id) ?? positions.get(id); }
function groupBox(group: GraphGroup, positions: Map<string, GraphPosition>, preview: PreviewPositions): GroupBox | null {
  const members = group.memberIds.map((id) => positionFor(id, positions, preview)).filter((item): item is GraphPosition => Boolean(item));
  if (!members.length) return null;
  const left = Math.min(...members.map((item) => item.x - NODE_W / 2)) - GRAPH_GROUP_PADDING;
  const top = Math.min(...members.map((item) => item.y - NODE_H / 2)) - GRAPH_GROUP_PADDING - GRAPH_GROUP_HEADER_HEIGHT;
  const slots = graphSlotCount(group.memberIds.length);
  const rows = slots / 2;
  return { left, top, width: NODE_W * 2 + GRAPH_SLOT_GAP + GRAPH_GROUP_PADDING * 2, height: GRAPH_GROUP_HEADER_HEIGHT + GRAPH_GROUP_PADDING * 2 + rows * NODE_H + Math.max(0, rows - 1) * GRAPH_SLOT_GAP, slotCount: slots };
}
function groupBoxes(model: GraphModel, positions: Map<string, GraphPosition>, preview: PreviewPositions): Map<string, GroupBox> {
  const result = new Map<string, GroupBox>();
  model.groups.forEach((group) => { const box = groupBox(group, positions, preview); if (box) result.set(group.id, box); });
  return result;
}
function categoryBox(category: GraphCategory, model: GraphModel, positions: Map<string, GraphPosition>, preview: PreviewPositions, worldW: number, worldH: number): CategoryBox | null {
  const baseBox = layoutCategories(model, worldW, worldH).get(category.id);
  if (!baseBox) return null;
  if (isCornerCategory(category.id)) {
    return { left: baseBox.left, top: baseBox.top, width: baseBox.width, height: baseBox.height, directSlotCount: baseBox.directSlotCount };
  }
  const memberId = category.directMemberIds[0] ?? model.groups.find((group) => category.groupIds.includes(group.id))?.memberIds[0];
  const basePosition = memberId ? layoutGraph(model, worldW, worldH).get(memberId) : undefined;
  const currentPosition = memberId ? positionFor(memberId, positions, preview) : undefined;
  const shiftX = basePosition && currentPosition ? currentPosition.x - basePosition.x : 0;
  const shiftY = basePosition && currentPosition ? currentPosition.y - basePosition.y : 0;
  return { left: baseBox.left + shiftX, top: baseBox.top + shiftY, width: baseBox.width, height: baseBox.height, directSlotCount: baseBox.directSlotCount };
}
function categoryBoxes(model: GraphModel, positions: Map<string, GraphPosition>, preview: PreviewPositions, worldW: number, worldH: number): Map<string, CategoryBox> {
  const result = new Map<string, CategoryBox>();
  model.categories.forEach((category) => { const box = categoryBox(category, model, positions, preview, worldW, worldH); if (box) result.set(category.id, box); });
  return result;
}
function edgeLine(edge: GraphEdge, nodes: Map<string, GraphNode>, boxes: Map<string, GroupBox>, positions: Map<string, GraphPosition>, selected: string | null | undefined, preview: PreviewPositions): React.JSX.Element | null {
  const endpoint = (id: string): GraphPosition | undefined => { const groupId = nodes.get(id)?.groupId; const box = groupId ? boxes.get(groupId) : undefined; return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : positionFor(id, positions, preview); };
  const source = endpoint(edge.source); const target = endpoint(edge.target);
  if (!source || !target) return null;
  const active = edge.source === selected || edge.target === selected || preview?.has(edge.source) || preview?.has(edge.target);
  return <g key={edge.id} className={active ? 'pk-graph-edge pk-graph-edge--active' : 'pk-graph-edge'} data-testid={`graph-edge-${edge.id}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={edge.color} strokeWidth={active ? 2.4 : 1.5} strokeOpacity={active ? .88 : .32} /></g>;
}
function clampPan(pan: GraphPosition, zoom: number, world: { width: number; height: number }, frameW: number, frameH: number): GraphPosition {
  const worldW = world.width; const worldH = world.height;
  const scaledW = worldW * zoom; const scaledH = worldH * zoom;
  return {
    x: scaledW <= frameW ? (frameW - scaledW) / 2 : Math.min(0, Math.max(frameW - scaledW, pan.x)),
    y: scaledH <= frameH ? (frameH - scaledH) / 2 : Math.min(0, Math.max(frameH - scaledH, pan.y)),
  };
}

/** Не даёт боксу выйти за видимый viewport, но не затаскивает его обратно, если он уже снаружи. */
function clampExit(delta: number, boxStart: number, boxSize: number, viewportStart: number, viewportEnd: number): number {
  let lo = -Infinity; let hi = Infinity;
  if (boxStart >= viewportStart) lo = viewportStart - boxStart;
  if (boxStart + boxSize <= viewportEnd) hi = viewportEnd - (boxStart + boxSize);
  return Math.min(hi, Math.max(lo, delta));
}

interface GraphNodeCardProps { node: GraphNode; position: GraphPosition; isSelected: boolean; ledState?: StepLedState; onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void; onClick: () => void; onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void; }
const GraphNodeCard = memo(function GraphNodeCard({ node, position, isSelected, ledState, onPointerDown, onClick, onContextMenu }: GraphNodeCardProps): React.JSX.Element {
  return <div className={`pk-graph-node ${isSelected ? 'pk-graph-node--selected' : ''}`} style={{ left: position.x - NODE_W / 2, top: position.y - NODE_H / 2, width: NODE_W, height: NODE_H }} onPointerDown={onPointerDown} onClick={onClick} onContextMenu={onContextMenu} data-testid={`graph-node-${node.id}`} role="button" tabIndex={0} aria-label={node.title}><div className="pk-graph-node-body">{ledState ? <StepLanternLed state={ledState} size={8} tooltip={`${node.title}: ${ledState}`} /> : null}<div className="pk-graph-node-text"><span className="pk-graph-node-title" title={node.title}>{node.title}</span><span className="pk-graph-node-meta">{node.meta}</span></div><div className="pk-graph-node-badge" style={{ background: node.badgeColor }} /></div></div>;
});

function eventNodeId(event: GraphTelemetryEvent): string | undefined {
  const candidate = event.step_id ?? event.facts?.node_id;
  return typeof candidate === 'string' ? candidate : undefined;
}

function ledStateFor(event: GraphTelemetryEvent | undefined): StepLedState | undefined {
  if (!event) return undefined;
  if (event.status === 'running') return 'running';
  if (event.status === 'success' || event.status === 'succeeded' || event.status === 'ok') return 'success';
  if (event.status === 'warning') return 'warning';
  if (event.status === 'failure' || event.status === 'failed' || event.status === 'error') return 'failure';
  if (event.status === 'predicted') return 'predicted';
  return 'queued';
}

export const StudioGraphExplorer = memo(function StudioGraphExplorer({ tree, selectedNodeId, onSelectTab, onAdd, isAddOpen, onCloseAdd, overlay, onRename, onDelete, onOpenSettings, onCategoryClick }: StudioGraphExplorerProps): React.JSX.Element {
  const positions = useGraphStore((state) => state.positions);
  const setNodePositions = useGraphStore((state) => state.setNodePositions);
  const initFromModel = useGraphStore((state) => state.initFromModel);
  const setSelected = useGraphStore((state) => state.setSelected);
  const storeZoom = useGraphStore((state) => state.zoom);
  const setStoreZoom = useGraphStore((state) => state.setZoom);
  const storePan = useGraphStore((state) => state.pan);
  const setStorePan = useGraphStore((state) => state.setPan);
const model = useMemo(() => buildGraphFromTree(tree), [tree]);
  const graphRef = useRef<HTMLElement>(null);
  const modelRef = useRef(model);
  const dragRef = useRef<CategoryDrag | null>(null);
  const panRef = useRef<PanState | null>(null);
  const previewRef = useRef<PreviewPositions>(null);
  const suppressClickRef = useRef(false);
  const [preview, setPreview] = useState<PreviewPositions>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node?: GraphNode } | null>(null);
  const telemetry = useGraphTelemetry();

  const zoom = storeZoom;
  const pan = storePan ?? { x: 0, y: 0 };
  const setZoom = setStoreZoom;
  const setPan = setStorePan;

  const FRAME_INSET = 54;
  const frameW = Math.max(0, viewportSize.width - FRAME_INSET * 2);
  const frameH = Math.max(0, viewportSize.height - FRAME_INSET * 2);
  const world = useMemo(() => graphWorldBounds(model, frameW, frameH), [model, frameW, frameH]);

  useEffect(() => { modelRef.current = model; initFromModel(model, world.width, world.height); }, [model, initFromModel, world.width, world.height]);
  useEffect(() => {
    const measure = () => {
      const rect = graphRef.current?.getBoundingClientRect();
      if (rect) setViewportSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (graphRef.current) observer?.observe(graphRef.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const nodes = useMemo(() => new Map(model.nodes.map((node) => [node.id, node])), [model]);
  const groupsById = useMemo(() => new Map(model.groups.map((group) => [group.id, group])), [model]);
  const categoriesById = useMemo(() => new Map(model.categories.map((category) => [category.id, category])), [model]);
  useEffect(() => {
    if (useGraphStore.getState().pan === null) {
      setPan({ x: 0, y: 0 });
    }
  }, [setPan, world.minX, world.minY, world.width, world.height]);
  const boxes = useMemo(() => groupBoxes(model, positions, preview), [model, positions, preview]);
  const categoryBoxesMap = useMemo(() => categoryBoxes(model, positions, preview, world.width, world.height), [model, positions, preview, world.width, world.height]);
  const opFrame = useMemo(() => operationalFrame(world.width, world.height), [world.width, world.height]);
  const finish = useCallback((commit: boolean) => {
    const draft = previewRef.current;
    if (commit && dragRef.current?.moved && draft) { setNodePositions(draft); suppressClickRef.current = true; window.setTimeout(() => { suppressClickRef.current = false; }, 0); }
    dragRef.current = null; panRef.current = null; previewRef.current = null; setPreview(null); setIsPanning(false);
  }, [setNodePositions]);
  useEffect(() => { const cancel = () => finish(false); window.addEventListener('blur', cancel); return () => window.removeEventListener('blur', cancel); }, [finish]);

  const startCategoryDrag = useCallback((category: GraphCategory, box: CategoryBox, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isCornerCategory(category.id)) return;
    event.stopPropagation();
    const ids = [...category.directMemberIds, ...category.groupIds.flatMap((id) => groupsById.get(id)?.memberIds ?? [])];
    const origins = new Map(ids.map((id) => [id, positions.get(id)] as const).filter((entry): entry is [string, GraphPosition] => Boolean(entry[1])));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { box, startX: event.clientX, startY: event.clientY, origins, moved: false };
  }, [groupsById, positions]);
  const onNodePointerDown = useCallback((node: GraphNode) => (event: ReactPointerEvent<HTMLDivElement>) => { const category = categoriesById.get(node.categoryId); const box = category ? categoryBoxesMap.get(category.id) : undefined; if (category && box) startCategoryDrag(category, box, event); }, [categoriesById, categoryBoxesMap, startCategoryDrag]);
  const onGroupPointerDown = useCallback((group: GraphGroup, event: ReactPointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('.pk-graph-node')) return; const category = categoriesById.get(group.categoryId); const box = category ? categoryBoxesMap.get(category.id) : undefined; if (category && box) startCategoryDrag(category, box, event); }, [categoriesById, categoryBoxesMap, startCategoryDrag]);
  const onCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.pk-graph-node, .pk-graph-group, .pk-graph-category, .pk-studio-graph-add, .pk-graph-context-menu, .pk-studio-graph-overlay')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y }; setIsPanning(true);
  }, [pan]);
const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      const panning = panRef.current;
      if (panning) setPan(clampPan({ x: panning.originX + event.clientX - panning.startX, y: panning.originY + event.clientY - panning.startY }, zoom, world, frameW, frameH));
      return;
    }
    const dx = (event.clientX - drag.startX) / zoom; const dy = (event.clientY - drag.startY) / zoom;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const shiftX = clampExit(dx, drag.box.left, drag.box.width, 0, world.width);
    const shiftY = clampExit(dy, drag.box.top, drag.box.height, 0, world.height);
    const next = new Map([...drag.origins].map(([id, origin]) => [id, { x: origin.x + shiftX, y: origin.y + shiftY }]));
    previewRef.current = next; setPreview(next);
  }, [world, zoom, frameW, frameH, setPan]);
  const onWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const viewport = event.currentTarget.getBoundingClientRect();
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    if (nextZoom === zoom) return;

    const cursorX = event.clientX - (viewport.left + 54);
    const cursorY = event.clientY - (viewport.top + 54);

    const newPanX = cursorX - (cursorX - pan.x) * (nextZoom / zoom);
    const newPanY = cursorY - (cursorY - pan.y) * (nextZoom / zoom);

    setZoom(nextZoom);
    setPan(clampPan({ x: newPanX, y: newPanY }, nextZoom, world, frameW, frameH));
  }, [zoom, pan, world, frameW, frameH, setZoom, setPan]);

  const onNodeClick = useCallback((id: string) => () => { if (suppressClickRef.current) return; setSelected(id); const node = modelRef.current.nodes.find((item) => item.id === id); if (node) onSelectTab(node.tabId); }, [onSelectTab, setSelected]);
  const { isIdle } = useGraphIdle(graphRef, 20_000);
  const latestEventByNode = useMemo(() => {
    const result = new Map<string, GraphTelemetryEvent>();
    telemetry.forEach((event) => {
      const nodeId = eventNodeId(event);
      if (nodeId) result.set(nodeId, event);
    });
    return result;
  }, [telemetry]);
  const activeTelemetry = [...telemetry].reverse().find((event) => {
    const nodeId = eventNodeId(event);
    return Boolean(nodeId && nodes.has(nodeId));
  });
  const activeTelemetryNodeId = activeTelemetry ? eventNodeId(activeTelemetry) : undefined;
  const activeTelemetryPosition = activeTelemetryNodeId ? positionFor(activeTelemetryNodeId, positions, preview) : undefined;
  const photonEdges = useMemo<PhotonTrailConfig[]>(() => {
    const result: PhotonTrailConfig[] = [];
    const seen = new Set<string>();
    for (const event of telemetry) {
      if (event.kind !== 'edge.pulse') continue;
      const source = typeof event.facts?.source === 'string' ? event.facts.source : undefined;
      const target = typeof event.facts?.target === 'string' ? event.facts.target : undefined;
      const sourcePosition = source ? positionFor(source, positions, preview) : undefined;
      const targetPosition = target ? positionFor(target, positions, preview) : undefined;
      if (!source || !target || !sourcePosition || !targetPosition) continue;
      const edgeId = `${source}->${target}`;
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);
      const latency = typeof event.facts?.latency_ms === 'number' ? event.facts.latency_ms : 0;
      result.push({ edgeId, source: sourcePosition, target: targetPosition, color: photonColor(String(event.facts?.signal_kind ?? event.status)), speed: adaptiveSpeed(latency) });
    }
    return result;
  }, [positions, preview, telemetry]);
  const activeCategoryBox = activeTelemetryNodeId ? categoryBoxesMap.get(nodes.get(activeTelemetryNodeId)?.categoryId ?? '') : undefined;
  const telemetryLayerStyle = {
    position: 'absolute' as const,
    left: 54 + pan.x,
    top: 54 + pan.y,
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
    pointerEvents: 'none' as const,
    zIndex: 6,
  };
  const hudCenterX = activeTelemetryPosition ? 54 + pan.x + (activeTelemetryPosition.x - world.minX) * zoom : 0;
  const hudCenterY = activeTelemetryPosition ? 54 + pan.y + (activeTelemetryPosition.y - world.minY) * zoom : 0;
  const hudData: HUDWhisperData | null = activeTelemetry && activeTelemetryNodeId ? {
    nodeTitle: nodes.get(activeTelemetryNodeId)?.title ?? activeTelemetryNodeId,
    fact: `${activeTelemetry.kind} · ${activeTelemetry.status}${activeTelemetry.duration_ms ? ` · ${activeTelemetry.duration_ms}ms` : ''}`,
    whisper: activeTelemetry.kind === 'ai.whisper' && typeof activeTelemetry.facts?.whisper === 'string'
      ? activeTelemetry.facts.whisper
      : activeTelemetry.trust === 'hypothesis' ? 'AI hypothesis' : 'Verified execution event',
  } : null;
  const { dict } = useLocale();
  const catTitle = useCallback((id: string) => {
    const cats = dict.studio.categories;
    const keyMap: Record<string, keyof typeof cats> = { scenarios: 'scenarios', 'data-models': 'dataModels', 'page-models': 'pageModels', fuzzers: 'fuzzers', connectors: 'connectors', 'auth-profiles': 'authProfiles' };
    return cats[keyMap[id] ?? id as keyof typeof cats] ?? id;
  }, [dict]);
  const canvasStyle = { width: world.width, height: world.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'top left' };

   return <aside ref={graphRef} className={`pk-studio-graph${isPanning ? ' pk-studio-graph--panning' : ''}${isIdle ? ' pk-studio-graph--idle' : ''}`} data-testid="studio-graph-explorer" onPointerDown={onCanvasPointerDown} onPointerMove={onPointerMove} onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)} onClick={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }); }} onWheel={onWheel}>
     <div style={telemetryLayerStyle}><GraphCorners width={world.width} height={world.height} worldMinX={world.minX} worldMinY={world.minY} active={!isIdle && Boolean(activeTelemetry)} activeCenterX={activeTelemetryPosition?.x ?? 0} activeCenterY={activeTelemetryPosition?.y ?? 0} boxLeft={activeCategoryBox?.left} boxTop={activeCategoryBox?.top} boxWidth={activeCategoryBox?.width} boxHeight={activeCategoryBox?.height} /></div>
     <GraphWaveOverlay containerRef={graphRef} isIdle={isIdle} />
     <div style={telemetryLayerStyle}><GraphTelemetryOverlay width={world.width} height={world.height} worldMinX={world.minX} worldMinY={world.minY} photonEdges={photonEdges} inactiveEdgeIds={new Set<string>()} /></div>
     <NodeHudWhisperer data={hudData} nodeCenterX={hudCenterX} nodeCenterY={hudCenterY} visible={Boolean(hudData)} />
    {onOpenSettings ? (
      <button
        type="button"
        className="pk-studio-graph-gear"
        onClick={(event) => {
          event.stopPropagation();
          onOpenSettings();
        }}
        aria-label="Suite Settings"
        title="Suite Settings"
      >
        ⚙
      </button>
    ) : null}
    <button
      type="button"
      className={`pk-studio-graph-add ${isAddOpen ? 'pk-studio-graph-add--open' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        if (isAddOpen) {
          if (onCloseAdd) onCloseAdd();
          else onAdd();
        } else {
          onAdd();
        }
      }}
      aria-label={isAddOpen ? (dict.common.close ?? 'Закрыть') : dict.studio.addEntity}
      title={isAddOpen ? (dict.common.close ?? 'Закрыть') : dict.studio.addEntity}
    >
      {isAddOpen ? '−' : '+'}
    </button>
    {overlay}
    <div
      className="pk-graph-operational-frame"
      style={{
        left: 54,
        top: 54,
        width: frameW,
        height: frameH,
      }}
    >
      <div className="pk-graph-canvas" style={canvasStyle}>
        {model.categories.map((category) => {
           const box = categoryBoxesMap.get(category.id);
           if (!box) return null;
           const isCorner = isCornerCategory(category.id);
           return (
             <section
               key={category.id}
               className={`pk-graph-category${isCorner ? ' pk-graph-category--corner' : ''}`}
style={{ left: box.left - world.minX, top: box.top - world.minY, width: box.width, height: box.height, cursor: onCategoryClick ? 'pointer' : undefined }}
                data-testid={`graph-category-${category.id}`}
                onPointerDown={(event) => startCategoryDrag(category, box, event)}
                onClick={() => onCategoryClick?.(category.id)}
             >
               <h3>{CATEGORY_ICON[category.id] ? <img src={CATEGORY_ICON[category.id]} alt="" className="pk-graph-category-icon" /> : null}{catTitle(category.id)}</h3>
               <div className="pk-graph-category-slots" aria-hidden>{Array.from({ length: box.directSlotCount }, (_, index) => <span key={index} className={`pk-graph-category-slot${index < category.directMemberIds.length ? ' pk-graph-category-slot--occupied' : ''}`} data-testid={index === category.directMemberIds.length ? `graph-category-slot-${category.id}` : undefined} />)}</div>
             </section>
           );
         })}
        <svg className="pk-graph-edges" width={world.width} height={world.height} viewBox={`0 0 ${world.width} ${world.height}`} aria-hidden><g transform={`translate(${-world.minX} ${-world.minY})`}>{model.edges.map((edge) => edgeLine(edge, nodes, boxes, positions, selectedNodeId, preview))}</g></svg>
        {model.groups.map((group) => { const box = boxes.get(group.id); return box ? <div key={group.id} className="pk-graph-group" style={{ left: box.left - world.minX, top: box.top - world.minY, width: box.width, height: box.height }} data-testid={`graph-group-${group.id}`} onPointerDown={(event) => onGroupPointerDown(group, event)}><span className="pk-graph-group-title">{group.title}</span><div className="pk-graph-group-slots" aria-hidden>{Array.from({ length: box.slotCount }, (_, index) => <span key={index} className={`pk-graph-group-slot${index < group.memberIds.length ? ' pk-graph-group-slot--occupied' : ''}`} data-testid={index === group.memberIds.length ? `graph-group-slot-${group.id}` : undefined} />)}</div></div> : null; })}
         {model.nodes.map((node) => { const position = positionFor(node.id, positions, preview); const localPosition = position && { x: position.x - world.minX, y: position.y - world.minY }; return localPosition ? <GraphNodeCard key={node.id} node={node} position={localPosition} ledState={ledStateFor(latestEventByNode.get(node.id))} isSelected={selectedNodeId === node.id} onPointerDown={onNodePointerDown(node)} onClick={onNodeClick(node.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX, y: event.clientY, node }); }} /> : null; })}
      </div>
    </div>
    {contextMenu ? <div className="pk-graph-context-menu" style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translateY(-50%)' }} role="menu" onClick={(event) => event.stopPropagation()}>{contextMenu.node ? <><button type="button" onClick={() => { onRename?.(contextMenu.node!); setContextMenu(null); }}>{dict.common.rename}</button><button type="button" onClick={() => { onDelete?.(contextMenu.node!); setContextMenu(null); }}>{dict.common.delete}</button></> : <button type="button" onClick={() => { onAdd(); setContextMenu(null); }}>{dict.common.add} ...</button>}</div> : null}
  </aside>;
});
