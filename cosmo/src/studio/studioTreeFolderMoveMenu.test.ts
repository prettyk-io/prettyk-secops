import { describe, expect, it } from 'vitest';
import { folderMoveMenuSpecs } from './studioTreeFolderMoveMenu';

describe('folderMoveMenuSpecs', () => {
  it('lists other folders and remove when nested', () => {
    const folders = {
      pages: [
        { id: 'a', title: 'A', members: ['login'] },
        { id: 'b', title: 'B', members: [] },
      ],
      scenarios: [],
      modules: [],
      fuzzers: [],
      resources: [],
    };
    const specs = folderMoveMenuSpecs('pages', 'login', folders);
    expect(specs.map((s) => s.key)).toEqual(['move:pages:b', 'remove:pages:a']);
    expect(specs[1]?.folderId).toBeUndefined();
  });
});
