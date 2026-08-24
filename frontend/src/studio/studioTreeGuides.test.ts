// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyTreePointerLeave,
  applyTreePointerMove,
  sectionKeyForElement,
  type TreeGuidePointerState,
} from './studioTreeGuides';

function makeTreeItem(className: string, key: string): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('role', 'treeitem');
  item.className = className;
  const keyNode = document.createElement('span');
  keyNode.setAttribute('data-pk-tree-key', key);
  item.appendChild(keyNode);
  return item;
}

describe('studioTreeGuides', () => {
  it('sectionKeyForElement walks up to section node key', () => {
    const tree = document.createElement('div');
    const section = makeTreeItem('pk-studio-tree-section-node', 'group:pages');
    const leaf = makeTreeItem('pk-studio-tree-leaf', 'page:0');
    tree.append(section, leaf);
    expect(sectionKeyForElement(tree, leaf)).toBe('group:pages');
    expect(sectionKeyForElement(tree, null)).toBeUndefined();
  });

  it('applyTreePointerMove updates pos and hover key', () => {
    const tree = document.createElement('div');
    const section = makeTreeItem('pk-studio-tree-section-node', 'group:blocks');
    tree.append(section);
    const state: TreeGuidePointerState = {
      pointerPos: null,
      hoveredSectionKey: undefined,
    };
    const event = {
      clientX: 10,
      clientY: 20,
      target: section,
    } as unknown as PointerEvent;
    applyTreePointerMove(tree, state, event);
    expect(state.pointerPos).toEqual({ x: 10, y: 20 });
    expect(state.hoveredSectionKey).toBe('group:blocks');
  });

  it('applyTreePointerLeave clears only when outside bounds', () => {
    const tree = document.createElement('div');
    tree.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const state: TreeGuidePointerState = {
      pointerPos: { x: 50, y: 50 },
      hoveredSectionKey: 'group:pages',
    };
    expect(
      applyTreePointerLeave(state, tree, { clientX: 50, clientY: 50 } as PointerEvent),
    ).toBe(false);
    expect(state.hoveredSectionKey).toBe('group:pages');

    expect(
      applyTreePointerLeave(state, tree, { clientX: 200, clientY: 200 } as PointerEvent),
    ).toBe(true);
    expect(state.pointerPos).toBeNull();
    expect(state.hoveredSectionKey).toBeUndefined();
  });
});
