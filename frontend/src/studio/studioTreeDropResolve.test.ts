import { describe, expect, it } from 'vitest';
import type { StudioTree } from './collectStudioNodes';
import { GROUP_PAGES, folderKey } from './studioTreeKeys';
import {
  allowStudioTreeDrop,
  isStudioTreeNodeDraggable,
  resolveAntTreeDropDestination,
  resolveNativeDropDestination,
  treeMemberForTreeKey,
} from './studioTreeDropResolve';

const emptyTree: StudioTree = {
  pages: [
    {
      kind: 'page',
      key: 'page:login',
      pageId: 'login',
      path: '/p',
      title: 'Login',
      tabId: 'page:login',
      needsName: false,
      invalidId: false,
    },
  ],
  scenarios: [],
  modules: [],
  fuzzers: [],
  resources: [],
};

describe('studioTreeDropResolve', () => {
  it('resolves member and folder drop', () => {
    expect(treeMemberForTreeKey(emptyTree, 'page:login')).toEqual({
      section: 'pages',
      member: 'login',
    });
    const folders = {
      pages: [{ id: 'g1', title: 'G', members: ['login'] }],
      scenarios: [],
      modules: [],
      fuzzers: [],
      resources: [],
    };
    const member = { section: 'pages' as const, member: 'login' };
    expect(
      resolveNativeDropDestination(member, folderKey('pages', 'g1'), folders, emptyTree),
    ).toEqual({ folderId: 'g1' });
    expect(
      resolveNativeDropDestination(member, GROUP_PAGES, folders, emptyTree),
    ).toEqual({});
    expect(
      allowStudioTreeDrop({
        member,
        targetKey: folderKey('pages', 'g1'),
        dropPosition: 0,
        folders,
        tree: emptyTree,
      }),
    ).toBe(true);
    expect(
      resolveAntTreeDropDestination({
        member,
        targetKey: GROUP_PAGES,
        dropToGap: false,
        folders,
        tree: emptyTree,
      }),
    ).toEqual({});
    expect(isStudioTreeNodeDraggable('page:login', emptyTree)).toBe(true);
  });
});
