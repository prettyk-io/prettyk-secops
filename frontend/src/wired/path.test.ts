import { describe, expect, it } from 'vitest';
import { getPath, setPath } from './path';

describe('path utils', () => {
  it('getPath читает вложенное', () => {
    expect(getPath({ meta: { assessment_purpose: 'manual' } }, 'meta.assessment_purpose')).toBe('manual');
    expect(getPath({}, 'meta.x')).toBeUndefined();
  });

  it('getPath возвращает undefined для null/не-объекта', () => {
    expect(getPath(null, 'a.b')).toBeUndefined();
    expect(getPath(42, 'a.b')).toBeUndefined();
    expect(getPath('string', 'a.b')).toBeUndefined();
  });

  it('setPath пишет иммутабельно', () => {
    const state = { meta: { generate_act: false, assessment_purpose: 'scheduled' } };
    const next = setPath(state, 'meta.generate_act', true);
    expect(next.meta.generate_act).toBe(true);
    expect(state.meta.generate_act).toBe(false);
    expect(next.meta.assessment_purpose).toBe('scheduled');
  });

  it('setPath создаёт промежуточные ветки', () => {
    const next = setPath({}, 'a.b.c', 42);
    expect(next).toEqual({ a: { b: { c: 42 } } });
  });
});
