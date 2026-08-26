/**
 * PK-WB-B2 / POC-CDP-1: Browser Stage Shell — permanent right panel in Author/Record/Debug modes.
 * LIVE CDP via BrowserSession (no more mock).
 */

import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Monitor, Circle, Bug, PanelRightClose, PanelRightOpen, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { getBrowserSession } from '../studio/browserSession';
import type { BrowserSessionStatus } from '../studio/browserSession';

export type BrowserStageMode = 'author' | 'record' | 'debug';

export interface BrowserStageProps {
  mode: BrowserStageMode;
  onModeChange: (mode: BrowserStageMode) => void;
  targetUrl?: string;
  widthPercent?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onReload?: () => void;
  /** CDP recorder state (optional — only used in Record mode). */
  cdpConnected?: boolean;
  cdpObserving?: boolean;
}

export function BrowserStage({
  mode, onModeChange, targetUrl = 'https://bank.local/login',
  widthPercent = 42, collapsed = false, onToggleCollapse,
  onNavigateBack, onNavigateForward, onReload,
  cdpConnected = false, cdpObserving = false,
}: BrowserStageProps) {
  const [cdpStatus, setCdpStatus] = useState<BrowserSessionStatus | null>(null);

  useEffect(() => {
    const session = getBrowserSession();
    const update = () => setCdpStatus(session.getLastStatus());
    update();
    const unsub = session.onChange(update);
    return unsub;
  }, []);

  const liveCdp = cdpStatus?.connected ?? cdpConnected;
  const displayUrl = cdpStatus?.url || targetUrl;

  if (collapsed) {
    return (
      <div className="shrink-0 flex flex-col items-center gap-3 py-2 w-10 border-l border-slate-700/50 bg-[#080c14]">
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400">
          <PanelRightOpen className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 flex flex-col overflow-hidden border-l border-slate-700/50 bg-[#080c14]" style={{ width: `${widthPercent}%` }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 h-8 shrink-0 border-b border-slate-700/30 bg-[#0b101c]/90">
        <button onClick={onNavigateBack} className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30" title="Back">
          <ArrowLeft className="size-3.5" />
        </button>
        <button onClick={onNavigateForward} className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30" title="Forward">
          <ArrowRight className="size-3.5" />
        </button>
        <button onClick={onReload} className="p-0.5 rounded hover:bg-white/5 text-slate-400" title="Reload">
          <RefreshCw className="size-3.5" />
        </button>

        <div className="flex items-center gap-1.5 flex-1 mx-1.5 px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700">
          <span className={cn('text-[9px] shrink-0', liveCdp ? 'text-emerald-400' : 'text-slate-500')}>
            {liveCdp ? '🔒' : '⚠'}
          </span>
          <span className="text-[10px] text-slate-200 font-mono truncate">{displayUrl}</span>
        </div>

        {/* Live CDP status */}
        <span className={cn(
          'flex items-center gap-1 text-[9px] font-mono shrink-0',
          liveCdp ? (cdpObserving ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500',
        )}>
          <Circle className={cn(
            'size-1.5',
            liveCdp ? (cdpObserving ? 'fill-red-500 text-red-500' : 'fill-emerald-500 text-emerald-500') : 'fill-slate-600 text-slate-600',
          )} />
          {liveCdp ? (cdpObserving ? '● REC' : ':9222') : 'no CDP'}
        </span>

        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400">
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 flex items-center justify-center bg-[#080c14] relative">
        {liveCdp ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <Monitor className="size-12 text-emerald-700" />
            <p className="text-xs font-semibold text-emerald-500">CDP Live</p>
            <p className="text-[9px] text-slate-500 max-w-[200px]">
              {cdpStatus?.title || 'Page loaded'}
            </p>
            {cdpObserving && (
              <span className="flex items-center gap-1 text-[9px] text-red-400 font-mono px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                <Circle className="size-1.5 fill-red-500 text-red-500 animate-pulse" />
                Recording clicks
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Monitor className="size-16 text-slate-700" />
            <div>
              <p className="text-sm font-semibold text-slate-500">Browser Stage</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">
                Подключите Playwright CDP браузер через порт :9222 для живого вьюпорта
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-slate-600 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                Chrome :9222
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mode bar */}
      <div className="flex items-center gap-1 px-2 h-8 shrink-0 border-t border-slate-700/30 bg-[#0b101c]/90">
        <button
          onClick={() => onModeChange('author')}
          className={cn(
            'flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'author'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Monitor className="size-3" /> Author
          {mode === 'author' && <span className="text-[8px] text-cyan-500/70">58/42</span>}
        </button>
        <button
          onClick={() => onModeChange('record')}
          className={cn(
            'flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'record'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Circle className="size-3 fill-rose-500 text-rose-500" /> Record
          {mode === 'record' && <span className="text-[8px] text-red-500/70">60/40</span>}
        </button>
        <button
          onClick={() => onModeChange('debug')}
          className={cn(
            'flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'debug'
              ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Bug className="size-3" /> Debug
          {mode === 'debug' && <span className="text-[8px] text-violet-500/70">follow run</span>}
        </button>
      </div>
    </div>
  );
}