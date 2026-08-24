/**
 * Explorer leaf kind по connector_type (иконка 18×18 в дереве).
 */
import type { ExplorerLeafKind } from './studioTreeNest';

export type ConnectorLeafKind =
  | 'connectorDb'
  | 'connectorSiem'
  | 'connectorProm'
  | 'connectorSsh'
  | 'connectorMq'
  | 'connector';

const CONNECTOR_LEAF_KINDS: readonly ExplorerLeafKind[] = [
  'connector',
  'connectorDb',
  'connectorSiem',
  'connectorProm',
  'connectorSsh',
  'connectorMq',
];

export function isConnectorLeafKind(kind: ExplorerLeafKind): boolean {
  return (CONNECTOR_LEAF_KINDS as readonly string[]).includes(kind);
}

/** SoT connector_type → leaf kind. */
export function connectorLeafKindFromType(connectorType: string | undefined): ConnectorLeafKind {
  switch (connectorType) {
    case 'База данных':
      return 'connectorDb';
    case 'Система логгирования':
      return 'connectorSiem';
    case 'Prometheus':
      return 'connectorProm';
    case 'SSH':
      return 'connectorSsh';
    case 'Очередь сообщений':
      return 'connectorMq';
    default:
      return 'connector';
  }
}
