import { describe, expect, it } from 'vitest';
import { lineNumbersMinCharsForLineCount } from './lineNumberDigits';

describe('lineNumbersMinCharsForLineCount', () => {
  it('grows only at 10 / 100 / 1000 (VS Code digit steps)', () => {
    expect(lineNumbersMinCharsForLineCount(1)).toBe(1);
    expect(lineNumbersMinCharsForLineCount(9)).toBe(1);
    expect(lineNumbersMinCharsForLineCount(10)).toBe(2);
    expect(lineNumbersMinCharsForLineCount(32)).toBe(2);
    expect(lineNumbersMinCharsForLineCount(99)).toBe(2);
    expect(lineNumbersMinCharsForLineCount(100)).toBe(3);
    expect(lineNumbersMinCharsForLineCount(999)).toBe(3);
    expect(lineNumbersMinCharsForLineCount(1000)).toBe(4);
  });
});
