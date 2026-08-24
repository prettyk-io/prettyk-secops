import { describe, expect, it } from 'vitest';
import { resolveStudioFormFlags } from './studioWorkspaceFormFlags';
import type { StudioTab } from './studioTabs';

describe('resolveStudioFormFlags', () => {
  it('marks form-only for resource tab', () => {
    const tab: StudioTab = {
      id: 'resource:0',
      kind: 'resource',
      path: '',
      title: 'r',
      language: 'resource-form',
      readOnly: false,
      resourceIndex: 0,
    };
    const flags = resolveStudioFormFlags({
      activeTab: tab,
      isConnectorModuleActive: false,
      activeModuleType: undefined,
      openApiType: 'OpenAPI',
      graphqlType: 'GraphQL',
      grpcType: 'gRPC',
      chainType: 'Цепь',
      isAuthFormUiActive: false,
      isAuthActionUiActive: false,
    });
    expect(flags.isResourceTab).toBe(true);
    expect(flags.isFormOnlyTab).toBe(true);
  });
});
