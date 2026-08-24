/** Types for the Studio entity graph. */
import type { StudioTabId } from '../studioTabs';

export type GraphIconKey = 'scenario' | 'auth' | 'page' | 'module' | 'connector' | 'openapi' | 'graphql' | 'grpc' | 'chain' | 'fuzzer' | 'resource';
export type GraphNodeKind = 'scenario' | 'auth' | 'page' | 'module' | 'fuzzer' | 'resource';
export type GraphCategoryId = 'scenarios' | 'data-models' | 'page-models' | 'fuzzers' | 'connectors' | 'auth-profiles';

export interface GraphNode {
  id: string;
  tabId: StudioTabId;
  kind: GraphNodeKind;
  isHub: boolean;
  groupId?: string;
  categoryId: GraphCategoryId;
  title: string;
  iconKey: GraphIconKey;
  badgeColor: string;
  meta: string;
  invalidId: boolean;
}
export interface GraphEdge { id: string; source: string; target: string; color: string; }
export interface GraphGroup { id: string; title: string; memberIds: string[]; categoryId: GraphCategoryId; }
export interface GraphCategory { id: GraphCategoryId; title: string; directMemberIds: string[]; groupIds: string[]; }
export interface GraphModel { nodes: GraphNode[]; edges: GraphEdge[]; groups: GraphGroup[]; categories: GraphCategory[]; }
export interface GraphPosition { x: number; y: number; }
export type GraphLayoutMap = Map<string, GraphPosition>;
