/**
 * PW-F2: Studio Record UX overlay поверх noVNC.
 *
 * Оверлей поверх noVNC: цветная рамка при наведении.
 * Клик → карточка с proposal (Accept/Reject).
 * Ambiguous-селектор → выбор из нескольких.
 */
import { cn } from '../lib/utils';
import { Check, X, Shield, MousePointer2 } from 'lucide-react';

export interface RecordOverlayCandidate {
  id: string;
  label: string;
  selector: string;
  score: number;
}

export interface RecordProposal {
  dsl: string;
  candidates: RecordOverlayCandidate[];
  selectedCandidate?: string;
}

export interface RecordOverlayProps {
  active?: boolean;
  candidates?: RecordOverlayCandidate[];
  proposal?: RecordProposal | null;
  onAccept?: (candidateId: string) => void;
  onReject?: () => void;
}

export function RecordOverlay({
  active = false,
  candidates = [],
  proposal = null,
  onAccept, onReject,
}: RecordOverlayProps) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Hover frames */}
      {candidates.map((c) => (
        <div
          key={c.id}
          className="absolute border-2 border-cyan-400/60 bg-cyan-500/5 pointer-events-auto cursor-pointer rounded"
          style={{
            top: '10%', left: '20%', width: '30%', height: '8%',
          }}
          onClick={() => onAccept?.(c.id)}
          title={c.selector}
        >
          <div className="absolute -top-5 left-0 text-[10px] text-cyan-300 bg-slate-900 px-1.5 py-0.5 rounded whitespace-nowrap border border-cyan-500/30">
            {c.label}
          </div>
        </div>
      ))}

      {/* Proposal card */}
      {proposal && (
        <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-cyan-500/30 bg-slate-900/95">
            <Shield className="size-4 text-cyan-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-400 font-medium">Предложен шаг</p>
              <code className="text-[11px] text-cyan-300 font-mono block">{proposal.dsl}</code>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onReject} className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors">
                <X className="size-3.5" />
              </button>
              <button onClick={() => onAccept?.(proposal.selectedCandidate ?? proposal.candidates[0]?.id ?? '')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-[10px] font-semibold">
                <Check className="size-3.5" /> Принять
              </button>
            </div>
          </div>
          {/* Ambiguous: выбор из нескольких */}
          {proposal.candidates.length > 1 && (
            <div className="mt-2 flex gap-2">
              {proposal.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onAccept?.(c.id)}
                  className={cn(
                    'text-[10px] px-2 py-1 rounded border border-slate-600 text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors',
                    proposal.selectedCandidate === c.id && 'border-cyan-400 text-cyan-300 bg-cyan-500/10',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}