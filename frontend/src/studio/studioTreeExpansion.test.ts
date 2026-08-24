import { describe, expect, it } from 'vitest';
import { GROUP_PAGES } from './studioTreeKeys';
import { parseStoredTreeExpansion, serializeTreeExpansion } from './studioTreeExpansion';

describe('studioTreeExpansion', () => {
  it('parses legacy array and object forms', () => {
    expect(parseStoredTreeExpansion(null)).toEqual({ folders: [], collapsedGroups: [] });
    expect(parseStoredTreeExpansion(JSON.stringify(['folder:pages:a']))).toEqual({
      folders: ['folder:pages:a'],
      collapsedGroups: [],
    });
    const raw = serializeTreeExpansion(['folder:pages:a'], [GROUP_PAGES, 'junk']);
    const parsed = parseStoredTreeExpansion(raw);
    expect(parsed.folders).toEqual(['folder:pages:a']);
    expect(parsed.collapsedGroups).toEqual([GROUP_PAGES]);
  });
});
