import { describe, expect, it, vi } from 'vitest';
import {
  beginTreeSelectionRename,
  confirmTreeSelectionDeletion,
} from './studioTreeSelectionActions';

describe('studioTreeSelectionActions', () => {
  it('deletes page leaf and renames folder', () => {
    const onDeletePage = vi.fn();
    confirmTreeSelectionDeletion(
      'page:p1',
      {
        pages: [{ tabId: 'page:p1', pageId: 'Home', title: 'Home' }],
        scenarios: [],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      {
        confirmDeleteFolder: vi.fn(),
        confirmDeleteLeaf: (_t, _n, run) => run(),
        onDeletePage,
        onDeleteScenario: vi.fn(),
        onDeleteModule: vi.fn(),
        onDeleteFuzzer: vi.fn(),
        onDeleteResource: vi.fn(),
        folders: { pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] },
      },
    );
    expect(onDeletePage).toHaveBeenCalledWith('Home');

    const startNaming = vi.fn();
    beginTreeSelectionRename(
      'folder:pages:f1',
      {
        pages: [],
        scenarios: [],
        modules: [],
        fuzzers: [],
        resources: [],
      },
      {
        startNaming,
        beginRenamePage: vi.fn(),
        beginRenameScenario: vi.fn(),
        folders: {
          pages: [{ id: 'f1', title: 'Folder' }],
          scenarios: [],
          modules: [],
          fuzzers: [],
          resources: [],
        },
      },
    );
    expect(startNaming).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'rename-folder', folderId: 'f1' }),
    );
  });
});
