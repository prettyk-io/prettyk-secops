/**
 * @vitest-environment jsdom
 * VP-F1/VP-F2: BrowserStage рендерит <canvas> (не <img>), не поллит скриншоты.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BrowserStage } from './BrowserStage';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';

afterEach(() => cleanup());

describe('BrowserStage (VP-F1 canvas + VP-F2 cleanup)', () => {
  it('показывает кнопку «Запустить браузер» когда не connected', () => {
    useScenarioDeckStore.getState().setDecks([
      { id: 'deck-1', title: 'Deck', description: '', continueOnError: false, steps: [], collapsed: false },
    ]);
    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} />);
    expect(container.textContent).toContain('Запустить браузер');
  });

  it('НЕ содержит <img> — скриншот-поллинг удалён (VP-F2)', () => {
    useScenarioDeckStore.getState().setDecks([
      { id: 'deck-1', title: 'Deck', description: '', continueOnError: false, steps: [], collapsed: false },
    ]);
    // И в disconnected, и в connected состоянии — никаких <img>
    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);
    expect(container.querySelector('img')).toBeNull();
    // Даже без cdpConnected
    const { container: c2 } = render(<BrowserStage mode="author" onModeChange={() => {}} />);
    expect(c2.querySelector('img')).toBeNull();
  });

  it('показывает «Recording clicks» когда cdpObserving', () => {
    useScenarioDeckStore.getState().setDecks([
      { id: 'deck-1', title: 'Deck', description: '', continueOnError: false, steps: [], collapsed: false },
    ]);
    const { container } = render(<BrowserStage mode="record" onModeChange={() => {}} cdpConnected cdpObserving />);
    expect(container.textContent).toContain('Recording clicks');
  });
});