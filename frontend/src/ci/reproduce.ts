/**
 * PRETTYK-CI — Reproduce (PK-CI-11).
 *
 * Из finding собрать минимальный воспроизводимый конвейер без ручной сборки.
 *
 *   import { reproduceFromFinding } from '@/ci/reproduce';
 */
import type {
  PipelineDefinition,
  FindingRecord,
  RunRecord,
  StepNode,
  StepEdge,
} from './types';
import type { RunEngine } from './runEngine';

// ═══════════════════════════════════════════════════════════════════════════
// Reproduce model
// ═══════════════════════════════════════════════════════════════════════════

export interface ReproduceResult {
  /** Минимальный конвейер для воспроизведения конкретной finding. */
  pipeline: PipelineDefinition;
  /** Обоснование: почему именно эти шаги. */
  rationale: string;
  /** Версии инструментов, зафиксированные в исходном run. */
  toolVersions: Record<string, string>;
  /** Исходный dedup key finding. */
  findingKey: string;
}

/**
 * Собрать минимальный повторяемый конвейер из finding.
 *
 * Стратегия:
 *   — берём pipeline-снапшот исходного run;
 *   — оставляем шаги, которые приводят к этой finding (по порядку до её шага);
 *   — фиксируем версии и scope;
 *   — добавляем Quality Gate и Evidence Pack (чтобы вернуть доказательство).
 */
export function reproduceFromFinding(
  run: RunRecord,
  finding: FindingRecord,
): ReproduceResult {
  const snap = run.pipelineSnapshot;

  // Шаг, породивший finding — берём из meta, если есть, иначе полный срез
  const findingStepId = (finding as any).stepId as string | undefined;
  const steps = snap?.steps ?? [];
  const edges = snap?.edges ?? [];

  // Оставляем шаги до (включая) шаг с finding + обязательные gate/evidence
  let selectedSteps: StepNode[];
  let selectedEdges: StepEdge[];

  if (findingStepId && steps.some(s => s.id === findingStepId)) {
    const idx = steps.findIndex(s => s.id === findingStepId);
    const prefixIds = new Set(steps.slice(0, idx + 1).map(s => s.id));

    // Добавляем gate + evidence, если их ещё нет
    const gateStep: StepNode = { id: 'repro-gate', component: { name: 'Quality Gate', version: '3.1.0' }, label: 'Quality Gate' };
    const evidenceStep: StepNode = { id: 'repro-evidence', component: { name: 'Evidence Pack', version: '1.2.0' }, label: 'Evidence Pack' };

    selectedSteps = [...steps.slice(0, idx + 1)];
    if (!selectedSteps.some(s => s.component.name === 'Quality Gate')) selectedSteps.push(gateStep);
    if (!selectedSteps.some(s => s.component.name === 'Evidence Pack')) selectedSteps.push(evidenceStep);

    // Рёбра: только между выбранными шагами + chain к gate → evidence
    selectedEdges = edges.filter(e => prefixIds.has(e.from) && prefixIds.has(e.to));
    const lastOriginal = selectedSteps.find(s => s.id === findingStepId)!;
    const gate = selectedSteps.find(s => s.component.name === 'Quality Gate')!;
    const evd = selectedSteps.find(s => s.component.name === 'Evidence Pack')!;
    selectedEdges.push({ from: lastOriginal.id, to: gate.id, kind: 'depends_on' });
    selectedEdges.push({ from: gate.id, to: evd.id, kind: 'depends_on' });
  } else {
    // Нет явного stepId — воспроизводим весь срез + gate/evidence
    selectedSteps = [...steps];
    const gateStep: StepNode = { id: 'repro-gate', component: { name: 'Quality Gate', version: '3.1.0' } };
    const evidenceStep: StepNode = { id: 'repro-evidence', component: { name: 'Evidence Pack', version: '1.2.0' } };
    if (!selectedSteps.some(s => s.component.name === 'Quality Gate')) selectedSteps.push(gateStep);
    if (!selectedSteps.some(s => s.component.name === 'Evidence Pack')) selectedSteps.push(evidenceStep);
    selectedEdges = [...edges];
    const last = selectedSteps[selectedSteps.length - 3] ?? selectedSteps[0]!;
    selectedEdges.push({ from: last.id, to: 'repro-gate', kind: 'depends_on' });
    selectedEdges.push({ from: 'repro-gate', to: 'repro-evidence', kind: 'depends_on' });
  }

  const pipeline: PipelineDefinition = {
    id: `repro-${run.id}-${finding.dedupKey.slice(0, 8)}`,
    irVersion: snap?.irVersion ?? '1.0.0',
    name: `Reproduce: ${finding.dedupKey}`,
    description: `Minimal reproducible pipeline for finding "${finding.dedupKey}".`,
    target: snap?.target ?? { id: run.pipelineId, name: run.pipelineId },
    scope: snap?.scope ?? { rules: [] },
    policy: snap?.policy ?? run.policySnapshot,
    requiredCapabilities: snap?.requiredCapabilities ?? [],
    steps: selectedSteps,
    edges: selectedEdges,
    retry: snap?.retry,
    qualityGate: snap?.qualityGate,
  };

  return {
    pipeline,
    rationale: findingStepId
      ? `Steps up to "${findingStepId}" (the source of the finding), plus Quality Gate and Evidence Pack.`
      : 'Full pipeline slice with Quality Gate and Evidence Pack.',
    toolVersions: run.toolVersions,
    findingKey: finding.dedupKey,
  };
}

/**
 * Convenience: собрать reproduce из engine.
 */
export function reproduceFromEngine(
  engine: RunEngine,
  runId: string,
  findingKey: string,
): ReproduceResult | null {
  const run = engine.getRun(runId);
  if (!run) return null;
  const finding = engine.listFindings(runId).find(f => f.dedupKey === findingKey);
  if (!finding) return null;
  return reproduceFromFinding(run, finding);
}
