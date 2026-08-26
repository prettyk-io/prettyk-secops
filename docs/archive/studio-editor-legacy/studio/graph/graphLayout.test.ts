/** Tests for the deterministic floating category Studio Graph layout. */
import { describe, expect, it } from 'vitest';
import { GRAPH_CATEGORY_COLUMNS, GRAPH_CATEGORY_WIDTH, GRAPH_NODE_HEIGHT, graphGroupHeight, graphSlotCount, graphWorldBounds, layoutCategories, layoutForNewNode, layoutGraph } from './graphLayout';
import type { GraphCategoryId, GraphModel, GraphNode } from './graphTypes';

function node(id: string, kind: GraphNode['kind'], categoryId: GraphCategoryId): GraphNode { return { id, tabId: id as GraphNode['tabId'], kind, categoryId, isHub: false, title: id, iconKey: kind === 'auth' ? 'auth' : kind, badgeColor: '#000', meta: '', invalidId: false }; }
function modelFor(groups: GraphModel['groups'], nodes: GraphNode[]): GraphModel {
  const categoryIds: GraphCategoryId[] = ['scenarios', 'data-models', 'page-models', 'fuzzers', 'connectors', 'auth-profiles'];
  return { nodes, edges: [], groups, categories: categoryIds.map((id) => ({ id, title: id, groupIds: groups.filter((group) => group.categoryId === id).map((group) => group.id), directMemberIds: nodes.filter((item) => item.categoryId === id && !groups.some((group) => group.memberIds.includes(item.id))).map((item) => item.id) })) };
}

describe('graphLayout', () => {
  it('leaves an empty model without node coordinates', () => expect(layoutGraph({ nodes: [], edges: [], groups: [], categories: [] }).size).toBe(0));
  it('reserves the next free two-column row for groups and direct categories', () => {
    expect([0, 1, 2, 3, 4].map(graphSlotCount)).toEqual([2, 2, 4, 4, 6]);
    expect(graphGroupHeight(2)).toBeGreaterThan(graphGroupHeight(1));
    expect(graphGroupHeight(4)).toBeGreaterThan(graphGroupHeight(3));
    const cards = [node('page:0', 'page', 'page-models'), node('page:1', 'page', 'page-models')];
    expect(layoutCategories(modelFor([], cards)).get('page-models')?.directSlotCount).toBe(4);
  });
  it('lays real group cards in two columns inside their parent category', () => {
    const cards = [node('scenario:0', 'scenario', 'scenarios'), node('scenario:1', 'scenario', 'scenarios'), node('scenario:2', 'scenario', 'scenarios')];
    const model = modelFor([{ id: 'folder:scenarios', title: 'Juice Shop', memberIds: cards.map((item) => item.id), categoryId: 'scenarios' }], cards);
    const layout = layoutGraph(model); const category = layoutCategories(model).get('scenarios')!;
    const first = layout.get('scenario:0')!; const second = layout.get('scenario:1')!; const third = layout.get('scenario:2')!;
    expect(first.x).toBeLessThan(second.x); expect(first.y).toBe(second.y); expect(third.x).toBe(first.x); expect(third.y).toBeGreaterThan(first.y); expect(first.y).toBeGreaterThan(category.top);
  });
  it('places all six forms in a deterministic corner-anchored layout', () => {
    const model = modelFor([], [node('scenario:0', 'scenario', 'scenarios'), node('page:0', 'page', 'page-models'), node('fuzzer:0', 'fuzzer', 'fuzzers')]);
    const categories = layoutCategories(model);
    expect(categories.size).toBe(6);
    expect(categories.has('scenarios')).toBe(true);
    expect(categories.has('data-models')).toBe(true);
    expect(GRAPH_CATEGORY_COLUMNS).toBe(3);
    expect(layoutGraph(model)).toEqual(layoutGraph(model));
  });
  it('stretches the world bounds edge-to-edge with the viewport at the zoom-out floor with minX=minY=0', () => {
    const model = modelFor([], [node('scenario:0', 'scenario', 'scenarios')]);
    const natural = graphWorldBounds(model);
    const world = graphWorldBounds(model, 1600, 900);
    expect(world.width * 0.35).toBe(1600);
    expect(world.height * 0.35).toBe(900);
    expect(world.minX).toBe(0);
    expect(world.minY).toBe(0);
    expect(natural.minX).toBe(0);
    expect(natural.minY).toBe(0);
  });
  it('uses the category layout position for a newly added node', () => {
    const scenario = node('scenario:0', 'scenario', 'scenarios'); const fuzzer = node('fuzzer:1', 'fuzzer', 'fuzzers'); const existing = layoutGraph(modelFor([], [scenario])); const expanded = modelFor([], [scenario, fuzzer]);
    expect(layoutForNewNode(expanded, fuzzer, existing)).toEqual(layoutGraph(expanded).get(fuzzer.id));
  });
});
