import React from 'react';
import pageIcon from '../assets/studio-icons/page-model-3d.png';
import scenarioIcon from '../assets/studio-icons/scenario-3d.png';
import fuzzerIcon from '../assets/studio-icons/fuzzer-3d.png';
import dataModuleIcon from '../assets/studio-icons/module-cube-neon-3d.png';
import connectorIcon from '../assets/studio-icons/connector-3d.png';
import authVaultIcon from '../assets/studio-icons/auth-vault-3d.png';
import { useLocale } from '../locales';

export type HubActionId =
  | 'create-page'
  | 'create-scenario'
  | 'create-module'
  | 'create-auth'
  | 'create-connector'
  | 'create-fuzzer'
  | 'create-resource'
  | 'create-openapi'
  | 'create-graphql'
  | 'create-grpc'
  | 'create-chain'
  | 'external-scenario-stub';

export type HubSubmitPayload = {
  actionId: HubActionId;
  name: string;
  title?: string;
  /** undefined = корень раздела; только для page/scenario */
  folderId?: string;
  /** create-resource */
  resourceKind?:
    | 'data_file'
    | 'har_file'
    | 'proto_pack'
    | 'openapi_spec'
    | 'graphql_sdl';
  /** create-grpc / create-openapi (resource mode) / create-graphql */
  protoAs?: string;
  specAs?: string;
  sdlAs?: string;
  /** create-openapi / create-graphql */
  specMode?: 'resource' | 'url_relative';
  schemaMode?: 'resource' | 'introspection_relative';
  specPathRel?: string;
  schemaPathRel?: string;
  endpointRel?: string;
  authModuleId?: string;
};

export interface ActionTile {
  id: HubActionId;
  title: string;
  description: string;
  icon: string;
  defaultName?: string;
  badge?: string;
  isExternal?: boolean;
  isStub?: boolean;
  folderSection?: 'pages' | 'scenarios';
}

export const HUB_ACTION_TILES: ActionTile[] = [
  {
    id: 'create-page',
    title: 'Модели страниц',
    description: '',
    icon: pageIcon,
    defaultName: 'main_page',
    folderSection: 'pages',
  },
  {
    id: 'create-scenario',
    title: 'Сценарии проверки',
    description: '',
    icon: scenarioIcon,
    defaultName: 'scenario_1',
    folderSection: 'scenarios',
  },
  {
    id: 'create-fuzzer',
    title: 'Фаззеры',
    description: '',
    icon: fuzzerIcon,
    defaultName: 'fuzzer_1',
  },
  {
    id: 'create-resource',
    title: 'Модули данных',
    description: '',
    icon: dataModuleIcon,
    defaultName: 'data_module_1',
  },
  {
    id: 'create-connector',
    title: 'Коннекторы и Интеграции',
    description: '',
    icon: connectorIcon,
    defaultName: 'connector_1',
  },
  {
    id: 'create-auth',
    title: 'Профили авторизации',
    description: '',
    icon: authVaultIcon,
    defaultName: 'auth_profile_1',
  },
];

export function hubTileById(actionId: HubActionId): ActionTile | undefined {
  return HUB_ACTION_TILES.find((item) => item.id === actionId);
}

export interface StudioActionHubProps {
  onExternal: (actionId: HubActionId) => void;
  /** Клик по плитке (кроме external) — открыть form-popup снаружи */
  onPickAction: (actionId: HubActionId) => void;
}

/** Сетка каталога на пустой вкладке. */
export const StudioActionHub: React.FC<StudioActionHubProps> = ({
  onExternal,
  onPickAction,
}) => {
  const { dict } = useLocale();
  const titles = dict.studio.actionHub;
  const handleSelectTile = (tile: ActionTile) => {
    if (tile.isStub) {
      return;
    }
    if (tile.isExternal) {
      onExternal(tile.id);
      return;
    }
    onPickAction(tile.id);
  };

  const titleMap: Record<string, string> = {
    'create-page': titles.pageModels,
    'create-scenario': titles.scenarios,
    'create-fuzzer': titles.fuzzers,
    'create-resource': titles.dataModules,
    'create-connector': titles.connectors,
    'create-auth': titles.authProfiles,
  };

  return (
    <div className="pk-studio-action-hub" data-testid="studio-action-hub">
      <div className="pk-studio-action-hub-grid">
        {HUB_ACTION_TILES.map((tile) => (
          <div
            key={tile.id}
            className={
              'pk-studio-action-hub-card' +
              (tile.isStub ? ' pk-studio-action-hub-card--stub' : '')
            }
            onClick={tile.isStub ? undefined : () => handleSelectTile(tile)}
            role={tile.isStub ? undefined : 'button'}
            tabIndex={tile.isStub ? -1 : 0}
            aria-disabled={tile.isStub || undefined}
            onKeyDown={
              tile.isStub
                ? undefined
                : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectTile(tile);
                    }
                  }
            }
          >
            <div className="pk-studio-action-hub-icon-wrap">
              <img
                src={tile.icon}
                alt=""
                className="pk-studio-action-hub-card-icon"
                aria-hidden
              />
            </div>
            <div className="pk-studio-action-hub-card-content">
              <div className="pk-studio-action-hub-card-title">
                {titleMap[tile.id] ?? tile.title}
                {tile.badge ? (
                  <span className="pk-studio-action-hub-badge">{tile.badge}</span>
                ) : null}
              </div>
              {tile.description ? (
                <div className="pk-studio-action-hub-card-desc">{tile.description}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
