/**
 * PRETTYK-CI — Step Debugger (PK-CI-12).
 *
 * Шаг можно отладить: вход/выход, повтор только его, повтор с изменённым payload,
 * сравнение двух прогонов.
 *
 *   import { createStepDebugger, diffRuns } from '@/ci/stepDebugger';
 */
import type { RunRecord, FindingRecord, EvidenceRecord, StepNode } from './types';
import type { RunEngine } from './runEngine';
import { serializePipeline } from './codec';

// ═══════════════════════════════════════════════════════════════════════════
// Step IO model
// ═══════════════════════════════════════════════════════════════════════════

export interface StepIO {
  stepId: string;
  /** Вход (редиактированные ссылки + значения). */
  input: Record<string, string>;
  /** Выход — findings + evidence этого шага. */
  output: {
    findings: FindingRecord[];
    evidence: EvidenceRecord[];
  };
  /** Статус шага из timeline. */
  status?: string;
  /** Исходный payload (редиактированный). */
  payload?: string;
}

export interface StepDebugSession {
  runId: string;
  stepId: string;
  io: StepIO;
  /** Повтор только этого шага (без перезапуска пайпа). */
  replayCommand: string;
  /** Повтор с изменённым payload. */
  replayWithPayloadCommand: (newPayload: string) => string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Diff two runs (сравнение прогонов)
// ═══════════════════════════════════════════════════════════════════════════

export interface RunDiff {
  /** Шаги, которые изменились между прогонами. */
  changedSteps: string[];
  /** Новые findings во втором run. */
  newFindings: string[];
  /** Исчезнувшие findings. */
  removedFindings: string[];
  /** Изменившиеся checksum evidence. */
  changedEvidence: string[];
}

export function diffRuns(
  a: { findings: FindingRecord[]; evidence: EvidenceRecord[]; steps?: string[] },
  b: { findings: FindingRecord[]; evidence: EvidenceRecord[]; steps?: string[] },
): RunDiff {
  const aF = new Set(a.findings.map(f => f.dedupKey));
  const bF = new Set(b.findings.map(f => f.dedupKey));

  const newFindings = [...bF].filter(k => !aF.has(k));
  const removedFindings = [...aF].filter(k => !bF.has(k));

  const aE = new Map(a.evidence.map(e => [e.dedupKey, (e as any).checksum ?? JSON.stringify(e.payload)]));
  const bE = new Map(b.evidence.map(e => [e.dedupKey, (e as any).checksum ?? JSON.stringify(e.payload)]));
  const changedEvidence = [...bE.keys()].filter(k => aE.has(k) && aE.get(k) !== bE.get(k));

  const aSteps = a.steps ?? [];
  const bSteps = b.steps ?? [];
  const changedSteps = aSteps.filter((s, i) => bSteps[i] !== s);

  return { changedSteps, newFindings, removedFindings, changedEvidence };
}

// ═══════════════════════════════════════════════════════════════════════════
// Step debugger
// ═══════════════════════════════════════════════════════════════════════════

export interface StepDebugger {
  inspectStep(runId: string, stepId: string): StepIO | null;
  replayStep(runId: string, stepId: string, newPayload?: string): string;
  compareRuns(runIdA: string, runIdB: string): RunDiff | null;
  listSteps(runId: string): string[];
}

export function createStepDebugger(engine: RunEngine): StepDebugger {
  function inspectStep(runId: string, stepId: string): StepIO | null {
    const run = engine.getRun(runId);
    if (!run) return null;
    const step = run.pipelineSnapshot?.steps.find(s => s.id === stepId);
    if (!step) return null;

    // Output: findings/evidence связанные со step — фильтруем по dedupKey содержит stepId (спайк-эвристика)
    const allFindings = engine.listFindings(runId);
    const allEvidence = engine.listEvidence(runId);
    const stepFindings = allFindings.filter(f => (f as any).stepId === stepId || f.dedupKey.includes(stepId));
    const stepEvidence = allEvidence.filter(e => (e as any).stepId === stepId || e.dedupKey.includes(stepId));

    // Status из timeline
    const status = run.timeline
      .filter(t => t.event === 'acquire' || t.event === 'complete' || t.event === 'fail')
      .map(t => t.event)
      .pop();

    return {
      stepId,
      input: step.inputs ?? {},
      output: { findings: stepFindings, evidence: stepEvidence },
      status,
      payload: JSON.stringify(step.inputs ?? {}),
    };
  }

  function replayStep(runId: string, stepId: string, newPayload?: string): string {
    const io = inspectStep(runId, stepId);
    if (!io) return `pk replay-step ${runId} ${stepId}`;
    if (newPayload) {
      return `pk replay-step ${runId} ${stepId} --payload '${newPayload}'`;
    }
    return `pk replay-step ${runId} ${stepId}`;
  }

  function compareRuns(runIdA: string, runIdB: string): RunDiff | null {
    const a = engine.getRun(runIdA);
    const b = engine.getRun(runIdB);
    if (!a || !b) return null;

    return diffRuns(
      {
        findings: engine.listFindings(runIdA),
        evidence: engine.listEvidence(runIdA),
        steps: a.pipelineSnapshot?.steps.map(s => s.id) ?? [],
      },
      {
        findings: engine.listFindings(runIdB),
        evidence: engine.listEvidence(runIdB),
        steps: b.pipelineSnapshot?.steps.map(s => s.id) ?? [],
      },
    );
  }

  function listSteps(runId: string): string[] {
    const run = engine.getRun(runId);
    return run?.pipelineSnapshot?.steps.map(s => s.id) ?? [];
  }

  return { inspectStep, replayStep, compareRuns, listSteps };
}
