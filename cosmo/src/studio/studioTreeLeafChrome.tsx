/**
 * Explorer leaf icon + title chrome (S3776).
 */
import type { ReactNode } from 'react';
import type { ExplorerLeafKind } from './studioTreeNest';

export type LeafIconSrc = {
  page: string;
  scenario: string;
  fuzzer: string;
  resource: string;
  module: string;
  auth: string;
  connector: string;
  connectorDb: string;
  connectorSiem: string;
  connectorProm: string;
  connectorSsh: string;
  connectorMq: string;
  openapi: string;
  graphql: string;
  grpc: string;
  /** Виды с отдельным light-ассетом — без CSS invert. */
  keepOnLight?: ReadonlySet<ExplorerLeafKind>;
};

const KIND_CLASS: Record<ExplorerLeafKind, string> = {
  page: 'pk-studio-tree-model-img',
  scenario: 'pk-studio-tree-scenario-img',
  fuzzer: 'pk-studio-tree-fuzzer-img',
  resource: 'pk-studio-tree-resource-img',
  module: 'pk-studio-tree-module-img',
  auth: 'pk-studio-tree-auth-img',
  connector: 'pk-studio-tree-connector-img',
  connectorDb: 'pk-studio-tree-connector-img',
  connectorSiem: 'pk-studio-tree-connector-img',
  connectorProm: 'pk-studio-tree-connector-img',
  connectorSsh: 'pk-studio-tree-connector-img',
  connectorMq: 'pk-studio-tree-connector-img',
  openapi: 'pk-studio-tree-fuzzer-img',
  graphql: 'pk-studio-tree-fuzzer-img',
  grpc: 'pk-studio-tree-connector-img',
};

function iconSrcForKind(kind: ExplorerLeafKind, icons: LeafIconSrc): string {
  switch (kind) {
    case 'page':
      return icons.page;
    case 'scenario':
      return icons.scenario;
    case 'fuzzer':
      return icons.fuzzer;
    case 'resource':
      return icons.resource;
    case 'auth':
      return icons.auth;
    case 'connectorDb':
      return icons.connectorDb;
    case 'connectorSiem':
      return icons.connectorSiem;
    case 'connectorProm':
      return icons.connectorProm;
    case 'connectorSsh':
      return icons.connectorSsh;
    case 'connectorMq':
      return icons.connectorMq;
    case 'connector':
      return icons.connector;
    case 'openapi':
      return icons.openapi;
    case 'graphql':
      return icons.graphql;
    case 'grpc':
      return icons.grpc;
    default:
      return icons.module;
  }
}

export function ExplorerLeafIcon(props: {
  kind: ExplorerLeafKind;
  icons: LeafIconSrc;
}): React.JSX.Element {
  const { kind, icons } = props;
  const keep = icons.keepOnLight?.has(kind) ? ' pk-studio-tree-img-icon--keep' : '';
  return (
    <img
      src={iconSrcForKind(kind, icons)}
      className={`pk-studio-tree-leaf-icon pk-studio-tree-img-icon ${KIND_CLASS[kind]}${keep}`}
      alt=""
      aria-hidden
    />
  );
}

export function explorerLeafTitleNode(
  kind: ExplorerLeafKind,
  title: ReactNode,
  treeKey: string,
  icons: LeafIconSrc,
): React.JSX.Element {
  return (
    <span
      className={`pk-studio-tree-leaf-title pk-studio-tree-leaf-title-${kind}`}
      data-pk-tree-key={treeKey}
    >
      <ExplorerLeafIcon kind={kind} icons={icons} />
      {title}
    </span>
  );
}
