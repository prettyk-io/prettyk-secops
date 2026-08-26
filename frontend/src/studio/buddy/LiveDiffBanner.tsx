/**
 * CO-PILOT META (PoC) BUD-8 — LiveDiffBanner.
 *
 * Компактный сплит-дифф (зелёный/красный) + [Apply=Enter] / [Reject=Esc].
 * Без явного Apply workspace НЕ меняется.
 */
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LiveDiff } from './adapters';

export interface LiveDiffBannerProps {
  diff: LiveDiff;
  onApply: () => void;
  onReject: () => void;
}

export function LiveDiffBanner({ diff, onApply, onReject }: LiveDiffBannerProps) {
  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 overflow-hidden" data-testid="live-diff-banner">
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-200">{diff.title}</div>

      {/* Сплит-дифф */}
      <div className="mx-3 my-2 rounded border border-slate-700/60 bg-[#0d1220] overflow-hidden font-mono text-[11px] leading-5">
        {diff.lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'px-2 whitespace-pre',
              line.type === 'add' && 'bg-emerald-500/10 text-emerald-300',
              line.type === 'remove' && 'bg-red-500/10 text-red-300 line-through',
              line.type === 'context' && 'text-slate-400',
            )}
          >
            <span className="select-none mr-2 text-slate-600">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
            </span>
            {line.text}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2">
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Отклонить (Esc)"
        >
          <X className="size-3" /> Reject
        </button>
        <button
          onClick={onApply}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-[10px] font-semibold transition-colors"
          title="Применить (Enter)"
        >
          <Check className="size-3" /> Apply <kbd className="text-[8px] font-mono opacity-70">⏎</kbd>
        </button>
      </div>
    </div>
  );
}
