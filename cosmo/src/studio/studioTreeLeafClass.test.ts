import { describe, expect, it } from 'vitest';
import {
  entityLeafClassName,
  moduleLeafClassName,
  pageLeafClassName,
  scenarioLeafClassName,
} from './studioTreeLeafClass';

describe('studioTreeLeafClass', () => {
  it('flags pending / invalid / naming', () => {
    expect(
      pageLeafClassName(
        { needsName: true, invalidId: true, pageId: 'p' },
        { mode: 'rename-page', pageId: 'p', value: 'x', removeIfEmpty: false },
      ),
    ).toContain('pk-studio-tree-page-pending');
    expect(
      scenarioLeafClassName({ invalidId: false, scenarioIndex: 1 }, null),
    ).toContain('pk-studio-tree-scenario');
    expect(moduleLeafClassName({ invalidId: true, moduleIndex: 0 }, null)).toContain(
      'pk-studio-tree-page-invalid',
    );
    expect(entityLeafClassName({ invalidId: false }, true)).toContain(
      'pk-studio-tree-naming-active',
    );
  });
});
