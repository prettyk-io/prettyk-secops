/**
 * PRETTYK-CI — Canonical Pipeline IR & Run-State Contract.
 *
 * Свой security-смысл и контракт — свои; generic CI execution — не наш велосипед.
 *
 * Границы (не переписываем):
 *   — DSL, discovery, browser runtime, fuzzing, finding identity — существующие доменные движки.
 *   — Finding identity здесь НЕ вычисляется: мы только ПОТРЕБЛЯЕМ готовый `dedupKey`.
 *
 * Канон: docs/research/2026-08-24-prettyk-ci-concept.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// Capability / Permission (переиспользуем auth.UserCapability)
// ═══════════════════════════════════════════════════════════════════════════

export type Capability = string;

// ═══════════════════════════════════════════════════════════════════════════
// Scope & Target
// ═══════════════════════════════════════════════════════════════════════════

export interface TargetRef {
  /** Стабильный id цели/приложения. */
  id: string;
  name: string;
  /** Разрешённый environment (Lab Stand / Staging / Production). */
  environment?: string;
}

export interface ScopeRule {
  /** Разрешённые origin/host (точное совпадение или wildcard). */
  allowedHosts: string[];
  /** Разрешённые URI-префиксы (path prefix). */
  allowedPaths?: string[];
  /** Разрешённые схемы (https/http). */
  allowedSchemes?: string[];
}

export interface Scope {
  rules: ScopeRule[];
  /** Произвольная строка отказа в доступе, показывается в preflight. */
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Policy & Approvals
// ═══════════════════════════════════════════════════════════════════════════

export interface ApprovalRef {
  /** Тип approval (человек/роль/система). */
  kind: 'role' | 'manual' | 'system';
  /** Требуемая capability или роль. */
  required?: Capability;
  /** Человекочитаемое описание, что именно требуется. */
  label: string;
}

export interface PolicyRef {
  /** Стабильный id policy (снапшотится в run). */
  id: string;
  /** Человекочитаемое имя. */
  name: string;
  /** Версия policy — фиксируется в run, чтобы вердикт был воспроизводим. */
  version: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component reference (versioned — НЕ latest для production)
// ═══════════════════════════════════════════════════════════════════════════

export interface ComponentRef {
  name: string;
  /** Зафиксированная версия. 'latest' запрещён для production gate. */
  version: string;
  /** Опциональный digest — сильнее version. */
  digest?: string;
}

export type VersionRef = ComponentRef;

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Step (node) & Edge
// ═══════════════════════════════════════════════════════════════════════════

export interface StepMatrix {
  /** Матрица по измерению: target / browser / api / environment. */
  dimension: string;
  values: string[];
}

export interface StepNode {
  id: string;
  /** Versioned component reference. */
  component: ComponentRef;
  /** Человекочитаемый label для графа. */
  label?: string;
  /** Входные параметры шага (без секретов — только ссылки). */
  inputs?: Record<string, string>;
  /** Матрица по target/browser/api/env. */
  matrix?: StepMatrix;
  /** Требуемые approvals для этого шага. */
  approvals?: ApprovalRef[];
  /** Таймаут шага в миллисекундах. */
  timeoutMs?: number;
}

export type StepEdgeKind = 'depends_on' | 'parallel' | 'on_success' | 'on_failure';

export interface StepEdge {
  from: string;
  to: string;
  kind: StepEdgeKind;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline Definition (IR)
// ═══════════════════════════════════════════════════════════════════════════

export interface PipelineDefinition {
  /** Stable id проверки. */
  id: string;
  /** Версия IR-схемы. */
  irVersion: string;
  name: string;
  description?: string;
  target: TargetRef;
  scope: Scope;
  policy: PolicyRef;
  /** Требуемые capabilities для запуска. */
  requiredCapabilities: Capability[];
  steps: StepNode[];
  edges: StepEdge[];
  /** Общий таймаут пайпа. */
  timeoutMs?: number;
  /** Политика повтора (по умолчанию: retry разрешён на failed/expired). */
  retry?: RetryPolicy;
  /** Ожидаемые выходы/evidence. */
  expectedOutputs?: string[];
  /** Качество: требуемый gate. */
  qualityGate?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  /** Множитель backoff в мс. */
  backoffMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Run-State Contract (PK-CI-2) — СИГНАЛ ФЛЕШУ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Честная state machine.
 *
 *   draft → pending → queued → running → cancelling → succeeded / failed / cancelled / expired
 *
 * Терминальные: succeeded, failed, cancelled, expired.
 */
export type RunState =
  | 'draft'
  | 'pending'
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type RunEvent =
  | 'submit'            // draft → pending
  | 'abandon'           // draft → cancelled
  | 'approve'           // pending → queued (preflight пройден)
  | 'reject'            // pending → cancelled
  | 'acquire'           // queued → running (worker взял lease)
  | 'cancel'            // pending/queued/running → cancelling/cancelled
  | 'complete'          // running → succeeded
  | 'fail'              // running → failed
  | 'expire'            // pending/queued/running → expired (lease/timeout)
  | 'cancel_done'       // cancelling → cancelled
  | 'cancel_fail';      // cancelling → failed

export interface RunRecord {
  /** Correlation id (trace). */
  id: string;
  correlationId: string;
  pipelineId: string;
  /** Снапшот pipeline IR на момент запуска (воспроизводимость). */
  pipelineSnapshot: PipelineDefinition;
  /** Снапшот policy (версия зафиксирована). */
  policySnapshot: PolicyRef;
  state: RunState;
  /** Idempotency key: один intent + входы = один run. */
  idempotencyKey: string;
  /** Повтор: retryOf → родительский run; attemptNumber растёт. */
  retryOf?: string;
  attemptNumber: number;
  actor: string;
  createdAt: string;
  updatedAt: string;
  /** Lease: воркер продлевает; истечение → expired. */
  leaseExpiresAt?: string;
  /** История переходов (полный timeline). */
  timeline: RunTimelineEvent[];
  /** Причина последнего перехода (для аудита). */
  reason?: string;
  /** Хэш/версии инструментов (snapshot tool versions). */
  toolVersions: Record<string, string>;
}

export interface RunTimelineEvent {
  at: string;
  from: RunState;
  to: RunState;
  event: RunEvent;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Findings & Evidence (dedup by identity — потребляем dedupKey, не вычисляем)
// ═══════════════════════════════════════════════════════════════════════════

export interface DedupRecord {
  /** Стабильный identity-ключ (вычисляется существующими движками). */
  dedupKey: string;
  runId: string;
  observedAt: string;
  payload: unknown;
}

export interface FindingRecord extends DedupRecord {
  severity?: string;
  title?: string;
  /** Шаг, породивший finding (для Reproduce / Debugger). */
  stepId?: string;
}

export interface EvidenceRecord extends DedupRecord {
  checksum?: string;
  kind?: string;
  /** Шаг, породивший evidence. */
  stepId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transition result
// ═══════════════════════════════════════════════════════════════════════════

export interface TransitionResult {
  ok: boolean;
  /** Новый run или undefined при ошибке. */
  run?: RunRecord;
  /** Человекочитаемая причина отказа. */
  error?: string;
}
