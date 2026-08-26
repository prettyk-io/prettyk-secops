/**
 * PK-EC-9: Context Panel Shell — Target & Scope | Step Inspector | QWEN | Browser.
 * Step Inspector reads current line from Monaco, parses constructor, shows fields.
 * Tailwind, resize by width. 0 antd.
 */
import { useState, useCallback, useEffect } from 'react';
import { Target, Crosshair, Brain, Monitor, Shield, GripVertical } from 'lucide-react';

export interface ContextPanelProps {
  checkId?: string;
  title?: string;
  targetUrl?: string;
  /** Текущий конструктор из Monaco (на лету). */
  currentConstructor?: string;
  /** Ширина панели. */
  width?: number;
  onResize?: (w: number) => void;
}

const tabs = [
  { id: 'target', label: 'Target & Scope', icon: Target },
  { id: 'inspector', label: 'Step Inspector', icon: Crosshair },
  { id: 'qwen', label: 'QWEN', icon: Brain },
  { id: 'browser', label: 'Browser', icon: Monitor },
] as const;

function parseConstructorLine(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return { __empty: 'Пустая строка' };
  const parts = trimmed.split('|');
  if (parts.length >= 3) {
    return {
      'Component': parts[0]?.trim() ?? '?',
      'Action': parts[1]?.trim() ?? '?',
      'Argument': parts.slice(2).join('|').trim(),
    };
  }
  // PrettyK DSL: попытка распознать MethodId + аргументы
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return {
      'Method': words[0] ?? '?',
      'Strategy': words[1] ?? '?',
      'Value': words.slice(2).join(' ') || '—',
    };
  }
  return { 'Line': trimmed };
}

export function ContextPanel({
  checkId = 'juice-shop-1',
  title = 'Juice Shop — Auth & Scan',
  targetUrl = 'http://juice-shop:3000',
  currentConstructor = '',
  width = 300,
  onResize,
}: ContextPanelProps) {
  const [tab, setTab] = useState<string>('target');
  const [w, setW] = useState(width);
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback(() => setDragging(true), []);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const newW = Math.max(220, Math.min(520, window.innerWidth - e.clientX));
      setW(newW);
      onResize?.(newW);
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging, onResize]);

  const inspectorFields = parseConstructorLine(currentConstructor);

  return (
    <div className="shrink-0 flex overflow-hidden border-l border-slate-700/50 bg-[#0b101c]/95 backdrop-blur-md" style={{ width: w }}>
      {/* Resize grip */}
      <div
        className="w-1.5 cursor-ew-resize hover:bg-cyan-500/30 transition-colors shrink-0"
        onMouseDown={onDragStart}
      >
        <GripVertical className="size-3 text-slate-600 mt-2" />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center h-8 shrink-0 gap-0.5 px-1 border-b border-slate-700/30">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1 px-2 h-full text-[10px] font-semibold transition-colors border-b-2 ${
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">
          {tab === 'target' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Shield className="size-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200">Target & Scope</span>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Check ID</span>
                  <span className="text-slate-300 font-mono text-[11px]">{checkId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Title</span>
                  <span className="text-slate-200">{title}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Target URL</span>
                  <span className="text-slate-300 font-mono text-[11px] break-all">{targetUrl}</span>
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                  <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Auth Vault</span>
                  <span className="text-slate-400 italic">No auth profile assigned</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'inspector' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Crosshair className="size-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200">Step Inspector</span>
              </div>
              {currentConstructor ? (
                <div className="space-y-2">
                  <div className="rounded px-2 py-1.5 bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300 break-all">
                    {currentConstructor.trim() || '(empty)'}
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(inspectorFields).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-medium" style={{ fontFamily: '"Golos UI", sans-serif' }}>{k}</span>
                        <span className="text-slate-200 font-mono ml-2 truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Click a line in the editor to inspect.</p>
              )}
            </div>
          )}

          {tab === 'qwen' && (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Brain className="size-8 text-slate-700" />
              <p className="text-xs text-slate-500" style={{ fontFamily: '"Golos UI", sans-serif' }}>QWEN появится здесь</p>
            </div>
          )}

          {tab === 'browser' && (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Monitor className="size-8 text-slate-700" />
              <p className="text-xs text-slate-500" style={{ fontFamily: '"Golos UI", sans-serif' }}>Live Browser</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}