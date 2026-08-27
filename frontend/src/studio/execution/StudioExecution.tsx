/**
 * StudioExecution — F-3/F-10 main execution hub.
 *
 * Master playhead syncs video, logs, canvas beams to a single time source.
 * Mode persisted in URL. SSE bridge feeds logs + markers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useThemeMode } from '../../theme/ThemeProvider';
import { useExecutionSSE } from './useExecutionSSE';
import { useExecutionVideoSource } from './useExecutionVideoSource';
import { useExecutionStore } from './useExecutionStore';
import { PlayheadBar } from './playhead/PlayheadBar';
import { HeadquartersView } from './modes/HeadquartersView';
import { AuditView } from './modes/AuditView';
import { BattlefieldView } from './modes/BattlefieldView';
import type { HitEffect } from './canvas/HitEffects';
import type { ExecutionMode } from './types';

const MODE_LABELS: Record<ExecutionMode, string> = {
  headquarters: 'Штаб',
  audit: 'Аудит',
  battlefield: 'Поле боя',
};

export function StudioExecution() {
  const { mode: themeMode } = useThemeMode();
  const isLight = themeMode === 'light';

  const store = useExecutionStore();
  const stream = useExecutionSSE();
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);

  // PW-E4: live-вид прогона — noVNC из live meta → VideoTrack
  useExecutionVideoSource();

  // Sync markers from SSE
  useEffect(() => { store.setMarkers(stream.markers); }, [stream.markers]);

  // Master playback timer (F-10: single clock for all components)
  useEffect(() => {
    if (!store.isPlaying) return;
    let lastTick = performance.now();
    const tick = () => {
      const now = performance.now();
      const s = useExecutionStore.getState();
      if (!s.isPlaying) return;
      const dt = (now - lastTick) / 1000 * s.playbackSpeed;
      lastTick = now;
      const next = s.currentTime + dt;
      if (next >= s.duration) {
        s.togglePlay();
        s.seek(0);
      } else {
        s.seek(next);
        // Advance beams by dt
        s.advanceBeams(dt * 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store.isPlaying]);

  // Mode from URL
  useEffect(() => {
    const hash = window.location.hash;
    const modeMatch = hash.match(/execution=(\w+)/);
    if (modeMatch && ['headquarters', 'audit', 'battlefield'].includes(modeMatch[1]!)) {
      store.setMode(modeMatch[1] as ExecutionMode);
    }
  }, []);

  const handleModeChange = useCallback((m: ExecutionMode) => {
    store.setMode(m);
    const hash = window.location.hash;
    const base = hash.replace(/&?execution=\w+/, '');
    const sep = base.includes('?') ? '&' : '?';
    window.history.replaceState(null, '', `${base}${sep}execution=${m}`);
  }, []);

  if (stream.events.length === 0 && !store.runId) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#070B14' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">⚔️</div>
          <div className="text-slate-400 text-sm font-medium">Запустите проверку</div>
          <div className="text-slate-600 text-xs mt-1">Данные боевой зоны появятся после старта прогона</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#070B14' }}>
      <div className="flex items-center justify-between px-3 py-1 shrink-0 border-b border-slate-700/50" style={{ background: '#0A0E1A' }}>
        <div className="flex items-center gap-1">
          {(['headquarters', 'audit', 'battlefield'] as ExecutionMode[]).map((m) => (
            <button key={m} onClick={() => handleModeChange(m)} className={`text-[11px] px-2 py-0.5 rounded transition-colors ${store.mode === m ? 'bg-cyan-500/15 text-cyan-400 font-semibold' : 'text-slate-500 hover:text-slate-300'}`}>{MODE_LABELS[m]}</button>
          ))}
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{stream.events.length}e · {stream.markers.length}m</span>
      </div>
      <PlayheadBar />
      {store.mode === 'headquarters' && <HeadquartersView isLight={isLight} hitEffects={hitEffects} />}
      {store.mode === 'audit' && <AuditView />}
      {store.mode === 'battlefield' && <BattlefieldView isLight={isLight} hitEffects={hitEffects} />}
    </div>
  );
}