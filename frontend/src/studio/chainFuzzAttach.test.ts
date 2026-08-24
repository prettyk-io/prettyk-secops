import { describe, expect, it } from 'vitest';
import { attachChainFuzzTargets, chainSeedsToTargets } from './chainFuzzAttach';
import { listFuzzerIds, normalizeFuzzer } from './studioFuzzers';

describe('chainFuzzAttach', () => {
  it('maps seeds to targets', () => {
    expect(
      chainSeedsToTargets([
        { method: 'post', url: 'https://a/1', body: '{}' },
        { method: 'POST', url: 'https://a/1' },
      ]),
    ).toEqual([
      {
        method: 'POST',
        url: 'https://a/1',
        corpus: 'auto',
        body: '{}',
      },
    ]);
  });

  it('creates chain_* fuzzer and replaces placeholder', () => {
    const form = { test_suites: { fuzzers: [] } };
    const out = attachChainFuzzTargets(form, 'pay', [
      { method: 'GET', url: 'https://bank/x' },
    ]);
    expect(out).toBeTruthy();
    expect(out!.fuzzerId).toBe('chain_pay');
    expect(out!.added).toBe(1);
    expect(listFuzzerIds(out!.data)).toEqual(['chain_pay']);
    const f = normalizeFuzzer(
      (out!.data as { test_suites: { fuzzers: unknown[] } }).test_suites.fuzzers[0],
      0,
    );
    expect(f.targets[0]?.url).toBe('https://bank/x');
  });
});
