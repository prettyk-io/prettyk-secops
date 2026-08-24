/**
 * PRETTYK-CI — Codec (PK-CI-3): код ↔ граф — одно описание, два вида.
 *
 * `serializePipeline` / `parsePipeline` — канонический текст (JSON).
 * `toGraph` — нормализованный граф для визуального редактора.
 * Оба вида читают ОДИН и тот же PipelineDefinition — не два источника.
 *
 *   import { serializePipeline, parsePipeline, toGraph } from '@/ci/codec';
 */
import type { PipelineDefinition, StepNode, StepEdge } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Canonical serialization (text ↔ object)
// ═══════════════════════════════════════════════════════════════════════════

export const PIPELINE_IR_VERSION = '1.0.0';

export function serializePipeline(def: PipelineDefinition, pretty = true): string {
  return JSON.stringify(def, null, pretty ? 2 : 0);
}

export interface ParseResult {
  ok: boolean;
  pipeline?: PipelineDefinition;
  error?: string;
}

export function parsePipeline(text: string): ParseResult {
  try {
    const parsed = JSON.parse(text) as PipelineDefinition;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Not an object' };
    }
    if (!parsed.id || !Array.isArray(parsed.steps) || !Array.isArray(parsed.edges)) {
      return { ok: false, error: 'Missing id/steps/edges' };
    }
    return { ok: true, pipeline: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Graph view (для React Flow / визуального редактора)
// ═══════════════════════════════════════════════════════════════════════════

export interface GraphNode {
  id: string;
  label: string;
  component: string;
  version: string;
  data: StepNode;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: StepEdge['kind'];
}

export interface PipelineGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Нормализовать описание в граф. Один источник — PipelineDefinition.
 */
export function toGraph(def: PipelineDefinition): PipelineGraph {
  const nodes: GraphNode[] = def.steps.map(s => ({
    id: s.id,
    label: s.label ?? s.component.name,
    component: s.component.name,
    version: s.component.version,
    data: s,
  }));

  const edges: GraphEdge[] = def.edges.map((e, i) => ({
    id: `e${i}:${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    kind: e.kind,
  }));

  return { nodes, edges };
}

/**
 * Обратная операция: собрать PipelineDefinition из графа (для round-trip).
 */
export function fromGraph(
  base: Pick<PipelineDefinition, 'id' | 'irVersion' | 'name' | 'target' | 'scope' | 'policy' | 'requiredCapabilities'>,
  graph: PipelineGraph,
): PipelineDefinition {
  const steps: StepNode[] = graph.nodes.map(n => ({
    id: n.id,
    component: { name: n.component, version: n.version },
    label: n.label,
    inputs: n.data.inputs,
    matrix: n.data.matrix,
    approvals: n.data.approvals,
    timeoutMs: n.data.timeoutMs,
  }));

  const edges: StepEdge[] = graph.edges.map(e => ({
    from: e.source,
    to: e.target,
    kind: e.kind,
  }));

  return {
    ...base,
    steps,
    edges,
  };
}

/**
 * Round-trip check: graph → definition → graph сохраняет структуру.
 */
export function assertRoundTrip(def: PipelineDefinition): boolean {
  const g1 = toGraph(def);
  const base = {
    id: def.id,
    irVersion: def.irVersion,
    name: def.name,
    target: def.target,
    scope: def.scope,
    policy: def.policy,
    requiredCapabilities: def.requiredCapabilities,
  };
  const rebuilt = fromGraph(base, g1);
  const g2 = toGraph(rebuilt);
  return JSON.stringify(g1.nodes.map(n => n.id).sort()) === JSON.stringify(g2.nodes.map(n => n.id).sort())
    && JSON.stringify(g1.edges.map(e => [e.source, e.target, e.kind]).sort())
       === JSON.stringify(g2.edges.map(e => [e.source, e.target, e.kind]).sort());
}
