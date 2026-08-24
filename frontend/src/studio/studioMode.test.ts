import { describe, expect, it } from 'vitest';
import {
  studioOffEmptyDescription,
  studioOffReason,
  studioSuiteMode,
} from './studioMode';

describe('studioOffReason', () => {
  it('manual → manual', () => {
    expect(
      studioOffReason({
        meta: { assessment_purpose: 'manual' },
        security_configuration: { scan_policy: 'custom_policy' },
      }),
    ).toBe('manual');
  });

  it('не manual → null (scan_policy не гейтит)', () => {
    expect(studioOffReason({ meta: { assessment_purpose: 'scheduled' } })).toBeNull();
    expect(
      studioOffReason({
        meta: { assessment_purpose: 'emergency' },
        security_configuration: { scan_policy: 'scanner_fuzzing' },
      }),
    ).toBeNull();
  });
});

describe('studioSuiteMode', () => {
  it('manual → off; иначе on', () => {
    expect(studioSuiteMode({ meta: { assessment_purpose: 'manual' } })).toBe('off');
    expect(studioSuiteMode({ meta: { assessment_purpose: 'scheduled' } })).toBe('on');
  });
});

describe('studioOffEmptyDescription', () => {
  it('manual: без «Студия» и без wire-имён', () => {
    const manual = studioOffEmptyDescription({ meta: { assessment_purpose: 'manual' } });
    expect(manual).toContain('Ручная проверка в ZAP');
    expect(manual.toLowerCase()).not.toContain('студия');
    expect(manual).not.toContain('custom_policy');
    expect(manual).not.toContain('scan_policy');
  });
});
