import { describe, it, expect } from 'vitest';
import {
  isEndpointAllowed,
  executeBoundedActiveScan,
  executeGrpcAnalysis,
} from './boundedExecutor';
import { buildAttackSurfaceGraph } from './intakeParser';
import { DEFAULT_ACTIVE_SCAN_POLICY } from './types';

describe('PK-BL-3: Bounded Active & gRPC Executor', () => {
  it('filters out disallowed methods and excluded path patterns', () => {
    const policy = {
      ...DEFAULT_ACTIVE_SCAN_POLICY,
      allowedMethods: ['GET' as const, 'POST' as const],
      excludePathPatterns: ['/logout', '/admin/wipe'],
    };

    const graph = buildAttackSurfaceGraph({
      openapiContent: {
        openapi: '3.0.0',
        paths: {
          '/users': {
            get: {},
            delete: {},
          },
          '/auth/logout': {
            post: {},
          },
        },
      },
    });

    const getEp = graph.nodes.find((n) => n.path === '/users' && n.method === 'GET')!;
    const delEp = graph.nodes.find((n) => n.path === '/users' && n.method === 'DELETE')!;
    const logoutEp = graph.nodes.find((n) => n.path === '/auth/logout' && n.method === 'POST')!;

    expect(isEndpointAllowed(getEp, policy).allowed).toBe(true);
    expect(isEndpointAllowed(delEp, policy).allowed).toBe(false);
    expect(isEndpointAllowed(logoutEp, policy).allowed).toBe(false);
  });

  it('respects request budget and concurrency in active scan', async () => {
    const graph = buildAttackSurfaceGraph({
      openapiContent: {
        openapi: '3.0.0',
        paths: {
          '/p1': { get: {} },
          '/p2': { get: {} },
          '/p3': { get: {} },
          '/p4': { get: {} },
          '/p5': { get: {} },
        },
      },
    });

    const policy = {
      ...DEFAULT_ACTIVE_SCAN_POLICY,
      concurrency: 2,
      maxRequestsBudget: 3, // Bound to 3 requests
    };

    const summary = await executeBoundedActiveScan(graph, policy);
    expect(summary.totalRequests).toBeLessThanOrEqual(3);
    expect(summary.totalProbed).toBeLessThanOrEqual(3);
  });

  it('executes gRPC analysis on proto endpoints', async () => {
    const proto = `
      syntax = "proto3";
      package secops.admin;
      service AdminService {
        rpc DeleteUser (DeleteUserRequest) returns (DeleteUserResponse);
      }
      message DeleteUserRequest {
        string user_id = 1;
        string admin_password = 2;
      }
      message DeleteUserResponse {}
    `;

    const graph = buildAttackSurfaceGraph({ protoContent: proto });
    const summary = await executeGrpcAnalysis(graph, DEFAULT_ACTIVE_SCAN_POLICY);

    expect(summary.probedCount).toBe(1);
    expect(summary.findings.length).toBeGreaterThanOrEqual(1);
    expect(summary.findings.some((f) => f.checkType === 'grpc-auth-interceptor')).toBe(true);
  });
});
