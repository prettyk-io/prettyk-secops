/**
 * BOX-VAL-1: «документ пуст» — Validate/Run должны говорить правду.
 */
import { describe, expect, it } from 'vitest';
import { isWireDocumentEmpty } from './appValidateEmpty';

describe('isWireDocumentEmpty', () => {
  it('null / undefined → пусто', () => {
    expect(isWireDocumentEmpty(null)).toBe(true);
    expect(isWireDocumentEmpty(undefined)).toBe(true);
  });

  it('пустой объект → пусто', () => {
    expect(isWireDocumentEmpty({})).toBe(true);
    expect(isWireDocumentEmpty({ test_suites: {} })).toBe(true);
  });

  it('сценарий с непустым constructor → не пусто', () => {
    expect(
      isWireDocumentEmpty({
        test_suites: {
          scenarios: [{ steps: [{ constructor: 'webdriver|open|x' }] }],
        },
      }),
    ).toBe(false);
  });

  it('сценарий с пустым/пробельным constructor → пусто', () => {
    expect(
      isWireDocumentEmpty({
        test_suites: {
          scenarios: [{ steps: [{ constructor: '   ' }] }],
        },
      }),
    ).toBe(true);
  });

  it('страница с непустым constructor → не пусто', () => {
    expect(
      isWireDocumentEmpty({
        test_suites: {
          pages: { login: { constructor: 'webdriver|open|x' } },
        },
      }),
    ).toBe(false);
  });

  it('fuzzer присутствует → не пусто', () => {
    expect(
      isWireDocumentEmpty({
        test_suites: { fuzzers: [{ id: 'f1' }] },
      }),
    ).toBe(false);
  });

  it('только пустые сценарии и нет fuzzers → пусто', () => {
    expect(
      isWireDocumentEmpty({
        test_suites: {
          scenarios: [{ steps: [] }, { steps: [{ constructor: '' }] }],
          pages: {},
          fuzzers: [],
        },
      }),
    ).toBe(true);
  });
});