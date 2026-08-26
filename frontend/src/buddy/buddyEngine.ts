/**
 * CO-PILOT META (PoC) — BuddyEngine (orchestrator).
 *
 * Связывает контур: intent → skeleton → clarification → proposal →
 * bounded run → evidence. Ведёт сквозной trace. Обеспечивает инварианты PoC:
 * — workspace не меняется до явного approval;
 * — противоречия блокируют генерацию и запуск;
 * — pass только при доказанных assertions;
 * — reject не меняет ничего.
 *
 * Модель — swap-контракт (BuddyModel), по умолчанию DeterministicBuddyModel.
 */

import type {
  BuddyIntent,
  BuddyMessage,
  BuddyProposal,
  BuddyTrace,
  BoundedRunState,
  ClarificationResult,
  EvidenceMatrix,
  SkeletonData,
} from './types';
import type { BuddyModel } from './model';
import { DEFAULT_BUDDY_MODEL } from './model';
import { BoundedRunner, type StepRunner } from './boundedRun';
import { evaluateAssertions, emptyEvidenceMatrix } from './evidence';

export type BuddyEnginePhase =
  | 'collecting'          // приём сообщений, накопление intent
  | 'skeleton'            // skeleton извлечён
  | 'clarifying'          // есть пробелы/противоречия → ждём ответа
  | 'proposal'            // proposal готов к review
  | 'approved'            // proposal принят → можно запускать
  | 'rejected'            // proposal отклонён
  | 'running'             // bounded run активен
  | 'finished';           // run завершён, evidence оценён

export interface BuddyEngineState {
  phase: BuddyEnginePhase;
  /** Одна видимая рабочая гипотеза (не новый проект на каждое сообщение). */
  intent: BuddyIntent;
  skeleton: SkeletonData | null;
  clarification: ClarificationResult | null;
  proposal: BuddyProposal | null;
  runState: BoundedRunState | null;
  evidence: EvidenceMatrix | null;
  trace: BuddyTrace;
  /** Человекочитаемое сообщение состояния. */
  status: string;
}

export interface BuddyEngineOptions {
  model?: BuddyModel;
  runner?: StepRunner;
  maxTimeMs?: number;
  maxIterations?: number;
}

let _intentCounter = 0;
function newIntentId(): string {
  _intentCounter += 1;
  return `intent-${_intentCounter}`;
}

export class BuddyEngine {
  private model: BuddyModel;
  private runner?: StepRunner;
  private maxTimeMs?: number;
  private maxIterations?: number;
  private state: BuddyEngineState;
  private boundedRunner: BoundedRunner | null = null;
  private listeners = new Set<(s: BuddyEngineState) => void>();

  constructor(opts: BuddyEngineOptions = {}) {
    this.model = opts.model ?? DEFAULT_BUDDY_MODEL;
    this.runner = opts.runner;
    this.maxTimeMs = opts.maxTimeMs;
    this.maxIterations = opts.maxIterations;

    const intentId = newIntentId();
    this.state = {
      phase: 'collecting',
      intent: { messages: [], target: undefined },
      skeleton: null,
      clarification: null,
      proposal: null,
      runState: null,
      evidence: null,
      trace: { intentId, events: [{ kind: 'intent_received', intentId, messageCount: 0 }] },
      status: 'Ожидаю описание приложения и сценария',
    };
  }

  /** Подписаться на изменения состояния. */
  subscribe(fn: (s: BuddyEngineState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): BuddyEngineState {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // BUD-1: Intent → Skeleton
  // -------------------------------------------------------------------------

  /** Принять сообщение оператора и пересобрать skeleton (одна гипотеза). */
  addMessage(text: string): BuddyEngineState {
    const msg: BuddyMessage = {
      id: `msg-${Date.now().toString(36)}-${this.state.intent.messages.length + 1}`,
      role: 'operator',
      text,
      ts: Date.now(),
    };

    const intent: BuddyIntent = {
      ...this.state.intent,
      messages: [...this.state.intent.messages, msg],
    };

    const skeleton = this.model.extractSkeleton(intent);
    const clarification = this.model.clarify(intent, skeleton);

    let phase: BuddyEnginePhase;
    if (clarification.contradictions.length > 0) {
      phase = 'clarifying'; // противоречия блокируют генерацию и запуск
    } else if (!clarification.complete) {
      phase = 'clarifying';
    } else {
      phase = 'skeleton';
    }

    this.setState({
      ...this.state,
      phase,
      intent,
      skeleton,
      clarification,
      proposal: null,
      evidence: null,
      status: this.describeStatus(phase, clarification),
    });

    this.pushTrace({ kind: 'skeleton_built', pages: skeleton.pages.length, assumptions: skeleton.assumptions.length });
    if (clarification.questions.length || clarification.contradictions.length) {
      this.pushTrace({
        kind: 'clarification_asked',
        questions: clarification.questions.length,
        contradictions: clarification.contradictions.length,
      });
    }

    return this.state;
  }

  // -------------------------------------------------------------------------
  // BUD-2/3: Proposal + approval
  // -------------------------------------------------------------------------

  /** Собрать reviewable proposal (после того, как clarification решён). */
  buildProposal(): BuddyEngineState {
    const { intent, skeleton, clarification } = this.state;
    if (!skeleton || !clarification) {
      return this.state;
    }
    // Блок: противоречия или пробелы → proposal не строится
    if (clarification.contradictions.length > 0 || !clarification.complete) {
      this.setState({
        ...this.state,
        phase: 'clarifying',
        status: 'Генерация заблокирована: есть нерешённые противоречия или пробелы',
      });
      return this.state;
    }

    const proposal = this.model.buildProposal(intent, skeleton);
    this.setState({
      ...this.state,
      phase: 'proposal',
      proposal,
      status: 'Предложение готово к review',
    });
    this.pushTrace({ kind: 'proposal_built', proposalId: proposal.id });

    return this.state;
  }

  /** Принять proposal — workspace-изменение применяет внешний слой, здесь флаг. */
  approveProposal(): BuddyEngineState {
    const { proposal } = this.state;
    if (!proposal) return this.state;

    this.setState({
      ...this.state,
      phase: 'approved',
      status: 'Предложение принято. Готов к запуску.',
    });
    this.pushTrace({ kind: 'proposal_approved', proposalId: proposal.id });

    return this.state;
  }

  /** Отклонить proposal — ничего не меняется. */
  rejectProposal(): BuddyEngineState {
    const { proposal } = this.state;
    if (!proposal) return this.state;

    this.setState({
      ...this.state,
      phase: 'rejected',
      proposal: null,
      status: 'Предложение отклонено. Workspace не изменён.',
    });
    if (proposal) {
      this.pushTrace({ kind: 'proposal_rejected', proposalId: proposal.id });
    }

    return this.state;
  }

  // -------------------------------------------------------------------------
  // BUD-3: Bounded Run
  // -------------------------------------------------------------------------

  /** Запустить bounded run по принятому proposal. */
  async run(): Promise<BuddyEngineState> {
    const { proposal, phase } = this.state;
    if (phase !== 'approved' || !proposal) {
      return this.state;
    }
    if (!this.runner) {
      this.setState({
        ...this.state,
        phase: 'finished',
        status: 'Нет runner для запуска (PoC без live runner)',
      });
      return this.state;
    }

    // Все шаги proposal входят в заранее подтверждённый run-scope (approval уже дан)
    const approvedStepIds = proposal.scenario.steps.map((s) => s.id);

    this.boundedRunner = new BoundedRunner({
      runner: this.runner,
      approvedStepIds,
      config: {
        maxTimeMs: this.maxTimeMs,
        maxIterations: this.maxIterations,
      },
      onChange: (runState) => {
        this.setState({ ...this.state, runState });
      },
    });

    this.setState({ ...this.state, phase: 'running', status: 'Фоновый процесс запущен' });
    this.pushTrace({ kind: 'run_started', runId: proposal.id });

    const runState = await this.boundedRunner.run(proposal.scenario.steps);

    this.pushTrace({ kind: 'run_finished', runId: proposal.id, phase: runState.phase });

    // BUD-4: Evidence
    const evidence = evaluateAssertions(proposal.scenario.expectations, runState.outcomes);
    this.setState({
      ...this.state,
      runState,
      evidence,
      phase: 'finished',
      status: evidence.pass ? 'Pass: все assertions доказаны' : 'Fail: assertions не доказаны',
    });
    this.pushTrace({ kind: 'evidence_evaluated', pass: evidence.pass });

    return this.state;
  }

  /** Явный Stop фонового процесса. */
  stopRun(): void {
    if (this.boundedRunner?.isRunning()) {
      this.boundedRunner.stop();
    }
  }

  /** Текущий evidence (после run). */
  getEvidence(): EvidenceMatrix {
    return this.state.evidence ?? emptyEvidenceMatrix();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private describeStatus(phase: BuddyEnginePhase, clarification: ClarificationResult): string {
    if (phase === 'clarifying') {
      if (clarification.contradictions.length > 0) {
        return 'Найдены противоречия — генерация заблокирована до их решения';
      }
      return `Требуются уточнения (${clarification.questions.length})`;
    }
    return 'Структура извлечена';
  }

  private pushTrace(event: BuddyTrace['events'][number]): void {
    this.state.trace.events.push(event);
  }

  private setState(next: BuddyEngineState): void {
    this.state = next;
    this.listeners.forEach((fn) => fn(this.state));
  }
}
