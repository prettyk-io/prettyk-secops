/**
 * Подсказки ResourceFormPanel — вынесены из JSX (Sonar S3358 / S3776).
 */
import {
  isGraphqlSdlImportKind,
  isHarImportKind,
  isOpenApiSpecImportKind,
  isProtoPackImportKind,
  type ImportKind,
} from './studioResources';

export function resourceAsHint(kind: ImportKind, draftAs: string): string {
  const as = draftAs.trim();
  if (isHarImportKind(kind)) {
    return `Sequence name / path: ${as || 'checkout'}`;
  }
  if (isProtoPackImportKind(kind)) {
    return `Модуль gRPC: proto_as = ${as || 'bank_proto'}`;
  }
  if (isOpenApiSpecImportKind(kind)) {
    return `Модуль OpenAPI: spec_as = ${as || 'bank_oas'}`;
  }
  if (isGraphqlSdlImportKind(kind)) {
    return `Модуль GraphQL: sdl_as = ${as || 'bank_sdl'}`;
  }
  return `В сценарии: \${${as || 'urls'}}`;
}

export function resourceContentLabel(kind: ImportKind): string {
  if (isHarImportKind(kind)) {
    return 'HAR (черновик JSON)';
  }
  if (isProtoPackImportKind(kind)) {
    return 'Proto / описание пакета (черновик)';
  }
  if (isOpenApiSpecImportKind(kind)) {
    return 'OpenAPI (черновик JSON/YAML)';
  }
  if (isGraphqlSdlImportKind(kind)) {
    return 'GraphQL SDL (черновик)';
  }
  return 'Содержимое (черновик)';
}

export function resourceContentPlaceholder(kind: ImportKind): string {
  if (isHarImportKind(kind)) {
    return 'Вставьте HAR JSON — уйдёт в resources/{as}.har при пакете / lab-run';
  }
  if (isProtoPackImportKind(kind)) {
    return 'Текст .proto или заметка к zip — sidecar resources/{as}.zip|.proto';
  }
  if (isOpenApiSpecImportKind(kind)) {
    return 'Схема OpenAPI — sidecar resources/{as}.json|.yaml';
  }
  if (isGraphqlSdlImportKind(kind)) {
    return 'SDL — sidecar resources/{as}.graphql|.sdl';
  }
  return 'Строки файла — уйдут в resources/{as}.txt при «Скачать пакет»';
}

export function resourceContentFooter(kind: ImportKind, draft: string): string {
  if (!draft) {
    return 'Пусто — прикрепите файл через «+» или вставьте текст';
  }
  if (isHarImportKind(kind) || isProtoPackImportKind(kind)) {
    return `Черновик · ${String(draft.length)} символов`;
  }
  return `Черновик · ${String(draft.split(/\r?\n/).length)} строк`;
}
