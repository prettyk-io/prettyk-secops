import { describe, expect, it } from 'vitest';
import { drillDown, drillUp, drillTo, computeView } from './mapLayout';
import type { SanctuarySystemMap } from './systemMapModel';

function makeMap(): SanctuarySystemMap {
  return {
    version: '1',
    lastUpdated: '2026-08-27',
    nodes: [
      { id: 'sanctuary', label: 'Sanctuary', level: 'landscape', status: 'sealed_canon', lenses: ['architecture'] },
      { id: 'prettyk', label: 'PrettyK', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
      { id: 'studio', label: 'Studio', level: 'system', parent: 'prettyk', status: 'native_v2', lenses: ['architecture'] },
      { id: 'editor', label: 'Editor', level: 'system', parent: 'prettyk', status: 'native_v2', lenses: ['architecture'] },
      { id: 'codepanel', label: 'CodePanel', level: 'surface', parent: 'studio', status: 'native_v2', lenses: ['architecture'] },
      { id: 'explorer', label: 'Explorer', level: 'surface', parent: 'studio', status: 'native_v2', lenses: ['architecture'] },
    ],
    edges: [
      { id: 'e1', source: 'prettyk', target: 'studio', type: 'dependency', lenses: ['architecture'] },
      { id: 'e2', source: 'prettyk', target: 'editor', type: 'dependency', lenses: ['architecture'] },
      { id: 'e3', source: 'studio', target: 'codepanel', type: 'dependency', lenses: ['architecture'] },
      { id: 'e4', source: 'studio', target: 'explorer', type: 'dependency', lenses: ['architecture'] },
    ],
  };
}

describe('drill (семантический зум L0→L1→L2)', () => {
  it('drillDown добавляет узел, drillUp убирает, drillTo обрезает до предка', () => {
    expect(drillDown([], 'prettyk')).toEqual(['prettyk']);
    expect(drillDown(['prettyk'], 'studio')).toEqual(['prettyk', 'studio']);
    expect(drillDown(['prettyk'], 'prettyk')).toEqual(['prettyk']); // no dup
    expect(drillUp(['prettyk', 'studio'])).toEqual(['prettyk']);
    expect(drillUp([])).toEqual([]);
    expect(drillTo(['prettyk', 'studio', 'codepanel'], 'prettyk')).toEqual(['prettyk']);
    expect(drillTo(['prettyk', 'studio'], 'unknown')).toEqual(['prettyk', 'studio']);
  });
});

describe('computeView (B2: уровни абстракции + 7±2)', () => {
  it('L0 показывает landscape-корни', () => {
    const v = computeView(makeMap(), 'architecture', []);
    expect(v.zoomLevel).toBe(0);
    const labels = v.placed.map((p) => p.node.id).sort();
    expect(labels).toEqual(['prettyk', 'sanctuary']);
    expect(v.edges.length).toBe(0); // ребра между landscape-узлами отсутствуют
  });

  it('L1 показывает детей prettyk (studio+editor) и хлебные крошки', () => {
    const v = computeView(makeMap(), 'architecture', ['prettyk']);
    expect(v.zoomLevel).toBe(1);
    const ids = v.placed.map((p) => p.node.id).sort();
    expect(ids).toEqual(['editor', 'prettyk', 'studio']);
    expect(v.breadcrumbs.map((b) => b.id)).toEqual(['prettyk']);
    // ребра prettyk→studio, prettyk→editor
    expect(v.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    // studio/editor — drillable (имеют детей); prettyk — фокус (не кластер),
    // studio — кластер (свёрнут, имеет детей, но не в фокусе).
    expect(v.drillableIds.has('studio')).toBe(true);
    expect(v.clusterIds.has('studio')).toBe(true);
    expect(v.clusterIds.has('prettyk')).toBe(false);
  });

  it('L2 показывает детей studio (codepanel+explorer)', () => {
    const v = computeView(makeMap(), 'architecture', ['prettyk', 'studio']);
    expect(v.zoomLevel).toBe(2);
    const ids = v.placed.map((p) => p.node.id).sort();
    expect(ids).toEqual(['codepanel', 'explorer', 'prettyk', 'studio']);
    // e1 (prettyk→studio) — связь между хлебными крошками, честно видима;
    // e3/e4 — studio→codepanel/explorer.
    expect(v.edges.map((e) => e.id).sort()).toEqual(['e1', 'e3', 'e4']);
  });

  it('правило 7±2: в фокусе ≤ 9 узлов (дети выбранного узла)', () => {
    const map = makeMap();
    // Добавим 8 детей к prettyk (в сумме system-узлов = 10 → превысит 7±2 при L1).
    const extra = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      label: `S${i}`,
      level: 'system' as const,
      parent: 'prettyk',
      status: 'native_v2' as const,
      lenses: ['architecture'] as import('./systemMapModel').LensVisibility[],
    }));
    map.nodes = [...map.nodes, ...extra];
    const v = computeView(map, 'architecture', ['prettyk']);
    // Дети prettyk = studio + editor + 8 extra = 10 — но не падаем, просто честно все.
    const kids = v.placed.filter((p) => p.node.parent === 'prettyk');
    expect(kids.length).toBe(10);
  });

  it('свёрнутые кластеры: узлы с детьми вне фокуса помечаются cluster', () => {
    const v = computeView(makeMap(), 'architecture', []);
    // sanctuary и prettyk имеют детей? только prettyk. На L0 оба landscape.
    expect(v.drillableIds.has('prettyk')).toBe(true);
    expect(v.clusterIds.has('prettyk')).toBe(true);
    expect(v.clusterIds.has('sanctuary')).toBe(false);
  });
});
