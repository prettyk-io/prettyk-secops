/** Tests for the StudioTree → category-first GraphModel adapter. */
import { describe, expect, it } from 'vitest';
import { buildGraphFromTree } from './graphAdapter';
import type { StudioTree } from '../collectStudioNodes';

function emptyTree(): StudioTree { return { pages: [], scenarios: [], modules: [], fuzzers: [], resources: [] }; }
function category(model: ReturnType<typeof buildGraphFromTree>, id: string) { return model.categories.find((item) => item.id === id)!; }

describe('graphAdapter', () => {
  it('keeps all six categories even for an empty explorer', () => {
    const model = buildGraphFromTree(emptyTree());
    expect(model.nodes).toHaveLength(0);
    expect(model.edges).toHaveLength(0);
    expect(model.categories.map((item) => item.id)).toEqual(['scenarios', 'data-models', 'page-models', 'fuzzers', 'connectors', 'auth-profiles']);
  });

  it('keeps an ungrouped scenario as a direct category card without a synthetic form', () => {
    const tree: StudioTree = { ...emptyTree(), scenarios: [{ kind: 'scenario', key: 'scenario:0', scenarioIndex: 0, title: 'main_check', path: '/test_suites/scenarios/0/steps/0/constructor', tabId: 'scenario:0' as const, invalidId: false }] };
    const model = buildGraphFromTree(tree);
    expect(model.nodes[0]).toMatchObject({ kind: 'scenario', categoryId: 'scenarios', groupId: undefined, isHub: false });
    expect(model.groups).toEqual([]);
    expect(category(model, 'scenarios')).toMatchObject({ groupIds: [], directMemberIds: ['scenario:0'] });
  });

  it('creates nested forms only for real authoring folders, split by routed category', () => {
    const tree: StudioTree = {
      ...emptyTree(),
      scenarios: [
        { kind: 'scenario', key: 'scenario:0', scenarioIndex: 0, title: 'main_check', path: '/test_suites/scenarios/0/steps/0/constructor', tabId: 'scenario:0' as const, invalidId: false },
        { kind: 'scenario', key: 'scenario:1', scenarioIndex: 1, title: 'juice_check', path: '/test_suites/scenarios/1/steps/0/constructor', tabId: 'scenario:1' as const, invalidId: false, groupId: 'scenarios:juice' },
      ],
      pages: [
        { kind: 'page', key: 'page:main', pageId: 'main', path: '/pages/main', title: 'main page', tabId: 'page:main' as const, needsName: false, invalidId: false },
        { kind: 'page', key: 'page:login', pageId: 'login', path: '/pages/login', title: 'login', tabId: 'page:login' as const, needsName: false, invalidId: false, groupId: 'pages:juice' },
        { kind: 'page', key: 'page:register', pageId: 'register', path: '/pages/register', title: 'register', tabId: 'page:register' as const, needsName: false, invalidId: false, groupId: 'pages:juice' },
      ],
      groups: [
        { id: 'scenarios:juice', folderId: 'juice', section: 'scenarios', title: 'Сценарии JuiceShop', memberTabIds: ['scenario:1'] },
        { id: 'pages:juice', folderId: 'juice', section: 'pages', title: 'Модели страниц JuiceShop', memberTabIds: ['page:login', 'page:register'] },
      ],
    };
    const model = buildGraphFromTree(tree);
    expect(model.groups).toEqual(expect.arrayContaining([
      { id: 'scenarios:juice:scenarios', title: 'Сценарии JuiceShop', memberIds: ['scenario:1'], categoryId: 'scenarios' },
      { id: 'pages:juice:page-models', title: 'Модели страниц JuiceShop', memberIds: ['page:login', 'page:register'], categoryId: 'page-models' },
    ]));
    expect(category(model, 'scenarios').directMemberIds).toEqual(['scenario:0']);
    expect(category(model, 'page-models').directMemberIds).toEqual(['page:main']);
  });

  it('routes confirmed module, resource, page and fuzzer categories as direct cards when no folder exists', () => {
    const types = ['Авторизация', 'Коннектор', 'OpenAPI', 'GraphQL', 'gRPC', 'Цепь', 'Словарь'];
    const tree: StudioTree = { ...emptyTree(), modules: types.map((moduleType, index) => ({ kind: 'module' as const, key: `module:${index}`, moduleIndex: index, moduleId: `module_${index}`, moduleType, path: `/modules/${index}`, title: moduleType, tabId: `module:${index}` as `module:${number}`, invalidId: false })), pages: [{ kind: 'page', key: 'page:0', pageId: 'page', path: '/pages/0', title: 'page', tabId: 'page:0' as const, needsName: false, invalidId: false }], fuzzers: [{ kind: 'fuzzer', key: 'fuzzer:0', fuzzerIndex: 0, title: 'fuzzer', tabId: 'fuzzer:0' as const, fuzzerId: 'fuzzer', invalidId: false }], resources: [{ kind: 'resource', key: 'resource:0', resourceIndex: 0, title: 'traffic', tabId: 'resource:0' as const, path: 'resources/traffic.har', kindImport: 'har_file', as: 'traffic', invalidId: false }] };
    const model = buildGraphFromTree(tree);
    expect(model.nodes.map((item) => item.categoryId)).toEqual(['page-models', 'auth-profiles', 'connectors', 'connectors', 'connectors', 'connectors', 'connectors', 'data-models', 'fuzzers', 'data-models']);
    expect(model.groups).toEqual([]);
    expect(category(model, 'data-models').directMemberIds).toEqual(['module:6', 'resource:0']);
    expect(category(model, 'page-models').directMemberIds).toEqual(['page:0']);
    expect(category(model, 'fuzzers').directMemberIds).toEqual(['fuzzer:0']);
    expect(model.nodes.find((item) => item.id === 'resource:0')).toMatchObject({ meta: 'HAR', groupId: undefined });
  });

  it('connects an auth profile to connectors without duplicate edges', () => {
    const tree: StudioTree = { ...emptyTree(), modules: [
      { kind: 'module', key: 'module:0', moduleIndex: 0, moduleId: 'auth', moduleType: 'Авторизация', path: '/auth', title: 'auth', tabId: 'module:0' as const, invalidId: false },
      { kind: 'module', key: 'module:1', moduleIndex: 1, moduleId: 'api', moduleType: 'Коннектор', connectorType: 'REST', path: '/api', title: 'api', tabId: 'module:1' as const, invalidId: false },
      { kind: 'module', key: 'module:2', moduleIndex: 2, moduleId: 'gql', moduleType: 'GraphQL', path: '/gql', title: 'gql', tabId: 'module:2' as const, invalidId: false },
    ] };
    const model = buildGraphFromTree(tree);
    expect(model.nodes.find((item) => item.kind === 'auth')).toMatchObject({ categoryId: 'auth-profiles', badgeColor: '#a855f7' });
    expect(model.edges.filter((edge) => edge.source === 'module:0')).toHaveLength(2);
    expect(new Set(model.edges.map((edge) => edge.id)).size).toBe(model.edges.length);
  });
});
