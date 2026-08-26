/**
 * SANCTUARY-MAP B2 — движок семантического зума и детерминированной раскладки.
 *
 * Семантический зум ≠ масштаб пикселей: прокрутка/клик меняют уровень абстракции.
 *   L0 (Обитель)  → focusPath = []                  → landscape-корни
 *   L1 (PrettyK)   → focusPath = ['prettyk-core']   → system-дети ядра
 *   L2 (поверхность) → focusPath = [..., 'studio-v2'] → surface-дети узла
 *
 * Кластеризация: при отдалении (drillUp) дети сворачиваются обратно в родителя.
 * Раскладка — детерминированная сетка (без случайности), что минимизирует
 * пересечение связей (дерево родитель→дети излучается из одного центра).
 * Правило когнитивной чистоты 7±2: в фокусе — дети выбранного узла (≤ 9).
 */

import type {
  SanctuarySystemMap,
  SanctuaryMapNode,
  SanctuaryMapEdge,
  MapLens,
} from './systemMapModel';
import { childrenOf, indexNodes, projectLens } from './systemMapModel';

export type ZoomLevel = 0 | 1 | 2;

export interface PlacedNode {
  node: SanctuaryMapNode;
  x: number;
  y: number;
}

export interface MapViewport {
  placed: PlacedNode[];
  edges: SanctuaryMapEdge[];
  focusPath: string[];
  zoomLevel: ZoomLevel;
  breadcrumbs: SanctuaryMapNode[];
  /** Узлы, в которые можно провалиться (есть дети в текущей линзе). */
  drillableIds: Set<string>;
  /** Свёрнутые кластеры (родители вне фокуса с детьми). */
  clusterIds: Set<string>;
}

/* ── геометрия сетки ── */
const CELL_W = 260;
const CELL_H = 150;
const BREADCRUMB_Y = -140;
const BREADCRUMB_STEP_X = 220;

function gridCount(count: number): number {
  if (count <= 0) return 1;
  return Math.ceil(Math.sqrt(count));
}

function gridPosition(index: number, cols: number): { x: number; y: number } {
  const row = Math.floor(index / cols);
  const col = index % cols;
  return { x: col * CELL_W, y: row * CELL_H };
}

/** Центрировать сетку по оси X (чтобы ряд был симметричен относительно нуля). */
function centerGrid(count: number, cols: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowCount = Math.min(cols, count - row * cols);
    const offset = (rowCount - 1) * CELL_W * 0.5;
    out.push({ x: col * CELL_W - offset, y: row * CELL_H });
  }
  return out;
}

/* ── семантический зум ── */

function zoomLevelOf(focusPath: string[]): ZoomLevel {
  if (focusPath.length === 0) return 0;
  if (focusPath.length === 1) return 1;
  return 2;
}

/** Провалиться в узел (если есть дети). */
export function drillDown(focusPath: string[], nodeId: string): string[] {
  if (focusPath[focusPath.length - 1] === nodeId) return focusPath;
  return [...focusPath, nodeId];
}

/** Подняться на один уровень. */
export function drillUp(focusPath: string[]): string[] {
  if (focusPath.length === 0) return focusPath;
  return focusPath.slice(0, -1);
}

/** Подняться до конкретного предка (клик по хлебной крошке). */
export function drillTo(focusPath: string[], nodeId: string): string[] {
  const idx = focusPath.indexOf(nodeId);
  if (idx < 0) return focusPath;
  return focusPath.slice(0, idx + 1);
}

/**
 * Полная проекция вьюпорта: какие узлы видимы, где стоят, какие связи видны,
 * что свёрнуто в кластеры, куда можно провалиться.
 */
export function computeView(
  map: SanctuarySystemMap,
  lens: MapLens,
  focusPath: string[],
): MapViewport {
  const projection = projectLens(map, lens);
  const idx = indexNodes(map);
  const visibleIds = new Set(projection.nodes.map((n) => n.id));

  const zoomLevel = zoomLevelOf(focusPath);
  const focusId = focusPath[focusPath.length - 1];

  // Хлебные крошки: все предки в текущем focusPath (включая фокусный узел).
  const breadcrumbs: SanctuaryMapNode[] = [];
  for (const id of focusPath) {
    const n = idx.get(id);
    if (n) breadcrumbs.push(n);
  }

  // Дети фокусного узла (в линзе). При L0 — корни (landscape без родителя).
  const displayChildren = focusId
    ? childrenOf(map, focusId).filter((n) => visibleIds.has(n.id))
    : projection.nodes.filter((n) => !n.parent);

  // Свёрнутые кластеры: узлы-родители вне фокуса, у которых есть дети в линзе.
  const clusterIds = new Set<string>();
  const drillableIds = new Set<string>();
  for (const n of projection.nodes) {
    const kids = childrenOf(map, n.id).filter((k) => visibleIds.has(k.id));
    if (kids.length > 0) {
      drillableIds.add(n.id);
      if (n.id !== focusId) clusterIds.add(n.id);
    }
  }

  // Видимые узлы = хлебные крошки + фокусный узел + дети.
  const placedNodes = new Map<string, PlacedNode>();
  const headerIds: string[] = [];

  // Хлебные крошки — компактный ряд сверху.
  breadcrumbs.forEach((node, i) => {
    placedNodes.set(node.id, {
      node,
      x: i * BREADCRUMB_STEP_X,
      y: BREADCRUMB_Y,
    });
    headerIds.push(node.id);
  });

  // Дети — сеткой внизу.
  const positions = centerGrid(displayChildren.length, gridCount(displayChildren.length));
  displayChildren.forEach((node, i) => {
    placedNodes.set(node.id, { node, x: positions[i]!.x, y: positions[i]!.y });
  });

  // Ребра — только между видимыми узлами.
  const edges = projection.edges.filter(
    (e) => placedNodes.has(e.source) && placedNodes.has(e.target),
  );

  return {
    placed: Array.from(placedNodes.values()),
    edges,
    focusPath: [...focusPath],
    zoomLevel,
    breadcrumbs,
    drillableIds,
    clusterIds,
  };
}
