import { describe, expect, it } from 'vitest';
import { applyTreeMemberDrop, isFolderDropSection } from './studioWorkspaceFolderDrop';

describe('studioWorkspaceFolderDrop', () => {
  it('guards section and no-op root drops', () => {
    expect(isFolderDropSection('pages')).toBe(true);
    expect(isFolderDropSection('modules')).toBe(false);
    expect(
      applyTreeMemberDrop({ test_suites: {} }, 'pages', 'login', {}),
    ).toBeUndefined();
  });
});
