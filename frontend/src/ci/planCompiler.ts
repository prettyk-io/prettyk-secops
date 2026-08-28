/**
 * PRETTYK-CI — deterministic PipelinePlan compiler.
 *
 * This is the client-side reference implementation for the first Cosmo
 * vertical slice. It deliberately has no storage or runtime side effects.
 */
import type { PipelineDefinition, StepEdge } from './types';
import {
  collectUnpinnedComponents,
  topologicalOrder,
  validatePipelineGraph,
} from './pipelineStore';

export interface CompiledBatch {
  id: string;
  stepIds: string[];
  dependsOn: string[];
}

export interface PipelinePlan {
  pipelineId: string;
  irVersion: string;
  compiledHash: string;
  inputsHash: string;
  order: string[];
  batches: CompiledBatch[];
}

export class PlanCompilationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Pipeline compilation failed: ${issues.join('; ')}`);
    this.name = 'PlanCompilationError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedPipeline(pipeline: PipelineDefinition): PipelineDefinition {
  return {
    ...pipeline,
    steps: [...pipeline.steps].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...pipeline.edges].sort(compareEdges),
    requiredCapabilities: [...pipeline.requiredCapabilities].sort(),
  };
}

function compareEdges(a: StepEdge, b: StepEdge): number {
  return `${a.from}\0${a.to}\0${a.kind}`.localeCompare(`${b.from}\0${b.to}\0${b.kind}`);
}

function compileBatches(pipeline: PipelineDefinition, order: string[]): CompiledBatch[] {
  const dependencies = new Map<string, string[]>();
  for (const step of pipeline.steps) dependencies.set(step.id, []);
  for (const edge of pipeline.edges) {
    if (edge.kind === 'depends_on' || edge.kind === 'parallel') {
      dependencies.get(edge.to)?.push(edge.from);
    }
  }

  const depth = new Map<string, number>();
  for (const stepId of order) {
    const parents = dependencies.get(stepId) ?? [];
    depth.set(stepId, parents.length === 0 ? 0 : Math.max(...parents.map((id) => depth.get(id) ?? 0)) + 1);
  }

  const grouped = new Map<number, string[]>();
  for (const stepId of order) {
    const level = depth.get(stepId) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), stepId]);
  }

  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([level, stepIds]) => ({
    id: `batch-${level + 1}`,
    stepIds,
    dependsOn: level === 0 ? [] : [`batch-${level}`],
  }));
}

export async function compilePipeline(
  pipeline: PipelineDefinition,
  inputs: Record<string, string> = {},
): Promise<PipelinePlan> {
  const graphIssues = validatePipelineGraph(pipeline);
  const unpinned = collectUnpinnedComponents(pipeline);
  const issues = [
    ...graphIssues.map((issue) => issue.detail),
    ...unpinned.map((stepId) => `Unpinned component in step: ${stepId}`),
  ];
  if (issues.length > 0) throw new PlanCompilationError(issues);

  const normalized = normalizedPipeline(pipeline);
  const order = topologicalOrder(normalized.steps, normalized.edges);
  const canonical = canonicalJson(normalized);
  return {
    pipelineId: pipeline.id,
    irVersion: pipeline.irVersion,
    compiledHash: await sha256(canonical),
    inputsHash: await sha256(canonicalJson(inputs)),
    order,
    batches: compileBatches(normalized, order),
  };
}