/**
 * PK-BL-1: Multi-Source Intake Parser
 * 
 * Ingests URL, OpenAPI (JSON/YAML), HAR, and .proto files into a normalized AttackSurfaceGraph.
 */

import type {
  AttackSurfaceGraph,
  AttackSurfaceMetadata,
  EndpointNode,
  GraphEdge,
  HttpMethod,
  IntakeInput,
  IntakeSourceType,
  ParamLocation,
  ParamSchema,
  ProtocolType,
} from './types';

// Simple deterministic hash for endpoint IDs
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function generateEndpointId(
  protocol: ProtocolType,
  host: string,
  port: number | undefined,
  method: string,
  path: string,
): string {
  const normPath = path.startsWith('/') ? path : `/${path}`;
  const portPart = port ? `:${port}` : '';
  const raw = `${protocol}://${host}${portPart}#${method.toUpperCase()}#${normPath}`;
  return `ep_${hashString(raw)}`;
}

/**
 * 1. Plain URL Intake Parser
 */
export function parseUrlIntake(rawUrl: string): EndpointNode[] {
  if (!rawUrl || typeof rawUrl !== 'string') return [];
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const protocol = (url.protocol.replace(':', '') as ProtocolType) || 'https';
    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : undefined;
    const path = url.pathname || '/';

    const parameters: ParamSchema[] = [];
    url.searchParams.forEach((val, key) => {
      parameters.push({
        name: key,
        in: 'query',
        type: 'string',
        required: false,
        defaultValue: val,
      });
    });

    const id = generateEndpointId(protocol, host, port, 'GET', path);
    return [
      {
        id,
        protocol,
        host,
        port,
        path,
        method: 'GET',
        parameters,
        authRequired: false,
        contentTypes: ['application/json', 'text/html'],
        source: 'url',
        rawMetadata: { originalUrl: rawUrl },
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Minimal YAML parser helper for basic OpenAPI YAML specs (JSON fallback)
 */
function parseYamlOrJson(content: string | Record<string, unknown>): Record<string, unknown> | null {
  if (typeof content === 'object' && content !== null) {
    return content;
  }
  if (typeof content !== 'string') return null;

  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // Basic YAML key-value parser for simple OpenAPI YAMLs
  try {
    const lines = trimmed.split('\n');
    const root: Record<string, unknown> = {};
    let currentPath: string | null = null;
    let currentMethod: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.replace(/#.*$/, '').trimEnd();
      if (!line.trim()) continue;

      if (/^openapi:\s*['"]?([0-9.]+)['"]?/.test(line.trim())) {
        root.openapi = RegExp.$1;
      } else if (/^swagger:\s*['"]?([0-9.]+)['"]?/.test(line.trim())) {
        root.swagger = RegExp.$1;
      } else if (/^\s*paths:\s*$/.test(line)) {
        root.paths = root.paths || {};
      } else if (/^\s{2,4}(\/[a-zA-Z0-9_{}/-]+):\s*$/.test(line)) {
        currentPath = RegExp.$1;
        const paths = (root.paths = (root.paths || {}) as Record<string, Record<string, unknown>>);
        paths[currentPath] = paths[currentPath] || {};
      } else if (currentPath && /^\s{4,6}(get|post|put|delete|patch|options|head):\s*$/i.test(line)) {
        currentMethod = RegExp.$1.toLowerCase();
        const paths = (root.paths || {}) as Record<string, Record<string, unknown>>;
        const targetPath = paths[currentPath];
        if (targetPath) {
          targetPath[currentMethod] = { summary: `${currentMethod.toUpperCase()} ${currentPath}` };
        }
      }
    }

    if (root.paths && Object.keys(root.paths).length > 0) {
      return root;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * 2. OpenAPI / Swagger Parser
 */
export function parseOpenApiIntake(
  content: string | Record<string, unknown>,
  defaultHost = 'localhost',
): EndpointNode[] {
  const spec = parseYamlOrJson(content);
  if (!spec || typeof spec !== 'object') return [];

  const endpoints: EndpointNode[] = [];
  const pathsObj = (spec.paths || {}) as Record<string, Record<string, unknown>>;

  let baseHost = defaultHost;
  let basePort: number | undefined;
  let baseProtocol: ProtocolType = 'https';

  // OpenAPI 3.x servers
  if (Array.isArray(spec.servers) && spec.servers.length > 0 && spec.servers[0]?.url) {
    try {
      const serverUrl = new URL(String(spec.servers[0].url).startsWith('http') ? String(spec.servers[0].url) : `https://${spec.servers[0].url}`);
      baseHost = serverUrl.hostname;
      basePort = serverUrl.port ? parseInt(serverUrl.port, 10) : undefined;
      baseProtocol = (serverUrl.protocol.replace(':', '') as ProtocolType) || 'https';
    } catch {
      // fallback
    }
  } else if (typeof spec.host === 'string') {
    // Swagger 2.0 host
    const parts = spec.host.split(':');
    baseHost = parts[0] || defaultHost;
    if (parts[1]) basePort = parseInt(parts[1], 10);
  }

  const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

  for (const [pathKey, pathItem] of Object.entries(pathsObj)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [methodKey, opObj] of Object.entries(pathItem)) {
      const upperMethod = methodKey.toUpperCase() as HttpMethod;
      if (!httpMethods.includes(upperMethod)) continue;

      const op = (opObj || {}) as Record<string, unknown>;
      const parameters: ParamSchema[] = [];

      // Combine path-level and operation-level parameters
      const rawParams = [
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(op.parameters) ? op.parameters : []),
      ];

      for (const p of rawParams) {
        if (!p || typeof p !== 'object') continue;
        const pObj = p as Record<string, unknown>;
        const pIn = (pObj.in as ParamLocation) || 'query';
        const pName = String(pObj.name || '');
        if (!pName) continue;

        parameters.push({
          name: pName,
          in: pIn,
          type: typeof pObj.type === 'string' ? pObj.type : (pObj.schema as Record<string, unknown>)?.type ? String((pObj.schema as Record<string, unknown>).type) : 'string',
          required: Boolean(pObj.required),
          description: typeof pObj.description === 'string' ? pObj.description : undefined,
        });
      }

      // Parse OpenAPI 3 requestBody schemas
      if (op.requestBody && typeof op.requestBody === 'object') {
        const rb = op.requestBody as Record<string, unknown>;
        const contentObj = (rb.content || {}) as Record<string, Record<string, unknown>>;
        for (const [cType, mediaType] of Object.entries(contentObj)) {
          const schema = (mediaType?.schema || {}) as Record<string, unknown>;
          if (schema.properties && typeof schema.properties === 'object') {
            for (const [propName, propDef] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
              parameters.push({
                name: propName,
                in: 'body',
                type: String(propDef?.type || 'string'),
                required: Array.isArray(schema.required) ? schema.required.includes(propName) : false,
                description: typeof propDef?.description === 'string' ? propDef.description : undefined,
              });
            }
          }
        }
      }

      // Auth detection
      const hasSecurity = (Array.isArray(op.security) && op.security.length > 0) ||
        (Array.isArray(spec.security) && spec.security.length > 0);

      const contentTypes: string[] = [];
      if (op.requestBody && typeof op.requestBody === 'object') {
        contentTypes.push(...Object.keys((op.requestBody as Record<string, unknown>).content || {}));
      }
      if (contentTypes.length === 0) {
        contentTypes.push('application/json');
      }

      const id = generateEndpointId(baseProtocol, baseHost, basePort, upperMethod, pathKey);

      endpoints.push({
        id,
        protocol: baseProtocol,
        host: baseHost,
        port: basePort,
        path: pathKey,
        method: upperMethod,
        parameters,
        authRequired: hasSecurity,
        contentTypes,
        source: 'openapi',
        rawMetadata: {
          summary: typeof op.summary === 'string' ? op.summary : undefined,
          operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
          tags: Array.isArray(op.tags) ? op.tags : undefined,
        },
      });
    }
  }

  return endpoints;
}

/**
 * 3. HAR (HTTP Archive) Parser
 */
export function parseHarIntake(content: string | Record<string, unknown>): EndpointNode[] {
  let har: Record<string, unknown> | null = null;
  if (typeof content === 'object' && content !== null) {
    har = content;
  } else if (typeof content === 'string') {
    try {
      har = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  if (!har || typeof har !== 'object') return [];
  const log = (har.log || {}) as Record<string, unknown>;
  const entries = Array.isArray(log.entries) ? log.entries : [];

  const endpointMap = new Map<string, EndpointNode>();

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Record<string, unknown>;
    const req = (entry.request || {}) as Record<string, unknown>;
    const rawUrl = String(req.url || '');
    if (!rawUrl) continue;

    try {
      const url = new URL(rawUrl);
      const protocol = (url.protocol.replace(':', '') as ProtocolType) || 'https';
      const host = url.hostname;
      const port = url.port ? parseInt(url.port, 10) : undefined;
      const path = url.pathname || '/';
      const method = (String(req.method || 'GET').toUpperCase()) as HttpMethod;

      const id = generateEndpointId(protocol, host, port, method, path);

      // Check auth headers
      const headers = Array.isArray(req.headers) ? req.headers : [];
      let authRequired = false;
      for (const h of headers) {
        const name = String(h?.name || '').toLowerCase();
        if (name === 'authorization' || name === 'cookie' || name === 'x-api-key') {
          authRequired = true;
          break;
        }
      }

      // Query parameters
      const parameters: ParamSchema[] = [];
      const queryParams = Array.isArray(req.queryString) ? req.queryString : [];
      for (const q of queryParams) {
        const qName = String(q?.name || '');
        if (qName) {
          parameters.push({
            name: qName,
            in: 'query',
            type: 'string',
            required: false,
            defaultValue: q?.value,
          });
        }
      }

      // Post data
      const postData = (req.postData || {}) as Record<string, unknown>;
      const mimeType = String(postData.mimeType || 'application/json');

      if (postData.text && typeof postData.text === 'string' && mimeType.includes('json')) {
        try {
          const bodyObj = JSON.parse(postData.text);
          if (bodyObj && typeof bodyObj === 'object') {
            for (const [bKey, bVal] of Object.entries(bodyObj)) {
              parameters.push({
                name: bKey,
                in: 'body',
                type: typeof bVal,
                required: false,
                defaultValue: bVal,
              });
            }
          }
        } catch {
          // ignore invalid json in postData
        }
      }

      if (endpointMap.has(id)) {
        // Merge parameters & auth
        const existing = endpointMap.get(id)!;
        existing.authRequired = existing.authRequired || authRequired;
        for (const p of parameters) {
          if (!existing.parameters.some((ep) => ep.name === p.name && ep.in === p.in)) {
            existing.parameters.push(p);
          }
        }
      } else {
        endpointMap.set(id, {
          id,
          protocol,
          host,
          port,
          path,
          method,
          parameters,
          authRequired,
          contentTypes: [mimeType],
          source: 'har',
          rawMetadata: { responseStatus: (entry.response as Record<string, unknown>)?.status },
        });
      }
    } catch {
      // ignore malformed URLs
    }
  }

  return Array.from(endpointMap.values());
}

/**
 * 4. Protobuf (.proto) Parser
 */
export function parseProtoIntake(
  protoContent: string,
  defaultHost = 'localhost',
  defaultPort = 50051,
): EndpointNode[] {
  if (!protoContent || typeof protoContent !== 'string') return [];

  const endpoints: EndpointNode[] = [];
  const lines = protoContent.split('\n');

  let pkgName = '';
  let currentService = '';
  const messageFields = new Map<string, ParamSchema[]>();
  let currentMessage = '';

  // Pass 1: Parse packages and messages
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    const pkgMatch = /^package\s+([a-zA-Z0-9_.]+);/.exec(line);
    if (pkgMatch) {
      pkgName = pkgMatch[1] ?? '';
      continue;
    }

    const msgStartMatch = /^message\s+([a-zA-Z0-9_]+)\s*\{/.exec(line);
    if (msgStartMatch) {
      currentMessage = msgStartMatch[1] ?? '';
      messageFields.set(currentMessage, []);
      continue;
    }

    if (currentMessage) {
      if (line.includes('}')) {
        currentMessage = '';
      } else {
        // e.g. string user_id = 1; or repeated int32 tags = 2;
        const fieldMatch = /^(?:optional|required|repeated)?\s*([a-zA-Z0-9_.]+)\s+([a-zA-Z0-9_]+)\s*=\s*\d+;/.exec(line);
        if (fieldMatch) {
          const fType = fieldMatch[1] ?? 'string';
          const fName = fieldMatch[2] ?? '';
          messageFields.get(currentMessage)?.push({
            name: fName,
            in: 'proto_field',
            type: fType,
            required: line.startsWith('required'),
          });
        }
      }
    }
  }

  // Pass 2: Parse services and RPC methods
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    const srvMatch = /^service\s+([a-zA-Z0-9_]+)\s*\{/.exec(line);
    if (srvMatch) {
      currentService = srvMatch[1] ?? '';
      continue;
    }

    if (currentService) {
      if (line.includes('}')) {
        currentService = '';
      } else {
        // rpc Login (LoginRequest) returns (LoginResponse);
        const rpcMatch = /^rpc\s+([a-zA-Z0-9_]+)\s*\(\s*(?:stream\s+)?([a-zA-Z0-9_.]+)\s*\)\s*returns\s*\(\s*(?:stream\s+)?([a-zA-Z0-9_.]+)\s*\)/.exec(line);
        if (rpcMatch) {
          const rpcName = rpcMatch[1] ?? '';
          const reqType = (rpcMatch[2] ?? '').split('.').pop() || '';
          const fullServiceName = pkgName ? `${pkgName}.${currentService}` : currentService;
          const rpcPath = `/${fullServiceName}/${rpcName}`;

          const id = generateEndpointId('grpc', defaultHost, defaultPort, 'POST', rpcPath);
          const params = messageFields.get(reqType) || [];

          endpoints.push({
            id,
            protocol: 'grpc',
            host: defaultHost,
            port: defaultPort,
            path: rpcPath,
            method: 'POST',
            serviceName: fullServiceName,
            rpcName,
            parameters: [...params],
            authRequired: /auth|login|token|admin|secure/i.test(rpcName) || /auth|login/i.test(currentService),
            contentTypes: ['application/grpc', 'application/grpc+proto'],
            source: 'proto',
            rawMetadata: {
              packageName: pkgName,
              service: currentService,
              rpc: rpcName,
              requestType: rpcMatch[2],
              responseType: rpcMatch[3],
            },
          });
        }
      }
    }
  }

  return endpoints;
}

/**
 * 5. Unified Multi-Source Ingestion & Attack Surface Graph Builder
 */
export function buildAttackSurfaceGraph(input: IntakeInput): AttackSurfaceGraph {
  const allNodes: EndpointNode[] = [];
  const sourcesSummary: AttackSurfaceMetadata['intakeSources'] = [];

  // Parse URL
  if (input.targetUrl) {
    const urlNodes = parseUrlIntake(input.targetUrl);
    allNodes.push(...urlNodes);
    sourcesSummary.push({
      type: 'url',
      sourceName: input.targetUrl,
      endpointCount: urlNodes.length,
    });
  }

  // Parse OpenAPI
  if (input.openapiContent) {
    const openapiNodes = parseOpenApiIntake(input.openapiContent);
    allNodes.push(...openapiNodes);
    sourcesSummary.push({
      type: 'openapi',
      sourceName: input.rawName || 'openapi_spec',
      endpointCount: openapiNodes.length,
    });
  }

  // Parse HAR
  if (input.harContent) {
    const harNodes = parseHarIntake(input.harContent);
    allNodes.push(...harNodes);
    sourcesSummary.push({
      type: 'har',
      sourceName: input.rawName || 'network_archive',
      endpointCount: harNodes.length,
    });
  }

  // Parse Proto
  if (input.protoContent) {
    const protoNodes = parseProtoIntake(input.protoContent);
    allNodes.push(...protoNodes);
    sourcesSummary.push({
      type: 'proto',
      sourceName: input.protoFilename || 'service.proto',
      endpointCount: protoNodes.length,
    });
  }

  // Deduplicate nodes by ID
  const nodeMap = new Map<string, EndpointNode>();
  for (const node of allNodes) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, { ...node, parameters: [...node.parameters] });
    } else {
      const existing = nodeMap.get(node.id)!;
      // Merge parameters
      for (const p of node.parameters) {
        if (!existing.parameters.some((ep) => ep.name === p.name && ep.in === p.in)) {
          existing.parameters.push(p);
        }
      }
      // Merge contentTypes
      for (const ct of node.contentTypes) {
        if (!existing.contentTypes.includes(ct)) {
          existing.contentTypes.push(ct);
        }
      }
      existing.authRequired = existing.authRequired || node.authRequired;
    }
  }

  const nodes = Array.from(nodeMap.values());

  // Generate relationship edges (auth dependencies, data flows)
  const edges: GraphEdge[] = [];
  const authNodes = nodes.filter((n) => /login|auth|token|session|oauth/i.test(n.path) && n.method === 'POST');
  const protectedNodes = nodes.filter((n) => n.authRequired && !authNodes.some((an) => an.id === n.id));

  for (const aNode of authNodes) {
    for (const pNode of protectedNodes) {
      edges.push({
        from: aNode.id,
        to: pNode.id,
        relationship: 'auth_dependency',
      });
    }
  }

  // Compute metadata summary
  let totalParams = 0;
  let authCount = 0;
  const protocolSet = new Set<ProtocolType>();

  for (const node of nodes) {
    totalParams += node.parameters.length;
    if (node.authRequired) authCount++;
    protocolSet.add(node.protocol);
  }

  const metadata: AttackSurfaceMetadata = {
    title: input.rawName || (input.targetUrl ? `Surface for ${input.targetUrl}` : 'Attack Surface Graph'),
    totalEndpoints: nodes.length,
    totalParams,
    protocols: Array.from(protocolSet),
    authCoverage: {
      authenticated: authCount,
      public: nodes.length - authCount,
    },
    intakeSources: sourcesSummary,
    generatedAt: new Date().toISOString(),
  };

  return {
    id: `asg_${hashString(JSON.stringify({ count: nodes.length, date: metadata.generatedAt }))}`,
    targetUrl: input.targetUrl,
    nodes,
    edges,
    metadata,
  };
}
