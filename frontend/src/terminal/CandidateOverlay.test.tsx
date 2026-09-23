/**
 * @vitest-environment jsdom
 * BBA-FE-4: CandidateOverlay — рамки с подписями + клик по рамке.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CandidateOverlay } from './CandidateOverlay';
import type { CandidateElement } from './candidateInspect';

afterEach(() => cleanup());

function candidate(overrides?: Partial<CandidateElement>): CandidateElement {
  return {
    id: 'c1',
    tag: 'button',
    role: 'button',
    text: 'Войти',
    cssSelector: '#login',
    rect: { x: 0, y: 0, w: 100, h: 30 },
    ...overrides,
  };
}

const canvasRef = { current: { clientWidth: 640, clientHeight: 400 } as HTMLCanvasElement };

describe('CandidateOverlay', () => {
  it('рендерит рамки кандидатов', () => {
    const { container } = render(
      <CandidateOverlay candidates={[candidate()]} canvasRef={canvasRef} frameWidth={1280} frameHeight={800} onCandidateClick={() => {}} />,
    );
    expect(container.querySelector('[data-testid="candidate-overlay"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="candidate-frame"]')).toHaveLength(1);
  });

  it('рамка содержит подпись role/text в title', () => {
    const { getByTestId } = render(
      <CandidateOverlay candidates={[candidate({ role: 'button', text: 'Войти', cssSelector: '#login' })]} canvasRef={canvasRef} frameWidth={1280} frameHeight={800} onCandidateClick={() => {}} />,
    );
    const frame = getByTestId('candidate-frame');
    expect(frame.getAttribute('title')).toContain('button');
    expect(frame.getAttribute('title')).toContain('Войти');
    expect(frame.getAttribute('title')).toContain('#login');
  });

  it('клик по рамке вызывает onCandidateClick с кандидатом', () => {
    const on = vi.fn();
    const c = candidate();
    const { getByTestId } = render(
      <CandidateOverlay candidates={[c]} canvasRef={canvasRef} frameWidth={1280} frameHeight={800} onCandidateClick={on} />,
    );
    fireEvent.click(getByTestId('candidate-frame'));
    expect(on).toHaveBeenCalledWith(c);
  });

  it('пустой список → null', () => {
    const { container } = render(
      <CandidateOverlay candidates={[]} canvasRef={canvasRef} frameWidth={1280} frameHeight={800} onCandidateClick={() => {}} />,
    );
    expect(container.querySelector('[data-testid="candidate-overlay"]')).toBeNull();
  });
});