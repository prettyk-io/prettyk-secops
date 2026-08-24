import { describe, expect, it } from 'vitest';
import type { DataNode } from 'antd/es/tree';
import {
  childNodesForFolder,
  explorerLeafKindForSection,
  rootFolderEntries,
  withRootChildClass,
} from './studioTreeNest';

describe('studioTreeNest', () => {
  it('maps section → leaf kind', () => {
    expect(explorerLeafKindForSection('pages')).toBe('page');
    expect(explorerLeafKindForSection('scenarios')).toBe('scenario');
    expect(explorerLeafKindForSection('modules')).toBe('module');
  });

  it('partitions folder children vs root entries', () => {
    const folder = { id: 'f1', title: 'G', members: ['b', 'a'] };
    const entries = [
      { member: 'a', node: { key: 'a' } as DataNode },
      { member: 'b', node: { key: 'b' } as DataNode },
      { member: 'c', node: { key: 'c' } as DataNode },
    ];
    expect(childNodesForFolder(folder, entries).map((n) => n.key)).toEqual(['a', 'b']);
    expect(rootFolderEntries([folder], entries).map((e) => e.member)).toEqual(['c']);
    expect(withRootChildClass({ key: 'x', className: 'n' } as DataNode).className).toContain(
      'pk-studio-tree-root-child-node',
    );
  });
});
