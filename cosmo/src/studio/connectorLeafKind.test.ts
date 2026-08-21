import { describe, expect, it } from 'vitest';
import { connectorLeafKindFromType, isConnectorLeafKind } from './connectorLeafKind';

describe('connectorLeafKind', () => {
  it('maps SoT types to leaf kinds', () => {
    expect(connectorLeafKindFromType('База данных')).toBe('connectorDb');
    expect(connectorLeafKindFromType('Система логгирования')).toBe('connectorSiem');
    expect(connectorLeafKindFromType('Prometheus')).toBe('connectorProm');
    expect(connectorLeafKindFromType('SSH')).toBe('connectorSsh');
    expect(connectorLeafKindFromType('Очередь сообщений')).toBe('connectorMq');
    expect(connectorLeafKindFromType(undefined)).toBe('connector');
  });

  it('isConnectorLeafKind', () => {
    expect(isConnectorLeafKind('connectorProm')).toBe(true);
    expect(isConnectorLeafKind('module')).toBe(false);
  });
});
