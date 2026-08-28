/**
 * SoT fields for module_type OpenAPI | GraphQL | gRPC.
 */

export type OpenApiSpecMode = 'resource' | 'url_relative';

export type OpenApiFields = {
  spec_mode: OpenApiSpecMode;
  spec_as: string;
  spec_path_rel: string;
  auth_module_id: string;
  scanner_import: boolean;
  last_inventory: Record<string, unknown>[];
};

export type GraphqlSchemaMode = 'resource' | 'introspection_relative';

export type GraphqlFields = {
  schema_mode: GraphqlSchemaMode;
  sdl_as: string;
  schema_path_rel: string;
  endpoint_rel: string;
  auth_module_id: string;
  scanner_import: boolean;
  scanner_scan: boolean;
  last_inventory: Record<string, unknown>[];
};

export type GrpcFields = {
  proto_as: string;
  auth_module_id: string;
  last_inventory: Record<string, unknown>[];
};

export function defaultOpenApiFields(
  overrides?: Partial<OpenApiFields>,
): OpenApiFields {
  return {
    spec_mode: 'url_relative',
    spec_as: '',
    spec_path_rel: '/openapi.json',
    auth_module_id: '',
    scanner_import: false,
    last_inventory: [],
    ...overrides,
  };
}

export function defaultGraphqlFields(
  overrides?: Partial<GraphqlFields>,
): GraphqlFields {
  return {
    schema_mode: 'introspection_relative',
    sdl_as: '',
    schema_path_rel: '/graphql',
    endpoint_rel: '/graphql',
    auth_module_id: '',
    scanner_import: false,
    scanner_scan: false,
    last_inventory: [],
    ...overrides,
  };
}

export function defaultGrpcFields(overrides?: Partial<GrpcFields>): GrpcFields {
  return {
    proto_as: '',
    auth_module_id: '',
    last_inventory: [],
    ...overrides,
  };
}

export function normalizeOpenApiFields(raw: unknown): OpenApiFields {
  const o = asRec(raw);
  // legacy → thin
  let mode: OpenApiSpecMode = 'url_relative';
  if (o?.spec_mode === 'resource' || o?.spec_mode === 'url_relative') {
    mode = o.spec_mode;
  } else if (o?.spec_source === 'file') {
    mode = 'resource';
  }
  return defaultOpenApiFields({
    spec_mode: mode,
    spec_as: str(o?.spec_as),
    spec_path_rel:
      str(o?.spec_path_rel) ||
      str(o?.spec_url) ||
      (mode === 'url_relative' ? '/openapi.json' : ''),
    auth_module_id: str(o?.auth_module_id),
    scanner_import: Boolean(o?.scanner_import),
    last_inventory: Array.isArray(o?.last_inventory)
      ? (o!.last_inventory as Record<string, unknown>[])
      : [],
  });
}

export function normalizeGraphqlFields(raw: unknown): GraphqlFields {
  const o = asRec(raw);
  let mode: GraphqlSchemaMode = 'introspection_relative';
  if (o?.schema_mode === 'resource' || o?.schema_mode === 'introspection_relative') {
    mode = o.schema_mode;
  } else if (o?.schema_source === 'sdl_file') {
    mode = 'resource';
  }
  return defaultGraphqlFields({
    schema_mode: mode,
    sdl_as: str(o?.sdl_as),
    schema_path_rel:
      str(o?.schema_path_rel) ||
      str(o?.schema_url) ||
      '/graphql',
    endpoint_rel: str(o?.endpoint_rel) || str(o?.endpoint) || '/graphql',
    auth_module_id: str(o?.auth_module_id),
    scanner_import: Boolean(o?.scanner_import),
    scanner_scan: Boolean(o?.scanner_scan),
    last_inventory: Array.isArray(o?.last_inventory)
      ? (o!.last_inventory as Record<string, unknown>[])
      : [],
  });
}

export function normalizeGrpcFields(raw: unknown): GrpcFields {
  const o = asRec(raw);
  return defaultGrpcFields({
    proto_as: str(o?.proto_as),
    auth_module_id: str(o?.auth_module_id),
    last_inventory: Array.isArray(o?.last_inventory)
      ? (o!.last_inventory as Record<string, unknown>[])
      : [],
  });
}

function asRec(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function patchModuleFields(
  formData: unknown,
  moduleIndex: number,
  key: 'openapi_fields' | 'graphql_fields' | 'grpc_fields',
  nextFields: unknown,
): unknown {
  const root = { ...(asRec(formData) ?? {}) };
  const suites = { ...(asRec(root.test_suites) ?? {}) };
  const modules = Array.isArray(suites.test_data_constructor)
    ? (suites.test_data_constructor as unknown[]).slice()
    : [];
  if (moduleIndex < 0 || moduleIndex >= modules.length) {
    return undefined;
  }
  const mod = { ...(asRec(modules[moduleIndex]) ?? {}) };
  mod[key] = nextFields;
  modules[moduleIndex] = mod;
  return {
    ...root,
    test_suites: {
      ...suites,
      test_data_constructor: modules,
    },
  };
}

export function updateOpenApiModule(
  formData: unknown,
  moduleIndex: number,
  patch: Partial<OpenApiFields>,
): unknown {
  const mod = asRec(
    (asRec(asRec(formData)?.test_suites)?.test_data_constructor as unknown[] | undefined)?.[
      moduleIndex
    ],
  );
  const current = normalizeOpenApiFields(mod?.openapi_fields);
  return patchModuleFields(formData, moduleIndex, 'openapi_fields', {
    ...current,
    ...patch,
  });
}

export function updateGraphqlModule(
  formData: unknown,
  moduleIndex: number,
  patch: Partial<GraphqlFields>,
): unknown {
  const mod = asRec(
    (asRec(asRec(formData)?.test_suites)?.test_data_constructor as unknown[] | undefined)?.[
      moduleIndex
    ],
  );
  const current = normalizeGraphqlFields(mod?.graphql_fields);
  return patchModuleFields(formData, moduleIndex, 'graphql_fields', {
    ...current,
    ...patch,
  });
}

export function updateGrpcModule(
  formData: unknown,
  moduleIndex: number,
  patch: Partial<GrpcFields>,
): unknown {
  const mod = asRec(
    (asRec(asRec(formData)?.test_suites)?.test_data_constructor as unknown[] | undefined)?.[
      moduleIndex
    ],
  );
  const current = normalizeGrpcFields(mod?.grpc_fields);
  return patchModuleFields(formData, moduleIndex, 'grpc_fields', {
    ...current,
    ...patch,
  });
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
