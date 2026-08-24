/**
 * Scenario-level failsafe `<!>` (не action `>?`).
 * Контракт = orchestrator/core/scenario_failsafe.py
 */
export const SCENARIO_FAILSAFE_MARKER = '<!>';

export type ScenarioFailsafeParse = {
  allowed: boolean;
  body: string;
  /** Байтовый/символьный сдвиг тела относительно исходника (длина снятой 1-й строки + \n). */
  bodyOffset: number;
};

export function parseScenarioFailsafePrefix(script = ''): ScenarioFailsafeParse {
  const text = script;
  if (!text) {
    return { allowed: false, body: '', bodyOffset: 0 };
  }
  const nl = text.indexOf('\n');
  const first = nl >= 0 ? text.slice(0, nl) : text;
  const body = nl >= 0 ? text.slice(nl + 1) : '';
  if (!first.startsWith(SCENARIO_FAILSAFE_MARKER)) {
    return { allowed: false, body: text, bodyOffset: 0 };
  }
  const after = first.slice(3);
  if (after.trim()) {
    throw new Error(
      'После маркера сценария <!> на первой строке допустим только пробел',
    );
  }
  const bodyOffset = nl >= 0 ? nl + 1 : first.length;
  return { allowed: true, body, bodyOffset };
}

/** Sync SoT continue_on_failure с наличием <!> в constructor steps[0]. */
export function continueOnFailureFromConstructor(constructor: string): boolean {
  try {
    return parseScenarioFailsafePrefix(constructor).allowed;
  } catch {
    return false;
  }
}

/**
 * Записать continue_on_failure сценария по тексту его canvas.
 * path вида /test_suites/scenarios/N/steps/0/constructor
 */
export function withScenarioFailsafeFlag(
  formData: unknown,
  constructorPointer: string,
  constructorText: string,
): unknown {
  const match = /^\/test_suites\/scenarios\/(\d+)\/steps\/0\/constructor$/.exec(
    constructorPointer,
  );
  if (!match) {
    return formData;
  }
  const idx = Number(match[1]);
  const root = asRecord(formData);
  if (!root) {
    return formData;
  }
  const suites = asRecord(root.test_suites);
  if (!suites || !Array.isArray(suites.scenarios)) {
    return formData;
  }
  const scenarios = [...suites.scenarios];
  const prev = asRecord(scenarios[idx]);
  if (!prev) {
    return formData;
  }
  let flag = false;
  try {
    flag = parseScenarioFailsafePrefix(constructorText).allowed;
  } catch {
    flag = false;
  }
  if (Boolean(prev.continue_on_failure) === flag) {
    return formData;
  }
  scenarios[idx] = { ...prev, continue_on_failure: flag };
  return {
    ...root,
    test_suites: { ...suites, scenarios },
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
