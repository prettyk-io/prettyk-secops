import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './hashRoute';

describe('hashRoute', () => {
  it('парсит home / history / admin / studio / lab', () => {
    expect(parseHash('#/home')).toEqual({ kind: 'home' });
    expect(parseHash('#/history')).toEqual({ kind: 'history' });
    expect(parseHash('#/admin')).toEqual({ kind: 'admin' });
    expect(parseHash('#/lab')).toEqual({ kind: 'lab' });
    expect(parseHash('#/studio')).toEqual({ kind: 'studio', checkId: undefined });
    expect(parseHash('#/studio/chk-99')).toEqual({ kind: 'studio', checkId: 'chk-99' });
    expect(parseHash('#/workbench')).toEqual({ kind: 'studio', checkId: undefined });
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

  it('STU-RAILS: парсит editor / studio-old / editor-old', () => {
    expect(parseHash('#/checks/abc-1/editor')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'editor',
    });
    expect(parseHash('#/checks/abc-1/studio-old')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'studio-old',
    });
    expect(parseHash('#/checks/abc-1/editor-old')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'editor-old',
    });
    expect(parseHash('#/checks/abc-1/results')).toEqual({
      kind: 'check',
      checkId: 'abc-1',
      view: 'results',
    });
  });

  it('STU-RAILS: -v2 перенаправляется на канонический studio alias', () => {
    expect(parseHash('#/studio-v2/chk-1')).toEqual({ kind: 'studio', checkId: 'chk-1' });
    expect(parseHash('#/studio-v2')).toEqual({ kind: 'studio', checkId: undefined });
  });

  it('formatHash симметричен', () => {
    const route = { kind: 'check' as const, checkId: 'x', view: 'results' as const };
    expect(parseHash(formatHash(route))).toEqual(route);
    expect(formatHash({ kind: 'history' })).toBe('#/history');
    expect(formatHash({ kind: 'admin' })).toBe('#/admin');
    expect(formatHash({ kind: 'lab' })).toBe('#/lab');
  });
});
