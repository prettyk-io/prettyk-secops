/**
 * PlayheadBar — F-4/F-10 master timeline control.
 *
 * Single source of time for all Execution Hub components.
 * Video scrubs, logs scroll, beams recompute at t.
 * Markers clickable → seek to that moment.
 * Grey when no run_id.
 */
import { useCallback, useRef, useState } from 'react';
import { useExecutionStore } from '../useExecutionStore';
import type { TimelineMarker } from '../types';

const MARKER_COLORS: Record<TimelineMarker['kind'], string> = {
  step: '#3B82F6',
  fuzz: '#F59E0B',
  alert: '#EF4444',
  error: '#EAB308',
};

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = (Math.abs(seconds) % 60).toFixed(2);
  return `${seconds < 0 ? '-' : ''}${m}:${String(Math.floor(Number(s))).padStart(2, '0')}.${s.slice(-2)}`;
}

export function PlayheadBar() {
  const store = useExecutionStore();
  const { isPlaying, playbackSpeed, currentTime, duration, markers, runId, togglePlay, setSpeed, seek } = store;
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const inactive = !runId;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleScrub = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const rel = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seek(rel * duration);
    },
    [duration, seek],
  );

  const onBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (inactive) return;
      setScrubbing(true);
      handleScrub(e.clientX);
      const onMove = (ev: MouseEvent) => handleScrub(ev.clientX);
      const onUp = () => { setScrubbing(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mouseup', onUp);
    },
    [inactive, handleScrub],
  );

  return (
    <div className={`flex-shrink-0 ${inactive ? 'opacity-40 pointer-events-none' : ''}`} style={{ background: '#0F172A', borderBottom: '1px solid #1E293B' }}>
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-mono text-cyan-400 tabular-nums select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => seek(0)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors text-[10px]" title="Stop">⏹</button>
          <button onClick={togglePlay} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700/50 text-cyan-400 hover:text-cyan-300 transition-colors text-xs">{isPlaying ? '⏸' : '▶'}</button>
        </div>
        <div className="flex items-center gap-0.5">
          {[0.5, 1, 2, 4].map((spd) => (
            <button key={spd} onClick={() => setSpeed(spd)} className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${playbackSpeed === spd ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>{spd}×</button>
          ))}
        </div>
      </div>
      <div ref={barRef} className="relative h-6 cursor-pointer select-none mx-3 mb-1" onMouseDown={onBarMouseDown}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-700/50 rounded" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-cyan-500/40 rounded" style={{ left: 0, width: `${pct}%` }} />
        {markers.map((m, i) => {
          const mpct = duration > 0 ? ((m.ts % (duration || 1)) / duration) * 100 : 0;
          return (
            <div key={`${m.eventId ?? i}`} className="absolute top-0 w-1.5 rounded-full cursor-pointer hover:scale-150 transition-transform" style={{ left: `${mpct}%`, height: 6, marginTop: 2, backgroundColor: MARKER_COLORS[m.kind] }} title={m.label}
              onClick={(e) => { e.stopPropagation(); seek(m.ts % (duration || 1)); }} />
          );
        })}
        <div className="absolute top-0 w-3 h-6 bg-cyan-400 rounded shadow-glow-cyan cursor-grab" style={{ left: `${pct}%`, marginLeft: -6 }} />
      </div>
    </div>
  );
}