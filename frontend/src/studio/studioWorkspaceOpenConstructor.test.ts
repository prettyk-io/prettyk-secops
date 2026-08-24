import { describe, expect, it } from 'vitest';
import {
  constructorTextOrDefault,
  ensureConstructorOnOpen,
  firstStudioNode,
  readConstructorSlice,
  stripLegacyAtSeed,
} from './studioWorkspaceOpenConstructor';
import type { StudioTab } from './studioTabs';

describe('studioWorkspaceOpenConstructor', () => {
  it('strips legacy @seed and pads default canvas', () => {
    expect(stripLegacyAtSeed('@foo\nbar\n')).toBe('bar\n');
    const data = { test_suites: { pages: { login: { constructor: '' } } } };
    const text = constructorTextOrDefault(data, '/test_suites/pages/login/constructor');
    expect(text.split('\n')).toHaveLength(32);
  });

  it('ensures constructor on open when empty', () => {
    const data = { test_suites: { pages: { login: { constructor: '', title: 'Login' } } } };
    const tab = {
      id: 'page:login',
      title: 'Login',
      language: 'pk-constructor',
      path: '/test_suites/pages/login/constructor',
      readOnly: false,
      kind: 'constructor',
    } as StudioTab;
    const ensured = ensureConstructorOnOpen(data, tab);
    expect(ensured.mutated).toBe(true);
    expect(readConstructorSlice(ensured.data, tab.path).split('\n')).toHaveLength(32);
    expect(firstStudioNode({ pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] })).toBeUndefined();
  });
});
