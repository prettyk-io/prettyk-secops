import { describe, expect, it } from 'vitest';
import { selectedTreeKey } from './studioTreeKeys';

describe('selectedTreeKey', () => {
  it('keeps document tabs only', () => {
    expect(selectedTreeKey(undefined)).toBeUndefined();
    expect(selectedTreeKey('action-hub')).toBeUndefined();
    expect(selectedTreeKey('page:login')).toBe('page:login');
    expect(selectedTreeKey('scenario:3')).toBe('scenario:3');
  });
});
