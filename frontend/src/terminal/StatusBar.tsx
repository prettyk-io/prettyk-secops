/**
 * PK-EC-8: Status Bar — 24px, checkId | DSL type | Line:Col | scanner State | Last validation.
 * Tailwind, monospace for coordinates.
 */
export interface StatusBarProps {
  checkId: string;
  languageId?: string;
  /** Monaco position: { line, column }. */
  cursor?: { line: number; column: number };
  /** scanner state — static mock for now. */
  scannerState?: 'ready' | 'busy' | 'down';
  /** Last validation time (relative). */
  lastValidation?: string;
}

export function StatusBar({
  checkId,
  languageId = 'PrettyK DSL',
  cursor = { line: 1, column: 1 },
  scannerState = 'ready',
  lastValidation = '0.4s ago',
}: StatusBarProps) {
  const scannerColors = {
    ready: 'text-emerald-400',
    busy: 'text-cyan-400',
    down: 'text-red-400',
  };

  return (
    <footer className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-slate-700/50 bg-[#080c14] text-[10px] select-none z-20">
      {/* checkId (truncated) */}
      <span className="text-slate-500 font-mono max-w-[120px] truncate" title={checkId}>
        {checkId}
      </span>

      <span className="text-slate-600">·</span>

      {/* DSL type */}
      <span className="text-slate-400" style={{ fontFamily: '"Golos UI", sans-serif' }}>
        {languageId}
      </span>

      <div className="flex-1" />

      {/* Line:Col — monospace */}
      <span className="text-slate-400 font-mono tabular-nums">
        Ln <span className="text-slate-300">{cursor.line}</span>, Col <span className="text-slate-300">{cursor.column}</span>
      </span>

      <span className="text-slate-600">·</span>

      {/* scanner State */}
      <div className="flex items-center gap-1">
        <div className={`size-1.5 rounded-full ${scannerColors[scannerState]}`} />
        <span className={`${scannerColors[scannerState]}`} style={{ fontFamily: '"Golos UI", sans-serif' }}>
          scanner {scannerState === 'ready' ? 'Ready' : scannerState === 'busy' ? 'Busy' : 'Down'}
        </span>
      </div>

      <span className="text-slate-600">·</span>

      {/* Last validation */}
      <span className="text-slate-500 font-mono">{lastValidation}</span>
    </footer>
  );
}