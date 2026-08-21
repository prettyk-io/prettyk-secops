import { describe, expect, it } from 'vitest';
import {
  addScenario,
  ensureScenarioStep0,
  removeScenario,
  renameScenario,
  scenarioNameError,
} from './studioScenarios';

describe('studioScenarios', () => {
  it('создаёт сценарий сразу с одним скрытым шагом', () => {
    const withScenario = addScenario({}, 's1_data') as {
      test_suites: { scenarios: { scenario_name: string; steps: { constructor: string }[] }[] };
    };
    expect(withScenario.test_suites.scenarios[0]?.scenario_name).toBe('s1_data');
    expect(withScenario.test_suites.scenarios[0]?.steps).toHaveLength(1);
    expect(withScenario.test_suites.scenarios[0]?.steps[0]?.constructor.length).toBeGreaterThan(0);
  });

  it('переименовывает и удаляет', () => {
    const base = addScenario({}, 'flow_a');
    const renamed = renameScenario(base, 0, 'flow_b') as {
      test_suites: { scenarios: { scenario_name: string }[] };
    };
    expect(renamed.test_suites.scenarios[0]?.scenario_name).toBe('flow_b');
    const removed = removeScenario(renamed, 0) as {
      test_suites: { scenarios: unknown[] };
    };
    expect(removed.test_suites.scenarios).toHaveLength(0);
  });

  it('только python-id; отклоняет пустое / кириллицу / дубликат', () => {
    expect(scenarioNameError('123')).toBeTruthy();
    expect(scenarioNameError('')).toBeTruthy();
    expect(scenarioNameError('loginFlow')).toBeUndefined();
    expect(addScenario({}, '123')).toBeUndefined();
    const first = addScenario({}, 'Alpha');
    expect(first).toBeDefined();
    expect(addScenario(first, 'Alpha')).toBeUndefined();
    expect(scenarioNameError('Сценарий')).toBeTruthy();
  });

  it('renameScenario: конфликт имён', () => {
    const base = addScenario(addScenario({}, 'flow_a'), 'flow_b');
    expect(renameScenario(base, 0, 'flow_b')).toBeUndefined();
    const renamed = renameScenario(base, 0, 'flow_c');
    expect(renamed).toBeDefined();
    expect(
      (renamed as { test_suites: { scenarios: { scenario_name: string }[] } }).test_suites
        .scenarios[0]?.scenario_name,
    ).toBe('flow_c');
  });

  it('ensureScenarioStep0 дописывает пустой steps', () => {
    const bare = {
      test_suites: { scenarios: [{ scenario_name: 'Bare', steps: [] }] },
    };
    const next = ensureScenarioStep0(bare, 0) as typeof bare;
    expect(next.test_suites.scenarios[0]?.steps).toHaveLength(1);
  });
});
