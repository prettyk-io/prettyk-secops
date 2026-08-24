/**
 * PRETTYK-CI — Run Engine (PK-CI-2). СИГНАЛ ФЛЕШУ: контракт run-state.
 *
 * Честная state machine + idempotency + retry без дублей + lease recovery.
 *
 *   import { createRunEngine } from '@/ci/runEngine';
 *   const engine = createRunEngine(storage);
 *
 *   // Flash (Run Console / evidence / debugger) потребляет:
 *   engine.createRun(...)          — идемпотентно (один intent → один run)
 *   engine.transition(runId, evt)  — честный переход
 *   engine.retry(runId)            — новый attempt, без дублей findings/evidence
 *   engine.recordFinding(...)      — dedup по identity
 *   engine.recordEvidence(...)     — dedup по identity
 *   engine.recoverStale()          — lease recovery → retryable/failed
 */
import type { KVStorage } from './storage';
import { createStorage } from './storage';
import { nextState, canTransition, isTerminal } from './stateMachine';
import type {
  RunState,
  RunEvent,
  RunRecord,
  PipelineDefinition,
  PolicyRef,
  FindingRecord,
  EvidenceRecord,
  DedupRecord,
  TransitionResult,
} from './types';

const RUN_PREFIX = 'pk.ci.run.';
const FINDING_PREFIX = 'pk.ci.finding.';
const EVIDENCE_PREFIX = 'pk.ci.evidence.';

// ═══════════════════════════════════════════════════════════════════════════
// ID / correlation helpers
// ═══════════════════════════════════════════════════════════════════════════

let counter = 0;

function nextId(): string {
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const seq = counter.toString(36);
  return `run_${time}_${rand}_${seq}`;
}

export interface IdempotencySource {
  /** Стабильный ключ интента: pipelineId + входы + target. */
  key: string;
}

export function idempotencyKeyOf(pipelineId: string, inputs: Record<string, string>, targetId: string): string {
  const canonical = Object.keys(inputs).sort().map(k => `${k}=${inputs[k]}`).join('&');
  return `${pipelineId}|${targetId}|${canonical}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dedup (по identity — потребляем dedupKey, не вычисляем fingerprint)
// ═══════════════════════════════════════════════════════════════════════════

function dedupe<T extends DedupRecord>(records: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of records) {
    if (seen.has(r.dedupKey)) continue;
    seen.add(r.dedupKey);
    out.push(r);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine
// ═══════════════════════════════════════════════════════════════════════════

export interface RunEngine {
  createRun(opts: {
    pipeline: PipelineDefinition;
    actor: string;
    idempotencyKey?: string;
    inputs?: Record<string, string>;
    toolVersions?: Record<string, string>;
  }): RunRecord;
  getRun(id: string): RunRecord | null;
  listRuns(): RunRecord[];
  transition(id: string, event: RunEvent, reason?: string): TransitionResult;
  retry(id: string, actor?: string): RunRecord | null;
  cancel(id: string, reason?: string): TransitionResult;
  /** Воркер продлевает lease; ttlMs — длительность аренды. */
  renewLease(id: string, ttlMs: number): RunRecord | null;
  recordFinding(runId: string, dedupKey: string, payload: unknown, meta?: Partial<FindingRecord>): FindingRecord | null;
  recordEvidence(runId: string, dedupKey: string, payload: unknown, meta?: Partial<EvidenceRecord>): EvidenceRecord | null;
  listFindings(runId: string): FindingRecord[];
  listEvidence(runId: string): EvidenceRecord[];
  /** Lease recovery: все running с истёкшим lease → expired (retryable). */
  recoverStale(nowMs?: number): RunRecord[];
  _reset(): void;
}

export function createRunEngine(storage?: KVStorage, clock: () => number = Date.now): RunEngine {
  const store = storage ?? createStorage();
  const now = () => new Date(clock()).toISOString();

  function readRun(id: string): RunRecord | null {
    const raw = store.get(RUN_PREFIX + id);
    if (!raw) return null;
    try { return JSON.parse(raw) as RunRecord; } catch { return null; }
  }

  function writeRun(run: RunRecord): void {
    store.set(RUN_PREFIX + run.id, JSON.stringify(run));
  }

  function readRecords<T extends DedupRecord>(prefix: string, runId: string): T[] {
    const out: T[] = [];
    for (const key of store.keys()) {
      if (!key.startsWith(prefix)) continue;
      const raw = store.get(key);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as T;
        if (rec.runId === runId) out.push(rec);
      } catch { /* skip */ }
    }
    return out;
  }

  function appendRecord(prefix: string, rec: DedupRecord): void {
    store.set(prefix + rec.dedupKey + '|' + rec.runId, JSON.stringify(rec));
  }

  function applyTransition(run: RunRecord, event: RunEvent, reason?: string): TransitionResult {
    if (!canTransition(run.state, event)) {
      return { ok: false, error: `Invalid transition: ${run.state} --${event}--> ?` };
    }
    const to = nextState(run.state, event);
    const updated: RunRecord = {
      ...run,
      state: to,
      updatedAt: now(),
      reason: reason ?? undefined,
      timeline: [
        ...run.timeline,
        { at: now(), from: run.state, to, event, reason },
      ],
    };
    writeRun(updated);
    return { ok: true, run: updated };
  }

  return {
    createRun({ pipeline, actor, idempotencyKey, inputs = {}, toolVersions = {} }) {
      const ikey = idempotencyKey ?? idempotencyKeyOf(pipeline.id, inputs, pipeline.target.id);

      // Idempotency: тот же intent → тот же run
      for (const key of store.keys()) {
        if (!key.startsWith(RUN_PREFIX)) continue;
        const existing = readRun(key.slice(RUN_PREFIX.length));
        if (existing && existing.idempotencyKey === ikey && !isTerminal(existing.state)) {
          return existing;
        }
      }

      const id = nextId();
      const run: RunRecord = {
        id,
        correlationId: id,
        pipelineId: pipeline.id,
        pipelineSnapshot: JSON.parse(JSON.stringify(pipeline)) as PipelineDefinition,
        policySnapshot: { ...pipeline.policy },
        state: 'draft',
        idempotencyKey: ikey,
        attemptNumber: 1,
        actor,
        createdAt: now(),
        updatedAt: now(),
        timeline: [{ at: now(), from: 'draft', to: 'draft', event: 'submit', reason: 'created' }],
        toolVersions,
      };
      writeRun(run);
      return run;
    },

    getRun: readRun,

    listRuns() {
      const out: RunRecord[] = [];
      for (const key of store.keys()) {
        if (!key.startsWith(RUN_PREFIX)) continue;
        const run = readRun(key.slice(RUN_PREFIX.length));
        if (run) out.push(run);
      }
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    transition(id, event, reason) {
      const run = readRun(id);
      if (!run) return { ok: false, error: `Run not found: ${id}` };
      return applyTransition(run, event, reason);
    },

    retry(id, actor) {
      const parent = readRun(id);
      if (!parent) return null;
      if (parent.state !== 'failed' && parent.state !== 'expired') return null;

      // Новый attempt — НЕ создаёт дублей: findings/evidence по runId родителя
      // остаются на родителе; новый run ссылается на retryOf.
      const newRun: RunRecord = {
        ...JSON.parse(JSON.stringify(parent)) as RunRecord,
        id: nextId(),
        correlationId: parent.correlationId,
        retryOf: parent.id,
        attemptNumber: parent.attemptNumber + 1,
        actor: actor ?? parent.actor,
        state: 'draft',
        createdAt: now(),
        updatedAt: now(),
        timeline: [{ at: now(), from: 'draft', to: 'draft', event: 'submit', reason: `retry of ${parent.id}` }],
        leaseExpiresAt: undefined,
        reason: undefined,
      };
      writeRun(newRun);
      return newRun;
    },

    cancel(id, reason) {
      const run = readRun(id);
      if (!run) return { ok: false, error: `Run not found: ${id}` };
      // pending/queued → cancelled напрямую; running → cancelling
      if (run.state === 'running') {
        return applyTransition(run, 'cancel', reason);
      }
      if (run.state === 'pending' || run.state === 'queued') {
        return applyTransition(run, 'cancel', reason);
      }
      return { ok: false, error: `Cannot cancel from ${run.state}` };
    },

    renewLease(id, ttlMs) {
      const run = readRun(id);
      if (!run) return null;
      if (run.state !== 'running') return null;
      const updated: RunRecord = {
        ...run,
        leaseExpiresAt: new Date(clock() + ttlMs).toISOString(),
        updatedAt: now(),
      };
      writeRun(updated);
      return updated;
    },

    recordFinding(runId, dedupKey, payload, meta) {
      const run = readRun(runId);
      if (!run) return null;
      const existing = readRecords<FindingRecord>(FINDING_PREFIX, runId);
      // Dedup: тот же dedupKey в том же run → не создаём дубль
      if (existing.some(f => f.dedupKey === dedupKey)) return null;
      const rec: FindingRecord = {
        dedupKey,
        runId,
        observedAt: now(),
        payload,
        ...meta,
      };
      appendRecord(FINDING_PREFIX, rec);
      return rec;
    },

    recordEvidence(runId, dedupKey, payload, meta) {
      const run = readRun(runId);
      if (!run) return null;
      const existing = readRecords<EvidenceRecord>(EVIDENCE_PREFIX, runId);
      if (existing.some(e => e.dedupKey === dedupKey)) return null;
      const rec: EvidenceRecord = {
        dedupKey,
        runId,
        observedAt: now(),
        payload,
        ...meta,
      };
      appendRecord(EVIDENCE_PREFIX, rec);
      return rec;
    },

    listFindings(runId) {
      return readRecords<FindingRecord>(FINDING_PREFIX, runId);
    },

    listEvidence(runId) {
      return readRecords<EvidenceRecord>(EVIDENCE_PREFIX, runId);
    },

    recoverStale(nowMs = clock()) {
      const recovered: RunRecord[] = [];
      for (const key of store.keys()) {
        if (!key.startsWith(RUN_PREFIX)) continue;
        const run = readRun(key.slice(RUN_PREFIX.length));
        if (!run) continue;
        if (run.state === 'running' && run.leaseExpiresAt) {
          const leaseMs = new Date(run.leaseExpiresAt).getTime();
          if (nowMs > leaseMs) {
            const res = applyTransition(run, 'expire', 'lease expired — worker lost');
            if (res.ok && res.run) recovered.push(res.run);
          }
        }
      }
      return recovered;
    },

    _reset() {
      const keys = store.keys();
      for (const key of keys) {
        if (key.startsWith(RUN_PREFIX) || key.startsWith(FINDING_PREFIX) || key.startsWith(EVIDENCE_PREFIX)) {
          store.remove(key);
        }
      }
    },
  };
}

// Re-export dedup for reuse
export { dedupe };
