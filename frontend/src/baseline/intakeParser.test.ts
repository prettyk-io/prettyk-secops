import { describe, it, expect } from 'vitest';
import {
  parseUrlIntake,
  parseOpenApiIntake,
  parseHarIntake,
  parseProtoIntake,
  buildAttackSurfaceGraph,
  generateEndpointId,
} from './intakeParser';

describe('PK-BL-1: Multi-Source Intake Parser', () => {
  it('parses plain URL with query params', () => {
    const endpoints = parseUrlIntake('https://demo.juice-shop.opencode/api/v1/search?q=apple&limit=10');
    expect(endpoints).toHaveLength(1);
    const ep = endpoints[0]!;
    expect(ep.host).toBe('demo.juice-shop.opencode');
    expect(ep.path).toBe('/api/v1/search');
    expect(ep.method).toBe('GET');
    expect(ep.parameters).toHaveLength(2);
    expect(ep.parameters.find((p) => p.name === 'q')?.defaultValue).toBe('apple');
  });

  it('parses OpenAPI 3.0 spec JSON with paths, parameters, and security', () => {
    const openapiSpec = {
      openapi: '3.0.0',
      servers: [{ url: 'https://api.secops.local/v1' }],
      paths: {
        '/users/{userId}': {
          get: {
            summary: 'Get user profile',
            parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
            security: [{ bearerAuth: [] }],
          },
          delete: {
            summary: 'Delete user',
            security: [{ bearerAuth: [] }],
          },
        },
        '/auth/login': {
          post: {
            summary: 'Login endpoint',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                      username: { type: 'string' },
                      password: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const endpoints = parseOpenApiIntake(openapiSpec);
    expect(endpoints).toHaveLength(3);

    const getEp = endpoints.find((e) => e.path === '/users/{userId}' && e.method === 'GET');
    expect(getEp).toBeDefined();
    expect(getEp?.authRequired).toBe(true);
    expect(getEp?.parameters.some((p) => p.name === 'userId' && p.in === 'path')).toBe(true);

    const loginEp = endpoints.find((e) => e.path === '/auth/login' && e.method === 'POST');
    expect(loginEp).toBeDefined();
    expect(loginEp?.parameters.length).toBe(2);
    expect(loginEp?.parameters.find((p) => p.name === 'username')?.required).toBe(true);
  });

  it('parses HAR network logs and merges repeated endpoints', () => {
    const harData = {
      log: {
        entries: [
          {
            request: {
              method: 'GET',
              url: 'http://localhost:3000/rest/products/search?q=banana',
              queryString: [{ name: 'q', value: 'banana' }],
              headers: [{ name: 'User-Agent', value: 'Browser' }],
            },
            response: { status: 200 },
          },
          {
            request: {
              method: 'GET',
              url: 'http://localhost:3000/rest/products/search?q=orange&category=fruits',
              queryString: [
                { name: 'q', value: 'orange' },
                { name: 'category', value: 'fruits' },
              ],
              headers: [{ name: 'Authorization', value: 'Bearer token123' }],
            },
            response: { status: 200 },
          },
        ],
      },
    };

    const endpoints = parseHarIntake(harData);
    expect(endpoints).toHaveLength(1);
    const ep = endpoints[0]!;
    expect(ep.path).toBe('/rest/products/search');
    expect(ep.authRequired).toBe(true);
    expect(ep.parameters.map((p) => p.name).sort()).toEqual(['category', 'q']);
  });

  it('parses Protobuf .proto files into gRPC endpoint nodes', () => {
    const protoContent = `
      syntax = "proto3";
      package secops.auth.v1;

      message LoginRequest {
        string username = 1;
        string password = 2;
        string mfa_token = 3;
      }

      message LoginResponse {
        string jwt_token = 1;
      }

      message UserProfileRequest {
        string user_id = 1;
      }

      service AuthService {
        rpc Login (LoginRequest) returns (LoginResponse);
        rpc GetProfile (UserProfileRequest) returns (LoginResponse);
      }
    `;

    const endpoints = parseProtoIntake(protoContent, 'grpc.secops.local', 50051);
    expect(endpoints).toHaveLength(2);

    const loginRpc = endpoints.find((e) => e.rpcName === 'Login');
    expect(loginRpc).toBeDefined();
    expect(loginRpc?.protocol).toBe('grpc');
    expect(loginRpc?.serviceName).toBe('secops.auth.v1.AuthService');
    expect(loginRpc?.path).toBe('/secops.auth.v1.AuthService/Login');
    expect(loginRpc?.parameters.length).toBe(3);
    expect(loginRpc?.parameters.map((p) => p.name)).toEqual(['username', 'password', 'mfa_token']);
  });

  it('merges multi-source intake into unified Attack Surface Graph with auth dependency edges', () => {
    const graph = buildAttackSurfaceGraph({
      targetUrl: 'https://app.target.com/api/v1/health',
      openapiContent: {
        openapi: '3.0.0',
        servers: [{ url: 'https://app.target.com/api/v1' }],
        paths: {
          '/auth/token': {
            post: { summary: 'Generate Token' },
          },
          '/admin/metrics': {
            get: {
              summary: 'Admin Metrics',
              security: [{ apiKey: [] }],
            },
          },
        },
      },
    });

    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.metadata.totalEndpoints).toBe(graph.nodes.length);
    expect(graph.metadata.authCoverage.authenticated).toBeGreaterThanOrEqual(1);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    expect(graph.edges[0]?.relationship).toBe('auth_dependency');
  });
});
