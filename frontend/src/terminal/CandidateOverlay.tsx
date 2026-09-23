/**
 * BBA-FE-4: живой overlay кандидатов поверх canvas-стрима.
 *
 * Рисует кликабельные bounding-box рамки с подписью (role/tag · text).
 * Клик по рамке НЕ координатный — родитель делает живой клик по элементу
 * через cssSelector (BBA-EXEC-1 step/execute).
 */
import type { RefObject } from 'react';
import type { CandidateElement } from './candidateInspect';
import { computeViewportRectToCanvas } from './clickCoordinate';

export interface CandidateOverlayProps {
  candidates: CandidateElement[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Логический размер вьюпорта браузера (CSS px). */
  frameWidth: number;
  frameHeight: number;
  onCandidateClick: (c: CandidateElement) => void;
}

export function CandidateOverlay({
  candidates,
  canvasRef,
  frameWidth,
  frameHeight,
  onCandidateClick,
}: CandidateOverlayProps) {
  if (candidates.length === 0) return null;

  const canvas = canvasRef.current;
  // До первой отрисовки (или в jsdom без layout) clientWidth=0 → fallback 1:1
  // к логическому размеру вьюпорта, чтобы рамки всё равно отобразились.
  const cw = (canvas?.clientWidth ?? 0) || frameWidth;
  const ch = (canvas?.clientHeight ?? 0) || frameHeight;

  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="candidate-overlay">
      {candidates.map((c) => {
        const d = computeViewportRectToCanvas(cw, ch, frameWidth, frameHeight, c.rect);
        if (!d || d.width < 1 || d.height < 1) return null;
        const label = [c.role || c.tag, c.text].filter(Boolean).join(' · ');
        return (
          <button
            key={c.id}
            type="button"
            data-testid="candidate-frame"
            title={`${label} — ${c.cssSelector}`}
            aria-label={`Кандидат: ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onCandidateClick(c);
            }}
            className="group absolute pointer-events-auto rounded-[3px] border border-cyan-400/70 bg-cyan-500/10 hover:bg-cyan-500/25 hover:border-cyan-300 transition-colors"
            style={{
              left: d.left,
              top: d.top,
              width: d.width,
              height: d.height,
              minWidth: 4,
              minHeight: 4,
            }}
          >
            {label && (
              <span className="absolute -top-4 left-0 max-w-[280px] truncate rounded bg-slate-900/95 border border-cyan-500/40 px-1 py-px text-[8px] font-mono text-cyan-300 transition-opacity opacity-0 group-hover:opacity-100">
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}