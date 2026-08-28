import { describe, expect, it } from 'vitest';
import { compareLocaleStrings, sortStringsAsc } from './sortStrings';

describe('sortStringsAsc / compareLocaleStrings', () => {
  it('sorts ASCII identifiers stably (S2871)', () => {
    expect(sortStringsAsc(['scanner', 'allure', 'http', 'browser'])).toEqual([
      'allure',
      'browser',
      'http',
      'scanner',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = ['c', 'a', 'b'];
    const out = sortStringsAsc(input);
    expect(input).toEqual(['c', 'a', 'b']);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('compareLocaleStrings is usable as Array.sort comparator', () => {
    const keys = ['б', 'а', 'в'];
    keys.sort(compareLocaleStrings);
    expect(keys[0]).toBe('а');
  });
});
