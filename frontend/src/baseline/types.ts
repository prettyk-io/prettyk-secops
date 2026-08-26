/**
 * PRETTYK-BASELINE (PK-BL) — Canonical Data Contracts & Type Definitions
 * 
 * Provides domain models for:
 * 1. Multi-Source Intake Parsing & Attack Surface Graph (PK-BL-1)
 * 2. Smart Baseline Pipeline with 6 phases & durable state (PK-BL-2)
 * 3. Bounded Active Scan Policy & gRPC Execution (PK-BL-3)
 * 4. Baseline Delta Ledger Engine (PK-BL-4)
 * 5. REST & SSE Stream Protocol (PK-BL-5)
 */

export type ProtocolType = 'http' | 'https' | 'grpc' | 'ws' | 'wss';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type ParamLocation = 'query' | 'path' | 'header' | 'body' | 'cookie' | 'proto_field';

export interface ParamSchema {
  name: string;
  in: ParamLocation;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export type IntakeSourceType = 'url' | 'openapi' | 'har' | 'proto';

export interface EndpointNode {
  id: string;
  protocol: ProtocolType;
  host: string;
  port?: number;
  path: string;
  method: HttpMethod | string; // HTTP method or gRPC method
  serviceName?: string; // For gRPC or RPC services
  rpcName?: string; // For gRPC unary/streaming
  parameters: ParamSchema[];
  authRequired: boolean;
  contentTypes: string[];
  source: IntakeSourceType;
  rawMetadata?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string; // endpoint node ID
  to: string; // endpoint node ID
  relationship: 'auth_dependency' | 'sequence' | 'data_flow';
}

export interface AttackSurfaceMetadata {
  title?: string;
  version?: string;
  totalEndpoints: number;
  totalParams: number;
  protocols: ProtocolType[];
  authCoverage: {
    authenticated: number;
    public: number;
  };
  intakeSources: {
    type: IntakeSourceType;
    sourceName?: string;
    endpointCount: number;
  }[];
  generatedAt: string;
}

export interface AttackSurfaceGraph {
  id: string;
  targetUrl?: string;
  nodes: EndpointNode[];
  edges: GraphEdge[];
  metadata: AttackSurfaceMetadata;
}

export interface IntakeInput {
  targetUrl?: string;
  openapiContent?: string | Record<string, unknown>;
  harContent?: string | Record<string, unknown>;
  protoContent?: string;
  protoFilename?: string;
  rawName?: string;
}

export interface ActiveScanPolicy {
  allowedMethods: HttpMethod[];
  concurrency: number;
  maxRequestsBudget: number;
  maxDurationSeconds: number;
  rateLimitPerSecond: number;
  excludePathPatterns: string[];
  enableGrpc: boolean;
  enablePassiveOnly: boolean;
  headers: Record<string, string>;
  authProfileId?: string;
  timeoutMs: number;
}

export const DEFAULT_ACTIVE_SCAN_POLICY: ActiveScanPolicy = {
  allowedMethods: ['GET', 'POST'],
  concurrency: 4,
  maxRequestsBudget: 120,
  maxDurationSeconds: 60,
  rateLimitPerSecond: 10,
  excludePathPatterns: ['/logout', '/delete', '/destroy', '/admin/wipe'],
  enableGrpc: true,
  enablePassiveOnly: false,
  headers: {
    'User-Agent': 'PrettyK-Baseline-Scanner/1.0',
    'X-PrettyK-Audit': 'baseline-passive-active',
  },
  timeoutMs: 5000,
};

export type BaselinePhase =
  | 'intake-parsing'
  | 'auth-discovery'
  | 'passive-analysis'
  | 'bounded-active'
  | 'grpc-analysis'
  | 'delta-synthesis';

export const BASELINE_PHASE_ORDER: readonly BaselinePhase[] = [
  'intake-parsing',
  'auth-discovery',
  'passive-analysis',
  'bounded-active',
  'grpc-analysis',
  'delta-synthesis',
] as const;

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface FindingRecord {
  id: string;
  canonicalKey: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  endpointPath: string;
  method: string;
  serviceName?: string;
  checkType: string;
  evidence?: string;
  paramName?: string;
  cwe?: string;
  remediation?: string;
}

export type DeltaItemStatus = 'new' | 'resolved' | 'persistent' | 'regressed';

export interface DeltaItem {
  canonicalKey: string;
  status: DeltaItemStatus;
  currentFinding?: FindingRecord;
  previousFinding?: FindingRecord;
  firstSeenRunId: string;
  lastSeenRunId: string;
  occurrenceCount: number;
}

export interface DeltaSummary {
  totalCurrent: number;
  totalPrevious: number;
  newCount: number;
  resolvedCount: number;
  persistentCount: number;
  regressedCount: number;
  criticalDiff: number;
  highDiff: number;
  riskScoreDiff: number;
}

export interface DeltaLedger {
  runId: string;
  baselineRunId?: string;
  generatedAt: string;
  summary: DeltaSummary;
  items: DeltaItem[];
}

export type BaselineRunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface BaselineLogEntry {
  timestamp: string;
  phase: BaselinePhase;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

export interface BaselineRunRecord {
  runId: string;
  idempotencyKey: string;
  status: BaselineRunStatus;
  currentPhase: BaselinePhase;
  progressPercent: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  target: IntakeInput;
  policy: ActiveScanPolicy;
  graph?: AttackSurfaceGraph;
  findings: FindingRecord[];
  ledger?: DeltaLedger;
  logs: BaselineLogEntry[];
  error?: string;
}

export type BaselineStreamEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'endpoint_discovered'
  | 'finding_yielded'
  | 'log_emitted'
  | 'run_completed'
  | 'run_failed';

export interface BaselineStreamEvent {
  type: BaselineStreamEventType;
  runId: string;
  timestamp: string;
  payload: unknown;
}
