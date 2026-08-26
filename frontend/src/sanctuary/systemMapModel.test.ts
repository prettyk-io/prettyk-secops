import { describe, expect, it } from 'vitest';
import {
  loadSystemMap,
  validateSystemMap,
  classifyRoute,
  resolveCheckRoute,
  projectLens,
  collectLenses,
  childrenOf,
  type SanctuarySystemMap,
} from './systemMapModel';

function makeMap(partial: Partial<SanctuarySystemMap> = {}): SanctuarySystemMap {
  return {
    version: '1',
    lastUpdated: '2026-08-27',
    nodes: [],
    edges: [],
    ...partial,
  };
}

describe('classifyRoute (B1: валидация маршрутов)', () => {
  it('распознаёт статические, check-маршруты и битые', () => {
    expect(classifyRoute(undefined)).toBe('none');
    expect(classifyRoute('#/home')).toBe('static');
    expect(classifyRoute('#/admin')).toBe('static');
    expect(classifyRoute('#/sanctuary/map')).toBe('static');
    expect(classifyRoute('#/checks/<id>/studio')).toBe('check');
    expect(classifyRoute('#/checks/abc-1/editor')).toBe('check');
    expect(classifyRoute('#/studio-v2')).toBe('broken');
    expect(classifyRoute('#/nonsense/foo')).toBe('broken');
  });

  it('resolveCheckRoute подставляет id вместо плейсхолдера', () => {
    expect(resolveCheckRoute('#/checks/<id>/studio', 'chk-9')).toBe('#/checks/chk-9/studio');
    expect(resolveCheckRoute('#/admin', 'chk-9')).toBe('#/admin');
  });
});

describe('validateSystemMap (B1: битые ссылки)', () => {
  it('чистая карта без проблем', () => {
    const map = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
        { id: 'b', label: 'B', level: 'system', parent: 'a', status: 'native_v2', lenses: ['architecture'] },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'b', type: 'dependency', lenses: ['architecture'] }],
    });
    const issues = validateSystemMap(map);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('помечает дубликат id узла', () => {
    const map = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
        { id: 'a', label: 'A2', level: 'system', status: 'native_v2', lenses: ['architecture'] },
      ],
    });
    const issues = validateSystemMap(map);
    expect(issues.some((i) => i.severity === 'error' && i.refId === 'a')).toBe(true);
  });

  it('помечает связь на несуществующий узел (битая ссылка)', () => {
    const map = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'ghost', type: 'dependency', lenses: ['architecture'] }],
    });
    const issues = validateSystemMap(map);
    expect(issues.some((i) => i.refId === 'e1' && i.message.includes('ghost'))).toBe(true);
  });

  it('помечает битый маршрут узла как warning (не ломает карту)', () => {
    const map = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'system', status: 'native_v2', route: '#/bogus/x', lenses: ['architecture'] },
      ],
    });
    const issues = validateSystemMap(map);
    const issue = issues.find((i) => i.refId === 'a' && i.message.includes('Битый маршрут'));
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
    // Карта с битым маршрутом всё равно загружается (битая ссылка помечает узел).
    expect(loadSystemMap(map).ok).toBe(true);
  });

  it('помечает родителя-призрака', () => {
    const map = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'system', parent: 'missing', status: 'native_v2', lenses: ['architecture'] },
      ],
    });
    const issues = validateSystemMap(map);
    expect(issues.some((i) => i.refId === 'a' && i.message.includes('Родитель'))).toBe(true);
  });
});

describe('projectLens (B1: фильтр по линзе)', () => {
  const map = makeMap({
    nodes: [
      { id: 'arch', label: 'Arch', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
      { id: 'run', label: 'Run', level: 'landscape', status: 'infrastructure', lenses: ['runtime'] },
      { id: 'both', label: 'Both', level: 'system', status: 'native_v2', lenses: ['architecture', 'runtime'] },
    ],
    edges: [
      { id: 'e1', source: 'arch', target: 'both', type: 'dependency', lenses: ['architecture'] },
      { id: 'e2', source: 'run', target: 'both', type: 'dependency', lenses: ['runtime'] },
    ],
  });

  it('линза architecture оставляет только arch+both и связь e1', () => {
    const p = projectLens(map, 'architecture');
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['arch', 'both']);
    expect(p.edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('линза all возвращает всё', () => {
    const p = projectLens(map, 'all');
    expect(p.nodes.length).toBe(3);
    expect(p.edges.length).toBe(2);
  });

  it('связь, чьи вершины вне линзы, отфильтровывается', () => {
    const p = projectLens(map, 'runtime');
    // run + both видны, но e2 (run→both) в runtime — видна; e1 (arch→both) — нет.
    expect(p.nodes.map((n) => n.id).sort()).toEqual(['both', 'run']);
    expect(p.edges.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('collectLenses / childrenOf', () => {
  const map = makeMap({
    nodes: [
      { id: 'root', label: 'R', level: 'landscape', status: 'native_v2', lenses: ['architecture', 'flow'] },
      { id: 'c1', label: 'C1', level: 'system', parent: 'root', status: 'native_v2', lenses: ['runtime'] },
      { id: 'c2', label: 'C2', level: 'system', parent: 'root', status: 'native_v2', lenses: ['parity'] },
    ],
  });

  it('собирает только присутствующие линзы в каноническом порядке', () => {
    expect(collectLenses(map)).toEqual(['architecture', 'flow', 'runtime', 'parity']);
  });

  it('childrenOf находит детей по родителю', () => {
    expect(childrenOf(map, 'root').map((n) => n.id)).toEqual(['c1', 'c2']);
    expect(childrenOf(map, undefined).map((n) => n.id)).toEqual(['root']);
  });
});

describe('loadSystemMap (B1: единое описание)', () => {
  it('принимает валидный JSON и возвращает ok', () => {
    const raw = makeMap({
      nodes: [
        { id: 'a', label: 'A', level: 'landscape', status: 'native_v2', lenses: ['architecture'] },
      ],
    });
    const res = loadSystemMap(raw);
    expect(res.ok).toBe(true);
    expect(res.map?.nodes.length).toBe(1);
  });

  it('отклоняет не-объект / без nodes', () => {
    expect(loadSystemMap(null).ok).toBe(false);
    expect(loadSystemMap({}).ok).toBe(false);
  });
});
