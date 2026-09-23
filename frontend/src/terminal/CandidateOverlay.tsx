/**
 * BBA-FE-4: живой overlay кандидатов поверх canvas-стрима.
 *
 * Рисует кликабельные bounding-box рамки с подписью (role/tag · text).
 * Клик по рамке НЕ координатный — родитель делает живой клик по элементу
 * через cssSelector (BBA-EXEC-1 step/execute).
 */
import type { RefObject } from 'react';
import type { CandidateElement } from './candidateInspect';
import type { ActionKind } from '../studio/scenarioStepModel';
import { computeViewportRectToCanvas } from './clickCoordinate';

export interface CandidateOverlayProps {
  candidates: CandidateElement[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Логический размер вьюпорта браузера (CSS px). */
  frameWidth: number;
  frameHeight: number;
  /** Элемент выбран (клик по рамке) — действие по умолчанию. */
  onCandidateClick: (c: CandidateElement) => void;
  /** ACT-FE: конкретное действие из палитры поверх кандидата. */
  onCandidateAction?: (c: CandidateElement, action: ActionKind) => void;
}

/** ACT-FE: доступные действия палитры (порядок = порядок кнопок). */
const PALETTE_ACTIONS: ActionKind[] = ['Click', 'Type', 'Hover', 'Focus', 'Select', 'PressKey', 'Wheel', 'Scroll', 'Drag'];

const PALETTE_LABEL: Record<string, string> = {
  Click: 'click', Type: 'type', Hover: 'hover', Focus: 'focus',
  Select: 'select', PressKey: 'key', Wheel: 'wheel', Scroll: 'scroll', Drag: 'drag',
};

export function CandidateOverlay({
  candidates,
  canvasRef,
  frameWidth,
  frameHeight,
  onCandidateClick,
  onCandidateAction,
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
          <div
            key={c.id}
            className="group absolute pointer-events-auto"
            style={{
              left: d.left,
              top: d.top,
              width: d.width,
              height: d.height,
            }}
          >
            <button
              type="button"
              data-testid="candidate-frame"
              title={`${label} — ${c.cssSelector}`}
              aria-label={`Кандидат: ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onCandidateClick(c);
              }}
              className="absolute inset-0 rounded-[3px] border border-cyan-400/70 bg-cyan-500/10 hover:bg-cyan-500/25 hover:border-cyan-300 transition-colors"
              style={{ minWidth: 4, minHeight: 4 }}
            />
            {label && (
              <span className="absolute -top-4 left-0 max-w-[280px] truncate rounded bg-slate-900/95 border border-cyan-500/40 px-1 py-px text-[8px] font-mono text-cyan-300 transition-opacity opacity-0 group-hover:opacity-100">
                {label}
              </span>
            )}
            {onCandidateAction && (
              <span
                data-testid="candidate-action-palette"
                className="absolute -bottom-4 right-0 flex gap-px opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                {PALETTE_ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    data-testid={`candidate-action-${a}`}
                    title={`${PALETTE_LABEL[a]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCandidateAction(c, a);
                    }}
                    className="rounded bg-slate-900/95 border border-cyan-500/40 px-1 py-px text-[8px] font-mono text-cyan-300 hover:bg-cyan-500/30 hover:text-white leading-none"
                  >
                    {PALETTE_LABEL[a]}
                  </button>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}