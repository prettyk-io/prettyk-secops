/**
 * Мутации test_suites.imports — именованные ресурсы (sidecar resources/{as}.*).
 */
import { trimUnderscores } from '../keywords/textScan';
import { isValidPageId } from './studioPages';

/** data_file · har_file · proto_pack · openapi_spec · graphql_sdl. */
export type ImportKind =
  | 'data_file'
  | 'har_file'
  | 'proto_pack'
  | 'openapi_spec'
  | 'graphql_sdl';

export interface ResourceFields {
  path: string;
  kind: ImportKind;
  as: string;
  /** Только proto_pack: корни импорта; пусто = корень пакета. */
  import_paths?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function ensureImportsRoot(formData: unknown): {
  root: Record<string, unknown>;
  suites: Record<string, unknown>;
  imports: unknown[];
} {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const imports = Array.isArray(suites.imports) ? [...suites.imports] : [];
  return { root, suites, imports };
}

function commitImports(
  root: Record<string, unknown>,
  suites: Record<string, unknown>,
  imports: unknown[],
): unknown {
  return {
    ...root,
    test_suites: {
      ...suites,
      imports,
    },
  };
}

/** Логическое имя ресурса → `${as}` в stream (латиница, как у моделей). */
export function resourceAsError(as: string): string | undefined {
  const id = as.trim();
  if (!id) {
    return 'Укажите имя ресурса (as)';
  }
  if (!isValidPageId(id)) {
    return 'Имя: латиница, цифра или _; с буквы или _ (urls)';
  }
  return undefined;
}

export function resourcePathForAs(
  as: string,
  kind: ImportKind = 'data_file',
): string {
  const id = as.trim();
  if (kind === 'har_file') {
    return `resources/${id}.har`;
  }
  if (kind === 'proto_pack') {
    return `resources/${id}.zip`;
  }
  if (kind === 'openapi_spec') {
    return `resources/${id}.json`;
  }
  if (kind === 'graphql_sdl') {
    return `resources/${id}.graphql`;
  }
  return `resources/${id}.txt`;
}

export function isHarImportKind(kind: string | undefined): boolean {
  return kind === 'har_file';
}

export function isProtoPackImportKind(kind: string | undefined): boolean {
  return kind === 'proto_pack';
}

export function isOpenApiSpecImportKind(kind: string | undefined): boolean {
  return kind === 'openapi_spec';
}

export function isGraphqlSdlImportKind(kind: string | undefined): boolean {
  return kind === 'graphql_sdl';
}

/** Имя файла → кандидат as (stem, sanitize к латинице). */
export function sanitizeFilenameToAs(filename: string): string {
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const leaf = slash >= 0 ? filename.slice(slash + 1) : filename;
  const dot = leaf.lastIndexOf('.');
  const base = dot > 0 ? leaf.slice(0, dot) : leaf;
  let cleaned = trimUnderscores(base.replace(/[^A-Za-z0-9_]+/g, '_'));
  if (!cleaned) {
    cleaned = 'resource';
  }
  if (/^[0-9]/.test(cleaned)) {
    cleaned = `r_${cleaned}`;
  }
  return cleaned;
}

function coerceImportKind(raw: unknown, path: string): ImportKind {
  if (raw === 'har_file') {
    return 'har_file';
  }
  if (raw === 'proto_pack') {
    return 'proto_pack';
  }
  if (raw === 'openapi_spec') {
    return 'openapi_spec';
  }
  if (raw === 'graphql_sdl') {
    return 'graphql_sdl';
  }
  const lower = path.toLowerCase();
  if (lower.endsWith('.har')) {
    return 'har_file';
  }
  if (lower.endsWith('.zip') || lower.endsWith('.proto')) {
    return 'proto_pack';
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return 'openapi_spec';
  }
  if (
    lower.endsWith('.graphql') ||
    lower.endsWith('.sdl') ||
    lower.endsWith('.gql')
  ) {
    return 'graphql_sdl';
  }
  if (lower.endsWith('.json') && (lower.includes('openapi') || lower.includes('swagger'))) {
    return 'openapi_spec';
  }
  return 'data_file';
}

function coerceImportPaths(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map(String).map((s) => s.trim()).filter(Boolean);
}

export function normalizeImport(item: unknown): ResourceFields {
  if (typeof item === 'string') {
    const stem = sanitizeFilenameToAs(item);
    const kind = coerceImportKind(undefined, item);
    return {
      path: item.startsWith('resources/') ? item : resourcePathForAs(stem, kind),
      kind,
      as: stem,
    };
  }
  const record = asRecord(item) ?? {};
  const path = typeof record.path === 'string' ? record.path : '';
  let as = typeof record.as === 'string' ? record.as.trim() : '';
  if (!as && path) {
    as = sanitizeFilenameToAs(path);
  }
  const kind = coerceImportKind(record.kind, path);
  const import_paths = coerceImportPaths(record.import_paths);
  const out: ResourceFields = {
    path: path || (as ? resourcePathForAs(as, kind) : ''),
    kind,
    as,
  };
  if (kind === 'proto_pack' && import_paths && import_paths.length > 0) {
    out.import_paths = import_paths;
  }
  return out;
}

export function resourceDisplayName(fields: ResourceFields, index: number): string {
  if (fields.as.trim()) {
    return fields.as.trim();
  }
  return `resource_${String(index + 1)}`;
}

export function listResourceAsNames(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const imports = suites?.imports;
  if (!Array.isArray(imports)) {
    return [];
  }
  return imports
    .map((item) => normalizeImport(item).as)
    .filter((as) => as.length > 0);
}

function listResourcesByKind(formData: unknown, kind: ImportKind): ResourceFields[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const imports = suites?.imports;
  if (!Array.isArray(imports)) {
    return [];
  }
  return imports
    .map((item) => normalizeImport(item))
    .filter((r) => r.kind === kind && r.as.trim());
}

export function listProtoPackResources(formData: unknown): ResourceFields[] {
  return listResourcesByKind(formData, 'proto_pack');
}

export function listOpenApiSpecResources(formData: unknown): ResourceFields[] {
  return listResourcesByKind(formData, 'openapi_spec');
}

export function listGraphqlSdlResources(formData: unknown): ResourceFields[] {
  return listResourcesByKind(formData, 'graphql_sdl');
}

function toImportRecord(fields: ResourceFields): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    path: fields.path,
    kind: fields.kind,
    as: fields.as,
  };
  if (fields.kind === 'proto_pack' && fields.import_paths?.length) {
    rec.import_paths = fields.import_paths;
  }
  return rec;
}

export function emptyResource(
  as: string,
  kind: ImportKind = 'data_file',
): Record<string, unknown> {
  const id = as.trim();
  return toImportRecord({
    path: resourcePathForAs(id, kind),
    kind,
    as: id,
  });
}

export function addResource(
  formData: unknown,
  as: string,
  kind: ImportKind = 'data_file',
): { data: unknown; index: number } | undefined {
  const trimmed = as.trim();
  if (resourceAsError(trimmed)) {
    return undefined;
  }
  if (listResourceAsNames(formData).includes(trimmed)) {
    return undefined;
  }
  const { root, suites, imports } = ensureImportsRoot(formData);
  const index = imports.length;
  imports.push(emptyResource(trimmed, kind));
  return { data: commitImports(root, suites, imports), index };
}

export function renameResource(
  formData: unknown,
  index: number,
  as: string,
): unknown | undefined {
  const trimmed = as.trim();
  if (resourceAsError(trimmed)) {
    return undefined;
  }
  const { root, suites, imports } = ensureImportsRoot(formData);
  if (index < 0 || index >= imports.length) {
    return undefined;
  }
  const prev = normalizeImport(imports[index]);
  if (trimmed !== prev.as && listResourceAsNames(formData).includes(trimmed)) {
    return undefined;
  }
  imports[index] = toImportRecord({
    ...prev,
    path: resourcePathForAs(trimmed, prev.kind),
    as: trimmed,
  });
  return commitImports(root, suites, imports);
}

function resolveResourcePath(
  nextAs: string,
  nextKind: ImportKind,
  prev: ResourceFields,
): string {
  if (!resourceAsError(nextAs) && (nextAs !== prev.as || nextKind !== prev.kind)) {
    return resourcePathForAs(nextAs, nextKind);
  }
  if (prev.path) {
    return prev.path;
  }
  if (nextAs && !resourceAsError(nextAs)) {
    return resourcePathForAs(nextAs, nextKind);
  }
  return '';
}

export function updateResource(
  formData: unknown,
  index: number,
  patch: Partial<ResourceFields>,
): unknown | undefined {
  const { root, suites, imports } = ensureImportsRoot(formData);
  if (index < 0 || index >= imports.length) {
    return undefined;
  }
  const prev = normalizeImport(imports[index]);
  const nextAs = patch.as !== undefined ? patch.as.trim() : prev.as;
  const nextKind = patch.kind ?? prev.kind;
  if (
    nextAs &&
    !resourceAsError(nextAs) &&
    nextAs !== prev.as &&
    listResourceAsNames(formData).includes(nextAs)
  ) {
    return undefined;
  }
  const nextPath =
    patch.path !== undefined
      ? patch.path
      : resolveResourcePath(nextAs, nextKind, prev);
  const next: ResourceFields = {
    path: nextPath,
    kind: nextKind,
    as: nextAs,
  };
  if (nextKind === 'proto_pack') {
    const paths =
      patch.import_paths !== undefined ? patch.import_paths : prev.import_paths;
    if (paths?.length) {
      next.import_paths = paths;
    }
  }
  imports[index] = toImportRecord(next);
  return commitImports(root, suites, imports);
}

export function removeResource(formData: unknown, index: number): unknown {
  const { root, suites, imports } = ensureImportsRoot(formData);
  if (index < 0 || index >= imports.length) {
    return formData;
  }
  imports.splice(index, 1);
  return commitImports(root, suites, imports);
}
