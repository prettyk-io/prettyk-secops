/**
 * PRETTYK-CI — Pipeline Preview (PK-CI-7).
 *
 * До запуска показывает полный план: какие шаги, какие права и секреты нужны
 * (только ссылками), какие gates могут остановить, сколько ресурсов уйдёт.
 *
 *   import { buildPipelinePreview } from '@/ci/pipelinePreview';
 *   const plan = buildPipelinePreview(pipeline, heldCaps, estimates);
 */
import type {
  PipelineDefinition,
  StepNode,
  Capability,
} from './types';
import { topologicalOrder } from './pipelineStore';
import { findStep } from './stepCatalog';
import { runPreflight } from './preflight';

// ═══════════════════════════════════════════════════════════════════════════
// Preview model
// ═══════════════════════════════════════════════════════════════════════════

export interface StepPreview {
  stepId: string;
  label: string;
  component: string;
  version: string;
  /** Требуемые права для шага. */
  requiredCapabilities: Capability[];
  /** Ссылки на секреты (никогда raw values). */
  secretRefs: string[];
  /** Входные артефакты. */
  inputArtifacts: string[];
  /** Resource estimate. */
  resource: ResourceEstimate;
  /** Есть ли у пользователя все права на этот шаг. */
  allowed: boolean;
}

export interface ResourceEstimate {
  /** Ожидаемая длительность в мс. */
  durationMs?: number;
  /** Тип ресурса. */
  kind: 'lightweight' | 'standard' | 'intensive';
  /** Нужен ли egress наружу. */
  requiresEgress: boolean;
}

export interface PipelinePreview {
  pipelineId: string;
  name: string;
  /** Полный план в порядке выполнения (топологический). */
  steps: StepPreview[];
  /** Критические блокировки (preflight). */
  blockers: string[];
  /** Суммарный resource estimate. */
  totalEstimate: ResourceEstimate;
  /** Gates, которые могут остановить пайп. */
  gateDescriptions: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Resource estimation (по каталогу)
// ═══════════════════════════════════════════════════════════════════════════

const RISK_TO_RESOURCE: Record<string, ResourceEstimate> = {
  critical: { durationMs: 300_000, kind: 'intensive', requiresEgress: true },
  high: { durationMs: 120_000, kind: 'standard', requiresEgress: true },
  medium: { durationMs: 30_000, kind: 'standard', requiresEgress: false },
  low: { durationMs: 10_000, kind: 'lightweight', requiresEgress: false },
  none: { durationMs: 1_000, kind: 'lightweight', requiresEgress: false },
};

function estimateResource(stepId: string): ResourceEstimate {
  const catalogStep = findStep(stepId);
  const risk = (catalogStep?.capability.risk ?? 'medium') as keyof typeof RISK_TO_RESOURCE;
  return RISK_TO_RESOURCE[risk] ?? RISK_TO_RESOURCE['medium']!;
}

// ═══════════════════════════════════════════════════════════════════════════
// Secret refs extraction (только ссылки, НЕ значения)
// ═══════════════════════════════════════════════════════════════════════════

function extractSecretRefs(step: StepNode): string[] {
  const catalogStep = findStep(step.component.name);
  if (!catalogStep) return [];
  return catalogStep.capability.inputs
    .filter(i => i.kind === 'secret_ref')
    .map(i => i.name);
}

// ═══════════════════════════════════════════════════════════════════════════
// Gate descriptions
// ═══════════════════════════════════════════════════════════════════════════

function gateDescriptions(pipeline: PipelineDefinition): string[] {
  const descriptions: string[] = [];
  if (pipeline.qualityGate) {
    descriptions.push(`Quality gate: ${pipeline.qualityGate}`);
  }
  descriptions.push(`Policy: ${pipeline.policy.name} v${pipeline.policy.version}`);
  descriptions.push(`Timeout: ${pipeline.timeoutMs ? `${pipeline.timeoutMs}ms` : 'default (30 min)'}`);
  descriptions.push(`Retry: ${pipeline.retry ? `max ${pipeline.retry.maxAttempts} attempts` : 'disabled'}`);
  return descriptions;
}

// ═══════════════════════════════════════════════════════════════════════════
// Full preview builder
// ═══════════════════════════════════════════════════════════════════════════

export interface PreviewInput {
  pipeline: PipelineDefinition;
  /** Capabilities выполняющего пользователя. */
  heldCapabilities: Capability[];
  /** URL target (для preflight). */
  targetUrl: string;
  /** Actor. */
  actor?: string;
}

export function buildPipelinePreview(input: PreviewInput): PipelinePreview {
  const { pipeline, heldCapabilities, targetUrl, actor = 'unknown' } = input;

  // Preflight blocker list
  const preflight = runPreflight({ pipeline, targetUrl, heldCapabilities, actor });
  const blockers = preflight.blocks.map(b => `[${b.kind}] ${b.detail}`);

  // Topological execution order
  const order = topologicalOrder(pipeline.steps, pipeline.edges);
  const stepMap = new Map(pipeline.steps.map(s => [s.id, s]));

  const steps: StepPreview[] = order.map(id => {
    const step = stepMap.get(id);
    if (!step) return null!;
    const requiredCaps = stepCapabilitiesForPreview(step.component.name);
    return {
      stepId: id,
      label: step.label ?? step.component.name,
      component: step.component.name,
      version: step.component.version,
      requiredCapabilities: requiredCaps,
      secretRefs: extractSecretRefs(step),
      inputArtifacts: Object.keys(step.inputs ?? {}),
      resource: estimateResource(step.component.name),
      allowed: requiredCaps.every(c => heldCapabilities.includes(c)),
    };
  }).filter(Boolean);

  // Total estimate
  const totalMs = steps.reduce((sum, s) => sum + (s.resource.durationMs ?? 0), 0);
  const totalEstimate: ResourceEstimate = {
    durationMs: totalMs,
    kind: steps.some(s => s.resource.kind === 'intensive') ? 'intensive'
        : steps.some(s => s.resource.kind === 'standard') ? 'standard'
        : 'lightweight',
    requiresEgress: steps.some(s => s.resource.requiresEgress),
  };

  return {
    pipelineId: pipeline.id,
    name: pipeline.name ?? pipeline.id,
    steps,
    blockers,
    totalEstimate,
    gateDescriptions: gateDescriptions(pipeline),
  };
}

// Helper: resolve step capabilities from catalog
function stepCapabilitiesForPreview(componentName: string): Capability[] {
  const step = STEP_CATALOG_FOR_PREVIEW.find(s => s.name === componentName);
  return step?.capability.requiredCapabilities ?? [];
}

// Inline import to avoid circular dependency
import { STEP_CATALOG } from './stepCatalog';
const STEP_CATALOG_FOR_PREVIEW = STEP_CATALOG;