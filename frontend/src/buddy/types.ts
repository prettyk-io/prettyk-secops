/**
 * CO-PILOT META (PoC) — PrettyK Buddy engine contracts.
 *
 * Boss zone: intent → skeleton → clarification → bounded run → evidence.
 * Модель = swap-контракт (`BuddyModel`), не фундамент. Весь движок —
 * чистый TypeScript, framework-agnostic, детерминированно тестируемый.
 */

// ---------------------------------------------------------------------------
// Intent (сырой вход)
// ---------------------------------------------------------------------------

/** Одно сообщение диалога. */
export interface BuddyMessage {
  id: string;
  role: 'operator' | 'buddy';
  text: string;
  ts: number;
}

/** Намерение — накопленные сообщения оператора (одна видимая гипотеза). */
export interface BuddyIntent {
  /** Все сообщения оператора (свободный текст). */
  messages: BuddyMessage[];
  /** Тестовое приложение (разрешённый target). */
  target?: string;
}

// ---------------------------------------------------------------------------
// Skeleton (нормализованная структура)
// ---------------------------------------------------------------------------

/** Уровень достоверности элемента skeleton. */
export type Confidence = 'explicit' | 'assumption';

export interface SkeletonPage {
  id: string;
  name: string;
  /** URL-путь, если явно назван (/catalog). */
  path?: string;
  /** Состояние страницы (например «корзина пуста»). */
  state?: string;
  confidence: Confidence;
}

export interface SkeletonTransition {
  id: string;
  from: string;
  to: string;
  /** Чем осуществляется переход (action). */
  via: string;
  confidence: Confidence;
}

export interface SkeletonAction {
  id: string;
  kind: 'open' | 'click' | 'type' | 'wait' | 'assert' | 'navigate';
  /** Цель: имя страницы или элемента. */
  target: string;
  /** Значение для type. */
  value?: string;
  confidence: Confidence;
}

export interface SkeletonExpectation {
  id: string;
  /** Человеческое ожидание («товар в корзине»). */
  description: string;
  /** Какое assertion его докажет. */
  assertion?: string;
  confidence: Confidence;
}

/** Явно помеченное предположение (НЕ выдумка). */
export interface Assumption {
  id: string;
  /** О чём предположение. */
  about: string;
  /** Почему помечено как предположение. */
  reason: string;
}

export interface SkeletonData {
  appType?: string;
  pages: SkeletonPage[];
  transitions: SkeletonTransition[];
  actions: SkeletonAction[];
  expectations: SkeletonExpectation[];
  assumptions: Assumption[];
}

// ---------------------------------------------------------------------------
// Clarification (вопросы и противоречия)
// ---------------------------------------------------------------------------

export interface ClarificationQuestion {
  id: string;
  /** Что не хватает (страница/действие/результат/значение). */
  about: string;
  question: string;
}

export interface Contradiction {
  id: string;
  /** Первое утверждение. */
  left: string;
  /** Второе утверждение. */
  right: string;
  /** Человеческое объяснение противоречия. */
  detail: string;
}

export interface ClarificationResult {
  /** Готов ли skeleton к генерации (нет пробелов/противоречий). */
  complete: boolean;
  questions: ClarificationQuestion[];
  contradictions: Contradiction[];
}

// ---------------------------------------------------------------------------
// Proposal (page object + scenario)
// ---------------------------------------------------------------------------

export interface ProposedStep {
  id: string;
  /** PrettyK DSL-строка шага. */
  dsl: string;
  action: string;
  strategy: string;
  strategyValue: string;
  payload: string;
}

export interface BuddyProposal {
  id: string;
  /** Один page object. */
  pageObject: {
    name: string;
    path?: string;
    /** Элементы страницы. */
    elements: Array<{ name: string; locator: string }>;
  };
  /** Один scenario. */
  scenario: {
    name: string;
    steps: ProposedStep[];
    /** Ожидания (assertions). */
    expectations: SkeletonExpectation[];
  };
  /** Исходный intent, из которого proposal рождён. */
  sourceIntentId: string;
}

// ---------------------------------------------------------------------------
// Bounded Run
// ---------------------------------------------------------------------------

export interface BoundedRunConfig {
  /** Лимит времени (мс). */
  maxTimeMs: number;
  /** Лимит итераций (шагов). */
  maxIterations: number;
  /** Заранее подтверждённый run-scope (какие шаги разрешены). */
  approvedStepIds?: string[];
}

export type BoundedRunPhase =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'stopped'
  | 'bounded_failure';

export interface RunStepOutcome {
  stepId: string;
  ok: boolean;
  /** Честная причина провала. */
  error?: string;
  /** Собранное evidence (HTTP/DOM/AX/скриншот). */
  evidence?: EvidenceItem[];
  /** Время выполнения шага. */
  elapsedMs: number;
}

export interface BoundedRunState {
  phase: BoundedRunPhase;
  currentIteration: number;
  maxIterations: number;
  startedAt: number;
  elapsedMs: number;
  outcomes: RunStepOutcome[];
  /** Причина bounded failure. */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceKind = 'http' | 'dom' | 'ax' | 'screenshot' | 'timing';

export interface EvidenceItem {
  kind: EvidenceKind;
  /** Конкретное доказательство (HTTP-код, DOM-срез, AX-нода). */
  detail: string;
  /** Ссылка/значение артефакта. */
  ref?: string;
}

export interface AssertionResult {
  assertionId: string;
  expectation: string;
  /** Доказано ли assertion. */
  proven: boolean;
  /** Какие evidence подтверждают. */
  evidence: EvidenceItem[];
  /** Честная причина непрохождения. */
  failReason?: string;
}

export interface EvidenceMatrix {
  /** pass ТОЛЬКО если все assertions доказаны. */
  pass: boolean;
  assertions: AssertionResult[];
  /** Замечания/риски (advisory, не влияют на pass). */
  advisories: string[];
}

// ---------------------------------------------------------------------------
// Trace (сквозная цепочка)
// ---------------------------------------------------------------------------

export type BuddyTraceEvent =
  | { kind: 'intent_received'; intentId: string; messageCount: number }
  | { kind: 'skeleton_built'; pages: number; assumptions: number }
  | { kind: 'clarification_asked'; questions: number; contradictions: number }
  | { kind: 'proposal_built'; proposalId: string }
  | { kind: 'proposal_approved'; proposalId: string }
  | { kind: 'proposal_rejected'; proposalId: string }
  | { kind: 'run_started'; runId: string }
  | { kind: 'run_step'; stepId: string; ok: boolean }
  | { kind: 'run_finished'; runId: string; phase: BoundedRunPhase }
  | { kind: 'evidence_evaluated'; pass: boolean };

export interface BuddyTrace {
  /** ID рабочей гипотезы (одна на весь диалог). */
  intentId: string;
  events: BuddyTraceEvent[];
}
