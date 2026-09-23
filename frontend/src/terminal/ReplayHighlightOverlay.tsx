/**
 * RP-VIZ: рамка подсветки активного/ошибочного шага replay поверх живого кадра.
 *
 * Презентационный слой: не плодит второй overlay-стек (нет нового WS/поллинга),
 * переиспользует `computeViewportRectToCanvas` (общий координатный маппинг
 * с CandidateOverlay) и живёт внутри BrowserStage рядом с canvas.
 */
import type { RefObject } from 'react';
import type { CandidateElement } from './candidateInspect';
import { computeViewportRectToCanvas } from './clickCoordinate';

export interface ReplayHighlightOverlayProps {
  /** Целевой элемент шага (bbox из snapshot). null → нет подсветки. */
  target: CandidateElement | null;
  /** Лейбл при рамке: `<Action> <name>` (безопасный, без plaintext). */
  label: string;
  /** Причина ошибки шага (set → красная рамка + контекст). */
  error?: string | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameWidth: number;
  frameHeight: number;
}

export function ReplayHighlightOverlay({
  target,
  label,
  error = null,
  canvasRef,
  frameWidth,
  frameHeight,
}: ReplayHighlightOverlayProps) {
  if (!target) return null;

  const canvas = canvasRef.current;
  const cw = (canvas?.clientWidth ?? 0) || frameWidth;
  const ch = (canvas?.clientHeight ?? 0) || frameHeight;

  const d = computeViewportRectToCanvas(cw, ch, frameWidth, frameHeight, target.rect);
  if (!d || d.width < 1 || d.height < 1) return null;

  const failed = !!error;

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid={failed ? 'replay-error-frame' : 'replay-active-frame'}>
      <div
        data-testid="replay-highlight-rect"
        className={failed
          ? 'absolute border-2 border-red-500 bg-red-500/25 transition-all'
          : 'absolute border-2 border-emerald-400 bg-emerald-400/15 animate-pulse transition-all'}
        style={{
          left: d.left,
          top: d.top,
          width: d.width,
          height: d.height,
          minWidth: 4,
          minHeight: 4,
        }}
      />
      <div
        className={failed
          ? 'absolute rounded bg-red-600/95 border border-red-400 px-1.5 py-0.5 text-[9px] font-mono text-white max-w-[320px] truncate'
          : 'absolute rounded bg-emerald-600/95 border border-emerald-400 px-1.5 py-0.5 text-[9px] font-mono text-white max-w-[320px] truncate'}
        style={{ left: d.left, top: Math.max(0, d.top - 18) }}
      >
        {label}
      </div>
      {failed && error && (
        <div
          data-testid="replay-error-context"
          className="absolute rounded bg-red-950/95 border border-red-500/60 px-1.5 py-0.5 text-[9px] font-mono text-red-300 max-w-[360px]"
          style={{ left: d.left, top: d.top + d.height + 4 }}
        >
          {error}
        </div>
      )}
    </div>
  );
}