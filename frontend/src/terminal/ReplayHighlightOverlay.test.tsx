/**
 * @vitest-environment jsdom
 * RP-VIZ: ReplayHighlightOverlay — рамка активного/ошибочного шага.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ReplayHighlightOverlay } from './ReplayHighlightOverlay';
import type { CandidateElement } from './candidateInspect';

afterEach(() => cleanup());

const target: CandidateElement = {
  id: 'c1',
  tag: 'button',
  role: 'button',
  text: 'Войти',
  cssSelector: '#login',
  rect: { x: 0, y: 0, w: 100, h: 30 },
};

const canvasRef = { current: { clientWidth: 640, clientHeight: 400 } as HTMLCanvasElement };

describe('ReplayHighlightOverlay (RP-VIZ)', () => {
  it('активный шаг → emerald-рамка + лейбл', () => {
    const { getByTestId } = render(
      <ReplayHighlightOverlay target={target} label="Click Войти" canvasRef={canvasRef} frameWidth={1280} frameHeight={800} />,
    );
    expect(getByTestId('replay-active-frame')).not.toBeNull();
    expect(getByTestId('replay-highlight-rect')).not.toBeNull();
  });

  it('ошибка шага → красная рамка + причина', () => {
    const { getByTestId, getByText } = render(
      <ReplayHighlightOverlay target={target} label="Click Войти" error="selector not found" canvasRef={canvasRef} frameWidth={1280} frameHeight={800} />,
    );
    expect(getByTestId('replay-error-frame')).not.toBeNull();
    expect(getByTestId('replay-error-context').textContent).toContain('selector not found');
    expect(getByText('Click Войти')).toBeTruthy();
  });

  it('null target → ничего не рендерит', () => {
    const { container } = render(
      <ReplayHighlightOverlay target={null} label="Wait" canvasRef={canvasRef} frameWidth={1280} frameHeight={800} />,
    );
    expect(container.querySelector('[data-testid="replay-active-frame"]')).toBeNull();
    expect(container.querySelector('[data-testid="replay-error-frame"]')).toBeNull();
  });
});