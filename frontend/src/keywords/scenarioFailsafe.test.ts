import { describe, expect, it } from 'vitest';
import {
  continueOnFailureFromConstructor,
  parseScenarioFailsafePrefix,
  withScenarioFailsafeFlag,
} from './scenarioFailsafe';

describe('parseScenarioFailsafePrefix', () => {
  it('exact marker strips first line', () => {
    const got = parseScenarioFailsafePrefix('<!>\nОткрыть $base_url\n');
    expect(got.allowed).toBe(true);
    expect(got.body).toBe('Открыть $base_url\n');
    expect(got.bodyOffset).toBe(4);
  });

  it('rejects near-miss and leading space', () => {
    expect(parseScenarioFailsafePrefix('<!!\nx').allowed).toBe(false);
    expect(parseScenarioFailsafePrefix(' <!>\nx').allowed).toBe(false);
  });

  it('throws on junk after marker', () => {
    expect(() => parseScenarioFailsafePrefix('<!> discovery\nx')).toThrow(/пробел/);
  });
});

describe('withScenarioFailsafeFlag', () => {
  it('sets continue_on_failure from marker', () => {
    const form = {
      test_suites: {
        scenarios: [{ scenario_name: 'probe', continue_on_failure: false, steps: [{}] }],
      },
    };
    const next = withScenarioFailsafeFlag(
      form,
      '/test_suites/scenarios/0/steps/0/constructor',
      '<!>\nЛог "x"\n',
    ) as typeof form;
    expect(next.test_suites.scenarios[0]?.continue_on_failure).toBe(true);
    expect(continueOnFailureFromConstructor('<!>\nЛог "x"')).toBe(true);
  });

  it('clears flag when marker removed', () => {
    const form = {
      test_suites: {
        scenarios: [{ scenario_name: 'probe', continue_on_failure: true, steps: [{}] }],
      },
    };
    const next = withScenarioFailsafeFlag(
      form,
      '/test_suites/scenarios/0/steps/0/constructor',
      'Лог "x"\n',
    ) as typeof form;
    expect(next.test_suites.scenarios[0]?.continue_on_failure).toBe(false);
  });
});
