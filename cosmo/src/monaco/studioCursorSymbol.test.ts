import { describe, expect, it } from 'vitest';
import { formatCursorHud, symbolAtCursor } from './studioCursorSymbol';

describe('studioCursorSymbol', () => {
  it('ловит $var и ${var}', () => {
    expect(symbolAtCursor('Открыть $base_url', 10)).toBe('$base_url');
    expect(symbolAtCursor('x ${token} y', 5)).toBe('${token}');
  });

  it('ловит page.Op', () => {
    expect(symbolAtCursor('  login.Submit', 5)).toBe('login.Submit');
  });

  it('formatCursorHud', () => {
    expect(formatCursorHud(3, 8, '')).toBe('3:8');
    expect(formatCursorHud(3, 8, '$x')).toBe('3:8 · $x');
  });
});
