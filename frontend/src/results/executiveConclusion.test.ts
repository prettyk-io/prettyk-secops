import { describe, expect, it } from 'vitest';
import {
  buildExecutiveConclusion,
  classFromRisks,
  normalizeRisks,
} from './executiveConclusion';

describe('executiveConclusion', () => {
  it('Critical from counts', () => {
    expect(classFromRisks(normalizeRisks({ critical: 1 }))).toBe('Critical');
    const got = buildExecutiveConclusion({ counts: { critical: 1 } });
    expect(got.executive_class).toBe('Critical');
    expect(got.recommendations[0]).toMatch(/критическ/i);
  });

  it('Watch from soft + cluster lines', () => {
    const got = buildExecutiveConclusion({
      counts: { low: 1 },
      collapse: {
        top_findings: [
          {
            name: 'Missing Anti-clickjacking Header',
            risk: 'low',
            count: 5,
            systemic: true,
          },
        ],
      },
    });
    expect(got.executive_class).toBe('Watch');
    expect(got.recommendations.some((r) => r.includes('Anti-clickjacking'))).toBe(true);
  });

  it('fail_run does not inflate security class; sets execution_fault', () => {
    const got = buildExecutiveConclusion({
      counts: {},
      ci_verdict: 'fail_run',
      ci_exit_code: 1,
    });
    expect(got.executive_class).toBe('Pass');
    expect(got.execution_fault).toBe(true);
    expect(got.recommendations[0]).toMatch(/Исполнение: сбой/i);
  });

  it('fail_run with High findings keeps High security class', () => {
    const got = buildExecutiveConclusion({
      counts: { high: 2 },
      ci_verdict: 'fail_run',
      ci_exit_code: 1,
    });
    expect(got.executive_class).toBe('High');
    expect(got.execution_fault).toBe(true);
  });

  it('Pass when clean', () => {
    expect(buildExecutiveConclusion({ counts: {} }).executive_class).toBe('Pass');
  });
});
