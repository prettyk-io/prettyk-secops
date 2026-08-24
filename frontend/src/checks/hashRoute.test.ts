import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './hashRoute';

describe('hashRoute', () => {
  it('парсит home / history / admin (policies → admin)', () => {
    expect(parseHash('#/home')).toEqual({ kind: 'home' });
    expect(parseHash('#/history')).toEqual({ kind: 'history' });
    expect(parseHash('#/admin')).toEqual({ kind: 'admin' });
    expect(parseHash('#/lab')).toEqual({ kind: 'lab' });
    expect(parseHash('#/policies')).toEqual({ kind: 'admin' });
    expect(parseHash('')).toEqual({ kind: 'home' });
  });

  it('парсит check + view', () => {
    expect(parseHash('#/checks/abc-1/studio')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'studio',
    });
    expect(parseHash('#/checks/abc-1')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'studio',
    });
    expect(parseHash('#/checks/abc-1/nope')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'studio',
    });
  });

  it('formatHash симметричен', () => {
    const route = { kind: 'check' as const, checkId: 'x', view: 'results' as const };
    expect(parseHash(formatHash(route))).toEqual(route);
    expect(formatHash({ kind: 'history' })).toBe('#/history');
    expect(formatHash({ kind: 'admin' })).toBe('#/admin');
    expect(formatHash({ kind: 'lab' })).toBe('#/lab');
  });
});
