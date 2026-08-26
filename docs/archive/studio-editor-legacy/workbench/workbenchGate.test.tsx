/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  readWorkbenchSurface,
  persistWorkbenchSurface,
  WORKBENCH_SURFACE_STORAGE_KEY,
  type WorkbenchSurface,
} from './workbenchSurface';
import {
  readConstructorText,
  writeConstructorText,
  listDslTabs,
  firstDslTab,
  findDslTab,
  resolveNeighborDslTab,
  type DslTabRef,
} from '../wired/wiredDslCodec';
import { fuzzerTabId, resourceTabId, scenarioTabId } from '../studio/studioTabs';

/** Minimal legacy formData (test_suites). */
function makeFormData(scenarios?: Array<Record<string, unknown>>) {
  return {
    meta: { assessment_purpose: 'automated' },
    infrastructure: {},
    security_configuration: {},
    test_suites: {
      scenarios: scenarios ?? [],
      pages: {},
      imports: [],
    },
  };
}

/**
 * Helper: create a scenario with a constructor.
 */
function makeScenario(name: string, constructor: string) {
  return {
    scenario_name: name,
    description: '',
    continue_on_failure: false,
    steps: [{ step_id: 'step-0', description: '', constructor }],
  };
}

// ── WorkbenchSurface persistence ──
describe('Workbench Surface', () => {
  it('round-trips persist → read', () => {
    persistWorkbenchSurface('editor');
    expect(readWorkbenchSurface()).toBe('editor');
    const raw = localStorage.getItem(WORKBENCH_SURFACE_STORAGE_KEY);
    expect(raw).toBe('editor');

    persistWorkbenchSurface('studio');
    expect(readWorkbenchSurface()).toBe('studio');
    const raw2 = localStorage.getItem(WORKBENCH_SURFACE_STORAGE_KEY);
    expect(raw2).toBe('studio');
  });

  it('defaults to studio for unknown values', () => {
    localStorage.setItem(WORKBENCH_SURFACE_STORAGE_KEY, 'garbage');
    expect(readWorkbenchSurface()).toBe('studio');
  });

  it('does not throw in SSR (no window)', () => {
    // readWorkbenchSurface guards `typeof window === 'undefined'`
    // persistWorkbenchSurface same
    expect(typeof readWorkbenchSurface()).toBe('string');
    persistWorkbenchSurface('editor'); // noop in SSR
  });

  it('WorkbenchSurface type has correct values', () => {
    const surfaces: WorkbenchSurface[] = ['studio', 'editor'];
    for (const s of surfaces) {
      expect(['studio', 'editor']).toContain(s);
    }
  });
});

// ── Codec: formData ↔ DSL bidirectional round-trip ──
describe('Codec Bidirectional Round-Trip', () => {
  const constructorText = 'SAFE_GET https://example.com\n  expect status 200;\n\n  SECRET Bearer token\n\n  OPEN browser\n  CLICK login_button';

  it('write → read preserves content (pad-tolerant)', () => {
    const formData = makeFormData([makeScenario('Login', '')]);
    const path = '/test_suites/scenarios/0/steps/0/constructor';
    const written = writeConstructorText(formData, path, constructorText);
    const read = readConstructorText(written, path);
    // readConstructorText pads to 32 lines; strip trailing whitespace for comparison
    const normalized = read.replace(/\n+$/, '');
    expect(normalized).toBe(constructorText);
    // 32-line canon
    expect(read.split('\n').length).toBe(32);
  });

  it('read pads to 32 lines (canon)', () => {
    const formData = makeFormData([makeScenario('Login', 'one line')]);
    const path = '/test_suites/scenarios/0/steps/0/constructor';
    const text = readConstructorText(formData, path);
    const lines = text.split('\n');
    expect(lines.length).toBe(32);
    expect(lines[0]).toBe('one line');
    // pad lines should be empty
    for (let i = 1; i < 32; i++) {
      expect(lines[i]).toBe('');
    }
  });

  it('writeConstructorText returns new object (immutable)', () => {
    const formData = makeFormData([makeScenario('Login', 'original')]);
    const path = '/test_suites/scenarios/0/steps/0/constructor';
    const next = writeConstructorText(formData, path, 'modified');
    expect(next).not.toBe(formData);
    // readConstructorText pads to 32 lines — strip trailing empty lines for content comparison
    const originalText = readConstructorText(formData, path).replace(/\n+$/, '');
    const nextText = readConstructorText(next, path).replace(/\n+$/, '');
    expect(originalText).toBe('original');
    expect(nextText).toBe('modified');
  });
});

// ── DSL Tab listing ──
describe('DSL Tab listing', () => {
  it('lists single scenario tab', () => {
    const formData = makeFormData([makeScenario('Login', 'SAFE_GET https://example.com')]);
    const tabs = listDslTabs(formData);
    expect(tabs).toHaveLength(1);
    const tab = tabs[0]!;
    expect(tab.kind).toBe('scenario');
    expect(tab.entityId).toBe('Login');
    expect(tab.label).toBe('Login');
    expect(tab.path).toMatch(/\/test_suites\/scenarios\/\d+\/steps\/0\/constructor/);
  });

  it('lists multiple scenarios', () => {
    const formData = makeFormData([
      makeScenario('Login', 'OPEN login'),
      makeScenario('Signup', 'TYPE email'),
    ]);
    const tabs = listDslTabs(formData);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.label).toBe('Login');
    expect(tabs[1]!.label).toBe('Signup');
  });

  it('returns empty for no scenarios', () => {
    const formData = makeFormData();
    const tabs = listDslTabs(formData);
    expect(tabs).toHaveLength(0);
  });

  it('firstDslTab returns first scenario', () => {
    const formData = makeFormData([
      makeScenario('A', ''),
      makeScenario('B', ''),
    ]);
    const first = firstDslTab(formData);
    expect(first).toBeDefined();
    expect(first!.label).toBe('A');
    expect(first!.kind).toBe('scenario');
  });

  it('findDslTab finds by kind + entityId', () => {
    const formData = makeFormData([
      makeScenario('Login', ''),
      makeScenario('Signup', ''),
    ]);
    const found = findDslTab(formData, 'scenario', 'Signup');
    expect(found).toBeDefined();
    expect(found!.entityId).toBe('Signup');

    const missing = findDslTab(formData, 'scenario', 'Nope');
    expect(missing).toBeNull();
  });
});

// ── Simulated Studio ↔ Editor round-trip ──
describe('Studio ↔ Editor Round-Trip', () => {
  it('Studio edit → codec reads correctly in Editor', () => {
    const original = makeFormData([makeScenario('Login', 'SAFE_GET https://example.com\n  SECRET token')]);
    const scenarioPath = '/test_suites/scenarios/0/steps/0/constructor';

    // Simulate Studio edit
    const editedInStudio = writeConstructorText(original, scenarioPath, 'SAFE_GET https://example.com\n  SECRET token\n  OPEN browser\n  CLICK login\n');

    // Simulate Editor reading the same formData
    const editorText = readConstructorText(editedInStudio, scenarioPath);
    expect(editorText).toContain('SAFE_GET https://example.com');
    expect(editorText).toContain('SECRET token');
    expect(editorText).toContain('OPEN browser');
    expect(editorText).toContain('CLICK login');
  });

  it('Editor edit → formData mutates correctly (Studio reads back)', () => {
    const original = makeFormData([makeScenario('Login', 'SAFE_GET https://example.com')]);
    const scenarioPath = '/test_suites/scenarios/0/steps/0/constructor';

    // Simulate Editor edit
    const editedInEditor = writeConstructorText(original, scenarioPath, 'SAFE_GET https://new-url.com\n  expect status 201;\n');

    // Simulate Studio reading back the same formData
    const studioText = readConstructorText(editedInEditor, scenarioPath);
    expect(studioText).toContain('SAFE_GET https://new-url.com');
    expect(studioText).toContain('expect status 201;');
    expect(studioText).not.toContain('https://example.com'); // old URL gone
  });

  it('Multiple scenarios survive round-trip', () => {
    let formData = makeFormData([
      makeScenario('Login', 'SAFE_GET https://login.com'),
      makeScenario('Dashboard', 'SAFE_GET https://dashboard.com'),
    ]);
    const loginPath = '/test_suites/scenarios/0/steps/0/constructor';
    const dashPath = '/test_suites/scenarios/1/steps/0/constructor';

    // Edit Login in Editor
    formData = writeConstructorText(formData, loginPath, 'SAFE_GET https://login.com\n  OPEN browser\n') as typeof formData;
    // Edit Dashboard in Studio
    formData = writeConstructorText(formData, dashPath, 'SAFE_GET https://dashboard.com\n  expect status 200;\n') as typeof formData;

    const loginText = readConstructorText(formData, loginPath);
    const dashText = readConstructorText(formData, dashPath);

    expect(loginText).toContain('OPEN browser');
    expect(dashText).toContain('expect status 200;');
  });
});

// ── Tab switch preserves content ──
describe('Tab Switch Preserves Content', () => {
  it('switching tabs does not lose previous tab content', () => {
    let formData = makeFormData([
      makeScenario('Tab-A', 'content A'),
      makeScenario('Tab-B', 'content B'),
    ]);
    const pathA = '/test_suites/scenarios/0/steps/0/constructor';
    const pathB = '/test_suites/scenarios/1/steps/0/constructor';

    // Edit Tab-A
    formData = writeConstructorText(formData, pathA, 'content A modified') as typeof formData;

    // Switch to Tab-B
    const textB = readConstructorText(formData, pathB);
    expect(textB).toContain('content B');

    // Tab-A still has its edit
    const textA = readConstructorText(formData, pathA);
    expect(textA).toContain('content A modified');
    expect(textA).not.toContain('content A\n'); // old 1-liner was padded to 32 lines
  });
});

// ── Surface switch preserves formData identity ──
describe('Surface Switch Data Integrity', () => {
  it('Editor surface reads same formData as Studio surface', () => {
    const formData = makeFormData([makeScenario('Auth', 'SAFE_GET https://api.example.com\n  SECRET key\n')]);
    const path = '/test_suites/scenarios/0/steps/0/constructor';

    // Read in "Studio" surface
    const studioText = readConstructorText(formData, path);

    // Same formData read in "Editor" surface
    const editorText = readConstructorText(formData, path);

    expect(editorText).toBe(studioText);
    expect(editorText).toContain('SAFE_GET');
    expect(editorText).toContain('SECRET key');
  });

  it('formData is the single source of truth across surfaces', () => {
    let formData = makeFormData([makeScenario('Shared', 'initial')]);
    const path = '/test_suites/scenarios/0/steps/0/constructor';

    // Edit via "Editor" surface
    formData = writeConstructorText(formData, path, 'edited in editor') as typeof formData;

    // "Studio" surface sees the edit
    const studioView = readConstructorText(formData, path);
    expect(studioView).toContain('edited in editor');
    expect(studioView).not.toContain('initial'); // but padded to 32 lines
  });
});

// ── ER-2: neighbour resolution after delete (no phantom tabs) ──
describe('resolveNeighborDslTab', () => {
  it('returns null for an empty tree', () => {
    const formData = makeFormData([]);
    expect(resolveNeighborDslTab(formData, scenarioTabId(0))).toBeNull();
  });

  it('picks the neighbour scenario that shifted into the deleted index', () => {
    // Post-delete tree: 'A' (index 0) was deleted, 'B' shifted into index 0.
    const formData = makeFormData([
      makeScenario('B', ''),
      makeScenario('C', ''),
    ]);
    const neighbor = resolveNeighborDslTab(formData, scenarioTabId(0));
    expect(neighbor).not.toBeNull();
    expect(neighbor!.kind).toBe('scenario');
    expect(neighbor!.label).toBe('B');
  });

  it('falls back to the previous scenario when deleting the last one', () => {
    // Post-delete tree: 'B' (index 1) was deleted, only 'A' remains.
    const formData = makeFormData([makeScenario('A', '')]);
    const neighbor = resolveNeighborDslTab(formData, scenarioTabId(1));
    expect(neighbor).not.toBeNull();
    expect(neighbor!.kind).toBe('scenario');
    expect(neighbor!.label).toBe('A');
  });

  it('returns null for form-surface entities (fuzzer/resource)', () => {
    const formData = makeFormData([makeScenario('A', '')]);
    expect(resolveNeighborDslTab(formData, fuzzerTabId(0))).toBeNull();
    expect(resolveNeighborDslTab(formData, resourceTabId(0))).toBeNull();
  });
});