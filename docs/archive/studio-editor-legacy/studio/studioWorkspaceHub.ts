/**
 * Hub create dispatch for StudioWorkspace (S3776).
 */
import type { HubActionId, HubSubmitPayload } from './StudioActionHub';
import type { ExplorerRevealRequest } from './StudioBlocksTree';
import type { ImportKind } from './studioResources';

export type HubCreateResult = {
  ok: boolean;
  section?: ExplorerRevealRequest['section'];
  moveSection?: 'pages' | 'scenarios';
};

export type OpenApiCreateOpts = {
  specMode?: 'resource' | 'url_relative';
  specAs?: string;
  specPathRel?: string;
  authModuleId?: string;
};

export type GraphqlCreateOpts = {
  schemaMode?: 'resource' | 'introspection_relative';
  sdlAs?: string;
  schemaPathRel?: string;
  endpointRel?: string;
  authModuleId?: string;
};

export type HubCreateHandlers = {
  createScenario: (id: string, description?: string) => boolean;
  createPage: (id: string, title: string) => boolean;
  createModule: (name: string, title?: string) => boolean;
  createAuth: (name: string, title?: string) => boolean;
  createConnector: (name: string, title?: string) => boolean;
  createOpenApi: (name: string, opts?: OpenApiCreateOpts) => boolean;
  createGraphql: (name: string, opts?: GraphqlCreateOpts) => boolean;
  createGrpc: (
    name: string,
    opts?: { protoAs?: string; authModuleId?: string },
  ) => boolean;
  createChain: (name: string, title?: string) => boolean;
  createFuzzer: (name: string, title?: string) => boolean;
  createResource: (name: string, kind?: ImportKind, title?: string) => boolean;
};

export function resolveHubCreate(
  actionId: HubActionId,
  name: string,
  handlers: HubCreateHandlers,
  extras?: Pick<
    HubSubmitPayload,
    | 'title'
    | 'resourceKind'
    | 'protoAs'
    | 'authModuleId'
    | 'specMode'
    | 'specAs'
    | 'specPathRel'
    | 'schemaMode'
    | 'sdlAs'
    | 'schemaPathRel'
    | 'endpointRel'
  >,
): HubCreateResult {
  switch (actionId) {
    case 'create-scenario':
      return { ok: handlers.createScenario(name, extras?.title), section: 'scenarios', moveSection: 'scenarios' };
    case 'create-page':
      return { ok: handlers.createPage(name, extras?.title ?? ''), section: 'pages', moveSection: 'pages' };
    case 'create-module':
      return { ok: handlers.createModule(name, extras?.title), section: 'modules' };
    case 'create-auth':
      return { ok: handlers.createAuth(name, extras?.title), section: 'modules' };
    case 'create-connector':
      return { ok: handlers.createConnector(name, extras?.title), section: 'modules' };
    case 'create-openapi':
      return {
        ok: handlers.createOpenApi(name, {
          specMode: extras?.specMode,
          specAs: extras?.specAs,
          specPathRel: extras?.specPathRel,
          authModuleId: extras?.authModuleId,
        }),
        section: 'modules',
      };
    case 'create-graphql':
      return {
        ok: handlers.createGraphql(name, {
          schemaMode: extras?.schemaMode,
          sdlAs: extras?.sdlAs,
          schemaPathRel: extras?.schemaPathRel,
          endpointRel: extras?.endpointRel,
          authModuleId: extras?.authModuleId,
        }),
        section: 'modules',
      };
    case 'create-grpc':
      return {
        ok: handlers.createGrpc(name, {
          protoAs: extras?.protoAs,
          authModuleId: extras?.authModuleId,
        }),
        section: 'modules',
      };
    case 'create-chain':
      return { ok: handlers.createChain(name, extras?.title), section: 'modules' };
    case 'create-fuzzer':
      return { ok: handlers.createFuzzer(name, extras?.title), section: 'fuzzers' };
    case 'create-resource':
      return {
        ok: handlers.createResource(name, extras?.resourceKind, extras?.title),
        section: 'resources',
      };
    default:
      return { ok: false };
  }
}

export function applyHubSubmit(
  payload: HubSubmitPayload,
  handlers: HubCreateHandlers & {
    moveFolderMember: (section: 'pages' | 'scenarios', name: string, folderId: string) => void;
  },
): { ok: boolean; reveal?: ExplorerRevealRequest } {
  const {
    actionId,
    name,
    title,
    folderId,
    resourceKind,
    protoAs,
    authModuleId,
    specMode,
    specAs,
    specPathRel,
    schemaMode,
    sdlAs,
    schemaPathRel,
    endpointRel,
  } = payload;
  const created = resolveHubCreate(actionId, name, handlers, {
    title,
    resourceKind,
    protoAs,
    authModuleId,
    specMode,
    specAs,
    specPathRel,
    schemaMode,
    sdlAs,
    schemaPathRel,
    endpointRel,
  });
  if (!created.ok) {
    return { ok: false };
  }
  if (created.moveSection && folderId) {
    handlers.moveFolderMember(created.moveSection, name, folderId);
  }
  if (!created.section) {
    return { ok: true };
  }
  return {
    ok: true,
    reveal: {
      token: Date.now(),
      section: created.section,
      folderId: created.moveSection ? folderId : undefined,
    },
  };
}
