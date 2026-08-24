/** ADM-PURE reactive store — single Zustand source for all SecOps cards. */
import { create } from 'zustand';

// ── Domain types (ADM-PURE model: App → Target → Check → Run → Finding → Policy) ──

export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type RunStatus = 'running' | 'passed' | 'failed' | 'cancelled' | 'unavailable';
export type GateVerdict = 'pass' | 'watch' | 'fail' | 'unknown';
export type FindingStatus = 'active' | 'mitigated' | 'false_positive' | 'risk_accepted' | 'out_of_scope';
export type TargetStatus = 'active' | 'stale' | 'retired';

export interface SecOpsStore {
  // ── Targets ──
  apps: SecOpsApp[];
  setApps: (apps: SecOpsApp[]) => void;
  addApp: (app: SecOpsApp) => void;
  getApp: (id: string) => SecOpsApp | undefined;

  // ── Runs ──
  runs: SecOpsRun[];
  setRuns: (runs: SecOpsRun[]) => void;

  // ── Findings ──
  findings: SecOpsFinding[];
  setFindings: (f: SecOpsFinding[]) => void;

  // ── Policies ──
  policies: GatePolicy[];
  setPolicies: (p: GatePolicy[]) => void;

  // ── Overview ──
  refreshOverview: () => void;
}

export interface SecOpsApp {
  id: string;
  name: string;
  targets: SecOpsTarget[];
  createdAt: string; // ISO
}

export interface SecOpsTarget {
  id: string;
  url: string;
  status: TargetStatus;
  lastCheckAt: string | null;
  findingsCount: number;
  lastGate: GateVerdict;
}

export interface SecOpsRun {
  id: string;
  targetId: string;
  appName: string;
  targetUrl: string;
  startedAt: string;
  status: RunStatus;
  gate: GateVerdict;
  policyName: string;
  findingsCount: number;
}

export interface SecOpsFinding {
  id: string;
  runId: string;
  targetId: string;
  title: string;
  severity: SeverityKey;
  cwe: string | null;
  cvss: number | null;
  status: FindingStatus;
  curlPoc: string | null;
  changedAt: string;
}

export interface GatePolicy {
  id: string;
  name: string;
  enabled: boolean;
  maxCritical: number;
  maxHigh: number;
  maxMedium: number;
  maxLow: number;
}

export function blankPolicy(name: string): GatePolicy {
  return { id: `pol-${Date.now()}`, name, enabled: true, maxCritical: 0, maxHigh: 3, maxMedium: 5, maxLow: 10 };
}

export function runStatusColor(s: RunStatus): string {
  return s === 'running' ? '#38bdf8' : s === 'passed' ? '#22c55e' : s === 'failed' ? '#ef4444' : s === 'cancelled' ? '#94a3b8' : '#f59e0b';
}

export function gateVerdictColor(g: GateVerdict): string {
  return g === 'pass' ? '#22c55e' : g === 'watch' ? '#f59e0b' : g === 'fail' ? '#ef4444' : '#64748b';
}

export function severityColor(s: SeverityKey): string {
  return s === 'critical' ? '#ef4444' : s === 'high' ? '#f59e0b' : s === 'medium' ? '#f97316' : s === 'low' ? '#38bdf8' : '#94a3b8';
}

// ── Demo seed ──
function seedApps(): SecOpsApp[] {
  return [{
    id: 'app-1', name: 'Juice Shop', createdAt: '2026-08-01T10:00:00Z',
    targets: [
      { id: 'tgt-1', url: 'http://juice-shop:3000', status: 'active', lastCheckAt: '2026-08-22T14:22:00Z', findingsCount: 4, lastGate: 'watch' },
      { id: 'tgt-2', url: 'http://localhost:4200', status: 'active', lastCheckAt: '2026-08-21T09:15:00Z', findingsCount: 1, lastGate: 'pass' },
    ],
  }, {
    id: 'app-2', name: 'Bank Gateway', createdAt: '2026-08-05T08:00:00Z',
    targets: [
      { id: 'tgt-3', url: 'https://gateway.bank.example', status: 'stale', lastCheckAt: '2026-08-15T16:30:00Z', findingsCount: 2, lastGate: 'fail' },
    ],
  }];
}

function seedRuns(): SecOpsRun[] {
  return [
    { id: 'run-1', targetId: 'tgt-1', appName: 'Juice Shop', targetUrl: 'http://juice-shop:3000', startedAt: '2026-08-22T14:22:00Z', status: 'running', gate: 'unknown', policyName: 'OWASP Top-10', findingsCount: 0 },
    { id: 'run-2', targetId: 'tgt-1', appName: 'Juice Shop', targetUrl: 'http://juice-shop:3000', startedAt: '2026-08-22T07:10:00Z', status: 'passed', gate: 'pass', policyName: 'PCI-DSS', findingsCount: 0 },
    { id: 'run-3', targetId: 'tgt-3', appName: 'Bank Gateway', targetUrl: 'https://gateway.bank.example', startedAt: '2026-08-15T16:30:00Z', status: 'failed', gate: 'fail', policyName: 'CBR GOST-R', findingsCount: 2 },
    { id: 'run-4', targetId: 'tgt-2', appName: 'Juice Shop', targetUrl: 'http://localhost:4200', startedAt: '2026-08-21T09:15:00Z', status: 'passed', gate: 'pass', policyName: 'OWASP Top-10', findingsCount: 0 },
  ];
}

function seedFindings(): SecOpsFinding[] {
  return [
    { id: 'f-1', runId: 'run-3', targetId: 'tgt-3', title: 'SQL Injection on /api/login', severity: 'critical', cwe: 'CWE-89', cvss: 9.8, status: 'active', curlPoc: 'curl -X POST ...', changedAt: '2026-08-15T16:35:00Z' },
    { id: 'f-2', runId: 'run-3', targetId: 'tgt-3', title: 'Reflected XSS in search param', severity: 'high', cwe: 'CWE-79', cvss: 7.5, status: 'active', curlPoc: 'curl "https://gateway?...&q=<script>..."', changedAt: '2026-08-15T16:35:00Z' },
    { id: 'f-3', runId: 'run-1', targetId: 'tgt-1', title: 'Weak TLS cipher on :443', severity: 'medium', cwe: 'CWE-327', cvss: 5.9, status: 'active', curlPoc: null, changedAt: '2026-08-22T14:25:00Z' },
    { id: 'f-4', runId: 'run-1', targetId: 'tgt-1', title: 'Missing CSP header', severity: 'low', cwe: 'CWE-1021', cvss: 3.1, status: 'mitigated', curlPoc: null, changedAt: '2026-08-20T12:00:00Z' },
    { id: 'f-5', runId: 'run-1', targetId: 'tgt-1', title: 'Open redirect on /logout', severity: 'low', cwe: 'CWE-601', cvss: 4.3, status: 'false_positive', curlPoc: null, changedAt: '2026-08-19T18:00:00Z' },
  ];
}

function seedPolicies(): GatePolicy[] {
  return [
    { id: 'pol-owasp', name: 'OWASP Top-10', enabled: true, maxCritical: 0, maxHigh: 3, maxMedium: 5, maxLow: 10 },
    { id: 'pol-cbr', name: 'CBR GOST-R', enabled: true, maxCritical: 0, maxHigh: 0, maxMedium: 2, maxLow: 5 },
    { id: 'pol-pci', name: 'PCI-DSS', enabled: false, maxCritical: 0, maxHigh: 2, maxMedium: 3, maxLow: 8 },
  ];
}

export const useSecopsStore = create<SecOpsStore>((set, get) => ({
  apps: seedApps(),
  setApps: (apps) => set({ apps }),
  addApp: (app) => set((s) => ({ apps: [...s.apps, app] })),
  getApp: (id) => get().apps.find((a) => a.id === id || a.targets.some((t) => t.id === id)),

  runs: seedRuns(),
  setRuns: (runs) => set({ runs }),

  findings: seedFindings(),
  setFindings: (findings) => set({ findings }),

  policies: seedPolicies(),
  setPolicies: (policies) => set({ policies }),

  refreshOverview: () => {
    // Reactive — reads current state, no external fetch needed with demo seed.
    // Production: pull from adminApi hooks here.
  },
}));