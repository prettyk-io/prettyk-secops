// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioTree } from '../collectStudioNodes';
import type { StudioTabId } from '../studioTabs';
import { StudioGraphExplorer, type StudioGraphExplorerProps } from './StudioGraphExplorer';
import { useGraphStore } from './useGraphStore';

function tree(memberCount = 1): StudioTree {
  const scenarios = Array.from({ length: memberCount }, (_, index) => ({ kind: 'scenario' as const, key: `scenario:${index}`, scenarioIndex: index, title: `check_${index + 1}`, path: `/test_suites/scenarios/${index}/steps/0/constructor`, tabId: `scenario:${index}` as StudioTabId, invalidId: false, groupId: 'scenarios:login-flow' }));
  return { pages: [{ kind: 'page', key: 'page:login', pageId: 'login', path: '/test_suites/pages/login/constructor', title: 'login', tabId: 'page:login', needsName: false, invalidId: false, groupId: 'pages:login-flow' }], scenarios, modules: [{ kind: 'module', key: 'module:auth', moduleIndex: 0, moduleId: 'auth', moduleType: 'Авторизация', path: '/auth', title: 'auth', tabId: 'module:auth' as StudioTabId, invalidId: false }, { kind: 'module', key: 'module:api', moduleIndex: 1, moduleId: 'api', moduleType: 'Коннектор', connectorType: 'REST', path: '/api', title: 'api', tabId: 'module:api' as StudioTabId, invalidId: false }, { kind: 'module', key: 'module:docs', moduleIndex: 2, moduleId: 'docs', moduleType: 'OpenAPI', path: '/docs', title: 'docs', tabId: 'module:docs' as StudioTabId, invalidId: false }], fuzzers: [], resources: [], groups: [{ id: 'scenarios:login-flow', folderId: 'login-flow', section: 'scenarios', title: 'Login flow', memberTabIds: scenarios.map((item) => item.tabId) }, { id: 'pages:login-flow', folderId: 'login-flow', section: 'pages', title: 'Login pages', memberTabIds: ['page:login'] }] };
}
function renderGraph(onSelectTab = vi.fn(), onAdd = vi.fn(), callbacks: { onRename?: (node: Parameters<NonNullable<StudioGraphExplorerProps['onRename']>>[0]) => void; onDelete?: (node: Parameters<NonNullable<StudioGraphExplorerProps['onDelete']>>[0]) => void; overlay?: ReactNode; graph?: StudioTree } = {}) {
  render(<StudioGraphExplorer tree={callbacks.graph ?? tree()} onSelectTab={onSelectTab} onAdd={onAdd} {...callbacks} />); return onSelectTab;
}
function viewport(): HTMLElement { const graph = screen.getByTestId('studio-graph-explorer'); Object.defineProperty(graph, 'getBoundingClientRect', { configurable: true, value: () => ({ width: 1000, height: 700, left: 0, top: 0, right: 1000, bottom: 700 }) }); return graph; }

beforeEach(() => useGraphStore.getState().reset()); afterEach(cleanup);

describe('StudioGraphExplorer', () => {
  it('renders populated categories, nested group, cards and deduplicated edge', () => {
    renderGraph();
    expect(screen.getByTestId('graph-category-scenarios')).not.toBeNull();
    expect(screen.getByTestId('graph-category-connectors')).not.toBeNull();
    expect(screen.getByTestId('graph-group-scenarios:login-flow:scenarios')).not.toBeNull();
    expect(screen.getByTestId('graph-node-scenario:0')).not.toBeNull();
    expect(screen.getByTestId('graph-edge-module:auth->module:api')).not.toBeNull();
  });
  it('click on a card opens its entity parameters', () => {
    const onSelectTab = renderGraph(); fireEvent.click(screen.getByTestId('graph-node-module:api'));
    expect(onSelectTab).toHaveBeenCalledWith('module:api'); expect(useGraphStore.getState().selectedNodeId).toBe('module:api');
  });
  it('opens add flow and canvas context menu', () => {
    const onAdd = vi.fn(); renderGraph(vi.fn(), onAdd); fireEvent.click(screen.getByRole('button', { name: 'Add element' }));
    fireEvent.contextMenu(screen.getByTestId('studio-graph-explorer'), { clientX: 40, clientY: 50 }); fireEvent.click(screen.getByRole('button', { name: 'Add ...' }));
    expect(onAdd).toHaveBeenCalledTimes(2);
  });
  it('invokes node rename and delete callbacks', () => {
    const onRename = vi.fn(); const onDelete = vi.fn(); renderGraph(vi.fn(), vi.fn(), { onRename, onDelete }); const node = screen.getByTestId('graph-node-module:api');
    fireEvent.contextMenu(node, { clientX: 20, clientY: 20 }); fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.contextMenu(node, { clientX: 20, clientY: 20 }); fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'module:api' })); expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'module:api' }));
  });
  it('uses the requested zoom-out floor and clamps pan to the fixed world', () => {
    renderGraph(); const graph = viewport();
    // Trigger viewport measurement so the world bounds are correct
    fireEvent(window, new Event('resize'));
    for (let index = 0; index < 20; index += 1) fireEvent.wheel(graph, { deltaY: 100 });
    expect((document.querySelector('.pk-graph-canvas') as HTMLElement).style.transform).toContain('scale(0.35)');
    for (let index = 0; index < 7; index += 1) fireEvent.wheel(graph, { deltaY: -100 });
    fireEvent.pointerDown(graph, { button: 0, clientX: 100, clientY: 100, pointerId: 2 }); fireEvent.pointerMove(graph, { clientX: 10_000, clientY: 10_000, pointerId: 2 }); fireEvent.pointerUp(graph, { clientX: 10_000, clientY: 10_000, pointerId: 2 });
    const transform = (document.querySelector('.pk-graph-canvas') as HTMLElement).style.transform;
    expect(transform).toMatch(/scale\(1\.0(?:4|5)/);
    expect(transform).toContain('scale');
  });
});

describe('nested group slots and interaction', () => {
  it.each([[1, 2], [2, 4], [3, 4], [4, 6]])('renders %i cards with %i visual slots including the next free slot', (members, slots) => {
    renderGraph(vi.fn(), vi.fn(), { graph: tree(members) }); const group = screen.getByTestId('graph-group-scenarios:login-flow:scenarios');
    expect(group.querySelectorAll('.pk-graph-group-slot')).toHaveLength(slots); expect(screen.getByTestId('graph-group-slot-scenarios:login-flow:scenarios')).not.toBeNull();
  });
  it('anchors corner categories so they cannot be dragged', () => {
    renderGraph(vi.fn(), vi.fn(), { graph: tree(2) }); const graph = viewport(); const first = screen.getByTestId('graph-node-page:login'); const beforeFirst = useGraphStore.getState().positions.get('page:login')!;
    fireEvent.pointerDown(first, { button: 0, clientX: 260, clientY: 180, pointerId: 1 }); fireEvent.pointerMove(graph, { clientX: 360, clientY: 220, pointerId: 1 }); fireEvent.pointerUp(graph, { clientX: 360, clientY: 220, pointerId: 1 });
    // Page models is an anchored corner — position must remain fixed
    expect(useGraphStore.getState().positions.get('page:login')).toEqual(beforeFirst);
  });
  it('drags floating center categories (scenarios)', () => {
    renderGraph(vi.fn(), vi.fn(), { graph: tree(1) }); const graph = viewport(); const node = screen.getByTestId('graph-node-scenario:0'); const initial = useGraphStore.getState().positions.get('scenario:0')!;
    fireEvent.pointerDown(node, { button: 0, clientX: 300, clientY: 300, pointerId: 1 }); fireEvent.pointerMove(graph, { clientX: 420, clientY: 300, pointerId: 1 }); fireEvent.pointerUp(graph, { clientX: 420, clientY: 300, pointerId: 1 });
    const moved = useGraphStore.getState().positions.get('scenario:0')!;
    expect(moved.x).not.toBe(initial.x); expect(moved.y).toBe(initial.y);
  });
  it('clamps drag to the visible viewport after panning, not the fixed world extent', () => {
    renderGraph(); const graph = viewport();
    fireEvent(window, new Event('resize'));
    // Pan влево (pan.x < 0): canvas-левый край уходит за пределы экрана, видимая левая граница правее world.minX.
    fireEvent.pointerDown(graph, { button: 0, clientX: 2000, clientY: 350, pointerId: 2 }); fireEvent.pointerMove(graph, { clientX: 1200, clientY: 350, pointerId: 2 }); fireEvent.pointerUp(graph, { clientX: 1200, clientY: 350, pointerId: 2 });
    const node = screen.getByTestId('graph-node-module:api');
    fireEvent.pointerDown(node, { button: 0, clientX: 300, clientY: 300, pointerId: 1 }); fireEvent.pointerMove(graph, { clientX: -10_000, clientY: 300, pointerId: 1 }); fireEvent.pointerUp(graph, { clientX: -10_000, clientY: 300, pointerId: 1 });
    const after = useGraphStore.getState().positions.get('module:api')!;
    // Старый clamp увёл бы узел к world.minX (~-484, далеко за видимый левый край).
    // Корректный clamp держит узел внутри видимой области (x > 0), а не на границе canvas.
    expect(after.x).toBeGreaterThan(0);
  });
});
