import { describe, it, expect } from 'vitest';
import {
  canTransition,
  nextState,
  allowedEvents,
  TERMINAL_STATES,
  isTerminal,
  isRetryable,
  RETRYABLE_STATES,
} from './stateMachine';

describe('Run state machine (PK-CI-2)', () => {
  it('has 4 terminal states in canonical order', () => {
    expect(TERMINAL_STATES).toEqual(['succeeded', 'failed', 'cancelled', 'expired']);
  });

  it('retryable = failed + expired only', () => {
    expect(RETRYABLE_STATES).toEqual(['failed', 'expired']);
  });

  it('isTerminal true for terminal, false for transient', () => {
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('expired')).toBe(true);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('queued')).toBe(false);
  });

  it('isRetryable: failed/expired true, succeeded/cancelled false', () => {
    expect(isRetryable('failed')).toBe(true);
    expect(isRetryable('expired')).toBe(true);
    expect(isRetryable('succeeded')).toBe(false);
    expect(isRetryable('cancelled')).toBe(false);
  });

  it('draft → pending (submit) → queued (approve) → running (acquire)', () => {
    expect(canTransition('draft', 'submit')).toBe(true);
    expect(nextState('draft', 'submit')).toBe('pending');
    expect(nextState('pending', 'approve')).toBe('queued');
    expect(nextState('queued', 'acquire')).toBe('running');
  });

  it('running → cancelling → cancelled (honest cancel path)', () => {
    expect(nextState('running', 'cancel')).toBe('cancelling');
    expect(nextState('cancelling', 'cancel_done')).toBe('cancelled');
  });

  it('running → succeeded / failed / expired', () => {
    expect(nextState('running', 'complete')).toBe('succeeded');
    expect(nextState('running', 'fail')).toBe('failed');
    expect(nextState('running', 'expire')).toBe('expired');
  });

  it('queued/pending cancel directly to cancelled (no worker yet)', () => {
    expect(nextState('pending', 'cancel')).toBe('cancelled');
    expect(nextState('queued', 'cancel')).toBe('cancelled');
  });

  it('rejects invalid transitions (no silent moves)', () => {
    expect(canTransition('succeeded', 'fail')).toBe(false);
    expect(canTransition('cancelled', 'complete')).toBe(false);
    expect(canTransition('draft', 'complete')).toBe(false);
    expect(() => nextState('succeeded', 'fail')).toThrow(/Invalid run transition/);
  });

  it('terminal states have no outgoing events', () => {
    for (const t of TERMINAL_STATES) {
      expect(allowedEvents(t)).toEqual([]);
    }
  });

  it('running has the full set of outgoing events', () => {
    const events = allowedEvents('running').sort();
    expect(events).toEqual(['cancel', 'complete', 'expire', 'fail'].sort());
  });
});
