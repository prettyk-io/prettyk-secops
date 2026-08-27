/**
 * HeadquartersView — F-3/F-6 mode 1.
 * 60% war zone + 40% VideoTrack + bottom ticker.
 */
import { useRef } from 'react';
import { WarZoneCanvas } from '../canvas/WarZoneCanvas';
import { VideoTrack } from '../VideoTrack';
import { useExecutionSSE } from '../useExecutionSSE';
import { type HitEffect } from '../canvas/HitEffects';

interface HeadquartersViewProps {
  isLight: boolean;
  hitEffects: HitEffect[];
}

export function HeadquartersView({ isLight, hitEffects }: HeadquartersViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const stream = useExecutionSSE();
  const tickerEvents = stream.logs.slice(-7);

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: '#070B14' }}>
      <div className="flex-1 flex min-h-0">
        <div className="w-[60%] relative border-r border-slate-700/50" ref={mapRef}>
          <WarZoneCanvas isLight={isLight} containerRef={mapRef} hitEffects={hitEffects} />
        </div>
        <div className="w-[40%] flex flex-col" style={{ background: '#0F172A' }}>
          <div className="text-[10px] font-semibold text-slate-400 px-2 py-1 border-b border-slate-700/50 uppercase tracking-wider">
            Live Browser · Recording
          </div>
          <div className="flex-1">
            <VideoTrack />
          </div>
        </div>
      </div>
      <div className="h-7 flex items-center overflow-hidden border-t border-slate-700/50 shrink-0" style={{ background: '#0A0E1A' }}>
        <div className="flex items-center gap-3 px-3 animate-marquee whitespace-nowrap">
          {tickerEvents.map((e) => (
            <span key={e.id} className="text-[10px] text-slate-400 font-mono">
              <span className="text-cyan-500">{new Date(e.ts * 1000).toISOString().slice(11, 19)}</span>
              {' '}{e.text.slice(0, 80)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}