/**
 * Флаги активной вкладки StudioWorkspace (Sonar S3776).
 */
import type { StudioTab } from './studioTabs';

export type StudioFormFlags = {
  isResourceTab: boolean;
  isFuzzerTab: boolean;
  isConnectorModuleActive: boolean;
  isOpenApiModuleActive: boolean;
  isGraphqlModuleActive: boolean;
  isGrpcModuleActive: boolean;
  isChainModuleActive: boolean;
  isAuthFormUiActive: boolean;
  isAuthActionUiActive: boolean;
  isFormOnlyTab: boolean;
};

export function resolveStudioFormFlags(input: {
  activeTab: StudioTab | undefined;
  isConnectorModuleActive: boolean;
  activeModuleType: string | undefined;
  openApiType: string;
  graphqlType: string;
  grpcType: string;
  chainType: string;
  isAuthFormUiActive: boolean;
  isAuthActionUiActive: boolean;
}): StudioFormFlags {
  const isResourceTab = input.activeTab?.kind === 'resource';
  const isFuzzerTab = input.activeTab?.kind === 'fuzzer';
  const isOpenApiModuleActive = input.activeModuleType === input.openApiType;
  const isGraphqlModuleActive = input.activeModuleType === input.graphqlType;
  const isGrpcModuleActive = input.activeModuleType === input.grpcType;
  const isChainModuleActive = input.activeModuleType === input.chainType;
  const isFormOnlyTab =
    isResourceTab ||
    isFuzzerTab ||
    input.isConnectorModuleActive ||
    isOpenApiModuleActive ||
    isGraphqlModuleActive ||
    isGrpcModuleActive ||
    isChainModuleActive ||
    input.isAuthFormUiActive ||
    input.isAuthActionUiActive;
  return {
    isResourceTab,
    isFuzzerTab,
    isConnectorModuleActive: input.isConnectorModuleActive,
    isOpenApiModuleActive,
    isGraphqlModuleActive,
    isGrpcModuleActive,
    isChainModuleActive,
    isAuthFormUiActive: input.isAuthFormUiActive,
    isAuthActionUiActive: input.isAuthActionUiActive,
    isFormOnlyTab,
  };
}
