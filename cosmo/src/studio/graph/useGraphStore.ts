/**
 * Zustand store графа (STUDIO-GRAPH-EXPLORER).
 * Хранит позиции нод, zoom и pan в сессии (localStorage), не трогая wired.
 * Стор отделён от React-дерева — canvas не триггерит ререндеры Студии.
 */
import { create } from 'zustand';
import type { GraphLayoutMap, GraphModel, GraphPosition } from './graphTypes';
import { CORNER_CATEGORY_IDS, layoutForNewNode, layoutGraph } from './graphLayout';

export interface GraphSessionState {
  /** Позиции, назначенные layout engine либо drag-and-drop. */
  positions: GraphLayoutMap;
  /** Модель графа (ноды + рёбра), актуальная при последней синхронизации. */
  lastModel: GraphModel | null;
  /** Выбранный id ноды (tabId). null = ничего не выбрано. */
  selectedNodeId: string | null;
  /** Сохраненный масштаб канваса в сессии. */
  zoom: number;
  /** Сохраненное смещение pan в сессии (null = инициализировать по умолчанию). */
  pan: GraphPosition | null;

  lastWorldW: number;
  lastWorldH: number;

  /** Инициализировать стор из модели: вычисляет layout и восстанавливает сохранённые позиции. */
  initFromModel: (model: GraphModel, worldW?: number, worldH?: number) => void;

  /** Обновить одну позицию ноды (drag-canvas). */
  setNodePosition: (nodeId: string, position: GraphPosition) => void;

  /** Atomically shift a group of nodes (drag-group). */
  setNodePositions: (positions: ReadonlyMap<string, GraphPosition>) => void;

  /** Выбрать/снять выделение ноды. */
  setSelected: (nodeId: string | null) => void;

  /** Установить zoom. */
  setZoom: (zoom: number) => void;

  /** Установить pan. */
  setPan: (pan: GraphPosition) => void;

  /** Добавить новый узел (после создания сущности через Action Hub). */
  addNodes: (newNodes: GraphModel['nodes'], model: GraphModel, worldW?: number, worldH?: number) => void;

  /** Сбросить стор (при полной смене проверки). */
  reset: () => void;
}

const EMPTY_POSITIONS: GraphLayoutMap = new Map();
const STORAGE_KEY = 'pk-graph-session-state-v10';

function loadPersistedState(): {
  positions?: GraphLayoutMap;
  zoom?: number;
  pan?: GraphPosition | null;
} {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const positions: GraphLayoutMap = new Map();
    if (Array.isArray(parsed.positions)) {
      parsed.positions.forEach(([id, pos]: [string, GraphPosition]) => {
        if (typeof id === 'string' && pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          positions.set(id, pos);
        }
      });
    }
    return {
      positions: positions.size > 0 ? positions : undefined,
      zoom: typeof parsed.zoom === 'number' && parsed.zoom >= 0.35 && parsed.zoom <= 1.5 ? parsed.zoom : undefined,
      pan:
        parsed.pan && typeof parsed.pan.x === 'number' && typeof parsed.pan.y === 'number'
          ? parsed.pan
          : null,
    };
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistStateDebounced(positions: GraphLayoutMap, zoom: number, pan: GraphPosition | null): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = {
        positions: Array.from(positions.entries()),
        zoom,
        pan,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, 200);
}

const persisted = loadPersistedState();

export const useGraphStore = create<GraphSessionState>()((set, get) => ({
  positions: persisted.positions ?? EMPTY_POSITIONS,
  lastModel: null,
  selectedNodeId: null,
  zoom: persisted.zoom ?? 1,
  pan: persisted.pan ?? null,
  lastWorldW: 0,
  lastWorldH: 0,

  initFromModel: (model, worldW, worldH) => {
    const existing = get().positions;
    const worldChanged = worldW !== get().lastWorldW || worldH !== get().lastWorldH;

    const computed = layoutGraph(model, worldW, worldH);
    if (worldChanged || !existing || existing.size === 0) {
      set({ positions: computed, lastModel: model, lastWorldW: worldW, lastWorldH: worldH });
    } else {
      const nextPositions = new Map(computed);
      existing.forEach((pos, id) => {
        const node = model.nodes.find((n) => n.id === id);
        if (node && CORNER_CATEGORY_IDS.has(node.categoryId)) return;
        if (!nextPositions.has(id)) nextPositions.set(id, pos);
      });
      set({ positions: nextPositions, lastModel: model });
    }
  },

  setNodePosition: (nodeId, position) => {
    const prev = get().positions;
    const next = new Map(prev);
    next.set(nodeId, position);
    set({ positions: next });
    persistStateDebounced(next, get().zoom, get().pan);
  },

  setNodePositions: (positions) => {
    const next = new Map(get().positions);
    positions.forEach((position, nodeId) => next.set(nodeId, position));
    set({ positions: next });
    persistStateDebounced(next, get().zoom, get().pan);
  },

  setSelected: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  setZoom: (zoom) => {
    set({ zoom });
    persistStateDebounced(get().positions, zoom, get().pan);
  },

  setPan: (pan) => {
    set({ pan });
    persistStateDebounced(get().positions, get().zoom, pan);
  },

  addNodes: (newNodes, model) => {
    const positions = new Map(get().positions);
    for (const node of newNodes) {
      if (!positions.has(node.id)) {
        positions.set(node.id, layoutForNewNode(model, node, positions));
      }
    }
    set({ positions, lastModel: model });
    persistStateDebounced(positions, get().zoom, get().pan);
  },

  reset: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    set({
      positions: EMPTY_POSITIONS,
      lastModel: null,
      selectedNodeId: null,
      zoom: 1,
      pan: null,
    });
  },
}));
