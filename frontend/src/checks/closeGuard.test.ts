import { describe, expect, it } from 'vitest';
import { serializeCheckBuffer } from './closeGuard';

describe('serializeCheckBuffer', () => {
  it('стабилен для одинакового буфера', () => {
    const a = serializeCheckBuffer({ x: 1 }, { r: 't' });
    const b = serializeCheckBuffer({ x: 1 }, { r: 't' });
    expect(a).toBe(b);
    expect(serializeCheckBuffer({ x: 2 }, { r: 't' })).not.toBe(a);
  });
});
