/**
 * PK-BL-9: Live Phase Rail — 6 phases, SSE subscription, progress bars.
 */
import { useState, useEffect, useMemo } from 'react';
import { Shield, Bug, Gavel, Box, Activity, CheckCircle } from 'lucide-react';

export type PhaseId = 'discovery' | 'auth' | 'scan' | 'fuzz' | 'gate' | 'evidence';

export interface PhaseState {
  id: PhaseId;
  label: string;
  icon: React.ReactNode;
  status: 'idle' | 'running' | 'done' | 'failed';
  progress: number; // 0–100
  detail: string;
}

const DEFAULT_PHASES: PhaseState[] = [
  { id: 'discovery', label: 'Discovery', icon: <Activity className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
  { id: 'auth', label: 'Auth', icon: <Shield className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
  { id: 'scan', label: 'Scan', icon: <Bug className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
  { id: 'fuzz', label: 'Fuzz', icon: <Activity className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
  { id: 'gate', label: 'Gate', icon: <Gavel className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
  { id: 'evidence', label: 'Evidence', icon: <Box className="size-3.5" />, status: 'idle', progress: 0, detail: '—' },
];

export interface LivePhaseRailProps {
  /** SSE subscription — передаётся извне. По умолчанию демо. */
  phases?: PhaseState[];
}

export function LivePhaseRail({ phases: externalPhases }: LivePhaseRailProps) {
  const [internalPhases, setInternalPhases] = useState<PhaseState[]>(DEFAULT_PHASES);
  const [demoIdx, setDemoIdx] = useState(0);

  // Demo: симулирует прогресс фаз раз в 2 секунды
  useEffect(() => {
    if (externalPhases) return;
    if (demoIdx >= DEFAULT_PHASES.length) return;
    const timer = setTimeout(() => {
      setInternalPhases((prev) => {
        const next = [...prev];
        const current = next[demoIdx]!;
        if (current.progress < 100) {
          current.status = 'running';
          current.progress = Math.min(100, current.progress + 5);
          current.detail = `${current.progress}%`;
        } else {
          current.status = 'done';
          current.detail = 'completed';
          setDemoIdx((i) => i + 1);
        }
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [demoIdx, internalPhases, externalPhases]);

  const phases = externalPhases ?? internalPhases;

  return (
    <div className="space-y-1.5">
      {phases.map((p, i) => {
        const isFirstRunning = phases.findIndex((x) => x.status === 'running') === i;
        const isActive = p.status === 'running' || p.status === 'failed' || (p.status === 'done' && i === phases.findIndex((x) => x.status === 'idle') - 1);
        const barColor = p.status === 'failed' ? 'bg-red-400' : p.status === 'done' ? 'bg-emerald-400' : 'bg-cyan-400';

        return (
          <div key={p.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-white/[0.03]' : ''}`}>
            {/* Phase icon + label */}
            <div className={`size-7 rounded flex items-center justify-center shrink-0 transition-colors ${
              p.status === 'running' ? 'bg-cyan-500/20 text-cyan-400' :
              p.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' :
              p.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              'bg-slate-800 text-slate-500'
            }`}>
              {p.status === 'done' ? <CheckCircle className="size-3.5" /> : p.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[11px] font-semibold ${p.status === 'idle' ? 'text-slate-500' : 'text-slate-200'}`}>{p.label}</span>
                {isFirstRunning && (
                  <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">RUNNING</span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColor} ${p.status === 'running' ? 'animate-pulse' : ''}`}
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-500 font-mono block mt-0.5">{p.detail}</span>
            </div>
          </div>
        );
      })}
      {!phases.some((p) => p.status === 'running') && !phases.some((p) => p.status === 'done') && (
        <p className="text-center text-[10px] text-slate-600 py-2">Waiting for pipeline start…</p>
      )}
    </div>
  );
}