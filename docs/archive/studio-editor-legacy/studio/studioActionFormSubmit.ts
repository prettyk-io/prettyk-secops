/**
 * Валидация / payload StudioActionForm (Sonar S3776).
 */
import type { HubActionId, HubSubmitPayload } from './StudioActionHub';
import type { ImportKind } from './studioResources';

export type ActionFormDraft = {
  actionId: HubActionId;
  name: string;
  title?: string;
  folderId?: string;
  resourceKind: ImportKind;
  protoAs: string;
  specMode: 'resource' | 'url_relative';
  specAs: string;
  specPathRel: string;
  schemaMode: 'resource' | 'introspection_relative';
  sdlAs: string;
  schemaPathRel: string;
  endpointRel: string;
  authModuleId: string;
  protoOptionsLen: number;
  openApiOptionsLen: number;
  gqlOptionsLen: number;
};

export function validateActionFormDraft(d: ActionFormDraft): string | null {
  if (!d.name.trim()) {
    return 'Укажите идентификатор';
  }
  if (d.actionId === 'create-grpc' && !d.protoAs.trim()) {
    return d.protoOptionsLen === 0
      ? 'Сначала создайте ресурс proto_pack'
      : 'Выберите ресурс proto_pack';
  }
  if (d.actionId === 'create-openapi' && d.specMode === 'resource' && !d.specAs.trim()) {
    return d.openApiOptionsLen === 0
      ? 'Сначала создайте ресурс openapi_spec'
      : 'Выберите ресурс openapi_spec';
  }
  if (
    d.actionId === 'create-graphql' &&
    d.schemaMode === 'resource' &&
    !d.sdlAs.trim()
  ) {
    return d.gqlOptionsLen === 0
      ? 'Сначала создайте ресурс graphql_sdl'
      : 'Выберите ресурс graphql_sdl';
  }
  return null;
}

export function buildActionFormPayload(
  d: ActionFormDraft,
  opts: { includeFolder: boolean },
): HubSubmitPayload {
  const name = d.name.trim();
  const title = d.title?.trim() || undefined;
  const wantsAuth =
    d.actionId === 'create-grpc' ||
    d.actionId === 'create-openapi' ||
    d.actionId === 'create-graphql';
  return {
    actionId: d.actionId,
    name,
    title,
    folderId: opts.includeFolder ? d.folderId : undefined,
    resourceKind: d.actionId === 'create-resource' ? d.resourceKind : undefined,
    protoAs: d.actionId === 'create-grpc' ? d.protoAs.trim() : undefined,
    specMode: d.actionId === 'create-openapi' ? d.specMode : undefined,
    specAs:
      d.actionId === 'create-openapi' && d.specMode === 'resource'
        ? d.specAs.trim()
        : undefined,
    specPathRel:
      d.actionId === 'create-openapi' && d.specMode === 'url_relative'
        ? d.specPathRel.trim() || '/openapi.json'
        : undefined,
    schemaMode: d.actionId === 'create-graphql' ? d.schemaMode : undefined,
    sdlAs:
      d.actionId === 'create-graphql' && d.schemaMode === 'resource'
        ? d.sdlAs.trim()
        : undefined,
    schemaPathRel:
      d.actionId === 'create-graphql' && d.schemaMode === 'introspection_relative'
        ? d.schemaPathRel.trim() || '/graphql'
        : undefined,
    endpointRel:
      d.actionId === 'create-graphql' ? d.endpointRel.trim() || '/graphql' : undefined,
    authModuleId: wantsAuth ? d.authModuleId.trim() || undefined : undefined,
  };
}
