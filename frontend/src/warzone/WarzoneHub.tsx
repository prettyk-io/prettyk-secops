/**
 * WZ-6: WarzoneHub — Execution Hub с общим таймлайном и тремя режимами.
 *
 * Ключевой инвариант: playhead (t) живёт в родителе и НЕ сбрасывается
 * при переключении режима. Переключение — только выбор вью.
 *
 * WZ-SSE: данные HUD приходят из useWarZoneTelemetry (живой SceneState
 * или честный mock), не из локальных хардкодов.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWarZoneTelemetry, type SceneState } from './useWarZoneTelemetry';
import { WarzoneModes, type WarzoneMode } from './WarzoneModes';

const DURATION_S = 120;

const DEMO_LOGS = [
  { ts: 0.5, channel: 'system' as const, text: 'bootstrap' },
  { ts: 1.2, channel: 'system' as const, text: 'scenario loaded' },
  { ts: 2.0, channel: 'security' as const, text: 'scanner scan started' },
  { ts: 3.1, channel: 'system' as const, text: 'step: Open /login' },
  { ts: 4.0, channel: 'security' as const, text: 'fuzzer beam armed' },
  { ts: 5.5, channel: 'system' as const, text: 'step: Click #btn' },
];

export function WarzoneHub() {
  const { scene, live } = useWarZoneTelemetry();
  const [mode, setMode] = useState<WarzoneMode>('hybrid');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // Playhead: общий rAF-цикл, не привязан к режиму.
  useEffect(() => {
    if (!playing) return;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setT((prev) => (prev >= DURATION_S ? 0 : prev + dt));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const logs = useMemo(() => DEMO_LOGS, []);

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#070B14' }}>
      {/* Топ-бар: title + play/pause + live-индикатор */}
      <div className="flex items-center gap-3 px-3 h-10 shrink-0 border-b border-slate-700/50" style={{ background: '#0A0E1A' }}>
        <span className="text-sm font-semibold" style={{ color: '#e2e8f0', fontFamily: 'Golos UI, sans-serif' }}>⚔️ WarZone</span>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="px-2.5 py-1 rounded text-[11px] font-semibold"
          style={{ background: playing ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: playing ? '#ef4444' : '#22c55e' }}
        >
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: live ? 'rgba(34,211,238,0.1)' : 'rgba(100,116,139,0.1)', color: live ? '#22d3ee' : '#64748b' }}>
          {live ? '● live SSE' : 'mock'}
        </span>
      </div>

      <WarzoneModes mode={mode} t={t} durationS={DURATION_S} scene={scene} logs={logs} />

      {/* Нижняя панель: переключение режима (не трогает playhead) */}
      <div className="flex items-center gap-1 px-3 py-1 shrink-0 border-t border-slate-700/50" style={{ background: '#0A0E1A' }}>
        {(['hybrid', 'audit', 'battlefield'] as WarzoneMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors"
            style={{ background: mode === m ? 'rgba(168,85,247,0.15)' : 'transparent', color: mode === m ? '#a855f7' : '#64748b' }}
          >
            {m === 'hybrid' ? 'Hybrid' : m === 'audit' ? 'Audit' : 'Battlefield'}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono" style={{ color: '#475569' }}>playhead {t.toFixed(1)}s</span>
      </div>
    </div>
  );
}
