import { describe, expect, it } from 'vitest';
import { validateWiredFields, hasErrors } from './validateWiredFields';

describe('validateWiredFields (PURE simplified)', () => {
  it('требует base_url_override', () => {
    const errors = validateWiredFields({ infrastructure: { base_url_override: '' } });
    expect(errors.map((e) => e.path)).toContain('infrastructure.base_url_override');
  });

  it('валидный http URL — ок', () => {
    const errors = validateWiredFields({ infrastructure: { base_url_override: 'http://example.com' } });
    expect(hasErrors(errors)).toBe(false);
  });

  it('невалидный URL → ошибка', () => {
    const errors = validateWiredFields({ infrastructure: { base_url_override: 'not-a-url' } });
    expect(errors.map((e) => e.path)).toContain('infrastructure.base_url_override');
  });

  it('hasErrors возвращает true/false', () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([{ path: 'x', message: 'err' }])).toBe(true);
  });
});