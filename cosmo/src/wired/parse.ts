/**
 * RK-MANIFEST-2: парсер legacy-манифеста (JSON Schema payload) → плоский typed JSON.
 * Читает docs/wired.json как reference для дефолтов, но на вход принимает legacy formData.
 * Legacy → новый контракт { regulation, editor }.
 */

import type {
  Wired,
  WiredResult,
  RegulationMeta,
  RegulationInfrastructure,
  RegulationSecurity,
  Editor,
  EditorImport,
  EditorPage,
  EditorScenario,
  ScenarioStep,
  EditorModules,
  AuthModule,
  OpenApiModule,
  GraphqlModule,
  GrpcModule,
  ChainModule,
  DataModule,
  ConnectorModule,
  FuzzerModule,
  FuzzerTarget,
  EditorFolder,
  EditorFolders,
} from './types';

/* ── helpers ── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBoolean(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asArray<T>(v: unknown, mapItem: (item: unknown) => T): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(mapItem);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

/* ── legacy module list → typed modules ── */

const MODULE_KIND_MAP: Record<
  string,
  'auth' | 'openapi' | 'graphql' | 'grpc' | 'chain' | 'data' | 'connector' | 'fuzzer'
> = {
  Авторизация: 'auth',
  OpenAPI: 'openapi',
  GraphQL: 'graphql',
  'gRPC': 'grpc',
  Цепь: 'chain',
  'Модуль работы с данными': 'data',
  Коннектор: 'connector',
  Фаззер: 'fuzzer',
};

function parseModuleEntry(entry: unknown): { kind: string; data: Record<string, unknown> } | null {
  if (!isRecord(entry)) return null;
  const moduleType = asString(entry.module_type);
  if (!moduleType) return null;
  return { kind: moduleType, data: entry };
}

function extractModules(testSuites: Record<string, unknown>): EditorModules {
  const legacyModules = asArray(testSuites.test_data_constructor, parseModuleEntry).filter(
    Boolean,
  ) as { kind: string; data: Record<string, unknown> }[];

  const auth: AuthModule[] = [];
  const openapi: OpenApiModule[] = [];
  const graphql: GraphqlModule[] = [];
  const grpc: GrpcModule[] = [];
  const chain: ChainModule[] = [];
  const data: DataModule[] = [];
  const connectors: ConnectorModule[] = [];
  const fuzzers: FuzzerModule[] = [];

  for (const { kind, data: d } of legacyModules) {
    const id = asString(d.id);
    const name = asString(d.label || d.name || id);

    switch (MODULE_KIND_MAP[kind]) {
      case 'auth': {
        const authFields = asRecord(d.auth_fields);
        auth.push({ id, dialect: asString(authFields.dialect || d.dialect), ...authFields });
        break;
      }
      case 'openapi': {
        const of = asRecord(d.openapi_fields);
        openapi.push({
          id,
          schema_mode: asString(of.schema_mode, 'inline'),
          schema_resource: asString(of.schema_resource) || undefined,
          schema_path: asString(of.schema_path) || undefined,
          auth_module_id: asString(of.auth_module_id) || undefined,
          allow_zap_import: asBoolean(of.allow_zap_import, true),
          operations_cache: of.operations_cache,
        });
        break;
      }
      case 'graphql': {
        const gf = asRecord(d.graphql_fields);
        graphql.push({
          id,
          schema_mode: asString(gf.schema_mode, 'inline'),
          sdl_resource: asString(gf.sdl_resource) || undefined,
          introspection_path: asString(gf.introspection_path) || undefined,
          endpoint_path: asString(gf.endpoint_path) || undefined,
          auth_module_id: asString(gf.auth_module_id) || undefined,
          allow_zap_import: asBoolean(gf.allow_zap_import, true),
          allow_zap_scan: asBoolean(gf.allow_zap_scan, true),
          operations_cache: gf.operations_cache,
        });
        break;
      }
      case 'grpc': {
        const gf = asRecord(d.grpc_fields);
        grpc.push({
          id,
          proto_resource: asString(gf.proto_resource) || undefined,
          auth_module_id: asString(gf.auth_module_id) || undefined,
          services_cache: gf.services_cache,
        });
        break;
      }
      case 'chain': {
        const cf = asRecord(d.chain_fields);
        chain.push({
          id,
          har_resource: asString(cf.har_resource) || undefined,
          sequence_name: asString(cf.sequence_name) || undefined,
          raw_har: cf.raw_har,
          templated_har: cf.templated_har,
          steps_cache: cf.steps_cache,
          replace_map: cf.replace_map,
          play_bindings: isRecord(cf.bindings) ? (cf.bindings as Record<string, string>) : undefined,
          value_pack_module_id: asString(cf.value_pack_module) || undefined,
          notes: asString((cf.last_notes as unknown[] | undefined)?.[0]) || undefined,
        });
        break;
      }
      case 'data': {
        const df = asRecord(d.data_storage_fields || d.data_fields);
        data.push({
          id,
          source: asString(df.source || d.source, 'inline'),
          process_id: asString(df.process_id || d.process_id || id),
          editor: asString(df.editor || '', ''),
          output_format: asString(df.output_format || 'json'),
        });
        break;
      }
      case 'connector': {
        const cf = asRecord(d.connector_fields);
        connectors.push({
          id,
          kind: asString(cf.connector_type || d.connector_type || 'unknown'),
          notes: asString(cf.notes || ''),
          ...cf,
        });
        break;
      }
      case 'fuzzer': {
        const ff = asRecord(d.fuzzing_fields || d.fuzzer_fields);
        const http = isRecord(ff.http_template) ? ff.http_template : {};
        const engRaw = (ff.mixer || ff.engine) as Record<string, unknown>;
        fuzzers.push({
          id,
          intent: asString(d.intent, ''),
          name,
          http_template: {
            method: asString(http.method, 'GET'),
            url: asString(http.url),
            headers: isRecord(http.headers) ? (http.headers as Record<string, string>) : {},
            follow_redirect: asBoolean(http.follow_redirect, false),
          },
          query_target: isRecord(ff.query_target)
            ? { param: asString((ff.query_target as Record<string, unknown>).param), corpus: asString((ff.query_target as Record<string, unknown>).corpus) }
            : undefined,
          limits: isRecord(ff.poc_limits)
            ? {
                max_requests: asNumber((ff.poc_limits as Record<string, unknown>).max_requests, 100),
                requests_per_sec: asNumber((ff.poc_limits as Record<string, unknown>).requests_per_sec, 10),
                request_timeout_sec: asNumber((ff.poc_limits as Record<string, unknown>).request_timeout_sec, 30),
              }
            : undefined,
          anomaly: isRecord(ff.anomaly_watch)
            ? {
                mark_5xx: asBoolean((ff.anomaly_watch as Record<string, unknown>).mark_5xx, false),
                delay_threshold_ms: asNumber((ff.anomaly_watch as Record<string, unknown>).delay_threshold_ms, 500),
              }
            : undefined,
          engine: isRecord(ff.mixer || ff.engine)
            ? {
                method: asString(engRaw.method, 'GET'),
                headers: isRecord(engRaw.headers) ? (engRaw.headers as Record<string, string>) : undefined,
                body: asString(engRaw.body) || undefined,
              }
            : undefined,
          connector: isRecord(ff.connector) ? ff.connector : undefined,
          data: isRecord(ff.data) ? ff.data : undefined,
          init_raw: asString(d.init_raw) || undefined,
        });
        break;
      }
    }
  }

  return { auth, openapi, graphql, grpc, chain, data, connectors, fuzzers };
}

/* ── imports ── */

function parseImportItem(item: unknown): EditorImport {
  if (typeof item === 'string') {
    return { path: item, kind: 'data_file' };
  }
  const o = asRecord(item);
  return {
    path: asString(o.path),
    kind: asString(o.kind, 'data_file'),
    stream_name: asString(o.as) || undefined,
    proto_roots: Array.isArray(o.import_paths) ? (o.import_paths as string[]).join(',') : undefined,
  };
}

/* ── pages ── */

function parsePages(pagesRaw: unknown): EditorPage[] {
  const pagesObj = asRecord(pagesRaw);
  return Object.entries(pagesObj).map(([key, v]) => {
    const p = asRecord(v);
    return {
      title: asString(p.title, key),
      path: asString(p.path, ''),
      constructor: asString(p.constructor, ''),
    };
  });
}

/* ── scenarios ── */

function parseScenarioStep(v: unknown): ScenarioStep {
  const s = asRecord(v);
  return {
    step_id: asString(s.step_id),
    description: asString(s.description, ''),
    constructor: asString(s.constructor, ''),
    expect_error: asBoolean(s.expect_error),
    retry_count: asNumber(s.retry_count, 0),
    retry_delay_sec: asNumber(s.retry_delay_sec, 0),
    continue_on_error: asBoolean(s.continue_on_error, false),
    save_result_var: asString(s.save_var, ''),
  };
}

function parseScenarios(raw: unknown): EditorScenario[] {
  return asArray(raw, (v) => {
    const s = asRecord(v);
    return {
      scenario_id: asString(s.scenario_id),
      title: asString(s.scenario_name || s.title, ''),
      description: asString(s.description, ''),
      continue_on_error: asBoolean(s.continue_on_error, false),
      steps: asArray(s.steps, parseScenarioStep),
    };
  });
}

/* ── folders ── */

function parseFolder(f: unknown): EditorFolder {
  const o = asRecord(f);
  return {
    folder_id: asString(o.folder_id || o.id),
    title: asString(o.title || o.label || o.name),
    items: asArray(o.items || o.members || o.children, (x) => x),
  };
}

function parseFolders(raw: unknown): EditorFolders {
  const obj = asRecord(raw);
  const result: Record<string, EditorFolder[]> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      result[key] = val.map(parseFolder);
    }
  }
  return result;
}

/* ── fuzzer targets ── */

function parseFuzzerTarget(v: unknown): FuzzerTarget {
  const t = asRecord(v);
  return {
    url: asString(t.url),
    method: asString(t.method, 'GET'),
    corpus: asString(t.corpus),
    body_template: asString(t.body_template || t.body),
  };
}

/* ── главный парсер ── */

/**
 * Кэш editor-парсинга по ссылке test_suites.
 * При правках формы меняется только regulation (meta/infra/security); test_suites
 * остаётся тем же объектом → editor (модули/сценарии/папки) не парсится заново на
 * каждую клавишу. При правках в Студии test_suites — новый объект → пересчёт.
 */
const editorCache = new WeakMap<object, Editor>();

function parseEditor(testSuites: Record<string, unknown>): Editor {
  const cached = editorCache.get(testSuites);
  if (cached) {
    return cached;
  }
  const editor: Editor = {
    imports: asArray(testSuites.imports, parseImportItem),
    pages: parsePages(testSuites.pages),
    scenarios: parseScenarios(testSuites.scenarios),
    modules: extractModules(testSuites),
    fuzzer_targets: asArray(testSuites.fuzzers || testSuites.fuzzer_targets, parseFuzzerTarget),
    folders: parseFolders(testSuites.folders),
  };
  editorCache.set(testSuites, editor);
  return editor;
}

export function parseWired(json: unknown): WiredResult {
  if (!isRecord(json)) {
    return { ok: false, error: 'Манифест должен быть объектом' };
  }

  const metaRaw = asRecord(json.meta);
  const infraRaw = asRecord(json.infrastructure);
  const secRaw = asRecord(json.security_configuration);

  const meta: RegulationMeta = {
    project_id: asString(metaRaw.project_id, 'owasp-zap-tests'),
    initiator_name: asString(metaRaw.initiator_name, ''),
    app_leader: asString(metaRaw.app_leader, ''),
    assessment_purpose: (asString(metaRaw.assessment_purpose, 'scheduled') as RegulationMeta['assessment_purpose']),
    generate_act: asBoolean(metaRaw.generate_act),
    scheduled_info: asString(metaRaw.scheduled_info) || undefined,
    release_domain: asString(metaRaw.release_domain) || undefined,
    compliance_requirements: asString(metaRaw.compliance_requirements) || undefined,
    release_manager: asString(metaRaw.release_manager) || undefined,
    emergency_reason: asString(metaRaw.emergency_reason) || undefined,
  };

  const infrastructure: RegulationInfrastructure = {
    base_url_override: asString(infraRaw.base_url_override, 'http://runner01.dev.spaceport.ru:8080'),
    allowed_extra_domains: asString(infraRaw.allowed_extra_domains, ''),
    zap_mode: (asString(infraRaw.zap_mode, 'demon') as RegulationInfrastructure['zap_mode']),
    browser_type: (asString(infraRaw.browser_type, 'chrome') as RegulationInfrastructure['browser_type']),
    debug_mode: asBoolean(infraRaw.debug_mode),
    webswing_session_timeout_min: infraRaw.webswing_session_timeout_min !== undefined ? asNumber(infraRaw.webswing_session_timeout_min, 60) : undefined,
    idle_timeout_min: infraRaw.idle_timeout_min !== undefined ? asNumber(infraRaw.idle_timeout_min, 10) : undefined,
    additional_local_server_port: infraRaw.additional_local_server_port !== undefined ? asNumber(infraRaw.additional_local_server_port) : undefined,
  };

  const securityConfig: RegulationSecurity = {
    scan_policy: (asString(secRaw.scan_policy, 'custom_policy') as RegulationSecurity['scan_policy']),
    auth_type: (asString(secRaw.auth_type, 'Без авторизации') as RegulationSecurity['auth_type']),
    auth_details: isRecord(secRaw.auth_details) ? (secRaw.auth_details as Record<string, unknown>) : {},
    active_auth_module: asString(secRaw.active_auth_module, ''),
  };

  const testSuites = asRecord(json.test_suites);
  const editor = parseEditor(testSuites);

  const wired: Wired = {
    regulation: {
      meta,
      infrastructure,
      security_configuration: securityConfig,
    },
    editor,
  };

  return { ok: true, wired };
}

/* ── RK: обратный мёрж regulation в legacy formData ── */

export function mergeRegulationToLegacy(
  wired: Wired,
  legacyFormData: unknown,
): unknown {
  const { regulation } = wired;
  const orig = legacyFormData as Record<string, unknown>;
  return {
    ...orig,
    meta: regulation.meta,
    infrastructure: regulation.infrastructure,
    security_configuration: regulation.security_configuration,
  };
}
