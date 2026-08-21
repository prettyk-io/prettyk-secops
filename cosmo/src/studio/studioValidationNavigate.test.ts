import { describe, expect, it } from 'vitest';
import type { ConstructorBatchFail } from '../api/editorValidate';
import type { StudioPageNode, StudioScenarioNode, StudioTree } from './collectStudioNodes';
import {
  editorPositionFromFail,
  resolveNodeForValidationFail,
} from './studioValidationNavigate';

const emptyTree = (): StudioTree => ({
  pages: [],
  scenarios: [],
  modules: [],
  fuzzers: [],
  resources: [],
});

const fail = (partial: Partial<ConstructorBatchFail>): ConstructorBatchFail => ({
  id: partial.id ?? '',
  path: partial.path ?? '',
  objectId: partial.objectId ?? '',
  message: partial.message ?? 'x',
  line: partial.line,
  column: partial.column,
});

describe('studioValidationNavigate', () => {
  it('resolves page node from path', () => {
    const tree = emptyTree();
    const page: StudioPageNode = {
      kind: 'page',
      key: 'page:home',
      pageId: 'home',
      path: '/test_suites/pages/home/constructor',
      title: 'home',
      tabId: 'page:home',
      needsName: false,
      invalidId: false,
    };
    tree.pages = [page];
    const node = resolveNodeForValidationFail(
      tree,
      fail({ path: '/test_suites/pages/home/constructor', objectId: 'home' }),
    );
    expect(node?.kind === 'page' && node.pageId).toBe('home');
  });

  it('falls back to object title', () => {
    const tree = emptyTree();
    const scenario: StudioScenarioNode = {
      kind: 'scenario',
      key: 'scenario:0',
      scenarioIndex: 0,
      title: 'Login',
      path: '/test_suites/scenarios/0/steps/0/constructor',
      tabId: 'scenario:0',
      invalidId: false,
    };
    tree.scenarios = [scenario];
    const node = resolveNodeForValidationFail(tree, fail({ objectId: 'Login' }));
    expect(node?.kind === 'scenario' && node.scenarioIndex).toBe(0);
  });

  it('editorPositionFromFail defaults to 1:1', () => {
    expect(editorPositionFromFail(fail({}))).toEqual({
      lineNumber: 1,
      column: 1,
    });
    expect(editorPositionFromFail(fail({ line: 3, column: 4 }))).toEqual({
      lineNumber: 3,
      column: 4,
    });
  });
});
