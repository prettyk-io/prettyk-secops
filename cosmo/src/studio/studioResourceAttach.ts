/**
 * Attach resource files — sidecar resources/{as}.*
 */
import {
  resourceAsError,
  resourcePathForAs,
  type ImportKind,
} from './studioResources';

export function uniqueResourceAsName(base: string, taken: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (taken.has(candidate) || resourceAsError(candidate)) {
    candidate = `${base}_${String(n)}`;
    n += 1;
    if (n > 100) {
      return `resource_${String(Date.now())}`;
    }
  }
  return candidate;
}

export function attachResourceRejectMessage(
  rejected: number,
  total: number,
): string | undefined {
  if (rejected <= 0) {
    return undefined;
  }
  if (rejected === total) {
    return (
      'Нужны файлы .txt, .har, .zip/.proto, OpenAPI (.json/.yaml) или GraphQL (.graphql/.sdl)'
    );
  }
  return (
    `Пропущено: ${String(rejected)}. Приняты .txt / .har / .zip / .proto / ` +
    `.json|.yaml (OpenAPI) / .graphql|.sdl|.gql`
  );
}

/** @deprecated use attachResourceRejectMessage */
export function attachTxtRejectMessage(
  rejected: number,
  total: number,
): string | undefined {
  return attachResourceRejectMessage(rejected, total);
}

export function isTxtResourceFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.txt');
}

export function isHarResourceFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.har');
}

export function isProtoPackResourceFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.proto');
}

export function isOpenApiSpecResourceFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml') ||
    (lower.endsWith('.json') &&
      (lower.includes('openapi') || lower.includes('swagger') || lower.includes('oas')))
  );
}

export function isGraphqlSdlResourceFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.graphql') || lower.endsWith('.sdl') || lower.endsWith('.gql')
  );
}

export function isAttachableResourceFileName(name: string): boolean {
  return (
    isTxtResourceFileName(name) ||
    isHarResourceFileName(name) ||
    isProtoPackResourceFileName(name) ||
    isOpenApiSpecResourceFileName(name) ||
    isGraphqlSdlResourceFileName(name)
  );
}

export function importKindFromFileName(name: string): ImportKind {
  if (isHarResourceFileName(name)) {
    return 'har_file';
  }
  if (isProtoPackResourceFileName(name)) {
    return 'proto_pack';
  }
  if (isGraphqlSdlResourceFileName(name)) {
    return 'graphql_sdl';
  }
  if (isOpenApiSpecResourceFileName(name)) {
    return 'openapi_spec';
  }
  return 'data_file';
}

/** Path sidecar с учётом расширения .proto / .yaml / .sdl. */
export function resourcePathForAttachedFile(as: string, fileName: string): string {
  const kind = importKindFromFileName(fileName);
  const lower = fileName.toLowerCase();
  const id = as.trim();
  if (kind === 'proto_pack' && lower.endsWith('.proto')) {
    return `resources/${id}.proto`;
  }
  if (kind === 'openapi_spec') {
    if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
      return `resources/${id}.yaml`;
    }
    return `resources/${id}.json`;
  }
  if (kind === 'graphql_sdl') {
    if (lower.endsWith('.sdl')) {
      return `resources/${id}.sdl`;
    }
    if (lower.endsWith('.gql')) {
      return `resources/${id}.gql`;
    }
    return `resources/${id}.graphql`;
  }
  return resourcePathForAs(as, kind);
}
