/**
 * @vitest-environment jsdom
 * PW-A3: BrowserStage рендерит живой noVNC-стрим вместо скриншот-поллинга.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

let mockStatus: { connected: boolean; streamUrl: string | null; url: string | null; title: string | null };

vi.mock('../studio/browserSession', () => ({
  getBrowserSession: () => ({
    startPolling: () => {},
    stopPolling: () => {},
    getLastStatus: () => ({ ok: true, ...mockStatus, contexts: [] }),
    onChange: () => () => {},
  }),
}));

import { BrowserStage } from './BrowserStage';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';

describe('BrowserStage (PW-A3 noVNC)', () => {
  beforeEach(() => {
    // Stable deck so the `decks[0]?.steps` selector returns a cached reference
    useScenarioDeckStore.getState().setDecks([
      { id: 'deck-1', title: 'Deck', description: '', continueOnError: false, steps: [], collapsed: false },
    ]);
    mockStatus = {
      connected: true,
      streamUrl: 'http://127.0.0.1:7900/?autoconnect=1&resize=scale',
      url: 'http://juice-shop:3000/',
      title: 'Juice Shop',
    };
  });

  afterEach(() => cleanup());

  it('рендерит живой noVNC iframe когда streamUrl есть', () => {
    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toContain('7900');
  });

  it('не рендерит iframe и не поллит скриншоты когда streamUrl отсутствует', () => {
    mockStatus.streamUrl = null;
    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} />);
    expect(container.querySelector('iframe')).toBeFalsy();
    expect(container.textContent).toContain('Запуск живого стрима');
  });

  it('показывает «Recording clicks» поверх стрима когда cdpObserving', () => {
    const { container } = render(<BrowserStage mode="record" onModeChange={() => {}} cdpObserving />);
    expect(container.textContent).toContain('Recording clicks');
  });
});
