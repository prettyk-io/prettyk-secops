/**
 * WZ-6: Три режима Execution Hub.
 *
 * (1) Hybrid Operational   — War Zone 60% + видео 40% + лог-тикер
 * (2) Enterprise Audit     — двойной лог System/Security
 * (3) Signature Battlefield — полноэкранный командный центр + HUD
 *
 * HUD (всегда сверху): текущий t, активные лучи, findings count, node_hits.
 * Переключение режима НЕ сбрасывает playhead (t живёт в родителе).
 */
import type { SceneState } from './useWarZoneTelemetry';

export type WarzoneMode = 'hybrid' | 'audit' | 'battlefield';

export interface WarzoneModesProps {
  mode: WarzoneMode;
  /** Текущий playhead (сек) — общий для всех режимов. */
  t: number;
  /** Полная длительность прогона (сек). */
  durationS: number;
  /** Сцена из SSE/mock. */
  scene: SceneState;
  /** События для лог-тикера и двойного лога. */
  logs: { ts: number; channel: 'system' | 'security'; text: string }[];
}

const MODE_META: { id: WarzoneMode; label: string; hint: string }[] = [
  { id: 'hybrid', label: 'Hybrid Operational', hint: 'War Zone + видео + тикер' },
  { id: 'audit', label: 'Enterprise Audit', hint: 'двойной лог System/Security' },
  { id: 'battlefield', label: 'Signature Battlefield', hint: 'командный центр + HUD' },
];

/** HUD — текущий t, активные лучи, findings, node_hits. */
export function WarzoneHud({ t, scene }: { t: number; scene: SceneState }) {
  const totalFindings = scene.findings.reduce((sum, f) => sum + f.count, 0);
  const totalHits = scene.node_hits.reduce((sum, n) => sum + n.hits, 0);
  const fmtT = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 shrink-0 border-b border-slate-700/50" style={{ background: '#0A0E1A', fontFamily: 'Golos UI, sans-serif' }}>
      <span className="text-[11px] font-mono font-semibold" style={{ color: '#22d3ee' }}>t {fmtT}</span>
      <span className="text-[11px] font-mono" style={{ color: '#f43f5e' }}>лучи {scene.active_beams.length}</span>
      <span className="text-[11px] font-mono" style={{ color: '#f59e0b' }}>findings {totalFindings}</span>
      <span className="text-[11px] font-mono" style={{ color: '#10b981' }}>node_hits {totalHits}</span>
    </div>
  );
}

function WarZonePlaceholder({ ratio }: { ratio: string }) {
  return (
    <div className="flex items-center justify-center border border-slate-800 rounded" style={{ background: '#070B14', height: '100%', minHeight: 200 }}>
      <span className="text-xs" style={{ color: '#334155' }}>War Zone {ratio}</span>
    </div>
  );
}

function VideoPlaceholder() {
  return (
    <div className="flex items-center justify-center border border-slate-800 rounded" style={{ background: '#0F172A', height: '100%', minHeight: 200 }}>
      <span className="text-xs" style={{ color: '#334155' }}>Video / Live</span>
    </div>
  );
}

function LogTicker({ logs }: { logs: { ts: number; text: string }[] }) {
  const tail = logs.slice(-7);
  return (
    <div className="h-7 flex items-center overflow-hidden border-t border-slate-700/50 shrink-0" style={{ background: '#0A0E1A' }}>
      <div className="flex items-center gap-3 px-3 whitespace-nowrap">
        {tail.map((l, i) => (
          <span key={i} className="text-[10px] font-mono" style={{ color: '#94a3b8' }}>
            <span style={{ color: '#22d3ee' }}>{new Date(l.ts * 1000).toISOString().slice(11, 19)}</span> {l.text.slice(0, 80)}
          </span>
        ))}
      </div>
    </div>
  );
}

function DualLog({ logs }: { logs: { ts: number; channel: 'system' | 'security'; text: string }[] }) {
  const system = logs.filter((l) => l.channel === 'system').slice(-60);
  const security = logs.filter((l) => l.channel === 'security').slice(-60);
  const col = (title: string, color: string, items: typeof system) => (
    <div className="flex-1 flex flex-col min-h-0 border-r border-slate-700/50 last:border-r-0">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border-b border-slate-700/50" style={{ color }}>{title}</div>
      <div className="flex-1 overflow-y-auto px-2 py-1 text-[11px] font-mono">
        {items.length === 0 ? <span className="text-slate-600">нет событий</span> : items.map((l, i) => (
          <div key={i} className="flex gap-2" style={{ color: '#94a3b8' }}>
            <span className="shrink-0" style={{ color: '#22d3ee' }}>{new Date(l.ts * 1000).toISOString().slice(11, 19)}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return <div className="flex-1 flex min-h-0">{col('System', '#38bdf8', system)}{col('Security', '#f43f5e', security)}</div>;
}

export function WarzoneModes({ mode, t, durationS, scene, logs }: WarzoneModesProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#070B14' }}>
      <WarzoneHud t={t} scene={scene} />

      {/* Переключатель режимов */}
      <div className="flex items-center gap-1 px-3 py-1 shrink-0 border-b border-slate-700/50" style={{ background: '#0A0E1A' }}>
        {MODE_META.map((m) => (
          <span
            key={m.id}
            className="px-2.5 py-0.5 rounded text-[11px] transition-colors"
            style={{
              background: mode === m.id ? 'rgba(34,211,238,0.12)' : 'transparent',
              color: mode === m.id ? '#22d3ee' : '#64748b',
              fontFamily: 'Golos UI, sans-serif',
            }}
          >
            {m.label}
          </span>
        ))}
        <span className="ml-auto text-[10px] font-mono" style={{ color: '#475569' }}>{Math.floor(durationS)}s</span>
      </div>

      {/* Тело режима */}
      <div className="flex-1 flex flex-col min-h-0">
        {mode === 'hybrid' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex min-h-0 p-2 gap-2">
              <div className="w-[60%]"><WarZonePlaceholder ratio="60%" /></div>
              <div className="w-[40%]"><VideoPlaceholder /></div>
            </div>
            <LogTicker logs={logs} />
          </div>
        )}
        {mode === 'audit' && (
          <div className="flex-1 flex min-h-0 p-2">
            <DualLog logs={logs} />
          </div>
        )}
        {mode === 'battlefield' && (
          <div className="flex-1 relative min-h-0">
            <WarZonePlaceholder ratio="fullscreen" />
            <div className="absolute top-2 right-2 flex flex-col gap-1 text-[10px] font-mono" style={{ color: '#94a3b8' }}>
              <span style={{ color: '#22d3ee' }}>t {t.toFixed(1)}s</span>
              <span style={{ color: '#f43f5e' }}>{scene.active_beams.length} beams</span>
              <span style={{ color: '#f59e0b' }}>{scene.findings.reduce((s, f) => s + f.count, 0)} findings</span>
              <span style={{ color: '#10b981' }}>{scene.node_hits.reduce((s, n) => s + n.hits, 0)} hits</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
