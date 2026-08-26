import { describe, expect, it } from 'vitest';
import { documentTabIdFromNodeKey, nextTabDropHint } from './studioTabDrag';

describe('studioTabDrag', () => {
  it('filters hub and keeps document tabs', () => {
    expect(documentTabIdFromNodeKey(null)).toBeUndefined();
    expect(documentTabIdFromNodeKey('action-hub')).toBeUndefined();
    expect(documentTabIdFromNodeKey('page:login')).toBe('page:login');
    const prev = { id: 'page:a' as const, edge: 'before' as const };
    expect(nextTabDropHint(prev, 'page:a', 'before')).toBe(prev);
    expect(nextTabDropHint(prev, 'page:a', 'after')).toEqual({ id: 'page:a', edge: 'after' });
  });
});
