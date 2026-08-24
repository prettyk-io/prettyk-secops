/**
 * PRETTYK-CI — Честная state machine (PK-CI-2).
 *
 * Чистые функции переходов. Без side effects. Проверяемы в SSR/tests.
 *
 *   import { canTransition, transition, TERMINAL_STATES } from '@/ci/stateMachine';
 */
import type { RunState, RunEvent } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Terminal states
// ═══════════════════════════════════════════════════════════════════════════

export const TERMINAL_STATES: readonly RunState[] = [
  'succeeded',
  'failed',
  'cancelled',
  'expired',
];

export const RETRYABLE_STATES: readonly RunState[] = ['failed', 'expired'];

export function isTerminal(state: RunState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function isRetryable(state: RunState): boolean {
  return (RETRYABLE_STATES as readonly string[]).includes(state);
}

// ═══════════════════════════════════════════════════════════════════════════
// Transition table (canonical)
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS: Record<RunState, Partial<Record<RunEvent, RunState>>> = {
  draft: {
    submit: 'pending',
    abandon: 'cancelled',
  },
  pending: {
    approve: 'queued',
    reject: 'cancelled',
    cancel: 'cancelled',
    expire: 'expired',
  },
  queued: {
    acquire: 'running',
    cancel: 'cancelled',
    expire: 'expired',
  },
  running: {
    cancel: 'cancelling',
    complete: 'succeeded',
    fail: 'failed',
    expire: 'expired',
  },
  cancelling: {
    cancel_done: 'cancelled',
    cancel_fail: 'failed',
  },
  succeeded: {},   // terminal
  failed: {},     // terminal (retry порождает НОВЫЙ run)
  cancelled: {},  // terminal
  expired: {},    // terminal (retry порождает НОВЫЙ run)
};

/**
 * Разрешён ли переход из state по event.
 */
export function canTransition(state: RunState, event: RunEvent): boolean {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS[state], event);
}

/**
 * Вычислить целевой state. Бросает, если переход недопустим.
 */
export function nextState(state: RunState, event: RunEvent): RunState {
  const target = TRANSITIONS[state][event];
  if (!target) {
    throw new Error(`Invalid run transition: ${state} --${event}--> ?`);
  }
  return target;
}

/**
 * Список допустимых событий из state (для UI: какие кнопки активны).
 */
export function allowedEvents(state: RunState): RunEvent[] {
  return Object.keys(TRANSITIONS[state]) as RunEvent[];
}
