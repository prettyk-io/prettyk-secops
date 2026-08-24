import { describe, expect, it } from 'vitest';
import {
  formatDiagLocation,
  objectIdFromConstructorPath,
  offsetToLineCol,
} from './diagLocation';

describe('offsetToLineCol', () => {
  it('maps offsets to 1-based line:column', () => {
    const text = 'a\nbc\nd';
    expect(offsetToLineCol(text, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol(text, 2)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineCol(text, 4)).toEqual({ line: 2, column: 3 });
  });
});

describe('objectIdFromConstructorPath', () => {
  it('resolves scenario id and page id', () => {
    const data = {
      test_suites: {
        scenarios: [{ id: 's1_data' }, { id: 's4_juice_shop_user_flow' }],
        pages: { login: { constructor: 'x' } },
      },
    };
    expect(
      objectIdFromConstructorPath(
        data,
        '/test_suites/scenarios/1/steps/0/constructor',
      ),
    ).toBe('s4_juice_shop_user_flow');
    expect(objectIdFromConstructorPath(data, '/test_suites/pages/login/constructor')).toBe(
      'login',
    );
  });
});

describe('formatDiagLocation', () => {
  it('formats or falls back', () => {
    expect(formatDiagLocation(37, 1)).toBe('37:1');
    expect(formatDiagLocation(undefined, 1)).toBe('?:?');
  });
});
