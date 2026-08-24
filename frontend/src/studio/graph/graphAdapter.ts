/** Deterministic adapter from authoring tree to the Studio graph. */
import type { StudioModuleNode, StudioTree } from '../collectStudioNodes';
import type { GraphCategory, GraphCategoryId, GraphEdge, GraphGroup, GraphIconKey, GraphModel, GraphNode, GraphNodeKind } from './graphTypes';

const BADGE_COLORS: Record<GraphNodeKind, string> = {
  scenario: '#38bdf8', auth: '#a855f7', page: '#60a5fa', module: '#a855f7', fuzzer: '#f59e0b', resource: '#4ade80',
};
const CONNECTOR_TYPES = new Set(['Коннектор', 'OpenAPI', 'GraphQL', 'gRPC', 'Цепь']);
const CATEGORY_TITLES: Record<GraphCategoryId, string> = {
  scenarios: 'Сценарии',
  'data-models': 'Модели данных',
  'page-models': 'Модели страниц',
  fuzzers: 'Фаззеры',
  connectors: 'Коннекторы и интеграции',
  'auth-profiles': 'Профили авторизации',
};

function buildNode(tabId: GraphNode['tabId'], kind: GraphNodeKind, categoryId: GraphCategoryId, iconKey: GraphIconKey, title: string, meta: string, invalidId: boolean): GraphNode {
  return { id: tabId, tabId, kind, categoryId, iconKey, title, meta, invalidId, isHub: false, badgeColor: BADGE_COLORS[kind] };
}

function iconForModule(node: StudioModuleNode): GraphIconKey {
  switch (node.moduleType) {
    case 'Авторизация': return 'auth';
    case 'Коннектор': return 'connector';
    case 'OpenAPI': return 'openapi';
    case 'GraphQL': return 'graphql';
    case 'gRPC': return 'grpc';
    case 'Цепь': return 'chain';
    default: return 'module';
  }
}

function kindForModule(node: StudioModuleNode): GraphNodeKind {
  return node.moduleType === 'Авторизация' ? 'auth' : 'module';
}

function categoryForModule(node: StudioModuleNode): GraphCategoryId {
  if (node.moduleType === 'Авторизация') return 'auth-profiles';
  return CONNECTOR_TYPES.has(node.moduleType) ? 'connectors' : 'data-models';
}

function moduleMeta(node: StudioModuleNode): string {
  if (node.moduleType === 'Коннектор' && node.connectorType) return node.connectorType;
  return node.moduleType === 'Авторизация' ? 'Auth Profile' : node.moduleType || 'Data module';
}

function graphNodes(tree: StudioTree): GraphNode[] {
  return [
    ...tree.scenarios.map((node) => buildNode(node.tabId, 'scenario', 'scenarios', 'scenario', node.title, 'Scenario', node.invalidId)),
    ...tree.pages.map((node) => buildNode(node.tabId, 'page', 'page-models', 'page', node.title, 'Page Model', node.invalidId)),
    ...tree.modules.map((node) => buildNode(node.tabId, kindForModule(node), categoryForModule(node), iconForModule(node), node.title, moduleMeta(node), node.invalidId)),
    ...tree.fuzzers.map((node) => buildNode(node.tabId, 'fuzzer', 'fuzzers', 'fuzzer', node.title, 'Fuzzer', node.invalidId)),
    ...tree.resources.map((node) => buildNode(node.tabId, 'resource', 'data-models', 'resource', node.title, node.kindImport === 'har_file' ? 'HAR' : node.kindImport || 'Resource', node.invalidId)),
  ];
}

function graphGroups(tree: StudioTree, sourceNodes: GraphNode[]): { nodes: GraphNode[]; groups: GraphGroup[] } {
  const nodesById = new Map(sourceNodes.map((node) => [node.id, node]));
  const assigned = new Map<string, string>();
  const groups: GraphGroup[] = [];

  for (const raw of tree.groups ?? []) {
    const members = raw.memberTabIds.map((id) => nodesById.get(id)).filter((node): node is GraphNode => Boolean(node));
    const categoryIds = new Set(members.map((node) => node.categoryId));
    for (const categoryId of categoryIds) {
      const memberIds = members.filter((node) => node.categoryId === categoryId).map((node) => node.id);
      if (!memberIds.length) continue;
      const id = `${raw.id}:${categoryId}`;
      groups.push({ id, title: raw.title, memberIds, categoryId });
      memberIds.forEach((nodeId) => assigned.set(nodeId, id));
    }
  }

  return { nodes: sourceNodes.map((node) => ({ ...node, groupId: assigned.get(node.id) })), groups };
}

function graphCategories(nodes: GraphNode[], groups: GraphGroup[]): GraphCategory[] {
  return (Object.keys(CATEGORY_TITLES) as GraphCategoryId[]).map((id) => ({
    id,
    title: CATEGORY_TITLES[id],
    directMemberIds: nodes.filter((node) => node.categoryId === id && !node.groupId).map((node) => node.id),
    groupIds: groups.filter((group) => group.categoryId === id).map((group) => group.id),
  }));
}

function graphEdges(tree: StudioTree): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (source: { tabId: string }, target: { tabId: string }, color: string): void => {
    if (source.tabId === target.tabId) return;
    const id = `${source.tabId}->${target.tabId}`;
    if (edgeKeys.has(id)) return;
    edgeKeys.add(id);
    edges.push({ id, source: source.tabId, target: target.tabId, color });
  };

  for (const auth of tree.modules.filter((node) => node.moduleType === 'Авторизация')) {
    for (const connector of tree.modules) {
      if (connector.tabId !== auth.tabId && CONNECTOR_TYPES.has(connector.moduleType)) addEdge(auth, connector, BADGE_COLORS.auth);
    }
  }
  return edges;
}

export function buildGraphFromTree(tree: StudioTree): GraphModel {
  const sourceNodes = graphNodes(tree);
  const { nodes, groups } = graphGroups(tree, sourceNodes);
  return { nodes, groups, categories: graphCategories(nodes, groups), edges: graphEdges(tree) };
}
