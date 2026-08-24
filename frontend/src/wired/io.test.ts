/**
 * Тесты для io.ts — импорт/экспорт манифеста.
 * RK-FORM-3.
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { defaultWired, resetToDefault } from './io';

describe('defaultWired', () => {
  it('возвращает коробочный манифест secops-lab-pure', () => {
    const m = defaultWired();
    expect(m.regulation.meta.project_id).toBe('owasp-zap-tests');
    expect(m.regulation.meta.assessment_purpose).toBe('scheduled');
    expect(m.regulation.infrastructure.zap_mode).toBe('demon');
    expect(m.regulation.infrastructure.browser_type).toBe('chrome');
    expect(m.regulation.security_configuration.scan_policy).toBe('custom_policy');
    expect(m.regulation.security_configuration.auth_type).toBe('Без авторизации');
    expect(m.editor.imports).toEqual([]);
    expect(m.editor.pages).toEqual([]);
    expect(m.editor.scenarios).toEqual([]);
  });

  it('generate_act = false по умолчанию', () => {
    expect(defaultWired().regulation.meta.generate_act).toBe(false);
  });

  it('debug_mode = false по умолчанию', () => {
    expect(defaultWired().regulation.infrastructure.debug_mode).toBe(false);
  });
});

describe('resetToDefault', () => {
  it('равен defaultWired (fresh object)', () => {
    const a = resetToDefault();
    const b = defaultWired();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('возвращает независимую копию', () => {
    const a = resetToDefault();
    a.regulation.meta.project_id = 'mutated';
    const b = resetToDefault();
    expect(b.regulation.meta.project_id).toBe('owasp-zap-tests');
  });
});
