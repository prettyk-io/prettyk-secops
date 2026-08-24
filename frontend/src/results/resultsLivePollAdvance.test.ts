import { describe, expect, it } from 'vitest';
import { advanceLivePoll } from './resultsLivePollAdvance';

describe('advanceLivePoll', () => {
  it('marks timeout while running', () => {
    const out = advanceLivePoll(
      'running',
      {},
      100_000,
      { runningSince: 0, awaitStartSince: null, awaitingStart: false },
      50_000,
      45_000,
    );
    expect(out.launchFault).toBe('timeout');
    expect(out.hot).toBe(true);
  });

  it('fails start wait on idle', () => {
    const out = advanceLivePoll(
      'idle',
      {},
      50_000,
      { runningSince: null, awaitStartSince: 0, awaitingStart: true },
      45 * 60_000,
      45_000,
    );
    expect(out.launchFault).toBe('start_failed');
  });
});
