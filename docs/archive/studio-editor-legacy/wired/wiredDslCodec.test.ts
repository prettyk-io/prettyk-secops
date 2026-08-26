/**
 * wiredDslCodec unit tests — PK-WB-A1
 */

import { describe, it, expect } from 'vitest';
import {
  readConstructorText,
  writeConstructorText,
  listDslTabs,
  firstDslTab,
  findDslTab,
  type DslTabRef,
} from '../wired/wiredDslCodec';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeScenarioFormData(n: number, text: string): unknown {
  const steps = Array.from({ length: n }, (_, i) => ({
    step_id: `step_${i}`,
    constructor: text,
  }));
  return {
    test_suites: {
      scenarios: [
        {
          scenario_name: 'Login Flow',
          steps,
        },
        {
          scenario_name: 'Checkout',
          steps: [{ constructor: 'Checkout scenario body' }],
        },
      ],
      pages: {
        LoginPage: {
          title: 'Login Page',
          path: '/login',
          constructor: 'Page: LoginPage body',
        },
        Dashboard: {
          title: 'Dashboard Page',
          path: '/dashboard',
          constructor: 'Page: Dashboard body',
        },
      },
      imports: [
        {
          kind: 'Модуль работы с данными',
          as: 'auth_tokens',
          content: 'tok1\ntok2\n',
        },
        {
          kind: 'OpenAPI',
          as: 'petstore',
          content: 'openapi: 3.0',
        },
      ],
      fuzzers: [
        {
          title: 'JWT Sniper',
          name: 'jwt_sniper',
          constructor: '# Fuzzer JWT Sniper\nAction Fuzz',
        },
      ],
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('wiredDslCodec', () => {
  const empty = {
    test_suites: { scenarios: [] as unknown[], pages: {}, imports: [], fuzzers: [] },
  };

  describe('readConstructorText', () => {
    it('reads constructor text from a path', () => {
      const fd = makeScenarioFormData(1, 'Hello world');
      const text = readConstructorText(fd, '/test_suites/scenarios/0/steps/0/constructor');
      expect(text).toContain('Hello world');
    });

    it('returns padded 32-line canvas for empty constructor', () => {
      const text = readConstructorText(empty, '/test_suites/scenarios/0/steps/0/constructor');
      expect(text.split('\n').length).toBeGreaterThanOrEqual(32);
    });

    it('handles missing path gracefully', () => {
      const text = readConstructorText(empty, '/test_suites/nowhere');
      expect(text.split('\n').length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('writeConstructorText', () => {
    it('writes text and returns a new object', () => {
      const fd = makeScenarioFormData(1, 'original');
      const next = writeConstructorText(fd, '/test_suites/scenarios/0/steps/0/constructor', 'modified');
      const readBack = readConstructorText(next, '/test_suites/scenarios/0/steps/0/constructor');
      expect(readBack).toContain('modified');
      expect(readBack).not.toContain('original');
    });

    it('does not mutate original formData', () => {
      const fd = makeScenarioFormData(1, 'original');
      writeConstructorText(fd, '/test_suites/scenarios/0/steps/0/constructor', 'modified');
      const fromOriginal = readConstructorText(fd, '/test_suites/scenarios/0/steps/0/constructor');
      expect(fromOriginal).toContain('original');
    });
  });

  describe('listDslTabs', () => {
    it('lists scenarios, pages, data modules, and fuzzers', () => {
      const fd = makeScenarioFormData(1, 'test');
      const tabs = listDslTabs(fd);

      const scenarios = tabs.filter((t) => t.kind === 'scenario');
      const pages = tabs.filter((t) => t.kind === 'page');
      const modules = tabs.filter((t) => t.kind === 'module');
      const fuzzers = tabs.filter((t) => t.kind === 'fuzzer');

      expect(scenarios).toHaveLength(2);
      expect(pages).toHaveLength(2);
      expect(modules).toHaveLength(1); // only data module, not OpenAPI
      expect(fuzzers).toHaveLength(1);

      // Scenario paths use step 0 only
      expect(scenarios[0]!.path).toBe('/test_suites/scenarios/0/steps/0/constructor');
      expect(scenarios[1]!.path).toBe('/test_suites/scenarios/1/steps/0/constructor');

      // Labels
      expect(scenarios[0]!.label).toBe('Login Flow');
      expect(pages[0]!.label).toBe('Login Page');
    });

    it('returns empty for empty formData', () => {
      expect(listDslTabs(null)).toHaveLength(0);
      expect(listDslTabs({})).toHaveLength(0);
    });

    it('returns empty for null/undefined formData', () => {
      expect(listDslTabs(null)).toHaveLength(0);
      expect(listDslTabs(undefined)).toHaveLength(0);
    });
  });

  describe('firstDslTab', () => {
    it('returns first scenario when scenarios exist', () => {
      const fd = makeScenarioFormData(1, 'test');
      const tab = firstDslTab(fd);
      expect(tab).not.toBeNull();
      expect(tab!.kind).toBe('scenario');
      expect(tab!.label).toBe('Login Flow');
    });

    it('falls back to page when no scenarios', () => {
      const fd = {
        test_suites: {
          scenarios: [],
          pages: { Admin: { title: 'Admin', constructor: '# admin' } },
        },
      };
      const tab = firstDslTab(fd);
      expect(tab).not.toBeNull();
      expect(tab!.kind).toBe('page');
    });

    it('returns null for empty formData', () => {
      expect(firstDslTab(null)).toBeNull();
      expect(firstDslTab({})).toBeNull();
    });
  });

  describe('findDslTab', () => {
    it('finds by kind and entityId', () => {
      const fd = makeScenarioFormData(1, 'test');
      const tab = findDslTab(fd, 'page', 'Dashboard');
      expect(tab).not.toBeNull();
      expect(tab!.label).toBe('Dashboard Page');
      expect(tab!.path).toBe('/test_suites/pages/Dashboard/constructor');
    });

    it('returns null when not found', () => {
      const fd = makeScenarioFormData(1, 'test');
      expect(findDslTab(fd, 'scenario', 'nonexistent')).toBeNull();
      expect(findDslTab(fd, 'page', 'Nope')).toBeNull();
    });
  });

  describe('round-trip', () => {
    it('write → read returns the exact text (with pad)', () => {
      const fd = makeScenarioFormData(1, '');
      const next = writeConstructorText(fd, '/test_suites/scenarios/0/steps/0/constructor', 'round-trip text');
      const text = readConstructorText(next, '/test_suites/scenarios/0/steps/0/constructor');
      expect(text).toContain('round-trip text');
    });

    it('multi-scenario edit does not corrupt sibling', () => {
      const fd = makeScenarioFormData(1, 'Hello from S0');
      const mutated = writeConstructorText(fd, '/test_suites/scenarios/1/steps/0/constructor', 'Hello from S1');
      const s0 = readConstructorText(mutated, '/test_suites/scenarios/0/steps/0/constructor');
      const s1 = readConstructorText(mutated, '/test_suites/scenarios/1/steps/0/constructor');
      expect(s0).toContain('Hello from S0');
      expect(s1).toContain('Hello from S1');
    });
  });
});