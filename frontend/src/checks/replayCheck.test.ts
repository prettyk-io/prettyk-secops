// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumePendingReplay,
  markPendingReplay,
  PENDING_REPLAY_KEY,
  peekPendingReplay,
} from './replayCheck';

describe('replayCheck pending flag', () => {
  afterEach(() => {
    sessionStorage.removeItem(PENDING_REPLAY_KEY);
  });

  it('mark peek consume', () => {
    markPendingReplay('chk-1');
    expect(peekPendingReplay()).toBe('chk-1');
    expect(consumePendingReplay()).toBe('chk-1');
    expect(consumePendingReplay()).toBeNull();
  });
});
