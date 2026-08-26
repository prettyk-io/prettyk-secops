/**
 * PK-BL-5: Baseline REST & SSE API Client + Stream Engine
 * 
 * Provides end-to-end execution of baseline pipeline, REST handlers,
 * SSE event streaming, and typed client SDK.
 */

import type {
  ActiveScanPolicy,
  BaselinePhase,
  BaselineRunRecord,
  BaselineStreamEvent,
  DeltaLedger,
  FindingRecord,
  IntakeInput,
} from './types';
import { SmartBaselinePipelineStore, executePassiveAnalysis } from './smartPipeline';
import { buildAttackSurfaceGraph } from './intakeParser';
import { executeBoundedActiveScan, executeGrpcAnalysis } from './boundedExecutor';
import { computeDeltaLedger } from './deltaLedger';

export interface ExecuteBaselineOptions {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  previousBaselineRunId?: string;
  onEvent?: (event: BaselineStreamEvent) => void;
}

/**
 * Executes the complete 6-phase baseline security pipeline for a run.
 */
export async function executeBaselinePipeline(
  runId: string,
  store: SmartBaselinePipelineStore,
  options: ExecuteBaselineOptions = {},
): Promise<BaselineRunRecord> {
  const run = store.getRun(runId);
  if (!run) {
    throw new Error(`Baseline run '${runId}' not found in store.`);
  }

  const broadcast = (type: BaselineStreamEvent['type'], payload: unknown) => {
    const ev: BaselineStreamEvent = {
      type,
      runId,
      timestamp: new Date().toISOString(),
      payload,
    };
    options.onEvent?.(ev);
  };

  run.status = 'running';
  run.startedAt = new Date().toISOString();
  broadcast('phase_started', { phase: 'intake-parsing', progress: 0 });

  try {
    // ----------------------------------------------------
    // Phase 1: intake-parsing (0% -> 20%)
    // ----------------------------------------------------
    store.setPhase(runId, 'intake-parsing', 10);
    store.addLog(runId, 'intake-parsing', 'info', 'Parsing intake sources into Attack Surface Graph...');

    const graph = buildAttackSurfaceGraph(run.target);
    run.graph = graph;
    broadcast('endpoint_discovered', { totalEndpoints: graph.nodes.length, nodes: graph.nodes });
    store.addLog(runId, 'intake-parsing', 'info', `Discovered ${graph.nodes.length} endpoints across ${graph.metadata.protocols.join(', ')}.`);
    store.setPhase(runId, 'intake-parsing', 20);
    broadcast('phase_completed', { phase: 'intake-parsing' });

    // ----------------------------------------------------
    // Phase 2: auth-discovery (20% -> 35%)
    // ----------------------------------------------------
    store.setPhase(runId, 'auth-discovery', 25);
    broadcast('phase_started', { phase: 'auth-discovery', progress: 25 });
    store.addLog(runId, 'auth-discovery', 'info', 'Evaluating authentication mechanisms and dependencies...');

    const authEndpoints = graph.nodes.filter((n) => /login|auth|oauth|token/i.test(n.path));
    store.addLog(
      runId,
      'auth-discovery',
      'info',
      `Identified ${authEndpoints.length} auth endpoints. Coverage: ${graph.metadata.authCoverage.authenticated} protected, ${graph.metadata.authCoverage.public} public.`,
    );
    store.setPhase(runId, 'auth-discovery', 35);
    broadcast('phase_completed', { phase: 'auth-discovery' });

    // ----------------------------------------------------
    // Phase 3: passive-analysis (35% -> 55%)
    // ----------------------------------------------------
    store.setPhase(runId, 'passive-analysis', 40);
    broadcast('phase_started', { phase: 'passive-analysis', progress: 40 });
    store.addLog(runId, 'passive-analysis', 'info', 'Executing passive security rules on graph nodes...');

    const passiveFindings = executePassiveAnalysis(graph);
    store.addFindings(runId, passiveFindings);
    for (const pf of passiveFindings) {
      broadcast('finding_yielded', pf);
    }
    store.addLog(runId, 'passive-analysis', 'info', `Passive analysis yielded ${passiveFindings.length} findings.`);
    store.setPhase(runId, 'passive-analysis', 55);
    broadcast('phase_completed', { phase: 'passive-analysis' });

    // ----------------------------------------------------
    // Phase 4: bounded-active (55% -> 75%)
    // ----------------------------------------------------
    store.setPhase(runId, 'bounded-active', 60);
    broadcast('phase_started', { phase: 'bounded-active', progress: 60 });
    store.addLog(
      runId,
      'bounded-active',
      'info',
      `Running bounded active probes (budget=${run.policy.maxRequestsBudget}, concurrency=${run.policy.concurrency})...`,
    );

    const activeSummary = await executeBoundedActiveScan(graph, run.policy, options.fetchFn);
    store.addFindings(runId, activeSummary.findings);
    for (const af of activeSummary.findings) {
      broadcast('finding_yielded', af);
    }
    store.addLog(
      runId,
      'bounded-active',
      'info',
      `Active scan finished: ${activeSummary.totalProbed} probed, ${activeSummary.totalSkipped} skipped, ${activeSummary.findings.length} findings.`,
    );
    store.setPhase(runId, 'bounded-active', 75);
    broadcast('phase_completed', { phase: 'bounded-active' });

    // ----------------------------------------------------
    // Phase 5: grpc-analysis (75% -> 90%)
    // ----------------------------------------------------
    store.setPhase(runId, 'grpc-analysis', 80);
    broadcast('phase_started', { phase: 'grpc-analysis', progress: 80 });
    store.addLog(runId, 'grpc-analysis', 'info', 'Executing gRPC proto inspection and reflection probes...');

    const grpcSummary = await executeGrpcAnalysis(graph, run.policy);
    store.addFindings(runId, grpcSummary.findings);
    for (const gf of grpcSummary.findings) {
      broadcast('finding_yielded', gf);
    }
    store.addLog(runId, 'grpc-analysis', 'info', `gRPC analysis completed on ${grpcSummary.probedCount} RPC methods.`);
    store.setPhase(runId, 'grpc-analysis', 90);
    broadcast('phase_completed', { phase: 'grpc-analysis' });

    // ----------------------------------------------------
    // Phase 6: delta-synthesis (90% -> 100%)
    // ----------------------------------------------------
    store.setPhase(runId, 'delta-synthesis', 95);
    broadcast('phase_started', { phase: 'delta-synthesis', progress: 95 });
    store.addLog(runId, 'delta-synthesis', 'info', 'Synthesizing delta ledger against previous baseline run...');

    let previousRunFindings: FindingRecord[] = [];
    if (options.previousBaselineRunId) {
      const prev = store.getRun(options.previousBaselineRunId);
      if (prev) previousRunFindings = prev.findings;
    }

    const ledger = computeDeltaLedger(
      runId,
      run.findings,
      options.previousBaselineRunId ? { runId: options.previousBaselineRunId, findings: previousRunFindings, timestamp: '' } : undefined,
    );
    run.ledger = ledger;

    store.completeRun(runId, 'succeeded');
    store.addLog(
      runId,
      'delta-synthesis',
      'info',
      `Delta ledger synthesized: ${ledger.summary.newCount} new, ${ledger.summary.resolvedCount} resolved, ${ledger.summary.persistentCount} persistent.`,
    );
    broadcast('run_completed', { runId, status: 'succeeded', ledger: run.ledger, totalFindings: run.findings.length });
    return run;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.completeRun(runId, 'failed', msg);
    store.addLog(runId, run.currentPhase, 'error', `Pipeline failed with error: ${msg}`);
    broadcast('run_failed', { runId, error: msg });
    throw err;
  }
}

/**
 * Server REST Handlers
 */
export function handleStartBaseline(
  body: {
    target?: IntakeInput;
    policy?: Partial<ActiveScanPolicy>;
    idempotencyKey?: string;
    previousBaselineRunId?: string;
  },
  store: SmartBaselinePipelineStore,
  options: ExecuteBaselineOptions = {},
): { runId: string; idempotencyKey: string; status: string; isNew: boolean } {
  const target: IntakeInput = body.target || {};
  const { run, isNew } = store.createRun(target, body.policy, body.idempotencyKey);

  if (isNew) {
    // Start asynchronous execution in background
    executeBaselinePipeline(run.runId, store, {
      ...options,
      previousBaselineRunId: body.previousBaselineRunId,
    }).catch(() => {
      // Handled inside executeBaselinePipeline
    });
  }

  return {
    runId: run.runId,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    isNew,
  };
}

export function handleGetBaselineStatus(
  runId: string,
  store: SmartBaselinePipelineStore,
): BaselineRunRecord | null {
  return store.getRun(runId) || null;
}

export function handleGetBaselineLedger(
  runId: string,
  store: SmartBaselinePipelineStore,
): DeltaLedger | null {
  const run = store.getRun(runId);
  return run?.ledger || null;
}

/**
 * Formats a BaselineStreamEvent as SSE wire format
 */
export function formatSseEvent(event: BaselineStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Typed Baseline API Client for Frontend/Workbench
 */
export class BaselineApiClient {
  constructor(private store: SmartBaselinePipelineStore) {}

  public async startBaseline(
    target: IntakeInput,
    policy?: Partial<ActiveScanPolicy>,
    idempotencyKey?: string,
    previousBaselineRunId?: string,
  ) {
    return handleStartBaseline({ target, policy, idempotencyKey, previousBaselineRunId }, this.store);
  }

  public async getStatus(runId: string): Promise<BaselineRunRecord | null> {
    return handleGetBaselineStatus(runId, this.store);
  }

  public async getLedger(runId: string): Promise<DeltaLedger | null> {
    return handleGetBaselineLedger(runId, this.store);
  }

  public subscribeStream(runId: string, onEvent: (ev: BaselineStreamEvent) => void): () => void {
    return this.store.subscribe((e) => {
      if (e.runId === runId) {
        onEvent({
          type: e.type as any,
          runId: e.runId,
          timestamp: new Date().toISOString(),
          payload: e.data,
        });
      }
    });
  }
}
