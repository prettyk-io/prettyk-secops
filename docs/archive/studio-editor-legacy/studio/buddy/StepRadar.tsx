/**
 * CO-PILOT META (PoC) BUD-9 — StepRadar (живая телеметрия + Take Control).
 *
 * НЕ слепой спиннер. Живая строка текущего шага + телеметрия + Mini-Stage PiP
 * (микро-превью CDP в углу) + кнопка Take Control (Space) — мгновенный стоп,
 * накопленное сохраняется.
 */
import { Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { StepRadarState } from './adapters';

export interface StepRadarProps {
  state: StepRadarState;
  /** Экстренный перехват управления (Space). */
  onTakeControl: () => void;
  /** Опциональное PiP-превью (base64 PNG или URL). */
  pipPreview?: string;
}

const STATUS_TONE: Record<StepRadarState['status'], { color: string; label: string }> = {
  running: { color: '#22d3ee', label: 'live' },
  success: { color: '#10b981', label: 'ok' },
  failed: { color: '#ef4444', label: 'fail' },
  stopped: { color: '#f59e0b', label: 'stopped' },
};

export function StepRadar({ state, onTakeControl, pipPreview }: StepRadarProps) {
  const tone = STATUS_TONE[state.status];
  const progress = state.totalSteps > 0 ? Math.round((state.currentStep / state.totalSteps) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-700/60 bg-[#131B2E] p-3" data-testid="step-radar">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: tone.color,
            boxShadow: state.status === 'running' ? `0 0 6px ${tone.color}` : 'none',
            animation: state.status === 'running' ? 'pk-led-pulse 1s ease-in-out infinite' : 'none',
          }}
          aria-hidden
        />
        <span className="text-[11px] font-bold text-slate-200 flex-1 min-w-0 truncate">
          ⚡ Buddy Run: Step {state.currentStep} of {state.totalSteps}
        </span>
        <span className="text-[9px] font-mono uppercase text-slate-500" style={{ color: tone.color }}>
          {tone.label}
        </span>
      </div>

      {/* Живая строка телеметрии */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1 rounded bg-slate-700/50 overflow-hidden">
          <div
            className="h-full rounded transition-all"
            style={{ width: `${progress}%`, background: tone.color }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500">{progress}%</span>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-[11px] font-mono text-cyan-300 truncate">{state.stepLabel}</code>
        {state.targetUrl && (
          <span className="text-[9px] font-mono text-slate-500 truncate max-w-[40%]">{state.targetUrl}</span>
        )}
      </div>

      {/* Telemetry line */}
      {(state.telemetry?.ms != null || state.telemetry?.memory) && (
        <div className="text-[9px] font-mono text-slate-500 mt-1.5">
          {state.telemetry?.ms != null ? `Telemetry: ${state.telemetry.ms}ms` : ''}
          {state.telemetry?.ms != null && state.telemetry?.memory ? ' | ' : ''}
          {state.telemetry?.memory ? `Memory: ${state.telemetry.memory}` : ''}
        </div>
      )}

      {/* Mini-Stage PiP + Take Control */}
      <div className="flex items-center gap-2 mt-2">
        {pipPreview && (
          <div className="relative w-16 h-11 rounded border border-slate-600/60 overflow-hidden shrink-0 bg-[#0d1220]">
            <img src={pipPreview} alt="Browser preview" className="w-full h-full object-cover" />
          </div>
        )}
        <button
          onClick={onTakeControl}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold transition-colors',
            'bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25',
          )}
          title="Остановить и взять управление (Space)"
          data-testid="take-control"
        >
          <Square className="size-3" /> Take Control <kbd className="text-[8px] font-mono opacity-70">Space</kbd>
        </button>
      </div>
    </div>
  );
}
