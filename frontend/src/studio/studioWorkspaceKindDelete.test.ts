import { describe, expect, it } from 'vitest';
import type { StudioTree } from './collectStudioNodes';
import {
  openFuzzerIdsFromTabs,
  openModuleIdsFromTabs,
  openResourceAsFromTabs,
  openScenarioTitlesFromTabs,
  rebuildFuzzerTabs,
  rebuildModuleTabs,
  rebuildResourceTabs,
  rebuildScenarioTabs,
} from './studioWorkspaceKindDelete';
import type { StudioTab } from './studioTabs';

function treeStub(partial: Partial<StudioTree>): StudioTree {
  return {
    pages: [],
    scenarios: [],
    modules: [],
    fuzzers: [],
    resources: [],
    ...partial,
  };
}

describe('studioWorkspaceKindDelete', () => {
  it('collects open scenario titles and rebuilds tabs', () => {
    const tree = treeStub({
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
    });
    const tabs = [
      { id: 'scenario:0', kind: 'scenario', title: 'A', path: '/a' },
      { id: 'scenario:1', kind: 'scenario', title: 'B', path: '/b' },
    ] as unknown as StudioTab[];
    expect(openScenarioTitlesFromTabs(tabs, tree)).toEqual(['A', 'B']);
    const rebuilt = rebuildScenarioTabs(tree, ['B']);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0]?.id).toBe('scenario:1');
  });

  it('collects module / fuzzer / resource open keys', () => {
    const tree = treeStub({
      modules: [
        {
          kind: 'module',
          key: 'm0',
          moduleIndex: 0,
          moduleId: 'mod_a',
          moduleType: 'plain',
          path: '/m',
          title: 'mod_a',
          tabId: 'module:0',
          invalidId: false,
        },
      ],
      fuzzers: [
        {
          kind: 'fuzzer',
          key: 'f0',
          fuzzerIndex: 0,
          title: 'fz',
          tabId: 'fuzzer:0',
          fuzzerId: 'fz1',
          invalidId: false,
        },
      ],
      resources: [
        {
          kind: 'resource',
          key: 'r0',
          resourceIndex: 0,
          title: 'res',
          tabId: 'resource:0',
          path: '/r',
          kindImport: 'file',
          as: 'dict',
          invalidId: false,
        },
      ],
    });
    expect(
      openModuleIdsFromTabs([{ id: 'module:0', kind: 'module', title: 'm', path: '/m' } as unknown as StudioTab], tree),
    ).toEqual(['mod_a']);
    expect(
      openFuzzerIdsFromTabs([{ id: 'fuzzer:0', kind: 'fuzzer', title: 'f', path: '/f' } as unknown as StudioTab], tree),
    ).toEqual(['fz1']);
    expect(
      openResourceAsFromTabs(
        [{ id: 'resource:0', kind: 'resource', title: 'r', path: '/r' } as unknown as StudioTab],
        tree,
      ),
    ).toEqual(['dict']);
    expect(rebuildModuleTabs(tree, ['mod_a'])[0]?.id).toBe('module:0');
    expect(rebuildFuzzerTabs(tree, ['fz1'])[0]?.id).toBe('fuzzer:0');
    expect(rebuildResourceTabs(tree, ['dict'])[0]?.id).toBe('resource:0');
  });
});
