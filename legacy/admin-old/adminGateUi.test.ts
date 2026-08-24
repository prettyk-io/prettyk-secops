import { describe, expect, it } from 'vitest';
import {
  gateLabel,
  gateTagColor,
  portfolioHeroTone,
  toneFromVerdict,
} from './adminGateUi';

describe('adminGateUi', () => {
  it('maps verdicts to gate tones', () => {
    expect(toneFromVerdict('pass')).toBe('pass');
    expect(toneFromVerdict('fail_gate')).toBe('fail');
    expect(toneFromVerdict('watch')).toBe('watch');
    expect(gateLabel('pass')).toBe('PASS');
    expect(gateTagColor('fail')).toBe('error');
  });

  it('portfolio hero prefers FAIL over WATCH over PASS', () => {
    expect(
      portfolioHeroTone({ gate_fail: 1, gate_watch: 2, gate_pass: 3 }),
    ).toBe('fail');
    expect(
      portfolioHeroTone({ gate_fail: 0, gate_watch: 1, gate_pass: 3 }),
    ).toBe('watch');
    expect(
      portfolioHeroTone({ gate_fail: 0, gate_watch: 0, gate_pass: 2 }),
    ).toBe('pass');
  });
});
