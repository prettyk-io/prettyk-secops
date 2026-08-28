/**
 * PRETTYK-CI — barrel.
 *
 *   import { createRunEngine, createPipelineStore } from '@/ci';
 *   import { STEP_CATALOG } from '@/ci';
 *   import { nextState, canTransition, TERMINAL_STATES } from '@/ci';
 *   import type { RunState, RunRecord, PipelineDefinition } from '@/ci';
 */

// Types
export type {
  Capability,
  TargetRef,
  ScopeRule,
  Scope,
  ApprovalRef,
  PolicyRef,
  ComponentRef,
  VersionRef,
  StepMatrix,
  StepNode,
  StepEdge,
  StepEdgeKind,
  PipelineDefinition,
  RetryPolicy,
  RunState,
  RunEvent,
  RunRecord,
  RunTimelineEvent,
  DedupRecord,
  FindingRecord,
  EvidenceRecord,
  TransitionResult,
} from './types';

// State machine
export {
  TERMINAL_STATES,
  RETRYABLE_STATES,
  isTerminal,
  isRetryable,
  canTransition,
  nextState,
  allowedEvents,
} from './stateMachine';

// Storage
export { createStorage, memoryStorage, localStorageStorage } from './storage';
export type { KVStorage } from './storage';

// Pipeline store + graph integrity
export {
  createPipelineStore,
  validatePipelineGraph,
  topologicalOrder,
  isPinnedVersion,
  collectUnpinnedComponents,
} from './pipelineStore';
export type { PipelineStore, GraphIssue } from './pipelineStore';

// Deterministic plan compiler
export { compilePipeline, canonicalJson, PlanCompilationError } from './planCompiler';
export type { PipelinePlan, CompiledBatch } from './planCompiler';

// Run engine
export { createRunEngine, idempotencyKeyOf } from './runEngine';
export type { RunEngine } from './runEngine';

// Step catalog
export {
  STEP_CATALOG,
  findStep,
  stepComponentRef,
  stepCapabilities,
  pipelineRequiredCapabilities,
} from './stepCatalog';
export type { CatalogStep, StepCapability, StepInput, StepOutput } from './stepCatalog';

// Codec (code ↔ graph)
export {
  PIPELINE_IR_VERSION,
  serializePipeline,
  parsePipeline,
  toGraph,
  fromGraph,
  assertRoundTrip,
} from './codec';
export type { ParseResult, GraphNode, GraphEdge, PipelineGraph } from './codec';

// Preflight (PK-CI-5)
export {
  runPreflight,
  checkScope,
  checkPolicy,
  checkCapabilities,
  checkApprovals,
} from './preflight';
export type {
  PreflightInput,
  PreflightResult,
  PreflightBlock,
  PreflightBlockReason,
  AuditEvent,
} from './preflight';

// External CI bridge (PK-CI-6)
export {
  createCiBridge,
  exitCodeOf,
  externalStatusOf,
} from './ciBridge';
export type {
  CiBridge,
  ExternalCiResult,
  ExternalStatus,
  FindingsSummary,
} from './ciBridge';

// Pipeline preview (PK-CI-7)
export { buildPipelinePreview } from './pipelinePreview';
export type {
  PipelinePreview,
  StepPreview,
  ResourceEstimate,
  PreviewInput,
} from './pipelinePreview';

// Import/Export compatibility (PK-CI-8)
export {
  assessImport,
  assessExport,
} from './importExport';
export type {
  CompatibilityLevel,
  CompatibilityReport,
  StepCompatibility,
  ImportInput,
  ExportTarget,
  ExportResult,
  StepExport,
} from './importExport';

// Component versioning (PK-CI-9)
export {
  buildRegistry,
  validateComponentVersions,
  productionGate,
  versionHistoryOf,
} from './componentVersioning';
export type {
  ComponentVersion,
  ComponentVersionHistory,
  VersionValidation,
} from './componentVersioning';

// Proof-Carrying Run (PK-CI-10)
export {
  buildProofPackage,
  proofFromEngine,
  checksumOf,
} from './proofCarrying';
export type {
  ProofPackage,
  ArtifactChecksum,
  ProofInput,
} from './proofCarrying';

// Reproduce (PK-CI-11)
export {
  reproduceFromFinding,
  reproduceFromEngine,
} from './reproduce';
export type { ReproduceResult } from './reproduce';

// Step debugger (PK-CI-12)
export {
  createStepDebugger,
  diffRuns,
} from './stepDebugger';
export type {
  StepIO,
  StepDebugSession,
  StepDebugger,
  RunDiff,
} from './stepDebugger';
