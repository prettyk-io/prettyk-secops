import { describe, expect, it } from 'vitest';
import { useVirtualizer } from './virtualRows';

describe('virtualRows', () => {
  it('реэкспортирует useVirtualizer', () => {
    expect(typeof useVirtualizer).toBe('function');
  });
});
