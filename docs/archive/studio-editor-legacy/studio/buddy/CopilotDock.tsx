/**
 * CO-PILOT META (PoC) BUD-6 — Copilot Dock + Launchpad рельс.
 *
 * Правый штурманский док Buddy: развёрнут 320–380px, схлопывается в 36px рельс
 * с LED-индикатором активности. Виджеты (SkeletonCard / ClarificationChips /
 * LiveDiffBanner / StepRadar / EvidenceMatrix) — дети через пропсы.
 */
import type { ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BuddyPhase } from './adapters';

/** Цвет + пульс LED-рельса по фазе. */
const PHASE_LED: Record<BuddyPhase, { color: string; pulse: boolean; label: string }> = {
  idle:     { color: '#22d3ee', pulse: false, label: 'готов' },
  thinking: { color: '#a855f7', pulse: true,  label: 'думает' },
  waiting:  { color: '#f59e0b', pulse: true,  label: 'ждёт ответа' },
  running:  { color: '#22d3ee', pulse: true,  label: 'фоновый запуск' },
  done:     { color: '#10b981', pulse: false, label: 'завершено' },
  error:    { color: '#ef4444', pulse: true,  label: 'ошибка' },
};

export interface CopilotDockProps {
  /** Активная фаза Buddy (LED-рельс). */
  phase: BuddyPhase;
  /** Развёрнут ли док. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Заголовок панели (короткий статус Buddy). */
  title?: string;
  /** Ширина в px (канон 320–380). */
  width?: number;
  /** Виджеты внутри дока. */
  children?: ReactNode;
}

/** Тонкий 36px рельс с LED-пульсом — схлопнутое состояние. */
export function CopilotRail({
  phase,
  onToggleExpanded,
  title,
}: {
  phase: BuddyPhase;
  onToggleExpanded: () => void;
  title?: string;
}) {
  const led = PHASE_LED[phase];
  return (
    <aside
      className="flex flex-col items-center gap-3 py-2 w-9 shrink-0 border-l border-slate-700/50 bg-[#0B0F17]"
      style={{ width: 36 }}
      data-testid="buddy-rail"
      title={`Buddy: ${title ?? led.label}`}
    >
      <button
        onClick={onToggleExpanded}
        className="p-1 rounded hover:bg-white/5 text-slate-400"
        title="Развернуть Buddy"
        aria-label="Развернуть Buddy"
      >
        <PanelRightOpen className="size-4" />
      </button>
      <span
        className="rounded-full shrink-0"
        style={{
          width: 8,
          height: 8,
          background: led.color,
          boxShadow: led.pulse ? `0 0 8px ${led.color}` : 'none',
          animation: led.pulse ? 'pk-led-pulse 1.2s ease-in-out infinite' : 'none',
        }}
        aria-label={led.label}
      />
      <Sparkles className="size-3.5 text-[#a855f7]" />
    </aside>
  );
}

/** Развёрнутый правый док Buddy. */
export function CopilotDock({
  phase,
  expanded,
  onToggleExpanded,
  title,
  width = 340,
  children,
}: CopilotDockProps) {
  if (!expanded) {
    return <CopilotRail phase={phase} onToggleExpanded={onToggleExpanded} title={title} />;
  }

  const led = PHASE_LED[phase];

  return (
    <aside
      className="shrink-0 flex flex-col overflow-hidden border-l border-slate-700/50 bg-[#0B0F17]"
      style={{ width }}
      data-testid="buddy-dock"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-slate-700/30 bg-[#0d1220]/90">
        <span
          className="rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: led.color,
            boxShadow: led.pulse ? `0 0 6px ${led.color}` : 'none',
            animation: led.pulse ? 'pk-led-pulse 1.2s ease-in-out infinite' : 'none',
          }}
          aria-hidden
        />
        <span className="flex items-center gap-1.5 flex-1 min-w-0 text-[11px] font-semibold text-slate-200 truncate">
          <Sparkles className="size-3.5 text-[#a855f7] shrink-0" />
          {title ?? 'Buddy'}
        </span>
        <button
          onClick={onToggleExpanded}
          className={cn('p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5')}
          title="Свернуть в рельс"
          aria-label="Свернуть Buddy"
        >
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      {/* Body — виджеты */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">{children}</div>
    </aside>
  );
}
