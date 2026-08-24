import { describe, expect, it } from 'vitest';
import { evaluateExportGate, exportContainsPlainSecret } from './validateGate';

describe('evaluateExportGate', () => {
  it('ok без причин', () => {
    expect(evaluateExportGate({})).toEqual({ ok: true, reasons: [] });
  });

  it('собирает constructor + schema', () => {
    const result = evaluateExportGate({
      constructorFails: [{ id: 'page:login', message: 'unknown keyword', line: 2, column: 1 }],
      schemaIssues: [{ breadcrumb: 'meta.name', message: 'Заполните поле', keyword: 'required' }],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]?.source).toBe('constructor');
    expect(result.reasons[1]?.source).toBe('schema');
  });
});

describe('exportContainsPlainSecret', () => {
  it('ловит длинный sample', () => {
    expect(exportContainsPlainSecret('x SecretValue99 y', ['SecretValue99'])).toBe(true);
    expect(exportContainsPlainSecret('x *** y', ['SecretValue99'])).toBe(false);
  });
});
