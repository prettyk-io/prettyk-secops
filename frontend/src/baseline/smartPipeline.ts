/**
 * PK-BL-2: Smart Baseline Pipeline
 * 
 * Orchestrates 6 baseline security phases with durable state machine,
 * idempotency, lease renewal, and event broadcasting.
 */

import type {
  ActiveScanPolicy,
  AttackSurfaceGraph,
  BaselineLogEntry,
  BaselinePhase,
  BaselineRunRecord,
  BaselineRunStatus,
  FindingRecord,
  IntakeInput,
} from './types';
import { BASELINE_PHASE_ORDER, DEFAULT_ACTIVE_SCAN_POLICY } from './types';
import { buildAttackSurfaceGraph } from './intakeParser';

export type PipelineEventListener = (event: {
  type: string;
  runId: string;
  phase?: BaselinePhase;
  data?: unknown;
}) => void;

export class SmartBaselinePipelineStore {
  private runs = new Map<string, BaselineRunRecord>();
  private idempotencyMap = new Map<string, string>(); // idempotencyKey -> runId
  private listeners: PipelineEventListener[] = [];
  private storageKey = 'pk.baseline.runs.v1';

  constructor(enablePersistence = false) {
    if (enablePersistence && typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (raw) {
          const arr: BaselineRunRecord[] = JSON.parse(raw);
          for (const r of arr) {
            this.runs.set(r.runId, r);
            if (r.idempotencyKey) {
              this.idempotencyMap.set(r.idempotencyKey, r.runId);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  public subscribe(fn: PipelineEventListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(type: string, runId: string, phase?: BaselinePhase, data?: unknown) {
    for (const l of this.listeners) {
      try {
        l({ type, runId, phase, data });
      } catch {
        // ignore subscriber errors
      }
    }
  }

  public getRun(runId: string): BaselineRunRecord | undefined {
    return this.runs.get(runId);
  }

  public listRuns(): BaselineRunRecord[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public getByIdempotencyKey(key: string): BaselineRunRecord | undefined {
    const runId = this.idempotencyMap.get(key);
    return runId ? this.runs.get(runId) : undefined;
  }

  /**
   * Creates or returns existing run by idempotency key.
   */
  public createRun(
    target: IntakeInput,
    policy: Partial<ActiveScanPolicy> = {},
    idempotencyKey?: string,
    leaseOwner = 'worker-main',
  ): { run: BaselineRunRecord; isNew: boolean } {
    const key = idempotencyKey || `idem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Idempotency check: if running or succeeded, reuse
    const existingId = this.idempotencyMap.get(key);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing && (existing.status === 'running' || existing.status === 'succeeded' || existing.status === 'queued')) {
        return { run: existing, isNew: false };
      }
    }

    const runId = `bl_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullPolicy: ActiveScanPolicy = { ...DEFAULT_ACTIVE_SCAN_POLICY, ...policy };

    const run: BaselineRunRecord = {
      runId,
      idempotencyKey: key,
      status: 'pending',
      currentPhase: 'intake-parsing',
      progressPercent: 0,
      leaseOwner,
      leaseExpiresAt: Date.now() + 30000, // 30s lease
      createdAt: new Date().toISOString(),
      target,
      policy: fullPolicy,
      findings: [],
      logs: [],
    };

    this.runs.set(runId, run);
    this.idempotencyMap.set(key, runId);
    this.notify('run_created', runId, 'intake-parsing', run);
    return { run, isNew: true };
  }

  /**
   * Lease renewal
   */
  public renewLease(runId: string, owner: string, extensionMs = 30000): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    if (run.leaseOwner && run.leaseOwner !== owner && (run.leaseExpiresAt ?? 0) > Date.now()) {
      return false; // Owned by active lease
    }
    run.leaseOwner = owner;
    run.leaseExpiresAt = Date.now() + extensionMs;
    return true;
  }

  /**
   * Stale runs recovery
   */
  public recoverStaleRuns(maxAgeMs = 45000): string[] {
    const recovered: string[] = [];
    const now = Date.now();
    for (const [id, run] of this.runs.entries()) {
      if ((run.status === 'running' || run.status === 'queued') && (run.leaseExpiresAt ?? 0) < now) {
        run.status = 'failed';
        run.error = 'Execution lease expired (stale worker)';
        run.finishedAt = new Date().toISOString();
        run.logs.push({
          timestamp: new Date().toISOString(),
          phase: run.currentPhase,
          level: 'error',
          message: 'Lease expired without renewal. Run marked failed by recovery reaper.',
        });
        recovered.push(id);
        this.notify('run_stale_failed', id, run.currentPhase);
      }
    }
    return recovered;
  }

  /**
   * Log appender
   */
  public addLog(
    runId: string,
    phase: BaselinePhase,
    level: BaselineLogEntry['level'],
    message: string,
    data?: Record<string, unknown>,
  ) {
    const run = this.runs.get(runId);
    if (!run) return;
    const log: BaselineLogEntry = {
      timestamp: new Date().toISOString(),
      phase,
      level,
      message,
      data,
    };
    run.logs.push(log);
    this.notify('log_emitted', runId, phase, log);
  }

  /**
   * Update run phase and progress
   */
  public setPhase(runId: string, phase: BaselinePhase, progressPercent: number) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.currentPhase = phase;
    run.progressPercent = Math.min(100, Math.max(0, progressPercent));
    this.notify('phase_updated', runId, phase, { progressPercent: run.progressPercent });
  }

  /**
   * Add findings to run
   */
  public addFindings(runId: string, newFindings: FindingRecord[]) {
    const run = this.runs.get(runId);
    if (!run) return;
    for (const f of newFindings) {
      if (!run.findings.some((ef) => ef.canonicalKey === f.canonicalKey)) {
        run.findings.push(f);
        this.notify('finding_yielded', runId, run.currentPhase, f);
      }
    }
  }

  /**
   * Complete run
   */
  public completeRun(runId: string, status: 'succeeded' | 'failed' | 'cancelled', error?: string) {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = status;
    run.finishedAt = new Date().toISOString();
    run.progressPercent = status === 'succeeded' ? 100 : run.progressPercent;
    if (error) run.error = error;
    this.notify('run_completed', runId, run.currentPhase, { status, error });
  }
}

/**
 * Executes default passive security rules on parsed Attack Surface Graph
 */
export function executePassiveAnalysis(graph: AttackSurfaceGraph): FindingRecord[] {
  const findings: FindingRecord[] = [];

  for (const node of graph.nodes) {
    // Check 1: Insecure HTTP Protocol
    if (node.protocol === 'http' && node.host !== 'localhost' && node.host !== '127.0.0.1') {
      const canonicalKey = `passive:insecure-transport:${node.method}:${node.path}`;
      findings.push({
        id: `fnd_${Math.random().toString(36).substring(2, 8)}`,
        canonicalKey,
        severity: 'MEDIUM',
        title: 'Cleartext HTTP Insecure Transport',
        description: `Endpoint ${node.method} ${node.path} uses unencrypted HTTP protocol. Sensitive credentials may be intercepted.`,
        endpointPath: node.path,
        method: node.method,
        checkType: 'passive-transport-security',
        cwe: 'CWE-319',
        remediation: 'Enforce HTTPS and implement HSTS header with max-age >= 31536000.',
      });
    }

    // Check 2: Unauthenticated Sensitive Endpoint
    if (/admin|manage|config|secret|internal|debug|actuator|metrics/i.test(node.path) && !node.authRequired) {
      const canonicalKey = `passive:unauth-sensitive:${node.method}:${node.path}`;
      findings.push({
        id: `fnd_${Math.random().toString(36).substring(2, 8)}`,
        canonicalKey,
        severity: 'HIGH',
        title: 'Potentially Unprotected Sensitive Endpoint',
        description: `Administrative or management endpoint ${node.method} ${node.path} lacks explicit authentication controls.`,
        endpointPath: node.path,
        method: node.method,
        checkType: 'passive-auth-policy',
        cwe: 'CWE-306',
        remediation: 'Require authentication and RBAC authorization headers before accessing management endpoints.',
      });
    }

    // Check 3: Sensitive Parameters in GET Query
    if (node.method === 'GET') {
      const sensitiveParam = node.parameters.find((p) =>
        /password|secret|token|api_key|apikey|private_key|credit_card|cvv/i.test(p.name),
      );
      if (sensitiveParam) {
        const canonicalKey = `passive:sensitive-query-param:${node.path}:${sensitiveParam.name}`;
        findings.push({
          id: `fnd_${Math.random().toString(36).substring(2, 8)}`,
          canonicalKey,
          severity: 'HIGH',
          title: 'Sensitive Data Exposed in GET Query Parameters',
          description: `Parameter '${sensitiveParam.name}' on ${node.path} appears in query strings, risking exposure via browser history and server logs.`,
          endpointPath: node.path,
          method: 'GET',
          paramName: sensitiveParam.name,
          checkType: 'passive-sensitive-params',
          cwe: 'CWE-598',
          remediation: 'Transmit credentials and sensitive data inside POST/PUT request bodies with TLS encryption.',
        });
      }
    }
  }

  return findings;
}
