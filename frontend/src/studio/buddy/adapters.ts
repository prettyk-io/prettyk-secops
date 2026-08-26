/**
 * CO-PILOT META (PoC) — Buddy view adapters.
 *
 * View-типы (презентационные пропсы виджетов) + mapper-функции, конвертирующие
 * Boss-контракт (../../buddy/types) в view-пропсы. Виджеты импортируют типы отсюда,
 * buddyTypes.ts удалён (контракт Boss'а — в ../../buddy/types).
 */
import type {
  SkeletonData as BossSkeletonData,
  SkeletonPage as BossSkeletonPage,
  SkeletonAction as BossSkeletonAction,
  SkeletonExpectation,
  EvidenceMatrix as BossEvidenceMatrix,
  EvidenceItem as BossEvidenceItem,
  BuddyProposal,
  BoundedRunState,
  ClarificationResult,
  ClarificationQuestion,
  Contradiction,
} from '../../buddy/types';

// ---------------------------------------------------------------------------
// View types (презентационные пропсы виджетов)
// ---------------------------------------------------------------------------

/** LED-состояние рельса CopilotDock. */
export type BuddyPhase =
  | 'idle'
  | 'thinking'
  | 'waiting'
  | 'running'
  | 'done'
  | 'error';

/** View-страница (чекбокс + inline rename). name→title, confidence→included+assumption. */
export interface SkeletonPage {
  id: string;
  title: string;
  path: string;
  included: boolean;
  assumption?: boolean;
}

/** View-шаг сценария. */
export interface SkeletonStep {
  id: string;
  dsl: string;
  included: boolean;
  assumption?: boolean;
}

/** View-сценарий. actions/expectations → scenarios. */
export interface SkeletonScenario {
  id: string;
  title: string;
  steps: SkeletonStep[];
}

/** View-skeleton (пропсы SkeletonCard). */
export interface SkeletonData {
  intent: string;
  pages: SkeletonPage[];
  scenarios: SkeletonScenario[];
}

/** View-чипс уточнения. */
export interface ClarificationOption {
  id: string;
  label: string;
  hotkey: number;
}

/** View-уточнение (для ClarificationChips). */
export interface Clarification {
  question: string;
  options: ClarificationOption[];
}

/** View-строка сплит-диффа. */
export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
}

/** View-дифф (пропсы LiveDiffBanner). */
export interface LiveDiff {
  title: string;
  lines: DiffLine[];
}

/** View-состояние фонового запуска (пропсы StepRadar). */
export interface StepRadarState {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  targetUrl?: string;
  status: 'running' | 'success' | 'failed' | 'stopped';
  telemetry?: { ms?: number; memory?: string };
}

/** View-доказательство (kind→icon, detail→text, ref→link). */
export interface EvidenceItem {
  icon: 'http' | 'dom' | 'ax' | 'screenshot';
  text: string;
  ref?: string;
}

/** View-матрица доказательств (пропсы EvidenceMatrix View). */
export interface EvidenceMatrixView {
  pass: boolean;
  proven: EvidenceItem[];
  advisories: string[];
}

// ---------------------------------------------------------------------------
// Mappers: Boss → View
// ---------------------------------------------------------------------------

/** confidence → {included, assumption}. explicit=включить, assumption=не включена. */
function fromConfidence(c: BossSkeletonPage['confidence']): { included: boolean; assumption: boolean } {
  return c === 'assumption'
    ? { included: false, assumption: true }
    : { included: true, assumption: false };
}

/** Boss SkeletonPage → View SkeletonPage (name→title, confidence→included+assumption). */
export function mapSkeletonPage(p: BossSkeletonPage): SkeletonPage {
  return {
    id: p.id,
    title: p.name,
    path: p.path ?? '',
    ...fromConfidence(p.confidence),
  };
}

/** Boss SkeletonAction → DSL-строка (Click/Type/Open/Wait/Assert/Navigate). */
function actionToDsl(a: BossSkeletonAction): string {
  const kind = a.kind;
  if (kind === 'open') return `Open ${a.target}`;
  if (kind === 'wait') return `Wait ${a.value ?? '1000'}`;
  if (kind === 'type') return `Type "${a.target}" ${a.value ?? '$value'}`;
  if (kind === 'click') return `Click "${a.target}"`;
  if (kind === 'assert') return `Assert "${a.target}"`;
  if (kind === 'navigate') return `Navigate ${a.target}`;
  return `${a.kind} ${a.target}`;
}

/** Boss SkeletonAction[] → View SkeletonStep[] (confidence→included+assumption). */
function mapActionsToSteps(actions: BossSkeletonAction[]): SkeletonStep[] {
  return actions.map((a) => {
    const { included, assumption } = fromConfidence(a.confidence);
    return { id: a.id, dsl: actionToDsl(a), included, assumption };
  });
}

/**
 * Boss SkeletonData (actions+expectations) → View SkeletonData (pages+scenarios).
 * Собирает один scenario «Intent Draft» из actions/expectations.
 */
export function mapSkeleton(data: BossSkeletonData, intent: string): SkeletonData {
  const pages = data.pages.map(mapSkeletonPage);

  // actions → steps
  const actionSteps = mapActionsToSteps(data.actions);

  // expectations → assertion-шаги
  const expectationSteps: SkeletonStep[] = data.expectations.map((e) => {
    const { included, assumption } = fromConfidence(e.confidence);
    const dsl = e.assertion ?? `Assert ${e.description}`;
    return { id: e.id, dsl, included, assumption };
  });

  const scenario: SkeletonScenario = {
    id: 'scenario-draft',
    title: 'Intent Draft',
    steps: [...actionSteps, ...expectationSteps],
  };

  return { intent, pages, scenarios: [scenario] };
}

// ── Clarification ──

/** Boss ClarificationQuestion → View ClarificationOption (id=question.id, label=question.question). */
function mapQuestionToOption(q: ClarificationQuestion, hotkey: number): ClarificationOption {
  return { id: q.id, label: q.question, hotkey };
}

/** Boss ClarificationResult → массив View Clarification (объединяет questions + contradictions). */
export function mapClarificationResult(result: ClarificationResult): Clarification[] {
  const out: Clarification[] = [];

  // Questions как чипсы
  if (result.questions.length > 0) {
    out.push({
      question: 'Уточните:',
      options: result.questions.map((q, i) => mapQuestionToOption(q, i + 1)),
    });
  }

  // Contradictions: показываем как отдельный блок «противоречия»
  for (const c of result.contradictions) {
    out.push({
      question: `⚠ ${c.detail} (${c.left} ↔ ${c.right})`,
      options: [
        { id: `resolve-${c.id}-left`, label: c.left, hotkey: 1 },
        { id: `resolve-${c.id}-right`, label: c.right, hotkey: 2 },
      ],
    });
  }

  return out;
}

// ── Proposal → LiveDiff ──

/** Boss BuddyProposal → View LiveDiff. */
export function mapProposalToDiff(proposal: BuddyProposal): LiveDiff {
  const lines: DiffLine[] = [];

  // Page object
  lines.push({ type: 'context', text: `Page: ${proposal.pageObject.name}` });
  if (proposal.pageObject.path) lines.push({ type: 'context', text: `  Path: ${proposal.pageObject.path}` });
  for (const el of proposal.pageObject.elements) {
    lines.push({ type: 'add', text: `  Element ${el.name} = ${el.locator}` });
  }

  // Scenario steps
  lines.push({ type: 'context', text: `Scenario: ${proposal.scenario.name}` });
  for (const step of proposal.scenario.steps) {
    lines.push({ type: 'add', text: `  ${step.dsl}` });
  }

  // Expectations
  for (const exp of proposal.scenario.expectations) {
    lines.push({ type: 'add', text: `  Assert ${exp.description}` });
  }

  return {
    title: `Review: ${proposal.scenario.name}`,
    lines,
  };
}

// ── Bounded Run → StepRadar ──

/** Boss BoundedRunState → View StepRadarState. */
export function mapRunToStepRadar(run: BoundedRunState): StepRadarState {
  const status: StepRadarState['status'] =
    run.phase === 'running' ? 'running'
    : run.phase === 'done' ? 'success'
    : run.phase === 'stopped' || run.phase === 'bounded_failure' ? 'stopped'
    : 'failed';

  const lastOutcome = run.outcomes[run.outcomes.length - 1];
  const stepLabel = lastOutcome?.stepId
    ? `Step ${lastOutcome.stepId}: ${lastOutcome.ok ? 'OK' : (lastOutcome.error ?? 'fail')}`
    : '…';

  return {
    currentStep: run.currentIteration,
    totalSteps: run.maxIterations,
    stepLabel,
    targetUrl: undefined,
    status,
    telemetry: { ms: run.elapsedMs },
  };
}

// ── Evidence ──

/** Boss EvidenceItem (kind+detail+ref) → View EvidenceItem (icon+text+ref). */
export function mapEvidenceItem(item: BossEvidenceItem): EvidenceItem {
  return {
    icon: item.kind === 'timing' ? 'http' : item.kind,
    text: item.detail,
    ref: item.ref,
  };
}

/** Boss EvidenceMatrix → View EvidenceMatrixView (pass+advisories as-is, assertions flatten in proven). */
export function mapEvidenceMatrix(matrix: BossEvidenceMatrix): EvidenceMatrixView {
  const proven: EvidenceItem[] = [];
  for (const a of matrix.assertions) {
    if (a.proven) {
      proven.push(...a.evidence.map(mapEvidenceItem));
    }
  }
  return {
    pass: matrix.pass,
    proven,
    advisories: matrix.advisories,
  };
}