/**
 * PK-WB-A4: Segmented [Студия | Редактор] в WorkbenchHeader.
 * ВАЖНО: переключение не теряет active document, dirty state и контекст проверки.
 */
import { cn } from '../lib/utils';

export type WorkbenchMode = 'studio' | 'editor';

export interface StudioEditorSwitchProps {
  mode: WorkbenchMode;
  onChange: (mode: WorkbenchMode) => void;
  /** Есть ли несохранённые изменения в текущем документе. */
  hasDirty?: boolean;
}

export function StudioEditorSwitch({ mode, onChange, hasDirty = false }: StudioEditorSwitchProps) {
  return (
    <div className="flex items-center gap-0 p-0.5 rounded-md bg-slate-800 border border-slate-700" style={{ fontFamily: '"Golos UI", sans-serif' }}>
      <button
        onClick={() => onChange('studio')}
        className={cn(
          'px-3 py-1 text-[11px] font-semibold rounded transition-all',
          mode === 'studio'
            ? 'bg-cyan-500/15 text-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
            : 'text-slate-400 hover:text-slate-200',
        )}
      >
        Студия
      </button>
      <button
        onClick={() => onChange('editor')}
        className={cn(
          'px-3 py-1 text-[11px] font-semibold rounded transition-all flex items-center gap-1.5',
          mode === 'editor'
            ? 'bg-cyan-500/15 text-cyan-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
            : 'text-slate-400 hover:text-slate-200',
        )}
      >
        Редактор
        {hasDirty && (
          <span className="size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] animate-pulse" />
        )}
      </button>
    </div>
  );
}

/** Тип события переключения — для логгирования и аудита. */
export interface WorkbenchModeChangeEvent {
  from: WorkbenchMode;
  to: WorkbenchMode;
  /** Сохранён ли dirty документ перед переходом. */
  dirtyFlushed: boolean;
  /** ID активного документа до перехода. */
  activeDocId?: string;
}