/**
 * CO-PILOT META (PoC) BUD-9 — EvidenceMatrix.
 *
 * Финал прогона: intent ↔ факты (evidence-first), НЕ «Test passed!».
 * Зелёные доказательства + advisory замечания.
 */
import { CheckCircle2, AlertTriangle, Camera, Code2, Network, ListTree } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { EvidenceItem, EvidenceMatrixView } from './adapters';

export interface EvidenceMatrixProps {
  matrix: EvidenceMatrixView;
}

const ICON: Record<EvidenceItem['icon'], React.ReactNode> = {
  http: <Network className="size-3.5" />,
  dom: <Code2 className="size-3.5" />,
  ax: <ListTree className="size-3.5" />,
  screenshot: <Camera className="size-3.5" />,
};

export function EvidenceMatrix({ matrix }: EvidenceMatrixProps) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-[#131B2E] p-3" data-testid="evidence-matrix">
      <div className="flex items-center gap-1.5 mb-2">
        {matrix.pass ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="size-4 text-amber-400" />
        )}
        <span className="text-[11px] font-bold text-slate-200">Результат проверки намерения</span>
      </div>

      <div className="text-[10px] font-semibold text-emerald-400 mb-1">Доказано фактами</div>
      <div className="flex flex-col gap-1 mb-2">
        {matrix.proven.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
            <span className="text-emerald-400 mt-0.5 shrink-0">{ICON[item.icon]}</span>
            <span>{item.text}</span>
            {item.ref && <a href={item.ref} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline break-all text-[10px]">{item.ref}</a>}
          </div>
        ))}
        {matrix.proven.length === 0 && (
          <div className="text-[11px] text-slate-500">Нет подтверждённых фактов</div>
        )}
      </div>

      {matrix.advisories.length > 0 && (
        <>
          <div className="text-[10px] font-semibold text-amber-400 mb-1">Замечания и риски</div>
          <div className="flex flex-col gap-1">
            {matrix.advisories.map((a, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                <AlertTriangle className="size-3 text-amber-400 mt-0.5 shrink-0" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
