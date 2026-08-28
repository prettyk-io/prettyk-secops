/**
 * PK-WB-B2 / VP-F1: Browser Stage Shell.
 * LIVE browser via BrowserSession + WebSocket JPEG canvas (12fps+).
 *
 * VP-F1: Рендер кадров на <canvas> через WS relay (бинарный протокол),
 * клик → canvas-координаты → observe/click → реальный DOM click → DSL.
 * MJPEG <img> скриншот-поллинг удалены.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';
import {
  Monitor, Circle, Bug, PanelRightClose, PanelRightOpen,
  ArrowLeft, ArrowRight, RefreshCw, Loader2, ExternalLink, Play, Square, AlertTriangle,
  Maximize2, Minimize2,
} from 'lucide-react';
import { getBrowserSession } from '../studio/browserSession';
import type { BrowserSessionStatus } from '../studio/browserSession';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';
import { computeCanvasClickToViewport } from './clickCoordinate';
import { useBrowserCanvasStream } from './useBrowserCanvasStream';

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
  embedded?: boolean;
  cdpConnected?: boolean;
  cdpObserving?: boolean;
  recorderError?: string | null;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function BrowserStage({
  mode, onModeChange, targetUrl = 'http://juice-shop:3000',
  widthPercent = 42, collapsed = false, onToggleCollapse,
  onNavigateBack, onNavigateForward, onReload,
  embedded = false,
  cdpConnected = false, cdpObserving = false,
  recorderError = null,
  fullscreen = false, onToggleFullscreen,
}: BrowserStageProps) {
  const [cdpStatus, setCdpStatus] = useState<BrowserSessionStatus | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [navUrl, setNavUrl] = useState(targetUrl);
  const navAbortRef = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playStep, setPlayStep] = useState(0);
  const playAbortRef = useRef<AbortController | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clickLockRef = useRef(false);

  // ─ WS URL: канонический relay VP-B1 на ws://127.0.0.1:9224/api/browser/canvas
  // ВАЖНО: не :8765 — это plain-HTTP Playground без WS-апгрейда.
  const wsUrl = (() => {
    const explicit = import.meta.env.VITE_CDP_RELAY_WS || '';
    if (explicit) return explicit;
    const host = window.location.hostname === 'localhost'
      ? '127.0.0.1'
      : window.location.hostname;
    return `ws://${host}:9224/api/browser/canvas`;
  })();

  // ─ Status ─
  useEffect(() => {
    const session = getBrowserSession();
    session.startPolling(3000);
    const update = () => {
      const s = session.getLastStatus();
      setCdpStatus(s);
      if (s?.connected) setConnecting(false);
    };
    update();
    const unsub = session.onChange(update);
    return () => { session.stopPolling(); unsub(); };
  }, []);

  const liveCdp = cdpStatus?.connected ?? cdpConnected;

  // VP-F1: WS canvas stream
  const { frameInfo, framesReceived } = useBrowserCanvasStream(canvasRef, wsUrl, liveCdp);

  useEffect(() => {
    if (cdpStatus?.url) setNavUrl(cdpStatus.url);
  }, [cdpStatus?.url]);

  // ─ HDO: клик по canvas → observe/click ─
  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (clickLockRef.current || !cdpObserving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fi = frameInfo.current;
    const frameW = fi?.frameWidth ?? 1280;
    const frameH = fi?.frameHeight ?? 800;
    const vp = computeCanvasClickToViewport(canvas, frameW, frameH, e.clientX, e.clientY);
    if (!vp) return;

    clickLockRef.current = true;
    const session = getBrowserSession();
    const result = await session.observeClick(vp.x, vp.y);
    clickLockRef.current = false;
  }, [cdpObserving, frameInfo]);

  // ─ Навигация ─
  const doNavigate = useCallback(async (url: string) => {
    if (!url) return;
    navAbortRef.current?.abort();
    const abort = new AbortController();
    navAbortRef.current = abort;
    setNavError(null); setNavLoading(true);
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      const r = await fetch('/api/browser/navigate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: abort.signal });
      clearTimeout(timer);
      const d = await r.json();
      if (d.ok) { setNavUrl(d.url || navUrl); getBrowserSession().getStatus(); setNavLoading(false); }
      else { setNavError(d.error || 'Navigation failed'); setNavLoading(false); }
    } catch (e: any) {
      clearTimeout(timer);
      setNavError(e?.name === 'AbortError' ? 'Navigation cancelled' : e?.message || 'Navigation failed');
      setNavLoading(false);
    }
  }, [navUrl]);

  const cancelNav = useCallback(() => { navAbortRef.current?.abort(); setNavLoading(false); }, []);
  const doReload = useCallback(async () => {
    if (!liveCdp) return; setNavLoading(true);
    try { await fetch('/api/browser/eval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expression: 'window.location.reload()' }) }); getBrowserSession().getStatus(); setNavLoading(false); }
    catch { setNavLoading(false); }
  }, [liveCdp]);
  const doBack = useCallback(async () => {
    if (!liveCdp) return; setNavLoading(true);
    try { await fetch('/api/browser/back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); getBrowserSession().getStatus(); setNavLoading(false); }
    catch { setNavLoading(false); }
  }, [liveCdp]);
  const doForward = useCallback(async () => {
    if (!liveCdp) return; setNavLoading(true);
    try { await fetch('/api/browser/forward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); getBrowserSession().getStatus(); setNavLoading(false); }
    catch { setNavLoading(false); }
  }, [liveCdp]);

  const doPlay = useCallback(async () => {
    const steps = useScenarioDeckStore.getState().decks[0]?.steps ?? []; if (steps.length === 0) return;
    const abort = new AbortController(); playAbortRef.current = abort; setPlaying(true); setPlayStep(0);
    for (let i = 0; i < steps.length; i++) {
      if (abort.signal.aborted) break; setPlayStep(i + 1); const s = steps[i]!;
      try {
        if (s.action === "Click") await fetch("/api/browser/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, strategy: s.strategy }) });
        else if (s.action === "Type") await fetch("/api/browser/type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selector: s.strategyValue, text: s.payload, strategy: s.strategy }) });
        else if (s.action === "Open") await fetch("/api/browser/navigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.payload }) });
        else if (s.action === "Wait") await new Promise(r => setTimeout(r, Number(s.payload) || 1000));
      } catch { /* skip */ }
      if (i < steps.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setPlaying(false); setPlayStep(0); playAbortRef.current = null;
  }, []);

  const stopPlay = useCallback(() => { playAbortRef.current?.abort(); setPlaying(false); setPlayStep(0); playAbortRef.current = null; }, []);
  const steps = useScenarioDeckStore(s => s.decks[0]?.steps ?? []);

  if (collapsed) {
    return (<div className="shrink-0 flex flex-col items-center gap-3 py-2 w-10 border-l border-slate-700/50 bg-[#080c14]"><button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400"><PanelRightOpen className="size-4" /></button></div>);
  }

  const rootClass = embedded
    ? 'flex flex-col min-h-0 flex-1 w-full overflow-hidden border-l border-slate-700/50 bg-[#080c14]'
    : 'shrink-0 flex flex-col overflow-hidden border-l border-slate-700/50 bg-[#080c14]';
  const rootStyle = embedded ? undefined : { width: `${widthPercent}%` };

  const hasFrames = (framesReceived.current ?? 0) > 0;

  return (
    <div className={rootClass} style={rootStyle}>
      {navError && (<div className="flex items-center gap-2 px-3 py-1.5 shrink-0 text-[10px] bg-red-500/10 border-b border-red-500/20"><span className="text-red-400">{navError}</span><button onClick={() => setNavError(null)} className="ml-auto text-red-400 hover:text-red-300 text-[16px] leading-none">&times;</button></div>)}

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 h-8 shrink-0 border-b border-slate-700/30 bg-[#0b101c]/90">
        <button onClick={onNavigateBack ?? doBack} disabled={!liveCdp || navLoading} className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30"><ArrowLeft className="size-3.5" /></button>
        <button onClick={onNavigateForward ?? doForward} disabled={!liveCdp || navLoading} className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30"><ArrowRight className="size-3.5" /></button>
        <button onClick={onReload ?? doReload} disabled={!liveCdp || navLoading} className="p-0.5 rounded hover:bg-white/5 text-slate-400 disabled:opacity-30">{navLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}</button>

        <div className="flex items-center gap-1.5 flex-1 mx-1.5 px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700">
          <span className={cn('text-[9px] shrink-0', liveCdp ? 'text-emerald-400' : 'text-slate-500')}>{liveCdp ? '🔒' : '⚠'}</span>
          <input type="text" value={navUrl} onChange={(e) => setNavUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doNavigate(navUrl); }} spellCheck={false} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[10px] text-slate-200 font-mono px-0.5" placeholder="https://..." />
          <button onClick={navLoading ? cancelNav : () => doNavigate(navUrl)} disabled={!navUrl} className="p-0.5 rounded hover:bg-white/10 shrink-0 disabled:opacity-30" style={{ color: navLoading ? '#f87171' : '#38bdf8' }}>{navLoading ? <Square className="size-3" /> : <ExternalLink className="size-3" />}</button>
        </div>

        {playing ? (
          <button onClick={stopPlay} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">Stop {playStep}/{steps.length}</button>
        ) : (
          <button onClick={doPlay} disabled={!liveCdp || navLoading || steps.length === 0} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-30"><Play className="size-3" /> Play</button>
        )}

        <span className={cn('flex items-center gap-1 text-[9px] font-mono shrink-0', liveCdp ? (cdpObserving ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500')}>
          <Circle className={cn('size-1.5', liveCdp ? (cdpObserving ? 'fill-red-500 text-red-500' : 'fill-emerald-500 text-emerald-500') : 'fill-slate-600 text-slate-600')} />
          {liveCdp ? (cdpObserving ? '● REC' : 'live') : 'stopped'}
          {liveCdp && hasFrames && <span className="text-[7px] text-slate-500 ml-0.5">×{framesReceived.current ?? 0}</span>}
        </span>

        {embedded && onToggleFullscreen && (
          <button onClick={onToggleFullscreen} className="p-0.5 rounded hover:bg-white/5 text-slate-400" title={fullscreen ? 'Свернуть' : 'На весь экран'}>
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        )}
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400"><PanelRightClose className="size-3.5" /></button>
      </div>

      {/* Viewport: canvas (VP-F1) */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-[#080c14] relative overflow-hidden">
        {!liveCdp ? (
          <div className="flex flex-col items-center gap-4 text-center px-4">
            <Monitor className="size-16 text-slate-600" />
            <div>
              <p className="text-sm font-semibold text-slate-400">Браузер остановлен</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[260px]">Введите адрес сайта и нажмите «Запустить», чтобы открыть браузер</p>
            </div>
            <button onClick={() => doNavigate(navUrl)} disabled={!navUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <ExternalLink className="size-4" /> Запустить браузер
            </button>
            {navError && (<div className="flex items-center gap-2 px-3 py-1.5 rounded border border-red-500/30 bg-red-500/5 text-[10px] text-red-400 max-w-[260px]"><AlertTriangle className="size-3.5 shrink-0" />{navError}</div>)}
          </div>
        ) : connecting ? (
          <div className="flex flex-col items-center gap-2"><Loader2 className="size-10 animate-spin text-cyan-700" /><p className="text-xs text-slate-500">Запуск браузера…</p></div>
        ) : (
          <canvas
            ref={canvasRef}
            className={cn('object-contain', cdpObserving && 'cursor-crosshair')}
            style={{ imageRendering: 'auto', maxWidth: '100%', maxHeight: '100%' }}
            onClick={cdpObserving ? handleCanvasClick : undefined}
          />
        )}

        {liveCdp && cdpObserving && (
          <div className="absolute top-2 left-2 z-10">
            <span className="flex items-center gap-1 text-[9px] text-red-400 font-mono px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
              <Circle className="size-1.5 fill-red-500 text-red-500 animate-pulse" /> Recording clicks
            </span>
          </div>
        )}
        {recorderError && cdpObserving && (
          <div className="absolute bottom-2 left-2 right-2 z-20">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="size-3.5 text-amber-400 shrink-0" /><span className="text-[10px] text-amber-400">{recorderError}</span>
            </div>
          </div>
        )}
      </div>

      {/* Mode bar */}
      <div className="flex items-center gap-1 px-2 h-8 shrink-0 border-t border-slate-700/30 bg-[#0b101c]/90">
        <button onClick={() => onModeChange('author')}
          className={cn('flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'author' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200')}>
          <Monitor className="size-3" /> Author {mode === 'author' && <span className="text-[8px] text-cyan-500/70">58/42</span>}
        </button>
        <button onClick={() => onModeChange('record')}
          className={cn('flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'record' ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-200')}>
          <Circle className="size-3 fill-rose-500 text-rose-500" /> Record {mode === 'record' && <span className="text-[8px] text-red-500/70">60/40</span>}
        </button>
        <button onClick={() => onModeChange('debug')}
          className={cn('flex items-center gap-1 px-2.5 h-6 rounded text-[10px] font-semibold transition-all',
            mode === 'debug' ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30' : 'text-slate-400 hover:text-slate-200')}>
          <Bug className="size-3" /> Debug {mode === 'debug' && <span className="text-[8px] text-violet-500/70">follow run</span>}
        </button>
      </div>
    </div>
  );
}