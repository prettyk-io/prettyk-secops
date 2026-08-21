import { describe, expect, it } from 'vitest';
import { findRefsInText, matchRefAt, rootNameFromRefPath, stripRef } from './refs';

describe('refs scanners', () => {
  it('stripRef accepts $path and ${path}', () => {
    expect(stripRef('$user.email')).toBe('user.email');
    expect(stripRef('${user.email}')).toBe('user.email');
    expect(stripRef('$ENV:TOKEN')).toBe('ENV:TOKEN');
    expect(stripRef('plain')).toBeUndefined();
  });

  it('matchRefAt / findRefsInText locate refs without regex PATH_BODY', () => {
    const text = 'a $x and ${y} end';
    expect(matchRefAt(text, 2)?.token).toBe('$x');
    expect(findRefsInText(text).map((r) => r.path)).toEqual(['x', 'y']);
  });

  it('rootNameFromRefPath keeps simple roots only', () => {
    expect(rootNameFromRefPath('user.email')).toBe('user');
    expect(rootNameFromRefPath('ENV:TOKEN')).toBeUndefined();
  });
});
