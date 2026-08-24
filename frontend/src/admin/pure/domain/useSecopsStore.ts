/**
 * ADM-PURE: Reactive SecOps Store (zero-dependency React hooks).
 *
 * Контракт для Flash:
 *   import { useSecopsStore } from './domain/useSecopsStore';
 *   const { state, addTarget, triggerRun, togglePolicy, updateFindingStatus, filterFindings } = useSecopsStore();
 *
 * Инициализируется из seed-данных. Все мутации иммутабельны.
 */
import { useReducer, useCallback, useMemo } from 'react';
import type {
  SecOpsState,
  Target,
  Run,
  Finding,
  FindingFilter,
  FindingStatus,
  OverviewData,
} from './types';
import {
  SEED_APPLICATIONS,
  SEED_TARGETS,
  SEED_POLICIES,
  SEED_RUNS,
  SEED_FINDINGS,
} from './mockSecopsDb';
import { evaluateGate } from './gateEngine';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
const INITIAL_STATE: SecOpsState = {
  applications: SEED_APPLICATIONS,
  targets: SEED_TARGETS,
  policies: SEED_POLICIES,
  runs: SEED_RUNS,
  findings: SEED_FINDINGS,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type Action =
  | { type: 'ADD_TARGET'; appId: string; name: string; url: string }
  | { type: 'TRIGGER_RUN'; targetId: string; policyId?: string }
  | { type: 'TOGGLE_POLICY'; policyId: string }
  | { type: 'UPDATE_FINDING_STATUS'; findingId: string; status: FindingStatus }
  | { type: 'COMPLETE_RUN'; runId: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let idCounter = 100;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function secopsReducer(state: SecOpsState, action: Action): SecOpsState {
  switch (action.type) {
    case 'ADD_TARGET': {
      const target: Target = {
        id: nextId('tgt'),
        appId: action.appId,
        name: action.name,
        url: action.url,
        createdAt: nowISO(),
        activeFindings: 0,
      };
      return { ...state, targets: [...state.targets, target] };
    }

    case 'TRIGGER_RUN': {
      const run: Run = {
        id: nextId('run'),
        targetId: action.targetId,
        policyId: action.policyId,
        status: 'running',
        startedAt: nowISO(),
        totalSteps: 16,
        completedSteps: 0,
      };
      return { ...state, runs: [...state.runs, run] };
    }

    case 'TOGGLE_POLICY': {
      return {
        ...state,
        policies: state.policies.map((p) =>
          p.id === action.policyId ? { ...p, active: !p.active } : p,
        ),
      };
    }

    case 'UPDATE_FINDING_STATUS': {
      return {
        ...state,
        findings: state.findings.map((f) =>
          f.id === action.findingId ? { ...f, status: action.status } : f,
        ),
      };
    }

    case 'COMPLETE_RUN': {
      const run = state.runs.find((r) => r.id === action.runId);
      if (!run || run.status !== 'running') return state;

      const targetFindings = state.findings.filter((f) => f.runId === action.runId);
      const policy = state.policies.find((p) => p.id === run.policyId);
      const gateResult = policy
        ? evaluateGate(run, targetFindings, policy)
        : { verdict: 'passed' as const, reason: 'No policy assigned — gate bypassed.' };

      const finishedAt = nowISO();
      const durationMs =
        new Date(finishedAt).getTime() - new Date(run.startedAt).getTime();

      const updatedRun: Run = {
        ...run,
        status: gateResult.verdict === 'passed' ? 'passed' : gateResult.verdict === 'warning' ? 'warning' : 'failed',
        finishedAt,
        durationMs,
        verdict: gateResult.verdict,
        verdictReason: gateResult.reason,
        completedSteps: run.totalSteps,
      };

      // Update target's lastCheck and activeFindings count
      const activeCount = targetFindings.filter((f) => f.status === 'active').length;

      return {
        ...state,
        runs: state.runs.map((r) => (r.id === action.runId ? updatedRun : r)),
        targets: state.targets.map((t) =>
          t.id === run.targetId
            ? { ...t, lastCheckedAt: finishedAt, lastStatus: updatedRun.status, activeFindings: activeCount }
            : t,
        ),
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSecopsStore() {
  const [state, dispatch] = useReducer(secopsReducer, INITIAL_STATE);

  const addTarget = useCallback(
    (appId: string, name: string, url: string): Target => {
      const id = nextId('tgt');
      const target: Target = {
        id,
        appId,
        name,
        url,
        createdAt: nowISO(),
        activeFindings: 0,
      };
      dispatch({ type: 'ADD_TARGET', appId, name, url });
      return target;
    },
    [],
  );

  const triggerRun = useCallback(
    (targetId: string, policyId?: string): Run => {
      const id = nextId('run');
      const run: Run = {
        id,
        targetId,
        policyId,
        status: 'running',
        startedAt: nowISO(),
        totalSteps: 16,
        completedSteps: 0,
      };
      dispatch({ type: 'TRIGGER_RUN', targetId, policyId });
      return run;
    },
    [],
  );

  const togglePolicy = useCallback((policyId: string) => {
    dispatch({ type: 'TOGGLE_POLICY', policyId });
  }, []);

  const updateFindingStatus = useCallback(
    (findingId: string, status: FindingStatus) => {
      dispatch({ type: 'UPDATE_FINDING_STATUS', findingId, status });
    },
    [],
  );

  const completeRun = useCallback((runId: string) => {
    dispatch({ type: 'COMPLETE_RUN', runId });
  }, []);

  const filterFindings = useCallback(
    (filter: FindingFilter): Finding[] => {
      return state.findings.filter((f) => {
        if (filter.severity && f.severity !== filter.severity) return false;
        if (filter.targetId && f.targetId !== filter.targetId) return false;
        if (filter.status && f.status !== filter.status) return false;
        return true;
      });
    },
    [state.findings],
  );

  const getAppOverview = useCallback((): OverviewData => {
    const activeRuns = state.runs.filter((r) => r.status === 'running');
    const activeFindings = state.findings.filter((f) => f.status === 'active');
    const completedRuns = state.runs.filter((r) => r.status === 'passed' || r.status === 'failed' || r.status === 'warning');

    return {
      totalTargets: state.targets.length,
      activeRuns: activeRuns.length,
      openCritical: activeFindings.filter((f) => f.severity === 'CRITICAL').length,
      openHigh: activeFindings.filter((f) => f.severity === 'HIGH').length,
      passRate:
        completedRuns.length > 0
          ? Math.round(
              (completedRuns.filter((r) => r.verdict === 'passed').length / completedRuns.length) * 100,
            )
          : 0,
      latestRuns: [...state.runs]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 5),
      topFindings: [...activeFindings]
        .sort((a, b) => b.cvss - a.cvss)
        .slice(0, 8),
    };
  }, [state.runs, state.findings, state.targets]);

  return {
    state,
    addTarget,
    triggerRun,
    togglePolicy,
    updateFindingStatus,
    completeRun,
    filterFindings,
    getAppOverview,
  };
}