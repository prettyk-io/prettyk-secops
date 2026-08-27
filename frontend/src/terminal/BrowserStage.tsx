/**
 * PK-WB-B2 / POC-CDP-1: Browser Stage Shell — permanent right panel in Author/Record/Debug modes.
 * LIVE browser via BrowserSession (no more mock).
 *
 * Live v2 (27 Aug 2026): живая адресная строка, корректный скриншот, растягивание на форму.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';
import {
  Monitor, Circle, Bug, PanelRightClose, PanelRightOpen,
  ArrowLeft, ArrowRight, RefreshCw, Loader2, ExternalLink, Play, Square,
} from 'lucide-react';
import { getBrowserSession } from '../studio/browserSession';
import type { BrowserSessionStatus } from '../studio/browserSession';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';

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
  /** Когда true — встраивается в таб и растягивается на 100% родителя (EditorWorkbench). */
  embedded?: boolean;
  /** CDP recorder state (optional — only used in Record mode). */
  cdpConnected?: boolean;
  cdpObserving?: boolean;
}

export function BrowserStage({
  mode, onModeChange, targetUrl = 'http://juice-shop:3000',
  widthPercent = 42, collapsed = false, onToggleCollapse,
  onNavigateBack, onNavigateForward, onReload,
  embedded = false,
  cdpConnected = false, cdpObserving = false,
}: BrowserStageProps) {
  const [cdpStatus, setCdpStatus] = useState<BrowserSessionStatus | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [shotLoading, setShotLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [navUrl, setNavUrl] = useState(targetUrl);
  const navAbortRef = useRef<AbortController | null>(null);
  // F-7: Play state
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState(0);
  const playAbortRef = useRef<AbortController | null>(null);
  const shotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Browser status from singleton session ──
  useEffect(() => {
    const session = getBrowserSession();
    session.startPolling(3000); // Start polling immediately
    const update = () => setCdpStatus(session.getLastStatus());
    update();
    const unsub = session.onChange(update);
    return () => { session.stopPolling(); unsub(); };
  }, []);

  const liveCdp = cdpStatus?.connected ?? cdpConnected;

  // Синхронизация navUrl с реальным URL из живого браузера
  useEffect(() => {
    if (cdpStatus?.url) setNavUrl(cdpStatus.url);
  }, [cdpStatus?.url]);

  const displayUrl = cdpStatus?.url || targetUrl;

  // ── Live screenshot polling ──
  const takeShot = useCallback(async () => {
    if (!liveCdp) return;
    try {
      const r = await fetch('/api/browser/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (d.ok && d.screenshot) {
        const raw: string = d.screenshot;
        // Handle both formats: backend may return clean base64 or data-URI
        setScreenshot(raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`);
      }
    } catch {
      // Browser down — keep last frame
    }
  }, [liveCdp]);

  useEffect(() => {
    if (!liveCdp) {
      setScreenshot(null);
      if (shotTimerRef.current) {
        clearInterval(shotTimerRef.current);
        shotTimerRef.current = null;
      }
      return;
    }
    setShotLoading(true);
    takeShot().finally(() => setShotLoading(false));
    shotTimerRef.current = setInterval(takeShot, 1500);
    return () => {
      if (shotTimerRef.current) {
        clearInterval(shotTimerRef.current);
        shotTimerRef.current = null;
      }
    };
  }, [liveCdp, takeShot]);

  // ── Навигация (с таймаутом и отменой) ──
  const doNavigate = useCallback(async (url: string) => {
    if (!url) return;
    // Убить предыдущий запрос если висит
    navAbortRef.current?.abort();
    const abort = new AbortController();
    navAbortRef.current = abort;
    setNavError(null);
    setNavLoading(true);
    // Железный таймаут: 10 секунд, потом отмена
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      const r = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: abort.signal,
      });
      clearTimeout(timer);
      const d = await r.json();
      if (d.ok) {
        setNavUrl(d.url || navUrl);
        getBrowserSession().getStatus();
        setTimeout(() => { takeShot(); setNavLoading(false); }, 800);
      } else {
        setNavError(d.error || 'Navigation failed');
        setNavLoading(false);
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        setNavError('Navigation cancelled or timed out');
      } else if (e?.message?.includes('Failed to fetch')) {
        setNavError('Browser not reachable — is Playground running?');
      } else {
        setNavError(e?.message || 'Navigation failed');
      }
      setNavLoading(false);
    }
  }, [navUrl, takeShot]);

  const cancelNav = useCallback(() => {
    navAbortRef.current?.abort();
    setNavLoading(false);
    setNavError('Cancelled');
  }, []);

  const doReload = useCallback(async () => {
    if (!liveCdp) return;
    setNavLoading(true);
    try {
      await fetch('/api/browser/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: 'window.location.reload()' }),
      });
      setTimeout(() => { takeShot(); setNavLoading(false); }, 1000);
    } catch {
      setNavLoading(false);
    }
  }, [liveCdp, takeShot]);

  const doBack = useCallback(async () => {
    if (!liveCdp) return;
    setNavLoading(true);
    try {
      await fetch('/api/browser/back', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      setTimeout(() => { takeShot(); setNavLoading(false); }, 600);
    } catch {
      setNavLoading(false);
    }
  }, [liveCdp, takeShot]);

  const doForward = useCallback(async () => {
    if (!liveCdp) return;
    setNavLoading(true);
    try {
      await fetch('/api/browser/forward', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      setTimeout(() => { takeShot(); setNavLoading(false); }, 600);
    } catch {
      setNavLoading(false);
    }
  }, [liveCdp, takeShot]);

  // ── F-7: Play / Stop ──
  const doPlay = useCallback(async () => {
    const steps = useScenarioDeckStore.getState().decks[0]?.steps ?? [];
    if (steps.length === 0) return;
    const abort = new AbortController();
    playAbortRef.current = abort;
    setPlaying(true);
    setPlayStep(0);
    for (let i = 0; i < steps.length; i++) {
      if (abort.signal.aborted) break;
      setPlayStep(i + 1);
      const s = steps[i]!;
      try {
        if (s.action === "Click") {
          await fetch("/api/browser/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, strategy: s.strategy }) });
        } else if (s.action === "Type") {
          await fetch("/api/browser/type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, text: s.payload, strategy: s.strategy }) });
        } else if (s.action === "Open") {
          await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.payload }) });
        } else if (s.action === "Wait") {
          await new Promise(r => setTimeout(r, Number(s.payload) || 1000));
        }
        takeShot();
      } catch { /* step failed */ }
      if (i < steps.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setPlaying(false);
    setPlayStep(0);
    playAbortRef.current = null;
  }, [takeShot]);

  const stopPlay = useCallback(() => {
    playAbortRef.current?.abort();
    setPlaying(false);
    setPlayStep(0);
    playAbortRef.current = null;
  }, []);

  const steps = useScenarioDeckStore(s => s.decks[0]?.steps ?? []);

  // ── Collapsed state ──
  if (collapsed) {
    return (
      <div className="shrink-0 flex flex-col items-center gap-3 py-2 w-10 border-l border-slate-700/50 bg-[#080c14]">
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400">
          <PanelRightOpen className="size-4" />
        </button>
      </div>
    );
  }

  // ── CSS: split-pane vs embedded ──
  const rootClass = embedded
    ? 'flex flex-col min-h-0 flex-1 w-full overflow-hidden border-l border-slate-700/50 bg-[#080c14]'
    : 'shrink-0 flex flex-col overflow-hidden border-l border-slate-700/50 bg-[#080c14]';
  const rootStyle = embedded ? undefined : { width: `${widthPercent}%` };

  return (
    <div className={rootClass} style={rootStyle}>
      {/* ── Navigation error ── */}
      {navError && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 text-[10px] bg-red-500/10 border-b border-red-500/20">
          <span className="text-red-400">{navError}</span>
          <button onClick={() => setNavError(null)} className="ml-auto text-red-400 hover:text-red-300 text-[16px] leading-none">&times;</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 px-2 h-8 shrink-0 border-b border-slate-700/30 bg-[#0b101c]/90">
        {/* Back */}
        <button onClick={onNavigateBack ?? doBack} disabled={!liveCdp || navLoading}
          className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30" title="Back">
          <ArrowLeft className="size-3.5" />
        </button>
        {/* Forward */}
        <button onClick={onNavigateForward ?? doForward} disabled={!liveCdp || navLoading}
          className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30" title="Forward">
          <ArrowRight className="size-3.5" />
        </button>
        {/* Reload */}
        <button onClick={onReload ?? doReload} disabled={!liveCdp || navLoading}
          className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30" title="Reload">
          {navLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>

        {/* ── Живая адресная строка ── */}
        <div className="flex items-center gap-1.5 flex-1 mx-1.5 px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700">
          <span className={cn('text-[9px] shrink-0', liveCdp ? 'text-emerald-400' : 'text-slate-500')}>
            {liveCdp ? '🔒' : '⚠'}
          </span>
          <input
            type="text"
            value={navUrl}
            onChange={(e) => setNavUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doNavigate(navUrl); }}
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[10px] text-slate-200 font-mono px-0.5"
            placeholder="https://..."
          />
          <button
            onClick={navLoading ? cancelNav : () => doNavigate(navUrl)}
            disabled={!navUrl}
            className="p-0.5 rounded hover:bg-white/10 shrink-0 disabled:opacity-30"
            title={navLoading ? 'Cancel' : liveCdp ? 'Go' : 'Start browser'}
            style={{ color: navLoading ? '#f87171' : '#38bdf8' }}
          >
            {navLoading ? <Square className="size-3" /> : <ExternalLink className="size-3" />}
          </button>
        </div>

        {/* F-7: Play / Stop */}
        {playing ? (
          <button onClick={stopPlay}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20" title="Stop">
            <Square className="size-3" /> Stop {playStep}/{steps.length}
          </button>
        ) : (
          <button onClick={doPlay} disabled={!liveCdp || navLoading || steps.length === 0}
            className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-30" title="Play recorded steps">
            <Play className="size-3" /> Play
          </button>
        )}

        {/* Live CDP status */}
        <span className={cn(
          'flex items-center gap-1 text-[9px] font-mono shrink-0',
          liveCdp ? (cdpObserving ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500',
        )}>
          <Circle className={cn(
            'size-1.5',
            liveCdp ? (cdpObserving ? 'fill-red-500 text-red-500' : 'fill-emerald-500 text-emerald-500') : 'fill-slate-600 text-slate-600',
          )} />
          {liveCdp ? (cdpObserving ? '● REC' : 'live') : 'no browser'}
        </span>

        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400">
          <PanelRightClose className="size-3.5" />
        </button>
      </div>

      {/* ── Viewport ── */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-[#080c14] relative overflow-hidden">
        {liveCdp ? (
          screenshot ? (
            <img
              src={screenshot}
              alt={cdpStatus?.title || 'Live viewport'}
              className="w-full h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          ) : shotLoading ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <Loader2 className="size-10 animate-spin text-cyan-700" />
              <p className="text-xs text-slate-500">Загрузка первого кадра…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <Monitor className="size-12 text-emerald-700" />
              <p className="text-xs font-semibold text-emerald-500">Browser Live</p>
              <p className="text-[9px] text-slate-500 max-w-[200px]">
                {cdpStatus?.title || 'Page loaded'}
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-4">
            {mode === 'record' ? (
              <>
                <Circle className="size-14 text-rose-700/60" />
                <div>
                  <p className="text-sm font-semibold text-rose-400">Record Mode</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[240px]">
                    Введите целевой URL и нажмите Go, чтобы запустить браузер для записи
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-slate-600 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                    Browser ready
                  </span>
                </div>
              </>
            ) : mode === 'debug' ? (
              <>
                <Bug className="size-14 text-violet-700/60" />
                <div>
                  <p className="text-sm font-semibold text-violet-400">Debug Mode</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[240px]">
                    Введите URL и нажмите Go для запуска отладочной сессии
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-slate-600 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                    Browser ready
                  </span>
                </div>
              </>
            ) : (
              <>
                <Monitor className="size-16 text-slate-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-500">Browser Stage</p>
                  <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">
                    Нажмите Go для запуска живого браузера
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-slate-600 font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                    Browser ready
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Recording overlay */}
        {liveCdp && cdpObserving && (
          <div className="absolute top-2 left-2 z-10">
            <span className="flex items-center gap-1 text-[9px] text-red-400 font-mono px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
              <Circle className="size-1.5 fill-red-500 text-red-500 animate-pulse" />
              Recording clicks
            </span>
          </div>
        )}
      </div>

      {/* ── Mode bar ── */}
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