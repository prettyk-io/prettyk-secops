/**
 * PK-BL-10: Baseline Delta Ledger & Verdict Card — сравнение с предыдущим прогоном, Gate Verdict.
 */
import { TrendingUp, TrendingDown, Minus, Shield, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

export interface DeltaItem {
  label: string;
  current: number;
  previous: number;
  unit?: string;
}

export interface BaselineDeltaLedgerProps {
  items: DeltaItem[];
  /** Дата предыдущего прогона. */
  previousRunDate?: string;
  /** Gate verdict. */
  gate?: 'passed' | 'failed' | 'watch' | 'pending';
  gateReason?: string;
}

function deltaColor(c: number, p: number): string {
  if (c > p) return 'text-red-400';
  if (c < p) return 'text-emerald-400';
  return 'text-slate-500';
}

function DeltaIcon({ current, previous }: { current: number; previous: number }) {
  if (current > previous) return <TrendingUp className="size-3 text-red-400" />;
  if (current < previous) return <TrendingDown className="size-3 text-emerald-400" />;
  return <Minus className="size-3 text-slate-500" />;
}

export function BaselineDeltaLedger({ items, previousRunDate = '2026-08-23 14:22', gate = 'pending', gateReason }: BaselineDeltaLedgerProps) {
  const verdictConfig = {
    passed: { icon: <CheckCircle className="size-14 text-emerald-400" />, bg: 'border-emerald-400/30 bg-emerald-500/5', label: 'PASSED', labelColor: 'text-emerald-400' },
    failed: { icon: <XCircle className="size-14 text-red-400" />, bg: 'border-red-400/30 bg-red-500/5', label: 'FAILED', labelColor: 'text-red-400' },
    watch: { icon: <AlertTriangle className="size-14 text-amber-400" />, bg: 'border-amber-400/30 bg-amber-500/5', label: 'WATCH', labelColor: 'text-amber-400' },
    pending: { icon: <Clock className="size-14 text-slate-500" />, bg: 'border-slate-600/30 bg-slate-500/5', label: 'PENDING', labelColor: 'text-slate-400' },
  };

  const v = verdictConfig[gate];

  return (
    <div className="space-y-4">
      {/* Verdict card */}
      <div className={`flex flex-col items-center gap-2 py-6 rounded-xl border ${v.bg}`}>
        {v.icon}
        <span className={`text-sm font-black uppercase tracking-widest ${v.labelColor}`}>{v.label}</span>
        {gateReason && <p className="text-[10px] text-slate-400 max-w-[280px] text-center">{gateReason}</p>}
      </div>

      {/* Delta ledger */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Delta vs {previousRunDate}</span>
          <span className="text-[9px] text-slate-600 font-mono">previous</span>
        </div>
        {items.map((item) => {
          const diff = item.current - item.previous;
          const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
          const isNew = item.previous === 0 && item.current > 0;
          const isResolved = item.current === 0 && item.previous > 0;

          return (
            <div key={item.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/50">
              <DeltaIcon current={item.current} previous={item.previous} />
              <span className="flex-1 text-[11px] text-slate-300 font-medium">{item.label}</span>
              <span className={`text-[11px] font-bold font-mono ${deltaColor(item.current, item.previous)}`}>
                {item.current}
                {item.unit ?? ''}
              </span>
              <span className={`text-[10px] font-mono ml-1 ${
                isResolved ? 'text-emerald-400' :
                isNew ? 'text-red-400' :
                diff === 0 ? 'text-slate-500' :
                diff > 0 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {isNew ? 'NEW' : isResolved ? 'RESOLVED' : diffStr}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}