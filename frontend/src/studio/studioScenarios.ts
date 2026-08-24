/**
 * Мутации scenarios / steps в formData из Студии.
 */

import { defaultConstructorText } from './defaultConstructor';
import { humanizeSnakeCase } from './humanizeSnakeCase';
import { displayNameError } from './pythonIds';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function ensureScenariosRoot(formData: unknown): {
  root: Record<string, unknown>;
  suites: Record<string, unknown>;
  scenarios: unknown[];
} {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const scenarios = Array.isArray(suites.scenarios) ? [...suites.scenarios] : [];
  return { root, suites, scenarios };
}

function commitScenarios(
  root: Record<string, unknown>,
  suites: Record<string, unknown>,
  scenarios: unknown[],
): unknown {
  return {
    ...root,
    test_suites: {
      ...suites,
      scenarios,
    },
  };
}

export function emptyStep(id = ''): Record<string, unknown> {
  return {
    id,
    description: '',
    constructor: defaultConstructorText(),
    failsafe: false,
    retry: 0,
    retry_delay: 2,
    continue_on_failure: false,
    save_as: '',
  };
}

export function emptyScenario(name: string, description?: string): Record<string, unknown> {
  return {
    scenario_name: name,
    description: description ?? humanizeSnakeCase(name),
    continue_on_failure: false,
    /** UI Редактора не показывает шаги; schema требует steps[].constructor. */
    steps: [emptyStep()],
  };
}

/** Гарантирует steps[0] с constructor — для вкладки сценария. */
export function ensureScenarioStep0(
  formData: unknown,
  scenarioIndex: number,
): unknown | undefined {
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return undefined;
  }
  const scenario = asRecord(scenarios[scenarioIndex]) ?? emptyScenario('scenario');
  const steps = Array.isArray(scenario.steps) ? [...scenario.steps] : [];
  if (steps.length === 0) {
    steps.push(emptyStep());
    scenarios[scenarioIndex] = { ...scenario, steps };
    return commitScenarios(root, suites, scenarios);
  }
  const first = asRecord(steps[0]) ?? emptyStep();
  const ctor = first['constructor'];
  if (typeof ctor !== 'string' || ctor.length === 0) {
    steps[0] = { ...first, constructor: emptyStep()['constructor'] };
    scenarios[scenarioIndex] = { ...scenario, steps };
    return commitScenarios(root, suites, scenarios);
  }
  return formData;
}

/** Имя сценария: python-id. */
export function scenarioNameError(name: string): string | undefined {
  return displayNameError(name, 'scenario');
}

export function listScenarioNames(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const scenarios = suites?.scenarios;
  if (!Array.isArray(scenarios)) {
    return [];
  }
  return scenarios.map((item) => {
    const scenario = asRecord(item);
    const name = scenario?.scenario_name;
    return typeof name === 'string' ? name.trim() : '';
  }).filter((name) => name.length > 0);
}

export function addScenario(formData: unknown, name: string, description?: string): unknown | undefined {
  const trimmed = name.trim();
  if (!trimmed || scenarioNameError(trimmed)) {
    return undefined;
  }
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  const names = listScenarioNames(formData);
  if (names.includes(trimmed)) {
    return undefined;
  }
  scenarios.push(emptyScenario(trimmed, description));
  return commitScenarios(root, suites, scenarios);
}

export function renameScenario(
  formData: unknown,
  scenarioIndex: number,
  name: string,
): unknown | undefined {
  const trimmed = name.trim();
  if (!trimmed || scenarioNameError(trimmed)) {
    return undefined;
  }
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return undefined;
  }
  const names = listScenarioNames(formData);
  const prev = asRecord(scenarios[scenarioIndex]) ?? {};
  const prevName = typeof prev.scenario_name === 'string' ? prev.scenario_name.trim() : '';
  if (trimmed !== prevName && names.includes(trimmed)) {
    return undefined;
  }
  scenarios[scenarioIndex] = { ...prev, scenario_name: trimmed };
  return commitScenarios(root, suites, scenarios);
}

export function removeScenario(formData: unknown, scenarioIndex: number): unknown {
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return formData;
  }
  scenarios.splice(scenarioIndex, 1);
  return commitScenarios(root, suites, scenarios);
}

export function addStep(
  formData: unknown,
  scenarioIndex: number,
  stepId = '',
): { data: unknown; stepIndex: number } | undefined {
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return undefined;
  }
  const scenario = asRecord(scenarios[scenarioIndex]) ?? emptyScenario('scenario');
  const steps = Array.isArray(scenario.steps) ? [...scenario.steps] : [];
  const stepIndex = steps.length;
  steps.push(emptyStep(stepId));
  scenarios[scenarioIndex] = { ...scenario, steps };
  return { data: commitScenarios(root, suites, scenarios), stepIndex };
}

export function removeStep(
  formData: unknown,
  scenarioIndex: number,
  stepIndex: number,
): unknown {
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return formData;
  }
  const scenario = asRecord(scenarios[scenarioIndex]);
  if (!scenario) {
    return formData;
  }
  const steps = Array.isArray(scenario.steps) ? [...scenario.steps] : [];
  if (stepIndex < 0 || stepIndex >= steps.length) {
    return formData;
  }
  steps.splice(stepIndex, 1);
  scenarios[scenarioIndex] = { ...scenario, steps };
  return commitScenarios(root, suites, scenarios);
}

export function renameStepId(
  formData: unknown,
  scenarioIndex: number,
  stepIndex: number,
  stepId: string,
): unknown | undefined {
  const { root, suites, scenarios } = ensureScenariosRoot(formData);
  if (scenarioIndex < 0 || scenarioIndex >= scenarios.length) {
    return undefined;
  }
  const scenario = asRecord(scenarios[scenarioIndex]);
  if (!scenario) {
    return undefined;
  }
  const steps = Array.isArray(scenario.steps) ? [...scenario.steps] : [];
  if (stepIndex < 0 || stepIndex >= steps.length) {
    return undefined;
  }
  const step = asRecord(steps[stepIndex]) ?? emptyStep();
  steps[stepIndex] = { ...step, id: stepId.trim() };
  scenarios[scenarioIndex] = { ...scenario, steps };
  return commitScenarios(root, suites, scenarios);
}
