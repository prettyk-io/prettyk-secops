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
  Maximize2, Minimize2, ScanLine,
} from 'lucide-react';
import { getBrowserSession } from '../studio/browserSession';
import type { BrowserSessionStatus } from '../studio/browserSession';
import type { ReplayStepState } from './replayRunner';
import { runReplay } from './replayRunner';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';
import type { ScenarioStepModel, ActionKind } from '../studio/scenarioStepModel';
import { computeCanvasClickToViewport } from './clickCoordinate';
import { useBrowserCanvasStream } from './useBrowserCanvasStream';
import { CandidateOverlay } from './CandidateOverlay';
import type { CandidateElement } from './candidateInspect';
import { matchStepToCandidate, replayHighlightLabel } from './replayHighlight';
import { ReplayHighlightOverlay } from './ReplayHighlightOverlay';

export type BrowserStageMode = 'author' | 'record' | 'debug';

/** Стабильная ссылка на пустой массив для zustand-селекторов (useSyncExternalStore). */
const EMPTY_STEPS: ScenarioStepModel[] = [];

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
  const [replayStates, setReplayStates] = useState<ReplayStepState[]>([]);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayErrorScreenshot, setReplayErrorScreenshot] = useState<string | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const replayResumeIndexRef = useRef(0);
  const playAbortRef = useRef<AbortController | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const clickLockRef = useRef(false);
  const clickMarkerSeqRef = useRef(0);
  const clickMarkerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clickMarker, setClickMarker] = useState<{ id: number; x: number; y: number } | null>(null);

  // ── BBA-FE-4: живой overlay кандидатов observe ──
  const [candidates, setCandidates] = useState<CandidateElement[]>([]);
  const [inspectOn, setInspectOn] = useState(false);

  // ── RP-VIZ: подсветка активного/ошибочного шага replay ──
  const [replayHighlight, setReplayHighlight] = useState<{
    target: CandidateElement | null;
    label: string;
    error: string | null;
  } | null>(null);

  // ─ WS URL: SOR-F1 — динамический relay endpoint из pk-control, fallback на хардкод
  const wsUrl = cdpStatus?.canvasUrl || (() => {
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
  const { frameInfo, framesReceived } = useBrowserCanvasStream(canvasRef, viewportRef, wsUrl, liveCdp);

  useEffect(() => {
    if (cdpStatus?.url) setNavUrl(cdpStatus.url);
  }, [cdpStatus?.url]);

  // BBA-FE-1: очистка ripple-таймера при размонтировании.
  useEffect(() => () => {
    if (clickMarkerTimerRef.current) clearTimeout(clickMarkerTimerRef.current);
  }, []);

  // ─ BBA-FE-1: клик по canvas — реальный клик (author) + observe (record) ─
  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (clickLockRef.current || !liveCdp) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fi = frameInfo.current;
    const frameW = fi?.frameWidth ?? 1280;
    const frameH = fi?.frameHeight ?? 800;
    const vp = computeCanvasClickToViewport(canvas, frameW, frameH, e.clientX, e.clientY);
    if (!vp) return;

    // Визуальный фидбек (ripple) в координатах viewport-контейнера.
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const id = ++clickMarkerSeqRef.current;
      setClickMarker({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (clickMarkerTimerRef.current) clearTimeout(clickMarkerTimerRef.current);
      clickMarkerTimerRef.current = setTimeout(() => setClickMarker(null), 450);
    }

    clickLockRef.current = true;
    const session = getBrowserSession();
    if (cdpObserving) {
      // record: клик в браузер + observe-событие → proposal (poll в useCdpRecorder).
      await session.observeClick(vp.x, vp.y);
    } else {
      // author: просто реальный клик по странице (без observe-очереди).
      await session.clickAt(vp.x, vp.y);
    }
    clickLockRef.current = false;
  }, [cdpObserving, frameInfo, liveCdp]);

  // ── BBA-FE-4: кандидаты observe → живой overlay ──
  const loadCandidates = useCallback(async () => {
    const list = await getBrowserSession().inspectCandidates('operator');
    setCandidates(list);
  }, []);

  const handleCandidateClick = useCallback(async (c: CandidateElement) => {
    // Живой клик по элементу (BBA-EXEC-1 locator click), не координатный.
    await getBrowserSession().executeStep({
      id: `inspect-${Date.now()}`,
      action: 'Click',
      strategy: 'css',
      strategyValue: c.cssSelector,
      payload: '',
      continueOnError: false,
      led: 'queued',
    });
    // Страница могла измениться — пересканировать кандидатов.
    if (inspectOn || cdpObserving) await loadCandidates();
  }, [inspectOn, cdpObserving, loadCandidates]);

  // ── ACT-FE: палитра действий поверх кандидата ──
  const handleCandidateAction = useCallback(async (c: CandidateElement, action: ActionKind) => {
    // Click/Type/Hover/Focus/Select/PressKey → target = cssSelector + strategy css.
    // Wheel/Scroll/Drag → координатные (наводятся на rect-центр кандидата).
    const session = getBrowserSession();
    let step: ScenarioStepModel;
    if (action === 'Wheel' || action === 'Scroll' || action === 'Drag') {
      const cx = c.rect.x + c.rect.w / 2;
      const cy = c.rect.y + c.rect.h / 2;
      const cx2 = cx + (c.rect.w > 0 ? 40 : 0);
      const cy2 = cy + (c.rect.h > 0 ? 40 : 0);
      const payload = action === 'Drag' ? `${cx} ${cy} ${cx2} ${cy2}` : '0 120';
      step = {
        id: `inspect-${action.toLowerCase()}-${Date.now()}`,
        action,
        strategy: 'css',
        strategyValue: c.cssSelector,
        payload,
        continueOnError: false,
        led: 'queued',
      };
    } else if (action === 'Type' || action === 'Select') {
      step = {
        id: `inspect-${action.toLowerCase()}-${Date.now()}`,
        action,
        strategy: 'css',
        strategyValue: c.cssSelector,
        payload: '$value',
        continueOnError: false,
        led: 'queued',
      };
    } else if (action === 'PressKey') {
      step = {
        id: `inspect-${action.toLowerCase()}-${Date.now()}`,
        action,
        strategy: 'css',
        strategyValue: c.cssSelector,
        payload: '$value',
        continueOnError: false,
        led: 'queued',
      };
    } else {
      step = {
        id: `inspect-${action.toLowerCase()}-${Date.now()}`,
        action,
        strategy: 'css',
        strategyValue: c.cssSelector,
        payload: '',
        continueOnError: false,
        led: 'queued',
      };
    }
    await session.executeStep(step);
    if (inspectOn || cdpObserving) await loadCandidates();
  }, [inspectOn, cdpObserving, loadCandidates]);

  const toggleInspect = useCallback(async () => {
    if (inspectOn) {
      setInspectOn(false);
      setCandidates([]);
    } else {
      setInspectOn(true);
      await loadCandidates();
    }
  }, [inspectOn, loadCandidates]);

  // Запись (observe) → авто-инспекция кандидатов.
  useEffect(() => {
    if (cdpObserving) {
      setInspectOn(true);
      loadCandidates();
    } else {
      setInspectOn(false);
      setCandidates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdpObserving]);

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

  const runReplayFor = useCallback(async (startIndex: number) => {
    const deck = useScenarioDeckStore.getState().decks[0];
    const steps = deck?.steps ?? [];
    if (steps.length === 0) return;
    const abort = new AbortController();
    playAbortRef.current = abort;
    setPlaying(true);
    setReplayPaused(false);
    setReplayError(null);
    setReplayErrorScreenshot(null);
    setErrorModalOpen(false);
    setReplayHighlight(null);

    const session = getBrowserSession();

    // RP-VIZ: снимок кандидатов для подсветки шагов по selector/имени.
    let candidates: CandidateElement[] = [];
    try { candidates = await session.inspectCandidates('operator'); } catch { candidates = []; }

    // Пошаговый прогон (не batch): каждый шаг эмитит running → passed/failed,
    // давая живую «прогулку» по странице с подсветкой активного шага.
    const result = await runReplay(
      steps,
      (step, signal) => session.executeStep(step, signal),
      {
        signal: abort.signal,
        startIndex,
        stepDelayMs: 600,
        onStepState: (st) => {
          setReplayStates((prev) => {
            const next = prev.length === steps.length
              ? [...prev]
              : steps.map((s, i) => ({ stepId: s.id, index: i, status: 'idle' as const }));
            next[st.index] = st;
            return next;
          });
          // RP-VIZ: подсветка активного/ошибочного шага.
          const step = steps[st.index];
          if (!step) return;
          const target = matchStepToCandidate(step, candidates);
          if (st.status === 'running') {
            setReplayHighlight({ target, label: replayHighlightLabel(step, target), error: null });
          } else if (st.status === 'failed') {
            setReplayHighlight((prev) => ({
              target: target ?? prev?.target ?? null,
              label: replayHighlightLabel(step, target ?? prev?.target ?? null),
              error: st.error ?? 'Шаг завершился с ошибкой',
            }));
          }
        },
      },
    );

    setPlaying(false);
    playAbortRef.current = null;

    if (result.stoppedOnError) {
      const failed = [...result.states].reverse().find((s) => s.status === 'failed');
      if (failed) {
        replayResumeIndexRef.current = failed.index + 1;
        setReplayError(failed.error ?? 'Шаг завершился с ошибкой');
        setReplayPaused(true);
        // BBA-FE-3: скриншот ошибки → модал.
        if (failed.screenshotB64) {
          setReplayErrorScreenshot(failed.screenshotB64);
          setErrorModalOpen(true);
        }
      }
    } else {
      // Успешное завершение — убираем подсветку последнего шага.
      setReplayHighlight(null);
    }
  }, []);

  const startReplay = useCallback(async () => {
    const steps = useScenarioDeckStore.getState().decks[0]?.steps ?? [];
    setReplayStates(steps.map((s, i) => ({ stepId: s.id, index: i, status: 'idle' as const })));
    replayResumeIndexRef.current = 0;
    await runReplayFor(0);
  }, [runReplayFor]);

  const continueReplay = useCallback(async () => {
    await runReplayFor(replayResumeIndexRef.current);
  }, [runReplayFor]);

  const stopPlay = useCallback(() => {
    playAbortRef.current?.abort();
    setPlaying(false);
    setReplayPaused(false);
    setReplayError(null);
    setReplayErrorScreenshot(null);
    setErrorModalOpen(false);
    setReplayHighlight(null);
    playAbortRef.current = null;
  }, []);
  // ВАЖНО: `?? []` в zustand-селекторе создаёт НОВЫЙ массив на каждом getSnapshot,
  // из-за чего useSyncExternalStore зацикливается (Maximum update depth exceeded).
  // Возвращаем стабильную ссылку: decks[0]?.steps (undefined → EMPTY, не новый массив).
  const steps = useScenarioDeckStore(s => s.decks[0]?.steps) ?? EMPTY_STEPS;

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
          <button onClick={stopPlay} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"><Square className="size-3" /> Stop</button>
        ) : (
          <button onClick={startReplay} disabled={!liveCdp || navLoading || steps.length === 0} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-30"><Play className="size-3" /> Play</button>
        )}

        <button
          onClick={toggleInspect}
          disabled={!liveCdp}
          className={cn('flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold border', inspectOn ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-slate-700/20 text-slate-300 border-slate-600/40 hover:bg-slate-700/40')}
          title="Инспекция кликабельных элементов (overlay кандидатов)"
        >
          <ScanLine className="size-3" /> Inspect
        </button>

        <span className={cn('flex items-center gap-1 text-[9px] font-mono shrink-0', liveCdp ? (cdpObserving ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500')}>
          <Circle className={cn('size-1.5', liveCdp ? (cdpObserving ? 'fill-red-500 text-red-500' : 'fill-emerald-500 text-emerald-500') : 'fill-slate-600 text-slate-600')} />
          {liveCdp ? (cdpObserving ? '● REC' : 'live') : 'stopped'}
          {liveCdp && hasFrames && <span className="text-[7px] text-slate-500 ml-0.5">×{framesReceived.current ?? 0}</span>}
        </span>

        {/* SOR-F2: индикатор здоровья сессии + Recreate Workspace */}
        {liveCdp && cdpStatus?.sessionHealth && cdpStatus.sessionHealth !== 'ready' && (
          <button
            onClick={async () => { await fetch('/api/browser/recreate-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); getBrowserSession().getStatus(); }}
            className="flex items-center gap-1 px-1.5 h-5 rounded text-[8px] font-semibold"
            style={{
              background: cdpStatus.sessionHealth === 'degraded' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              color: cdpStatus.sessionHealth === 'degraded' ? '#ef4444' : '#f59e0b',
              border: `1px solid ${cdpStatus.sessionHealth === 'degraded' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
            }}
            title={`Сессия: ${cdpStatus.sessionHealth}. Нажмите чтобы пересоздать workspace.`}
          >
            <Circle className={cn('size-1.5', cdpStatus.sessionHealth === 'degraded' ? 'fill-red-500 text-red-500' : 'fill-amber-500 text-amber-500')} />
            Recreate
          </button>
        )}

        {embedded && onToggleFullscreen && (
          <button onClick={onToggleFullscreen} className="p-0.5 rounded hover:bg-white/5 text-slate-400" title={fullscreen ? 'Свернуть' : 'На весь экран'}>
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        )}
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-white/5 text-slate-400"><PanelRightClose className="size-3.5" /></button>
      </div>

      {/* Viewport: canvas (VP-F1) */}
      <div ref={viewportRef} className="flex-1 min-h-0 flex items-center justify-center bg-[#080c14] relative overflow-hidden">
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
          <div className="relative" style={{ lineHeight: 0 }}>
            <canvas
              ref={canvasRef}
              className={cn('block', liveCdp && (cdpObserving ? 'cursor-crosshair' : 'cursor-pointer'))}
              style={{ imageRendering: 'auto', maxWidth: '100%', maxHeight: '100%' }}
              onClick={liveCdp ? handleCanvasClick : undefined}
            />
            {inspectOn && (
              <CandidateOverlay
                candidates={candidates}
                canvasRef={canvasRef}
                frameWidth={frameInfo.current?.frameWidth ?? 1280}
                frameHeight={frameInfo.current?.frameHeight ?? 800}
                onCandidateClick={handleCandidateClick}
                onCandidateAction={handleCandidateAction}
              />
            )}
            {replayHighlight && (
              <ReplayHighlightOverlay
                target={replayHighlight.target}
                label={replayHighlight.label}
                error={replayHighlight.error}
                canvasRef={canvasRef}
                frameWidth={frameInfo.current?.frameWidth ?? 1280}
                frameHeight={frameInfo.current?.frameHeight ?? 800}
              />
            )}
          </div>
        )}

        {clickMarker && (
          <span
            key={clickMarker.id}
            className="absolute z-10 pointer-events-none rounded-full bg-cyan-400/50 animate-ping"
            style={{ left: clickMarker.x - 6, top: clickMarker.y - 6, width: 12, height: 12 }}
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

        {/* BBA-FE-2: статус каждого шага replay + ошибка + Continue/Stop */}
        {(playing || replayPaused) && replayStates.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 z-20 flex flex-col gap-1.5">
            {replayPaused && (
              <div className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded border border-red-500/30 bg-red-500/10">
                <AlertTriangle className="size-3.5 text-red-400 shrink-0" />
                <span className="text-[10px] text-red-400 flex-1 truncate">{replayError ?? 'Ошибка шага'}</span>
                {replayErrorScreenshot && !errorModalOpen && (
                  <button onClick={() => setErrorModalOpen(true)} className="flex items-center gap-1 px-2 h-5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/20">Скриншот</button>
                )}
                <button onClick={continueReplay} className="flex items-center gap-1 px-2 h-5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"><Play className="size-2.5" /> Continue</button>
                <button onClick={stopPlay} className="flex items-center gap-1 px-2 h-5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"><Square className="size-2.5" /> Stop</button>
              </div>
            )}
            <div className="flex gap-1 flex-wrap">
              {replayStates.map((st, i) => (
                <span
                  key={st.stepId}
                  data-testid={`replay-step-${i}`}
                  data-status={st.status}
                  title={st.error ?? st.status}
                  className={cn(
                    'flex items-center justify-center size-5 rounded text-[9px] font-semibold border',
                    st.status === 'passed' && 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
                    st.status === 'failed' && 'text-red-400 bg-red-500/15 border-red-500/30',
                    st.status === 'running' && 'text-amber-400 bg-amber-500/15 border-amber-500/30 animate-pulse',
                    st.status === 'idle' && 'text-slate-500 bg-slate-700/20 border-slate-600/30',
                  )}
                >
                  {st.status === 'passed' ? '✓' : st.status === 'failed' ? '✗' : st.status === 'running' ? '▶' : ''}{i + 1}
                </span>
              ))}
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

      {/* BBA-FE-3: модал скриншота ошибки шага */}
      {errorModalOpen && replayErrorScreenshot && (
        <div data-testid="step-error-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-lg border border-red-500/30 bg-[#0b101c] shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b border-red-500/20">
              <AlertTriangle className="size-4 text-red-400 shrink-0" />
              <span className="text-xs font-semibold text-red-400">Ошибка шага</span>
              <span className="text-[10px] text-slate-500 truncate flex-1">{replayError ?? ''}</span>
              <button onClick={() => setErrorModalOpen(false)} aria-label="Закрыть" className="p-1 rounded hover:bg-white/5 text-slate-400 text-[16px] leading-none">&times;</button>
            </div>
            <div className="px-4 py-2 text-[11px] text-slate-300 font-mono shrink-0 border-b border-slate-700/40 bg-red-500/5">{replayError ?? 'Ошибка шага'}</div>
            <div className="flex-1 min-h-0 overflow-auto bg-[#05070c] p-3">
              <img
                src={`data:image/png;base64,${replayErrorScreenshot}`}
                alt="Скриншот ошибки шага"
                className="w-full h-auto rounded border border-slate-700/60"
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-t border-slate-700/40">
              <button onClick={continueReplay} className="flex items-center gap-1 px-2.5 h-7 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"><Play className="size-3" /> Continue</button>
              <button onClick={stopPlay} className="flex items-center gap-1 px-2.5 h-7 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"><Square className="size-3" /> Stop</button>
              <button onClick={() => setErrorModalOpen(false)} className="ml-auto px-2.5 h-7 rounded text-[10px] font-semibold text-slate-400 hover:text-slate-200">Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}