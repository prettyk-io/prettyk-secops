import { describe, expect, it } from 'vitest';
import { reorderStudioTabs, tabDropEdgeFromPoint } from './studioTabOrder';
import type { StudioTab } from './studioTabs';

const tab = (id: StudioTab['id'], title: string): StudioTab => ({
  id,
  title,
  language: 'pk-constructor',
  path: '',
  readOnly: false,
  kind: 'constructor',
});

describe('reorderStudioTabs', () => {
  const sample = [
    tab('page:a', 'A'),
    tab('page:b', 'B'),
    tab('page:c', 'C'),
  ];

  it('moves before target', () => {
    const next = reorderStudioTabs(sample, 'page:c', 'page:a', 'before');
    expect(next.map((item) => item.id)).toEqual(['page:c', 'page:a', 'page:b']);
  });

  it('moves after target', () => {
    const next = reorderStudioTabs(sample, 'page:a', 'page:b', 'after');
    expect(next.map((item) => item.id)).toEqual(['page:b', 'page:a', 'page:c']);
  });

  it('no-ops on same id', () => {
    expect(reorderStudioTabs(sample, 'page:a', 'page:a', 'after')).toBe(sample);
  });
});

describe('tabDropEdgeFromPoint', () => {
  it('picks before/after by midpoint', () => {
    const el = {
      getBoundingClientRect: () => ({ left: 100, width: 100 }),
    } as HTMLElement;
    expect(tabDropEdgeFromPoint(el, 120)).toBe('before');
    expect(tabDropEdgeFromPoint(el, 160)).toBe('after');
  });
});
