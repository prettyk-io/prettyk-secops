/**
 * PK-EC-6: Workbench Header — 44px, PrettyK logo, target badge, Run ▼ menu, user avatar.
 * Tailwind, cyan/violet канон. 0 antd.
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Play, Shield, Monitor, ChevronUp, Save, Check, Package } from 'lucide-react';
import { StudioEditorSwitch, type WorkbenchMode } from './StudioEditorSwitch';

export interface WorkbenchHeaderProps {
  /** Target name + URL для badge. */
  target?: { name?: string; url?: string };
  /** Статус проверки. */
  status?: 'draft' | 'validated' | 'failed';
  /** Никнейм пользователя. */
  userName?: string;
  /** Текущий режим Workbench (PK-WB-A4). */
  mode?: WorkbenchMode;
  /** Колбэк при переключении Студия ↔ Редактор. */
  onModeChange?: (mode: WorkbenchMode) => void;
  /** Есть ли несохранённые изменения. */
  hasDirty?: boolean;
  /** Колбэки на действия. */
  onValidate?: () => void;
  onRunStep?: () => void;
  onRunFull?: () => void;
  onOpenWarRoom?: () => void;
  onLogout?: () => void;
}

export function WorkbenchHeader({
  target = { name: 'Juice Shop Auth', url: 'http://juice-shop:3000' },
  status = 'draft',
  userName = 'АИ',
  mode = 'editor',
  onModeChange,
  hasDirty = false,
  onValidate,
  onRunStep,
  onRunFull,
  onOpenWarRoom,
  onLogout,
}: WorkbenchHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusColors = {
    validated: { dot: 'bg-emerald-400 shadow-emerald-400/40', text: 'text-emerald-400', label: 'Validated' },
    draft: { dot: 'bg-amber-400 shadow-amber-400/40', text: 'text-amber-400', label: 'Draft' },
    failed: { dot: 'bg-red-400 shadow-red-400/40', text: 'text-red-400', label: 'Failed' },
  };
  const sc = statusColors[status];

  return (
    <header className="h-11 shrink-0 flex items-center gap-3 px-3 border-b border-slate-700/50 bg-[#0b101c]/95 backdrop-blur-md z-30 select-none">
      {/* Left: PrettyK logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center justify-center size-7 rounded shrink-0" style={{ background: 'linear-gradient(135deg, #0ea5e9, #7c3aed)' }}>
          <Shield className="size-4 text-white" />
        </div>
        <span className="text-sm font-bold tracking-tight text-slate-100" style={{ fontFamily: '"Golos UI", sans-serif' }}>
          Pretty<strong style={{ color: '#38bdf8' }}>K</strong>
        </span>
      </div>

      <div className="w-px h-5 mx-0.5 bg-slate-700/50 shrink-0" />

      {/* Center: Target badge */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className={`size-2 rounded-full shrink-0 shadow-[0_0_6px_var(--tw-shadow-color)] ${sc.dot}`} />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200 truncate" style={{ fontFamily: '"Golos UI", sans-serif' }}>
            {target.name || 'Untitled Check'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono truncate">
            {target.url || '—'}
          </div>
        </div>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${sc.text} bg-white/5 border border-white/10 shrink-0`}>
          {sc.label}
        </span>
      </div>

      {/* PK-WB-A4: Studio | Editor switch — center */}
      {onModeChange && (
        <div className="flex justify-center shrink-0">
          <StudioEditorSwitch mode={mode} onChange={onModeChange} hasDirty={hasDirty} />
        </div>
      )}

      {/* Right: Run menu + avatar */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Run ▼ menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #7c3aed)' }}
          >
            <Play className="size-3.5" /> Run {menuOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl z-40 py-1">
              {[
                { label: 'Validate Document', icon: <Shield className="size-3.5" />, action: onValidate },
                { label: 'Run Current Step', icon: <Play className="size-3.5" />, action: onRunStep },
                { label: 'Run Full Check', icon: <Play className="size-3.5" />, action: onRunFull },
                { label: 'Open War Room', icon: <Monitor className="size-3.5" />, action: onOpenWarRoom },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => { item.action?.(); setMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ⌘K placeholder */}
        <button className="flex items-center gap-1 px-2 h-7 rounded text-[10px] font-semibold text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
          <span className="font-mono">⌘</span>K
        </button>

        {/* User avatar + logout */}
        <button
          onClick={onLogout}
          className="flex items-center justify-center size-7 rounded-full shrink-0 text-xs font-bold text-white hover:ring-2 hover:ring-cyan-400/50 transition-all"
          style={{ background: 'linear-gradient(135deg, #38bdf8, #7c3aed)' }}
          title={userName}
        >
          {userName.slice(0, 2).toUpperCase()}
        </button>
      </div>
    </header>
  );
}