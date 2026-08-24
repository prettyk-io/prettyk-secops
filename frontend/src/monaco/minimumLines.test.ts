import { describe, expect, it } from 'vitest';
import { CONSTRUCTOR_VISIBLE_LINES } from './constructorLayout';
import {
  lastNonEmptyLineNumber,
  missingLineBreaks,
  targetConstructorLineCount,
} from './minimumLines';

describe('missingLineBreaks', () => {
  it('restores the 32-line constructor canvas after empty lines are deleted', () => {
    expect(missingLineBreaks(CONSTRUCTOR_VISIBLE_LINES - 1)).toBe('\n');
    expect(missingLineBreaks(1)).toBe('\n'.repeat(CONSTRUCTOR_VISIBLE_LINES - 1));
  });

  it('does not add lines once the canvas has 32 or more', () => {
    expect(missingLineBreaks(CONSTRUCTOR_VISIBLE_LINES)).toBe('');
    expect(missingLineBreaks(CONSTRUCTOR_VISIBLE_LINES + 7)).toBe('');
  });
});

describe('targetConstructorLineCount', () => {
  it('keeps empty Enter inside the 32-line canvas from growing', () => {
    expect(targetConstructorLineCount(40, 0)).toBe(CONSTRUCTOR_VISIBLE_LINES);
    expect(targetConstructorLineCount(40, 1)).toBe(CONSTRUCTOR_VISIBLE_LINES);
    expect(targetConstructorLineCount(33, 5)).toBe(CONSTRUCTOR_VISIBLE_LINES);
  });

  it('allows growth only after content fills 32 lines', () => {
    expect(targetConstructorLineCount(32, 32)).toBe(32);
    expect(targetConstructorLineCount(33, 32)).toBe(33);
    expect(targetConstructorLineCount(34, 32)).toBe(33);
    expect(targetConstructorLineCount(34, 33)).toBe(34);
  });
});

describe('lastNonEmptyLineNumber', () => {
  it('ignores trailing blanks', () => {
    expect(lastNonEmptyLineNumber(['Лог "a"', '', '', ''])).toBe(1);
    expect(lastNonEmptyLineNumber(['', '', ''])).toBe(0);
  });
});
