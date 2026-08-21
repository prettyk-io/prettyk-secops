import { describe, expect, it } from 'vitest';
import { logicalOffsetToModel } from './offsets';

describe('logicalOffsetToModel', () => {
  it('keeps the logical end before padded canvas lines', () => {
    expect(logicalOffsetToModel('От\n\n\n', 2)).toBe(2);
  });

  it('maps offsets across model newlines', () => {
    expect(logicalOffsetToModel('ab\ncd\n', 2)).toBe(3);
    expect(logicalOffsetToModel('ab\ncd\n', 4)).toBe(5);
  });
});
