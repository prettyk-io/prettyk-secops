import { describe, expect, it } from 'vitest';
import { collectFuzzerRefFails } from './appConstructorFuzzRefs';

describe('collectFuzzerRefFails', () => {
  it('молчит, если id есть в fuzzers[]', () => {
    const fails = collectFuzzerRefFails(
      [{ id: 's1', path: '/scenarios/0/constructor', text: 'ФаззингВолна juice_search_q' }],
      { test_suites: { fuzzers: [{ id: 'juice_search_q' }] } },
    );
    expect(fails).toEqual([]);
  });

  it('ошибка, если фаззера нет', () => {
    const fails = collectFuzzerRefFails(
      [{ id: 's1', path: '/scenarios/0/constructor', text: 'ФаззингВолна missing_q' }],
      { test_suites: { fuzzers: [{ id: 'juice_search_q' }] } },
    );
    expect(fails).toHaveLength(1);
    expect(fails[0]!.message).toContain('missing_q');
  });

  it('ловит wire fuzz|wave|id', () => {
    const fails = collectFuzzerRefFails(
      [{ id: 's1', path: '/p', text: 'fuzz|wave|nope' }],
      { test_suites: { fuzzers: [] } },
    );
    expect(fails).toHaveLength(1);
  });
});
