import { describe, expect, it } from 'vitest';
import type { ConstructorDiagnostic } from '../keywords/constructor';
import { mergeConstructorDiagnostics } from './constructorDiagnosticsMerge';

const diag = (
  partial: Partial<ConstructorDiagnostic> & Pick<ConstructorDiagnostic, 'message'>,
): ConstructorDiagnostic => ({
  start: 0,
  end: 1,
  severity: 'error',
  ...partial,
});

describe('mergeConstructorDiagnostics', () => {
  it('keeps local while backend is pending', () => {
    const local = [diag({ message: 'local', severity: 'warning' })];
    expect(mergeConstructorDiagnostics(local, null)).toEqual(local);
  });

  it('keeps local errors when backend is clean', () => {
    const local = [
      diag({ message: 'err', severity: 'error' }),
      diag({ message: 'warn', severity: 'warning' }),
    ];
    expect(mergeConstructorDiagnostics(local, [])).toEqual([local[0]]);
  });

  it('unions backend with unseen local errors', () => {
    const backend = [diag({ message: 'be', start: 2, end: 3 })];
    const local = [
      diag({ message: 'be', start: 2, end: 3 }),
      diag({ message: 'local-extra', start: 9, end: 10 }),
    ];
    expect(mergeConstructorDiagnostics(local, backend)).toEqual([
      backend[0],
      local[1],
    ]);
  });
});
