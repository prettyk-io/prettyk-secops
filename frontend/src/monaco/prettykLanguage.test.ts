import { describe, expect, it } from 'vitest';
import {
  PRETTYK_ARGUMENT_RE,
  PRETTYK_NUMBER_RE,
  VAR_DOLLAR_PATH,
} from './prettykLanguage';

/** Порядок root как в Monarch: number, затем argument. */
function fallbackToken(text: string): { kind: 'number' | 'argument'; value: string } | null {
  const number = new RegExp(PRETTYK_NUMBER_RE.source, PRETTYK_NUMBER_RE.flags);
  const argument = new RegExp(PRETTYK_ARGUMENT_RE.source, PRETTYK_ARGUMENT_RE.flags);
  number.lastIndex = 0;
  argument.lastIndex = 0;
  const n = number.exec(text);
  if (n && n.index === 0) {
    return { kind: 'number', value: n[0] };
  }
  const a = argument.exec(text);
  if (a && a.index === 0) {
    return { kind: 'argument', value: a[0] };
  }
  return null;
}

/** Match from start — как Monarch после `$`. */
function dollarPath(text: string): string | null {
  const re = new RegExp(`^(?:${VAR_DOLLAR_PATH.source})`);
  const m = re.exec(text);
  return m?.[0] ?? null;
}

describe('prettyk fallback tokens', () => {
  it('keeps digits inside identifiers (password2)', () => {
    expect(fallbackToken('password2')).toEqual({ kind: 'argument', value: 'password2' });
  });

  it('still colors bare numeric literals', () => {
    expect(fallbackToken('30')).toEqual({ kind: 'number', value: '30' });
    expect(fallbackToken('3.14')).toEqual({ kind: 'number', value: '3.14' });
  });

  it('keeps digits in path-like atoms', () => {
    expect(fallbackToken('/api/v2/login')).toEqual({
      kind: 'argument',
      value: '/api/v2/login',
    });
  });
});

describe('prettyk $var path (locator color)', () => {
  it('colors full ident after $ (not only first letter)', () => {
    expect(dollarPath('username')).toBe('username');
    expect(dollarPath('password_value')).toBe('password_value');
  });

  it('keeps dotted / indexed paths', () => {
    expect(dollarPath('user.email')).toBe('user.email');
    expect(dollarPath('items[0].id')).toBe('items[0].id');
  });

  it('does not treat optional index as optional closing bracket only', () => {
    // Антипаттерн Sonar-refactor: `\[-?\d+\]?` → plain ident не матчится.
    const broken = new RegExp(
      String.raw`[A-Za-z_][A-Za-z0-9_]*\[-?\d+\]?(?:\.[A-Za-z_][A-Za-z0-9_]*\[-?\d+\]?)*`,
    );
    expect(new RegExp(`^(?:${broken.source})`).exec('username')).toBeNull();
    expect(dollarPath('username')).toBe('username');
  });
});
