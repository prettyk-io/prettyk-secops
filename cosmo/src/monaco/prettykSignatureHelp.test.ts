import { describe, expect, it } from 'vitest';
import {
  activePrettyArgIndex,
  formatPrettyMethodSignature,
} from './prettykSignatureHelpCore';

describe('prettykSignatureHelp', () => {
  it('formatPrettyMethodSignature — пробелы, не pipe', () => {
    const sig = formatPrettyMethodSignature('Открыть', {
      params: [
        { name: 'url', kind: 'positional', required: true },
        { name: 'timeout', kind: 'positional', required: false, default: 10 },
      ],
      defined_in: 'test',
    });
    expect(sig.label).toBe('Открыть url timeout=10');
    expect(sig.parameterRanges).toHaveLength(2);
    expect(sig.label.slice(...sig.parameterRanges[0]!)).toBe('url');
  });

  it('activePrettyArgIndex считает аргументы по курсору', () => {
    const line = 'Открыть $url 10';
    expect(activePrettyArgIndex(line, 'Открыть'.length, 0)).toBe(0);
    expect(activePrettyArgIndex(line, 'Открыть'.length, 'Открыть'.length)).toBe(0);
    expect(activePrettyArgIndex(line, 'Открыть'.length, 'Открыть '.length)).toBe(0);
    const inUrl = line.indexOf('$url') + 2;
    expect(activePrettyArgIndex(line, 'Открыть'.length, inUrl)).toBe(0);
    expect(activePrettyArgIndex(line, 'Открыть'.length, 'Открыть $url '.length)).toBe(1);
    expect(activePrettyArgIndex(line, 'Открыть'.length, line.length)).toBe(1);
  });
});
