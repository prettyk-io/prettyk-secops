/**
 * PRETTYK-CI — Durable Pipeline Store (PK-CI-1).
 *
 * Проверка описывается как граф шагов (зависимости, параллельные ветки, scope,
 * policy, approvals). Описание durable — переживает рестарт стенда.
 *
 *   import { createPipelineStore } from '@/ci/pipelineStore';
 */
import type { KVStorage } from './storage';
import { createStorage } from './storage';
import type {
  PipelineDefinition,
  StepNode,
  StepEdge,
  VersionRef,
} from './types';

const PREFIX = 'pk.ci.pipeline.';

// ═══════════════════════════════════════════════════════════════════════════
// Graph integrity checks (без циклов, без висячих ссылок)
// ═══════════════════════════════════════════════════════════════════════════

export interface GraphIssue {
  kind: 'missing_node' | 'missing_edge_ref' | 'cycle' | 'duplicate_id';
  detail: string;
}

/**
 * Валидация графа: уникальные id шагов, существование edge-ссылок, отсутствие циклов.
 */
export function validatePipelineGraph(def: PipelineDefinition): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set<string>();

  for (const s of def.steps) {
    if (ids.has(s.id)) {
      issues.push({ kind: 'duplicate_id', detail: `Duplicate step id: ${s.id}` });
    }
    ids.add(s.id);
  }

  for (const e of def.edges) {
    if (!ids.has(e.from)) {
      issues.push({ kind: 'missing_edge_ref', detail: `Edge from unknown node: ${e.from}` });
    }
    if (!ids.has(e.to)) {
      issues.push({ kind: 'missing_edge_ref', detail: `Edge to unknown node: ${e.to}` });
    }
  }

  // Cycle detection (Kahn's algorithm on depends_on/parallel edges)
  if (hasCycle(def.steps, def.edges)) {
    issues.push({ kind: 'cycle', detail: 'Pipeline graph contains a cycle' });
  }

  return issues;
}

function hasCycle(steps: StepNode[], edges: StepEdge[]): boolean {
  const indegree = new Map<string, number>();
  for (const s of steps) indegree.set(s.id, 0);
  const adjacency = new Map<string, string[]>();
  for (const s of steps) adjacency.set(s.id, []);

  for (const e of edges) {
    if (e.kind !== 'depends_on' && e.kind !== 'parallel') continue;
    adjacency.get(e.from)?.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const next of adjacency.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  return visited !== steps.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Topological order (для native-запуска и preview)
// ═══════════════════════════════════════════════════════════════════════════

export function topologicalOrder(steps: StepNode[], edges: StepEdge[]): string[] {
  const indegree = new Map<string, number>();
  for (const s of steps) indegree.set(s.id, 0);
  const adjacency = new Map<string, string[]>();
  for (const s of steps) adjacency.set(s.id, []);

  for (const e of edges) {
    if (e.kind !== 'depends_on' && e.kind !== 'parallel') continue;
    adjacency.get(e.from)?.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of adjacency.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  // Add isolated nodes (no edges) at the end
  for (const s of steps) {
    if (!order.includes(s.id)) order.push(s.id);
  }

  return order;
}

// ═══════════════════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineStore {
  save(def: PipelineDefinition): void;
  get(id: string): PipelineDefinition | null;
  list(): PipelineDefinition[];
  remove(id: string): void;
}

export function createPipelineStore(storage?: KVStorage): PipelineStore {
  const store = storage ?? createStorage();

  return {
    save(def) {
      store.set(PREFIX + def.id, JSON.stringify(def));
    },
    get(id) {
      const raw = store.get(PREFIX + id);
      if (!raw) return null;
      try { return JSON.parse(raw) as PipelineDefinition; } catch { return null; }
    },
    list() {
      const out: PipelineDefinition[] = [];
      for (const key of store.keys()) {
        if (!key.startsWith(PREFIX)) continue;
        const raw = store.get(key);
        if (!raw) continue;
        try { out.push(JSON.parse(raw) as PipelineDefinition); } catch { /* skip corrupt */ }
      }
      return out;
    },
    remove(id) {
      store.remove(PREFIX + id);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Version pinning helper (PK-CI-9 prep): 'latest' — недопустимо для production
// ═══════════════════════════════════════════════════════════════════════════

export function isPinnedVersion(ref: VersionRef): boolean {
  return ref.version !== 'latest' && ref.version.trim().length > 0;
}

export function collectUnpinnedComponents(def: PipelineDefinition): string[] {
  const unpinned: string[] = [];
  for (const s of def.steps) {
    if (!isPinnedVersion(s.component)) {
      unpinned.push(s.id);
    }
  }
  return unpinned;
}
