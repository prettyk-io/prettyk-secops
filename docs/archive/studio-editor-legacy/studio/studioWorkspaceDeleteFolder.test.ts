import { describe, expect, it } from 'vitest';
import type { StudioTree } from './collectStudioNodes';
import {
  resolveFolderModuleIndicesDesc,
  resolveFolderPages,
  resolveFolderScenarioIndicesDesc,
} from './studioWorkspaceDeleteFolder';

describe('studioWorkspaceDeleteFolder', () => {
  it('resolves pages and descending indices', () => {
    const tree: StudioTree = {
      pages: [
        {
          kind: 'page',
          key: 'p',
          pageId: 'login',
          path: '/p',
          title: 'Login',
          tabId: 'page:login',
          needsName: false,
          invalidId: false,
        },
      ],
      scenarios: [
        {
          kind: 'scenario',
          key: 's0',
          scenarioIndex: 0,
          title: 'A',
          path: '/a',
          tabId: 'scenario:0',
          invalidId: false,
        },
        {
          kind: 'scenario',
          key: 's1',
          scenarioIndex: 1,
          title: 'B',
          path: '/b',
          tabId: 'scenario:1',
          invalidId: false,
        },
      ],
      modules: [
        {
          kind: 'module',
          key: 'm0',
          moduleIndex: 0,
          moduleId: 'm0',
          moduleType: 'plain',
          path: '/m0',
          title: 'm0',
          tabId: 'module:0',
          invalidId: false,
        },
        {
          kind: 'module',
          key: 'm1',
          moduleIndex: 1,
          moduleId: 'm1',
          moduleType: 'plain',
          path: '/m1',
          title: 'm1',
          tabId: 'module:1',
          invalidId: false,
        },
      ],
      fuzzers: [],
      resources: [],
    };
    expect(resolveFolderPages(tree, ['Login'])[0]?.pageId).toBe('login');
    expect(resolveFolderScenarioIndicesDesc(tree, ['A', 'B'])).toEqual([1, 0]);
    expect(resolveFolderModuleIndicesDesc(tree, ['m0', 'm1'])).toEqual([1, 0]);
  });
});
