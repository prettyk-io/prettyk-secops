import { describe, expect, it } from 'vitest';
import { listFuzzerIdsFromFormData, suggestFuzzWaveArgs } from './completionFuzzWave';

const monacoStub = {
  languages: {
    CompletionItemKind: {
      Reference: 17,
      Text: 1,
    },
  },
} as unknown as typeof import('monaco-editor');

const range = {
  startLineNumber: 1,
  endLineNumber: 1,
  startColumn: 1,
  endColumn: 1,
};

describe('completionFuzzWave', () => {
  it('listFuzzerIdsFromFormData читает id', () => {
    expect(
      listFuzzerIdsFromFormData({
        test_suites: { fuzzers: [{ id: 'b' }, { id: 'a' }, { id: '  ' }] },
      }),
    ).toEqual(['a', 'b']);
  });

  it('не срабатывает без пробела после MethodId', () => {
    expect(suggestFuzzWaveArgs(monacoStub, 'ФаззингВолна', range, {})).toBeUndefined();
  });

  it('предлагает id после ФаззингВолна ', () => {
    const hit = suggestFuzzWaveArgs(
      monacoStub,
      'ФаззингВолна ju',
      range,
      { test_suites: { fuzzers: [{ id: 'juice_search_q' }, { id: 'other' }] } },
    );
    expect(hit?.suggestions.map((s) => s.label)).toEqual(['juice_search_q']);
  });
});
