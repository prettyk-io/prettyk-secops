import { describe, expect, it } from 'vitest';
import { compareProblemMarkers, countProblemSeverities, nextProblemIndex } from './studioProblems';

const mk = (line: number, col: number, severity = 8) => ({
  severity,
  startLineNumber: line,
  startColumn: col,
  endLineNumber: line,
  endColumn: col + 1,
  message: 'x',
});

describe('studioProblems', () => {
  it('orders by line then column', () => {
    const list = [mk(2, 1), mk(1, 5), mk(1, 2)].sort(compareProblemMarkers);
    expect(list.map((m) => `${m.startLineNumber}:${m.startColumn}`)).toEqual([
      '1:2',
      '1:5',
      '2:1',
    ]);
  });

  it('counts errors and warnings', () => {
    expect(countProblemSeverities([mk(1, 1, 8), mk(2, 1, 4), mk(3, 1, 8)], 8, 4)).toEqual({
      errors: 2,
      warnings: 1,
      total: 3,
    });
  });

  it('jumps to next marker and wraps', () => {
    const markers = [mk(1, 1), mk(2, 5), mk(4, 1)].sort(compareProblemMarkers);
    expect(nextProblemIndex(markers, 1, 1)).toBe(1);
    expect(nextProblemIndex(markers, 2, 5)).toBe(2);
    expect(nextProblemIndex(markers, 4, 2)).toBe(0);
  });
});
