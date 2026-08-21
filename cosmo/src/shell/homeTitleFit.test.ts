import { describe, expect, it } from 'vitest';
import { titleTargetWidth } from './homeTitleFit';

describe('homeTitleFit', () => {
  it('target = ширина entry (1:1)', () => {
    expect(titleTargetWidth(525)).toBe(525);
    expect(titleTargetWidth(525, 1)).toBe(525);
    expect(titleTargetWidth(100, 0.96)).toBe(96);
  });
});
