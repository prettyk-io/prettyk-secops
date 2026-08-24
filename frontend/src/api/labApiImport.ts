/**
 * Lab API import (OpenAPI / GraphQL / gRPC) → playground :8765.
 * Не запускает ZAP scan.
 */

export type LabOpenApiParseResult = {
  ok: boolean;
  kind?: string;
  base_url?: string;
  operations?: Array<{
    method?: string;
    path?: string;
    operation_id?: string | null;
    summary?: string;
    url?: string;
  }>;
  notes?: string[];
  seed?: string;
  error?: string;
};

export type LabGraphqlParseResult = {
  ok: boolean;
  source?: string;
  operations?: Array<{ kind?: string; name?: string; description?: string }>;
  notes?: string[];
  error?: string;
};

export type LabGrpcParseResult = {
  ok: boolean;
  services?: Array<{
    name?: string;
    methods?: Array<{ name?: string; unary?: boolean }>;
  }>;
  notes?: string[];
  error?: string;
};

export type LabGrpcUnaryResult = {
  ok: boolean;
  skipped?: boolean;
  notes?: string[];
  response?: unknown;
  error?: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status >= 500) {
    throw new Error(`lab API HTTP ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

export async function parseOpenApiLab(spec: string): Promise<LabOpenApiParseResult> {
  return postJson('/api/lab/openapi/parse', { spec });
}

export async function parseGraphqlLab(schema: string): Promise<LabGraphqlParseResult> {
  return postJson('/api/lab/graphql/parse', { schema });
}

export async function parseGrpcLab(proto: string): Promise<LabGrpcParseResult> {
  return postJson('/api/lab/grpc/parse', { proto });
}

export async function packGrpcLab(input: {
  proto_pack: string;
  import_paths?: string[];
}): Promise<LabGrpcParseResult> {
  return postJson('/api/lab/grpc/pack', input);
}

export async function unaryGrpcLab(input: {
  host: string;
  method: string;
  request_json?: string;
}): Promise<LabGrpcUnaryResult> {
  return postJson('/api/lab/grpc/unary', input);
}

export type LabChainFromHarResult = {
  ok: boolean;
  har_as?: string;
  sequence_name?: string;
  steps?: Array<Record<string, unknown>>;
  slots?: Array<Record<string, unknown>>;
  template_har?: string;
  notes?: string[];
  error?: string;
};

export type LabChainMaterializeResult = {
  ok: boolean;
  har_as?: string;
  har_path?: string;
  har_text?: string;
  setup_har_text?: string;
  attack_har_text?: string;
  sequence_name?: string;
  seed?: string;
  fuzz_targets?: Array<{ method?: string; url?: string; body?: string }>;
  notes?: string[];
  error?: string;
};

export type LabChainDryRunPreResult = {
  ok: boolean;
  setup_har_text?: string;
  attack_har_text?: string;
  seed?: string;
  extract_ok?: boolean;
  bindings_used?: string[];
  notes?: string[];
  error?: string;
};

export async function chainFromHarLab(input: {
  har: string;
  har_as?: string;
  sequence_name?: string;
}): Promise<LabChainFromHarResult> {
  return postJson('/api/lab/chain/from-har', input);
}

export async function chainMaterializeLab(input: {
  chain_fields: Record<string, unknown>;
  bindings?: Record<string, string>;
  wired?: Record<string, unknown>;
}): Promise<LabChainMaterializeResult> {
  return postJson('/api/lab/chain/materialize', input);
}

export async function chainDryRunPreLab(input: {
  chain_fields: Record<string, unknown>;
  bindings?: Record<string, string>;
  wired?: Record<string, unknown>;
}): Promise<LabChainDryRunPreResult> {
  return postJson('/api/lab/chain/dry-run-pre', input);
}

export type LabChainValuePackResult = {
  ok: boolean;
  count?: number;
  iterations?: Array<{
    index?: number;
    ok?: boolean;
    bindings?: Record<string, string>;
    har_text?: string;
    notes?: string[];
  }>;
  notes?: string[];
  error?: string;
};

export async function chainValuePackLab(input: {
  chain_fields: Record<string, unknown>;
  pack: string;
}): Promise<LabChainValuePackResult> {
  return postJson('/api/lab/chain/value-pack', input);
}
