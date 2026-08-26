/**
 * PK-EC-7: Bottom Drawer Shell — Problems | Step Timeline | Evidence tabs.
 * Tailwind, auto-open on validation error or run start.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bug, Activity, Package, ChevronUp, X,
} from 'lucide-react';

export interface MockStepEvent {
  step: string;
  status: 'running' | 'success' | 'failed';
  time: string;
}

const mockStepTimeline: MockStepEvent[] = [
  { step: 'Open URL', status: 'success', time: '14:32:01' },
  { step: 'Type login', status: 'success', time: '14:32:03' },
  { step: 'Click Submit', status: 'running', time: '14:32:05' },
];

export interface BottomDrawerProps {
  /** Управляется из workspaceStore. */
  open: boolean;
  onToggle: () => void;
  /** Авто-открытие при ошибке валидации. */
  hasErrors: boolean;
  /** Авто-открытие при старте run. */
  isRunning: boolean;
}

const tabs = [
  { id: 'problems', label: 'Problems', icon: Bug },
  { id: 'timeline', label: 'Step Timeline', icon: Activity },
  { id: 'evidence', label: 'Evidence', icon: Package },
] as const;

export function BottomDrawer({ open, onToggle, hasErrors, isRunning }: BottomDrawerProps) {
  const [tab, setTab] = useState<string>('problems');
  const [height, setHeight] = useState(192);
  const [dragging, setDragging] = useState(false);

  // Auto-open
  useEffect(() => {
    if ((hasErrors || isRunning) && !open) onToggle();
  }, [hasErrors, isRunning]);

  // Drag resize
  const onDragStart = useCallback(() => { setDragging(true); }, []);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const maxH = window.innerHeight - 200;
      setHeight(Math.max(80, Math.min(maxH, maxH - e.clientY + 60)));
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging]);

  if (!open) return null;

  return (
    <div className="shrink-0 flex flex-col overflow-hidden border-t border-slate-700/50 bg-[#0b101c]/95 backdrop-blur-md" style={{ height }}>
      {/* Drag handle */}
      <div
        className="h-1.5 cursor-ns-resize hover:bg-cyan-500/30 transition-colors shrink-0"
        onMouseDown={onDragStart}
      />

      {/* Tab bar */}
      <div className="flex items-center h-8 shrink-0 px-2 border-b border-slate-700/30 gap-0.5">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 h-full text-[10px] font-semibold transition-colors border-b-2 ${
                active
                  ? 'text-cyan-400 border-cyan-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
              style={{ fontFamily: '"Golos UI", sans-serif' }}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={onToggle} className="p-1 rounded hover:bg-white/5 text-slate-400">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {tab === 'problems' && (
          <div className="text-center py-6">
            <Bug className="size-6 text-slate-600 mx-auto mb-1" />
            <p className="text-xs text-slate-400" style={{ fontFamily: '"Golos UI", sans-serif' }}>0 ошибок</p>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="space-y-1.5">
            {mockStepTimeline.map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-xs">
                <div className={`size-2 rounded-full shrink-0 ${
                  s.status === 'success' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' :
                  s.status === 'running' ? 'bg-cyan-400 shadow-[0_0_6px_#38bdf8] animate-pulse' :
                  'bg-red-400'
                }`} />
                <span className="text-slate-300 flex-1" style={{ fontFamily: '"Golos UI", sans-serif' }}>{s.step}</span>
                <span className="text-[10px] text-slate-500 font-mono">{s.time}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'evidence' && (
          <div className="text-center py-6">
            <Package className="size-6 text-slate-600 mx-auto mb-1" />
            <p className="text-xs text-slate-400" style={{ fontFamily: '"Golos UI", sans-serif' }}>Нет артефактов</p>
          </div>
        )}
      </div>
    </div>
  );
}