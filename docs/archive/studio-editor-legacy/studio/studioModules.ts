/**
 * Мутации test_data_constructor из Редактора.
 * Имя листа = python-id = id = label; полотно без @-хедеров.
 */
import {
  defaultGraphqlFields,
  defaultGrpcFields,
  defaultOpenApiFields,
} from './apiModuleFields';
import { defaultChainFields } from './chainModuleFields';
import { defaultConnectorFields } from './connectorFields';
import { displayNameError } from './pythonIds';
import { defaultConstructorText, padConstructorCanvas } from './defaultConstructor';
import { pageIdError } from './studioPages';

/** Legacy «Фаззер» в Modules не предлагаем — сущность в дереве Fuzzers. */
export type ModuleType =
  | 'Генератор'
  | 'Коннектор'
  | 'Модуль работы с данными'
  | 'Авторизация'
  | 'OpenAPI'
  | 'GraphQL'
  | 'gRPC'
  | 'Цепь';
/** Импорт старых JSON / soft-migrate. */
export type LegacyModuleType = ModuleType | 'Фаззер';

export const AUTH_MODULE_TYPE: ModuleType = 'Авторизация';
export const CONNECTOR_MODULE_TYPE: ModuleType = 'Коннектор';
export const OPENAPI_MODULE_TYPE: ModuleType = 'OpenAPI';
export const GRAPHQL_MODULE_TYPE: ModuleType = 'GraphQL';
export const GRPC_MODULE_TYPE: ModuleType = 'gRPC';
export const CHAIN_MODULE_TYPE: ModuleType = 'Цепь';

/** По умолчанию — data-модуль (id + построчное полотно); type UI не светим. */
const DEFAULT_MODULE_TYPE: ModuleType = 'Модуль работы с данными';

const AUTH_CANVAS_HINT = [
  '# auth=bearer|basic|cookie|header|chain',
  '# token=...   | login=... | #password=secret',
  '# cookie=...  | header=X-Api-Key | value=...',
  '#',
  '# auth=chain',
  '# POST https://idp/token',
  '#   Header Content-Type = application/json',
  '#   Body {"user":"$login"}',
  '#   Capture $.access_token as token',
  '',
].join('\n');

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function ensureModulesRoot(formData: unknown): {
  root: Record<string, unknown>;
  suites: Record<string, unknown>;
  modules: unknown[];
} {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const modules = Array.isArray(suites.test_data_constructor)
    ? (suites.test_data_constructor as unknown[]).slice()
    : [];
  return { root, suites, modules };
}

function commitModules(
  root: Record<string, unknown>,
  suites: Record<string, unknown>,
  modules: unknown[],
): unknown {
  return {
    ...root,
    test_suites: {
      ...suites,
      test_data_constructor: modules,
    },
  };
}

/** Tech id модуля (python id). */
export function moduleIdError(id: string): string | undefined {
  const err = pageIdError(id);
  if (!err) {
    return undefined;
  }
  return err.replace('модели данных', 'модуля');
}

export function moduleDisplayError(name: string): string | undefined {
  return displayNameError(name, 'module');
}

export function listModuleIds(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules)) {
    return [];
  }
  return modules
    .map((item) => {
      const id = asRecord(item)?.id;
      return typeof id === 'string' ? id : '';
    })
    .filter((id) => id.length > 0);
}

export function listModuleLabels(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules)) {
    return [];
  }
  return modules
    .map((item) => {
      const label = asRecord(item)?.label;
      return typeof label === 'string' ? label.trim() : '';
    })
    .filter((label) => label.length > 0);
}

export function allocatePendingModuleId(existing: readonly string[]): string {
  let n = 1;
  while (existing.includes(`_module_${String(n)}`)) {
    n += 1;
  }
  return `_module_${String(n)}`;
}

/** JSON Pointer до текстового поля модуля для PrettyK. */
export function moduleEditorPointer(index: number, moduleType: string): string {
  const base = `/test_suites/test_data_constructor/${String(index)}`;
  if (moduleType === 'Коннектор') {
    // Форма ConnectorForm (не PrettyK) — pointer как у фаззера: label.
    return `${base}/label`;
  }
  if (moduleType === 'Модуль работы с данными') {
    return `${base}/data_storage_fields/editor`;
  }
  if (moduleType === AUTH_MODULE_TYPE) {
    return `${base}/auth_fields/constructor`;
  }
  if (
    moduleType === OPENAPI_MODULE_TYPE ||
    moduleType === GRAPHQL_MODULE_TYPE ||
    moduleType === GRPC_MODULE_TYPE ||
    moduleType === CHAIN_MODULE_TYPE
  ) {
    return `${base}/label`;
  }
  if (moduleType === 'Фаззер') {
    // POC-поля — JSON (request/injection), не PrettyK-полотно masks.
    return `${base}/label`;
  }
  if (moduleType === 'Генератор') {
    return `${base}/request_mixer_fields/chain`;
  }
  return `${base}/label`;
}

export function defaultAuthConstructorText(): string {
  return padConstructorCanvas(AUTH_CANVAS_HINT);
}

export function isAuthModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === AUTH_MODULE_TYPE;
}

export function isConnectorModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === CONNECTOR_MODULE_TYPE;
}

export function isOpenApiModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === OPENAPI_MODULE_TYPE;
}

export function isGraphqlModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === GRAPHQL_MODULE_TYPE;
}

export function isGrpcModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === GRPC_MODULE_TYPE;
}

export function isChainModule(module: Record<string, unknown> | undefined): boolean {
  return module?.module_type === CHAIN_MODULE_TYPE;
}

export function emptyModule(
  id: string,
  moduleType: LegacyModuleType = DEFAULT_MODULE_TYPE,
  label?: string,
): Record<string, unknown> {
  const name = label ?? id;
  const base: Record<string, unknown> = {
    module_type: moduleType,
    id,
    label: name,
  };
  if (moduleType === 'Коннектор') {
    base.connector_fields = defaultConnectorFields();
  } else if (moduleType === 'Модуль работы с данными') {
    // Построчный список URL → stream; process_id для CLI, в UI не светим.
    base.data_storage_fields = {
      source_type: 'Генерация из источника',
      process_id: 'additional_urls',
      editor: '',
    };
  } else if (moduleType === 'Фаззер') {
    // Legacy scaffold only (UI create → Fuzzers entity).
    base.fuzzing_fields = {
      request: {
        method: 'GET',
        url: 'http://juice-shop:3000/rest/products/search',
      },
      injection: {
        query_param: 'q',
        corpus: 'fuzz_payloads',
      },
    };
  } else if (moduleType === 'Генератор') {
    base.request_mixer_fields = {
      chain: defaultConstructorText(),
      headers: '',
      body: '',
    };
  } else if (moduleType === AUTH_MODULE_TYPE) {
    base.auth_fields = {
      constructor: defaultAuthConstructorText(),
    };
  } else if (moduleType === OPENAPI_MODULE_TYPE) {
    base.openapi_fields = defaultOpenApiFields();
  } else if (moduleType === GRAPHQL_MODULE_TYPE) {
    base.graphql_fields = defaultGraphqlFields();
  } else if (moduleType === GRPC_MODULE_TYPE) {
    base.grpc_fields = defaultGrpcFields();
  } else if (moduleType === CHAIN_MODULE_TYPE) {
    base.chain_fields = defaultChainFields({ har_as: name, sequence_name: name });
  }
  return base;
}

/**
 * Полотно data-модуля — не wire/PrettyK (URL-stream и т.п.).
 * Не требуем process_id: в Form/старых манифестах его часто нет, а editor уже URL-список.
 */
export function isDataUrlListModule(module: Record<string, unknown> | undefined): boolean {
  if (!module) {
    return false;
  }
  return module.module_type === 'Модуль работы с данными';
}

export function moduleRecordAt(
  formData: unknown,
  moduleIndex: number,
): Record<string, unknown> | undefined {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const modules = suites?.test_data_constructor;
  if (!Array.isArray(modules) || moduleIndex < 0 || moduleIndex >= modules.length) {
    return undefined;
  }
  return asRecord(modules[moduleIndex]);
}

/** Создать модуль: имя = python-id = id = label. */
export function addModule(
  formData: unknown,
  displayLabel: string,
  moduleType: ModuleType = DEFAULT_MODULE_TYPE,
): unknown {
  const id = displayLabel.trim();
  if (moduleDisplayError(id) || moduleIdError(id)) {
    return undefined;
  }
  const { root, suites, modules } = ensureModulesRoot(formData);
  if (listModuleIds(formData).includes(id) || listModuleLabels(formData).includes(id)) {
    return undefined;
  }
  modules.push(emptyModule(id, moduleType, id));
  return commitModules(root, suites, modules);
}

/** Выставить active_auth_module, если ещё пуст. */
export function ensureActiveAuthModule(
  formData: unknown,
  moduleId: string,
): unknown {
  const id = moduleId.trim();
  if (!id) {
    return formData;
  }
  const root = { ...(asRecord(formData) ?? {}) };
  const sec = { ...(asRecord(root.security_configuration) ?? {}) };
  const active = typeof sec.active_auth_module === 'string' ? sec.active_auth_module.trim() : '';
  if (active) {
    return formData;
  }
  sec.active_auth_module = id;
  if (sec.auth_type === undefined) {
    sec.auth_type = 'Без авторизации';
  }
  if (sec.scan_policy === undefined) {
    sec.scan_policy = 'custom_policy';
  }
  root.security_configuration = sec;
  return root;
}

/** AUTH-10: module_type=Авторизация + pointer active_auth_module. */
export function addAuthModule(formData: unknown, displayLabel: string): unknown {
  const next = addModule(formData, displayLabel, AUTH_MODULE_TYPE);
  if (next === undefined) {
    return undefined;
  }
  return ensureActiveAuthModule(next, displayLabel.trim());
}

/** CONN-10: module_type=Коннектор (слот, не runtime). */
export function addConnectorModule(formData: unknown, displayLabel: string): unknown {
  return addModule(formData, displayLabel, CONNECTOR_MODULE_TYPE);
}

export function addOpenApiModule(
  formData: unknown,
  displayLabel: string,
  opts?: {
    specMode?: 'resource' | 'url_relative';
    specAs?: string;
    specPathRel?: string;
    authModuleId?: string;
  },
): unknown {
  const next = addModule(formData, displayLabel, OPENAPI_MODULE_TYPE);
  if (next === undefined) {
    return undefined;
  }
  const specMode = opts?.specMode || 'url_relative';
  const specAs = (opts?.specAs || '').trim();
  const specPathRel = (opts?.specPathRel || '').trim();
  const authModuleId = (opts?.authModuleId || '').trim();
  if (!opts) {
    return next;
  }
  const { root, suites, modules } = ensureModulesRoot(next);
  const idx = modules.length - 1;
  if (idx < 0) {
    return next;
  }
  const mod = { ...(asRecord(modules[idx]) ?? {}) };
  mod.openapi_fields = defaultOpenApiFields({
    spec_mode: specMode,
    spec_as: specAs,
    spec_path_rel: specPathRel || '/openapi.json',
    auth_module_id: authModuleId,
  });
  modules[idx] = mod;
  return commitModules(root, suites, modules);
}

export function addGraphqlModule(
  formData: unknown,
  displayLabel: string,
  opts?: {
    schemaMode?: 'resource' | 'introspection_relative';
    sdlAs?: string;
    schemaPathRel?: string;
    endpointRel?: string;
    authModuleId?: string;
  },
): unknown {
  const next = addModule(formData, displayLabel, GRAPHQL_MODULE_TYPE);
  if (next === undefined) {
    return undefined;
  }
  if (!opts) {
    return next;
  }
  const { root, suites, modules } = ensureModulesRoot(next);
  const idx = modules.length - 1;
  if (idx < 0) {
    return next;
  }
  const mod = { ...(asRecord(modules[idx]) ?? {}) };
  mod.graphql_fields = defaultGraphqlFields({
    schema_mode: opts.schemaMode || 'introspection_relative',
    sdl_as: (opts.sdlAs || '').trim(),
    schema_path_rel: (opts.schemaPathRel || '').trim() || '/graphql',
    endpoint_rel: (opts.endpointRel || '').trim() || '/graphql',
    auth_module_id: (opts.authModuleId || '').trim(),
  });
  modules[idx] = mod;
  return commitModules(root, suites, modules);
}

export function addGrpcModule(
  formData: unknown,
  displayLabel: string,
  opts?: { protoAs?: string; authModuleId?: string },
): unknown {
  const next = addModule(formData, displayLabel, GRPC_MODULE_TYPE);
  if (next === undefined) {
    return undefined;
  }
  const protoAs = (opts?.protoAs || '').trim();
  const authModuleId = (opts?.authModuleId || '').trim();
  if (!protoAs && !authModuleId) {
    return next;
  }
  const { root, suites, modules } = ensureModulesRoot(next);
  const idx = modules.length - 1;
  if (idx < 0) {
    return next;
  }
  const mod = { ...(asRecord(modules[idx]) ?? {}) };
  mod.grpc_fields = defaultGrpcFields({
    proto_as: protoAs,
    auth_module_id: authModuleId,
  });
  modules[idx] = mod;
  return commitModules(root, suites, modules);
}

export function addChainModule(formData: unknown, displayLabel: string): unknown {
  return addModule(formData, displayLabel, CHAIN_MODULE_TYPE);
}

/** Переименовать id (= label). */
export function renameModule(
  formData: unknown,
  index: number,
  nextId: string,
): unknown {
  const trimmed = nextId.trim();
  if (moduleIdError(trimmed) || moduleDisplayError(trimmed)) {
    return undefined;
  }
  const { root, suites, modules } = ensureModulesRoot(formData);
  if (index < 0 || index >= modules.length) {
    return undefined;
  }
  const ids = listModuleIds(formData);
  const prev = asRecord(modules[index]) ?? {};
  const prevId = typeof prev.id === 'string' ? prev.id : '';
  if (trimmed !== prevId && ids.includes(trimmed)) {
    return undefined;
  }
  modules[index] = { ...prev, id: trimmed, label: trimmed };
  return commitModules(root, suites, modules);
}

/** Rename из дерева: id и label синхронно. */
export function renameModuleLabel(
  formData: unknown,
  index: number,
  nextLabel: string,
): unknown {
  return renameModule(formData, index, nextLabel);
}

export function removeModule(formData: unknown, index: number): unknown {
  const { root, suites, modules } = ensureModulesRoot(formData);
  if (index < 0 || index >= modules.length) {
    return formData;
  }
  modules.splice(index, 1);
  return commitModules(root, suites, modules);
}
