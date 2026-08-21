/** Deterministic floating-category layout for the Studio entity graph. */
import type { GraphCategory, GraphCategoryId, GraphLayoutMap, GraphModel, GraphNode, GraphPosition } from './graphTypes';

/** 4 Corner categories permanently anchored to edges (unmovable). */
export const CORNER_CATEGORY_IDS = new Set<GraphCategoryId>([
  'page-models',
  'data-models',
  'fuzzers',
  'connectors',
]);

export function isCornerCategory(id: GraphCategoryId): boolean {
  return CORNER_CATEGORY_IDS.has(id);
}

export const GRAPH_NODE_WIDTH = 180;
export const GRAPH_NODE_HEIGHT = 64;
export const GRAPH_GROUP_PADDING = 18;
export const GRAPH_GROUP_HEADER_HEIGHT = 40;
export const GRAPH_SLOT_GAP = 12;
export const GRAPH_CATEGORY_PADDING = 24;
export const GRAPH_CATEGORY_HEADER_HEIGHT = 42;
export const GRAPH_CATEGORY_GAP = 56;
export const GRAPH_CATEGORY_WIDTH =
  GRAPH_NODE_WIDTH * 2 + GRAPH_SLOT_GAP + GRAPH_GROUP_PADDING * 2 + GRAPH_CATEGORY_PADDING * 2;
export const GRAPH_WORLD_PADDING = 48;
export const GRAPH_FRAME_OFFSET = 54;
export function operationalFrame(worldW: number, worldH: number) {
  const M = GRAPH_FRAME_OFFSET;
  return { left: M, top: M, right: worldW - M, bottom: worldH - M };
}
export const GRAPH_MIN_ZOOM = 0.35;
export const GRAPH_CATEGORY_COLUMNS = 3;

type CategoryLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  directTop: number;
  directSlotCount: number;
};
export type GraphWorldBounds = { minX: number; minY: number; width: number; height: number };

export function graphSlotCount(memberCount: number): number {
  return Math.max(2, memberCount % 2 === 0 ? memberCount + 2 : memberCount + 1);
}

export function graphGroupHeight(memberCount: number): number {
  const rows = graphSlotCount(memberCount) / 2;
  return (
    GRAPH_GROUP_HEADER_HEIGHT +
    GRAPH_GROUP_PADDING * 2 +
    rows * GRAPH_NODE_HEIGHT +
    Math.max(0, rows - 1) * GRAPH_SLOT_GAP
  );
}

function asModel(modelOrNodes: GraphModel | GraphNode[]): GraphModel {
  return Array.isArray(modelOrNodes)
    ? { nodes: modelOrNodes, edges: [], groups: [], categories: [] }
    : modelOrNodes;
}

interface CategoryHeights {
  totalHeight: number;
  directGroupHeight: number;
  directSlotCount: number;
}

function computeCategoryHeights(model: GraphModel): Map<GraphCategoryId, CategoryHeights> {
  const groupsById = new Map(model.groups.map((group) => [group.id, group]));
  const heights = new Map<GraphCategoryId, CategoryHeights>();
  for (const category of model.categories) {
    let groupsHeight = 0;
    for (const groupId of category.groupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      groupsHeight += graphGroupHeight(group.memberIds.length) + GRAPH_SLOT_GAP;
    }
    const directGroupHeight = graphGroupHeight(category.directMemberIds.length);
    heights.set(category.id, {
      totalHeight: GRAPH_CATEGORY_HEADER_HEIGHT + GRAPH_CATEGORY_PADDING * 2 + groupsHeight + directGroupHeight,
      directGroupHeight,
      directSlotCount: graphSlotCount(category.directMemberIds.length),
    });
  }
  return heights;
}

function makeLayout(
  id: GraphCategoryId,
  left: number,
  top: number,
  heights: Map<GraphCategoryId, CategoryHeights>,
): CategoryLayout {
  const h = heights.get(id);
  const totalHeight = h?.totalHeight ?? 240;
  const directGroupHeight = h?.directGroupHeight ?? 0;
  const directSlotCount = h?.directSlotCount ?? 2;
  const groupsHeight = totalHeight - GRAPH_CATEGORY_HEADER_HEIGHT - GRAPH_CATEGORY_PADDING * 2 - directGroupHeight;
  return {
    left, top,
    width: GRAPH_CATEGORY_WIDTH,
    height: totalHeight,
    directTop: top + GRAPH_CATEGORY_HEADER_HEIGHT + GRAPH_CATEGORY_PADDING + groupsHeight,
    directSlotCount,
  };
}

/** Corner coords pinned to world edges with PAD margin. */
function pinCornerLeft(id: GraphCategoryId): 'tl' | 'tr' | 'bl' | 'br' {
  if (id === 'page-models') return 'tl';
  if (id === 'data-models') return 'tr';
  if (id === 'fuzzers') return 'bl';
  return 'br';
}

export function layoutCategories(
  model: GraphModel,
  worldW = 0,
  worldH = 0,
): Map<string, CategoryLayout> {
  const heights = computeCategoryHeights(model);
  const result = new Map<string, CategoryLayout>();

  if (worldW > 0 && worldH > 0) {
    const W = GRAPH_CATEGORY_WIDTH;
    for (const category of model.categories) {
      const { id } = category;
      if (!isCornerCategory(id)) continue;
      const h = heights.get(id)?.totalHeight ?? 240;
      const corner = pinCornerLeft(id);
      if (corner === 'tl')
        result.set(id, makeLayout(id, 0, 0, heights));
      else if (corner === 'tr')
        result.set(id, makeLayout(id, Math.max(0, worldW - W), 0, heights));
      else if (corner === 'bl')
        result.set(id, makeLayout(id, 0, Math.max(0, worldH - h), heights));
      else
        result.set(id, makeLayout(id, Math.max(0, worldW - W), Math.max(0, worldH - h), heights));
    }
    const topH = Math.max(heights.get('page-models')?.totalHeight ?? 0, heights.get('data-models')?.totalHeight ?? 0);
    const botH = Math.max(heights.get('fuzzers')?.totalHeight ?? 0, heights.get('connectors')?.totalHeight ?? 0);
    const topRowBottom = topH;
    const centerTop = topRowBottom + GRAPH_CATEGORY_GAP;
    const botRowTop = Math.max(centerTop, worldH - botH);
    const availableH = Math.max(0, botRowTop - centerTop);
    const scenH = heights.get('scenarios')?.totalHeight ?? 240;
    const authH = heights.get('auth-profiles')?.totalHeight ?? 240;
    const scenTop = centerTop + (availableH - scenH) / 2;
    const authTop = centerTop + (availableH - authH) / 2;
    const centerX = worldW / 2;
    result.set('scenarios', makeLayout('scenarios', Math.max(0, centerX - W - GRAPH_CATEGORY_GAP / 2), Math.max(0, scenTop), heights));
    result.set('auth-profiles', makeLayout('auth-profiles', centerX + GRAPH_CATEGORY_GAP / 2, Math.max(0, authTop), heights));
  } else {
    // Natural compact layout (fallback when no world dims)
    const getH = (id: GraphCategoryId) => heights.get(id)?.totalHeight ?? 240;
    const leftX = GRAPH_WORLD_PADDING;
    const rightX = GRAPH_WORLD_PADDING + 2 * (GRAPH_CATEGORY_WIDTH + GRAPH_CATEGORY_GAP);
    const centerX = (leftX + rightX) / 2;
    const topRowY = GRAPH_WORLD_PADDING;
    const topRowMaxH = Math.max(getH('page-models'), getH('data-models'));
    const centerRowY = topRowY + topRowMaxH + GRAPH_CATEGORY_GAP;
    const centerRowMaxH = Math.max(getH('scenarios'), getH('auth-profiles'));
    const bottomRowY = centerRowY + centerRowMaxH + GRAPH_CATEGORY_GAP;

    result.set('page-models', makeLayout('page-models', leftX, topRowY, heights));
    result.set('data-models', makeLayout('data-models', rightX, topRowY, heights));
    result.set('scenarios', makeLayout('scenarios', centerX - GRAPH_CATEGORY_WIDTH / 2 - 28, centerRowY, heights));
    result.set('auth-profiles', makeLayout('auth-profiles', centerX + GRAPH_CATEGORY_WIDTH / 2 + 28, centerRowY, heights));
    result.set('fuzzers', makeLayout('fuzzers', leftX, bottomRowY, heights));
    result.set('connectors', makeLayout('connectors', rightX, bottomRowY, heights));
  }

  return result;
}

/** World always starts at (0,0); sized to fill the operational viewport at MIN_ZOOM. */
export function graphWorldBounds(
  model: GraphModel,
  frameWidth = 0,
  frameHeight = 0,
): GraphWorldBounds {
  const widths = computeCategoryHeights(model);
  let contentMaxX = 0;
  let contentMaxY = 0;
  for (const category of model.categories) {
    const h = widths.get(category.id);
    if (!h) continue;
    contentMaxX = Math.max(contentMaxX, GRAPH_CATEGORY_WIDTH * 2 + GRAPH_CATEGORY_GAP + GRAPH_WORLD_PADDING);
    contentMaxY = Math.max(contentMaxY, h.totalHeight);
  }
  if (!model.categories.length) {
    contentMaxX = GRAPH_CATEGORY_WIDTH * 2 + GRAPH_CATEGORY_GAP + GRAPH_WORLD_PADDING;
    contentMaxY = 240;
  }
  return {
    minX: 0,
    minY: 0,
    width: frameWidth > 0 ? frameWidth / GRAPH_MIN_ZOOM : contentMaxX,
    height: frameHeight > 0 ? frameHeight / GRAPH_MIN_ZOOM : contentMaxY,
  };
}

export function layoutGraph(
  modelOrNodes: GraphModel | GraphNode[],
  worldW = 0,
  worldH = 0,
): GraphLayoutMap {
  const model = asModel(modelOrNodes);
  const positions: GraphLayoutMap = new Map();
  const groupsById = new Map(model.groups.map((group) => [group.id, group]));
  const categoryLayouts = layoutCategories(model, worldW, worldH);
  for (const category of model.categories) {
    const layout = categoryLayouts.get(category.id);
    if (!layout) continue;
    let cursorTop = layout.top + GRAPH_CATEGORY_HEADER_HEIGHT + GRAPH_CATEGORY_PADDING;
    for (const groupId of category.groupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      group.memberIds.forEach((nodeId, index) =>
        positions.set(nodeId, {
          x:
            layout.left +
            GRAPH_CATEGORY_PADDING +
            GRAPH_GROUP_PADDING +
            GRAPH_NODE_WIDTH / 2 +
            (index % 2) * (GRAPH_NODE_WIDTH + GRAPH_SLOT_GAP),
          y:
            cursorTop +
            GRAPH_GROUP_HEADER_HEIGHT +
            GRAPH_GROUP_PADDING +
            GRAPH_NODE_HEIGHT / 2 +
            Math.floor(index / 2) * (GRAPH_NODE_HEIGHT + GRAPH_SLOT_GAP),
        }),
      );
      cursorTop += graphGroupHeight(group.memberIds.length) + GRAPH_SLOT_GAP;
    }
    category.directMemberIds.forEach((nodeId, index) =>
      positions.set(nodeId, {
        x:
          layout.left +
          GRAPH_CATEGORY_PADDING +
          GRAPH_GROUP_PADDING +
          GRAPH_NODE_WIDTH / 2 +
          (index % 2) * (GRAPH_NODE_WIDTH + GRAPH_SLOT_GAP),
        y:
          layout.directTop +
          GRAPH_GROUP_HEADER_HEIGHT +
          GRAPH_GROUP_PADDING +
          GRAPH_NODE_HEIGHT / 2 +
          Math.floor(index / 2) * (GRAPH_NODE_HEIGHT + GRAPH_SLOT_GAP),
      }),
    );
  }
  return positions;
}

export function layoutForNewNode(
  modelOrNodes: GraphModel | GraphNode[],
  newNode: GraphNode,
  existing: GraphLayoutMap,
): GraphPosition {
  const model = asModel(modelOrNodes);
  return (
    layoutGraph(model).get(newNode.id) ?? {
      x: GRAPH_WORLD_PADDING + GRAPH_NODE_WIDTH / 2,
      y: GRAPH_WORLD_PADDING + GRAPH_NODE_HEIGHT / 2 + existing.size * (GRAPH_NODE_HEIGHT + GRAPH_SLOT_GAP),
    }
  );
}