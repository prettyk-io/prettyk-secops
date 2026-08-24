/**
 * ADM-PURE domain barrel — единственная точка импорта для Flash.
 *
 *   import { useSecopsStore, evaluateGate } from '@/admin/pure/domain';
 *   import type { Target, Run, Finding, GatePolicy, GateVerdict } from '@/admin/pure/domain';
 */
export { evaluateGate } from './gateEngine';
export { useSecopsStore } from './useSecopsStore';
export {
  SEED_APPLICATIONS,
  SEED_TARGETS,
  SEED_POLICIES,
  SEED_RUNS,
  SEED_FINDINGS,
} from './mockSecopsDb';
export type { GateResult } from './gateEngine';
export type {
  SecOpsState,
  SecOpsActions,
  FindingFilter,
  OverviewData,
  Severity,
  RunStatus,
  FindingStatus,
  GateVerdict,
  Application,
  Target,
  Run,
  Finding,
  GatePolicy,
  GateRule,
} from './types';