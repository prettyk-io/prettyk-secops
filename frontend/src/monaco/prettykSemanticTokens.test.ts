import { describe, expect, it } from 'vitest';
import {
  collectPrettykSemanticSpans,
  encodePrettykSemanticTokens,
} from './prettykSemanticTokens';

describe('prettykSemanticTokens FE-12', () => {
  it('slice1: tags Секрет and MethodId at line root', () => {
    const text = [
      'Секрет $tok = "x"',
      'Открыть https://app',
      '  Открыть nested',
      'Пусть $a = 1',
      '# comment Открыть',
    ].join('\n');
    const spans = collectPrettykSemanticSpans(text);
    const kinds = spans.map((s) => `${s.kind}:${s.line}`);
    expect(kinds).toContain('secret:0');
    expect(kinds).toContain('method:1');
    expect(kinds).toContain('method:2');
    expect(kinds).toContain('let:3');
    expect(kinds.some((k) => k.startsWith('method:4'))).toBe(false);
  });

  it('slice2: locator strategies + skips comment lines', () => {
    const text = [
      'Кликнуть css #ok',
      'xpath //a',
      '# css ignore',
    ].join('\n');
    const spans = collectPrettykSemanticSpans(text);
    expect(spans.some((s) => s.kind === 'locator' && s.line === 0)).toBe(true);
    expect(spans.some((s) => s.kind === 'locator' && s.line === 1)).toBe(true);
    expect(spans.some((s) => s.line === 2)).toBe(false);
  });

  it('encodes delta tokens', () => {
    const data = encodePrettykSemanticTokens([
      { line: 0, start: 0, length: 6, kind: 'secret' },
      { line: 2, start: 0, length: 7, kind: 'method' },
      { line: 2, start: 8, length: 3, kind: 'locator' },
    ]);
    expect([...data]).toEqual([0, 0, 6, 0, 0, 2, 0, 7, 1, 0, 0, 8, 3, 2, 0]);
  });
});
