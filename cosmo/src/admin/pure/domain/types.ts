/**
 * ADM-PURE domain types — SecOps Control target-centric data model.
 *
 * App → Target → Run → Finding → Policy → GateVerdict
 */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type RunStatus = 'running' | 'passed' | 'failed' | 'warning' | 'unavailable';

export type FindingStatus = 'active' | 'mitigated' | 'false_positive' | 'acknowledged';

export type GateVerdict = 'passed' | 'warning' | 'failed';

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------
export interface Application {
  id: string;
  name: string;
  env: 'Lab Stand' | 'Staging VPC' | 'Production';
  tags: string[];
}

// ---------------------------------------------------------------------------
// Target (проверяемая точка)
// ---------------------------------------------------------------------------
export interface Target {
  id: string;
  appId: string;
  name: string;
  url: string;
  createdAt: string;
  lastCheckedAt?: string;
  lastStatus?: RunStatus;
  activeFindings: number;
}

// ---------------------------------------------------------------------------
// Gate Rule & Policy
// ---------------------------------------------------------------------------
export interface GateRule {
  severity: Severity;
  maxAllowed: number;
}

export interface GatePolicy {
  id: string;
  name: string;
  description: string;
  active: boolean;
  rules: GateRule[];
}

// ---------------------------------------------------------------------------
// Run (прогон сканирования)
// ---------------------------------------------------------------------------
export interface Run {
  id: string;
  targetId: string;
  policyId?: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  verdict?: GateVerdict;
  verdictReason?: string;
  totalSteps: number;
  completedSteps: number;
}

// ---------------------------------------------------------------------------
// Finding (находка уязвимости)
// ---------------------------------------------------------------------------
export interface Finding {
  id: string;
  runId: string;
  targetId: string;
  cve: string;
  severity: Severity;
  title: string;
  type: string;
  endpoint: string;
  cvss: number;
  status: FindingStatus;
  firstSeen: string;
  lastSeen: string;
  payload: string;
  poc: string;
  response: string;
}

// ---------------------------------------------------------------------------
// SecOps Dashboard State
// ---------------------------------------------------------------------------
export interface SecOpsState {
  applications: Application[];
  targets: Target[];
  policies: GatePolicy[];
  runs: Run[];
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// Store Actions (contract for Flash)
// ---------------------------------------------------------------------------
export interface SecOpsActions {
  addTarget(appId: string, name: string, url: string): Target;
  triggerRun(targetId: string, policyId?: string): Run;
  togglePolicy(policyId: string): void;
  updateFindingStatus(findingId: string, status: FindingStatus): void;
  filterFindings(params: FindingFilter): Finding[];
  getAppOverview(): OverviewData;
}

export interface FindingFilter {
  severity?: Severity;
  targetId?: string;
  status?: FindingStatus;
}

export interface OverviewData {
  totalTargets: number;
  activeRuns: number;
  openCritical: number;
  openHigh: number;
  passRate: number;
  latestRuns: Run[];
  topFindings: Finding[];
}