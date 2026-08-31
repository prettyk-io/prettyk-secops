/** ADM-PURE reactive store — live API + SSE (ADM-WIRE-1). */
import { create } from 'zustand';

export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type RunStatus = 'running' | 'passed' | 'failed' | 'cancelled' | 'unavailable';
export type GateVerdict = 'pass' | 'watch' | 'fail' | 'unknown';
export type FindingStatus = 'active' | 'mitigated' | 'false_positive' | 'risk_accepted' | 'out_of_scope';
export type TargetStatus = 'active' | 'stale' | 'retired';

export interface SecOpsStore {
  apps: SecOpsApp[]; setApps: (apps: SecOpsApp[]) => void; addApp: (app: SecOpsApp) => void; getApp: (id: string) => SecOpsApp | undefined;
  runs: SecOpsRun[]; setRuns: (runs: SecOpsRun[]) => void;
  findings: SecOpsFinding[]; setFindings: (f: SecOpsFinding[]) => void;
  policies: GatePolicy[]; setPolicies: (p: GatePolicy[]) => void;
  refreshOverview: () => void;
}
export interface SecOpsApp { id: string; name: string; targets: SecOpsTarget[]; createdAt: string; }
export interface SecOpsTarget { id: string; url: string; status: TargetStatus; lastCheckAt: string | null; findingsCount: number; lastGate: GateVerdict; }
export interface SecOpsRun { id: string; targetId: string; appName: string; targetUrl: string; startedAt: string; status: RunStatus; gate: GateVerdict; policyName: string; findingsCount: number; }
export interface SecOpsFinding { id: string; runId: string; targetId: string; title: string; severity: SeverityKey; cwe: string | null; cvss: number | null; status: FindingStatus; curlPoc: string | null; changedAt: string; }
export interface GatePolicy { id: string; name: string; enabled: boolean; maxCritical: number; maxHigh: number; maxMedium: number; maxLow: number; }

export function blankPolicy(name: string): GatePolicy { return { id: `pol-${Date.now()}`, name, enabled: true, maxCritical: 0, maxHigh: 3, maxMedium: 5, maxLow: 10 }; }
export function runStatusColor(s: RunStatus): string { return s === 'running' ? '#38bdf8' : s === 'passed' ? '#22c55e' : s === 'failed' ? '#ef4444' : s === 'cancelled' ? '#94a3b8' : '#f59e0b'; }
export function gateVerdictColor(g: GateVerdict): string { return g === 'pass' ? '#22c55e' : g === 'watch' ? '#f59e0b' : g === 'fail' ? '#ef4444' : '#64748b'; }
export function severityColor(s: SeverityKey): string { return s === 'critical' ? '#ef4444' : s === 'high' ? '#f59e0b' : s === 'medium' ? '#f97316' : s === 'low' ? '#38bdf8' : '#94a3b8'; }

// ── Seed ──
function seedApps(): SecOpsApp[] { return [{ id:'app-1',name:'Juice Shop',createdAt:'2026-08-01T10:00:00Z',targets:[{id:'tgt-1',url:'http://juice-shop:3000',status:'active',lastCheckAt:null,findingsCount:0,lastGate:'unknown'},{id:'tgt-2',url:'http://localhost:4200',status:'active',lastCheckAt:null,findingsCount:0,lastGate:'unknown'}]},{id:'app-2',name:'Bank Gateway',createdAt:'2026-08-05T08:00:00Z',targets:[{id:'tgt-3',url:'https://gateway.bank.example',status:'stale',lastCheckAt:null,findingsCount:0,lastGate:'unknown'}]}];}
function seedPolicies(): GatePolicy[] { return [{id:'pol-owasp',name:'OWASP Top-10',enabled:true,maxCritical:0,maxHigh:3,maxMedium:5,maxLow:10},{id:'pol-cbr',name:'CBR GOST-R',enabled:true,maxCritical:0,maxHigh:0,maxMedium:2,maxLow:5},{id:'pol-pci',name:'PCI-DSS',enabled:false,maxCritical:0,maxHigh:2,maxMedium:3,maxLow:8}];}

// ── API helpers ──
async function fetchJson(path: string): Promise<unknown> { const r = await fetch(path); if (!r.ok) return null; return r.json(); }

function mapRun(raw: Record<string, unknown>): SecOpsRun {
  return { id: String(raw.id ?? ''), targetId: String(raw.check_id ?? ''), appName: String(raw.app_name ?? ''), targetUrl: String(raw.target_url ?? ''), startedAt: String(raw.started_at ?? ''), status: (raw.status as RunStatus) || 'unavailable', gate: (raw.gate_verdict as GateVerdict) || 'unknown', policyName: String(raw.policy_name ?? ''), findingsCount: Number(raw.findings_count) || 0 };
}

function mapFinding(raw: Record<string, unknown>): SecOpsFinding {
  return { id: String(raw.id ?? ''), runId: String(raw.run_id ?? ''), targetId: String(raw.target_id ?? ''), title: String(raw.title ?? ''), severity: (raw.severity as SeverityKey) || 'info', cwe: typeof raw.cwe === 'string' ? raw.cwe : null, cvss: typeof raw.cvss === 'number' ? raw.cvss : null, status: (raw.status as FindingStatus) || 'active', curlPoc: typeof raw.curl_poc === 'string' ? raw.curl_poc : null, changedAt: String(raw.changed_at ?? '') };
}

async function fetchRunsAndSync(): Promise<{ runs: SecOpsRun[]; apps: SecOpsApp[] }> {
  const data = await fetchJson('/api/runs');
  const arr: Record<string, unknown>[] = (data && typeof data === 'object') ? (Array.isArray((data as {runs?:unknown[]}).runs) ? (data as {runs:unknown[]}).runs as Record<string, unknown>[] : (Array.isArray(data) ? data as Record<string, unknown>[] : [])) : [];
  const runs: SecOpsRun[] = arr.map((r) => mapRun(r));
  const apps = seedApps();
  for (const a of apps) for (const t of a.targets) { const last = runs.filter((r) => r.targetId === t.id).sort((aa, bb) => bb.startedAt.localeCompare(aa.startedAt))[0]; if (last) { t.lastCheckAt = last.startedAt; t.findingsCount = last.findingsCount; t.lastGate = last.gate; } }
  return { runs, apps };
}

async function fetchFindings(): Promise<SecOpsFinding[]> {
  const data = await fetchJson('/api/fuzzer/findings');
  const arr: Record<string, unknown>[] = (data && typeof data === 'object') ? (Array.isArray((data as {findings?:unknown[]}).findings) ? (data as {findings:unknown[]}).findings as Record<string, unknown>[] : (Array.isArray(data) ? data as Record<string, unknown>[] : [])) : [];
  return arr.map((r) => mapFinding(r));
}

// ── Store ──
export const useSecopsStore = create<SecOpsStore>((set, get) => ({
  apps: seedApps(), setApps: (apps) => set({ apps }), addApp: (app) => set((s) => ({ apps: [...s.apps, app] })),
  getApp: (id) => get().apps.find((a) => a.id === id || a.targets.some((t) => t.id === id)),
  runs: [], setRuns: (runs) => set({ runs }),
  findings: [], setFindings: (findings) => set({ findings }),
  policies: seedPolicies(), setPolicies: (policies) => set({ policies }),
  refreshOverview: () => { fetchRunsAndSync().then(({ runs, apps }) => set({ runs, apps })).catch(() => {}); fetchFindings().then((findings) => set({ findings })).catch(() => {}); },
}));

// ── Init: polling + SSE ──
let _inited = false;
export function useSecopsLiveInit() {
  if (_inited) return; _inited = true;
  useSecopsStore.getState().refreshOverview();
  setInterval(() => useSecopsStore.getState().refreshOverview(), 10000);
  if (typeof EventSource !== 'undefined') {
    const connect = () => {
      const es = new EventSource('/api/fuzzer/findings/sse');
      es.addEventListener('message', (e: MessageEvent) => {
        try { const r = JSON.parse(e.data); if (r?.type === 'finding.created' && r.finding) { const f = mapFinding(r.finding as Record<string, unknown>); useSecopsStore.getState().setFindings([f, ...useSecopsStore.getState().findings].slice(0, 500)); } } catch { /* partial */ }
      });
      es.addEventListener('error', () => { es.close(); setTimeout(connect, 3000); });
    };
    connect();
  }
}