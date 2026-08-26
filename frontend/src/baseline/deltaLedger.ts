/**
 * PK-BL-4: Baseline Delta Ledger Engine
 * 
 * Compares Run_N vs Run_N-1 to compute canonical delta ledgers:
 * - new (introduced findings)
 * - resolved (fixed findings)
 * - persistent (continuing findings with occurrence counts)
 * - regressed (re-introduced previously resolved findings)
 */

import type {
  DeltaItem,
  DeltaItemStatus,
  DeltaLedger,
  DeltaSummary,
  FindingRecord,
  FindingSeverity,
} from './types';

const SEVERITY_WEIGHTS: Record<FindingSeverity, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

/**
 * Computes canonical key for a finding.
 */
export function computeFindingCanonicalKey(finding: {
  checkType: string;
  method: string;
  endpointPath: string;
  paramName?: string;
}): string {
  const normPath = finding.endpointPath.startsWith('/') ? finding.endpointPath : `/${finding.endpointPath}`;
  const param = finding.paramName ? `:${finding.paramName}` : '';
  return `finding:${finding.checkType}:${finding.method.toUpperCase()}:${normPath}${param}`;
}

/**
 * Computes the aggregate risk score for a list of findings.
 */
export function calculateRiskScore(findings: FindingRecord[]): number {
  return findings.reduce((acc, f) => acc + (SEVERITY_WEIGHTS[f.severity] || 0), 0);
}

export interface HistoricalRunSnapshot {
  runId: string;
  findings: FindingRecord[];
  timestamp: string;
}

/**
 * Computes the Delta Ledger comparing currentRun findings with previousRun and optional historical snapshots.
 */
export function computeDeltaLedger(
  currentRunId: string,
  currentFindings: FindingRecord[],
  previousRun?: HistoricalRunSnapshot,
  historicalChain: HistoricalRunSnapshot[] = [],
): DeltaLedger {
  const currentMap = new Map<string, FindingRecord>();
  for (const f of currentFindings) {
    const key = f.canonicalKey || computeFindingCanonicalKey(f);
    currentMap.set(key, f);
  }

  const prevFindings = previousRun ? previousRun.findings : [];
  const prevMap = new Map<string, FindingRecord>();
  for (const f of prevFindings) {
    const key = f.canonicalKey || computeFindingCanonicalKey(f);
    prevMap.set(key, f);
  }

  // Build map of all historical occurrences
  const historicalKeySeen = new Set<string>();
  const historicalKeyResolved = new Set<string>();

  for (const h of historicalChain) {
    for (const f of h.findings) {
      const key = f.canonicalKey || computeFindingCanonicalKey(f);
      historicalKeySeen.add(key);
    }
  }

  // If a key was in history but NOT in previous run, and now reappears in current run -> REGRESSED
  if (previousRun) {
    for (const hKey of historicalKeySeen) {
      if (!prevMap.has(hKey)) {
        historicalKeyResolved.add(hKey);
      }
    }
  }

  const items: DeltaItem[] = [];

  // 1. Process current findings (new, persistent, regressed)
  for (const [key, curFinding] of currentMap.entries()) {
    if (prevMap.has(key)) {
      // Present in both -> PERSISTENT
      const prevFinding = prevMap.get(key)!;
      items.push({
        canonicalKey: key,
        status: 'persistent',
        currentFinding: curFinding,
        previousFinding: prevFinding,
        firstSeenRunId: previousRun?.runId || currentRunId,
        lastSeenRunId: currentRunId,
        occurrenceCount: 2, // At least 2 consecutive runs
      });
    } else if (historicalKeyResolved.has(key)) {
      // Reappeared after being absent in prev run -> REGRESSED
      items.push({
        canonicalKey: key,
        status: 'regressed',
        currentFinding: curFinding,
        firstSeenRunId: historicalChain[0]?.runId || currentRunId,
        lastSeenRunId: currentRunId,
        occurrenceCount: 1,
      });
    } else {
      // Completely new -> NEW
      items.push({
        canonicalKey: key,
        status: 'new',
        currentFinding: curFinding,
        firstSeenRunId: currentRunId,
        lastSeenRunId: currentRunId,
        occurrenceCount: 1,
      });
    }
  }

  // 2. Process resolved findings (in prev, not in current)
  for (const [key, prevFinding] of prevMap.entries()) {
    if (!currentMap.has(key)) {
      items.push({
        canonicalKey: key,
        status: 'resolved',
        previousFinding: prevFinding,
        firstSeenRunId: previousRun?.runId || 'unknown',
        lastSeenRunId: previousRun?.runId || 'unknown',
        occurrenceCount: 1,
      });
    }
  }

  // 3. Compute summary statistics
  const newCount = items.filter((i) => i.status === 'new').length;
  const resolvedCount = items.filter((i) => i.status === 'resolved').length;
  const persistentCount = items.filter((i) => i.status === 'persistent').length;
  const regressedCount = items.filter((i) => i.status === 'regressed').length;

  const curCritical = currentFindings.filter((f) => f.severity === 'CRITICAL').length;
  const prevCritical = prevFindings.filter((f) => f.severity === 'CRITICAL').length;

  const curHigh = currentFindings.filter((f) => f.severity === 'HIGH').length;
  const prevHigh = prevFindings.filter((f) => f.severity === 'HIGH').length;

  const curScore = calculateRiskScore(currentFindings);
  const prevScore = calculateRiskScore(prevFindings);

  const summary: DeltaSummary = {
    totalCurrent: currentFindings.length,
    totalPrevious: prevFindings.length,
    newCount,
    resolvedCount,
    persistentCount,
    regressedCount,
    criticalDiff: curCritical - prevCritical,
    highDiff: curHigh - prevHigh,
    riskScoreDiff: curScore - prevScore,
  };

  return {
    runId: currentRunId,
    baselineRunId: previousRun?.runId,
    generatedAt: new Date().toISOString(),
    summary,
    items,
  };
}
