/**
 * CO-PILOT META (PoC) BUD-7 — ClarificationChips.
 *
 * Уточнения Buddy → чипсы с хоткеями 1/2/3 (не простыня текста).
 * Клик или клавиша 1..9 (через useBuddyHotkeys) отправляет ответ.
 */
import { cn } from '../../lib/utils';
import type { Clarification } from './adapters';

export interface ClarificationChipsProps {
  clarification: Clarification;
  /** Выбор варианта (по id). */
  onSelect: (optionId: string) => void;
}

export function ClarificationChips({ clarification, onSelect }: ClarificationChipsProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="clarification-chips">
      <p className="text-[11px] text-slate-200 mb-2">{clarification.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {clarification.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors',
              'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
            )}
            data-testid={`clarification-chip-${opt.id}`}
            title={`Ответить (${opt.hotkey})`}
          >
            <kbd className="text-[9px] font-mono opacity-70">{opt.hotkey}</kbd>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
