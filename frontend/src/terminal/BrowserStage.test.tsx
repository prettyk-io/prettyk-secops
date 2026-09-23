/**
 * @vitest-environment jsdom
 * VP-F1/VP-F2: BrowserStage рендерит <canvas> (не <img>), не поллит скриншоты.
 * BBA-FE-2: replay runner в BrowserStage — статусы шагов, ошибка, Continue/Stop.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserStage } from './BrowserStage';
import { useScenarioDeckStore } from '../studio/ScenarioDeckStore';
import type { ScenarioStepModel } from '../studio/scenarioStepModel';
import { __resetBrowserSessionForTests } from '../studio/browserSession';

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Helpers для replay-тестов
// ---------------------------------------------------------------------------

function clickStep(id: string): ScenarioStepModel {
  return { id, action: 'Click', strategy: 'css', strategyValue: '#target', payload: '', continueOnError: false, led: 'queued' };
}
function waitStep(id: string, payload: string): ScenarioStepModel {
  return { id, action: 'Wait', strategy: 'css', strategyValue: '', payload, continueOnError: false, led: 'queued' };
}
function deckWith(steps: ScenarioStepModel[]) {
  return { id: 'deck-1', title: 'Deck', description: '', continueOnError: false, steps, collapsed: false };
}

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function mockFetch(respond: (url: string) => Response): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
    return respond(url);
  }) as unknown as typeof fetch;
}

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

describe('BrowserStage — replay runner (BBA-FE-2 / BBA-FE-3)', () => {
  beforeEach(() => {
    __resetBrowserSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function scenarioResp(step: {
    step_id: string;
    action: string;
    status: 'passed' | 'failed';
    duration_ms: number;
    error: string | null;
    screenshot_b64: string | null;
  }, verdict: 'passed' | 'failed') {
    return resp(200, {
      ok: true,
      steps: [step],
      total: 1,
      executed: 1,
      passed: verdict === 'passed' ? 1 : 0,
      failed: verdict === 'passed' ? 0 : 1,
      cancelled: 0,
      verdict,
      duration_ms: 30,
    });
  }

  function mockScenarioReplay(step: Parameters<typeof scenarioResp>[0], verdict: 'passed' | 'failed' = 'passed') {
    mockFetch((url) => (url.includes('/api/browser/scenario/replay')
      ? scenarioResp(step, verdict)
      : resp(200, { ok: true })));
  }

  it('запускает replay и помечает шаг passed', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([clickStep('s1')])]);
    mockScenarioReplay({ step_id: 's1', action: 'click', status: 'passed', duration_ms: 12, error: null, screenshot_b64: null });

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-status="passed"]')).not.toBeNull();
    });
  });

  it('показывает ошибку шага вместо немого skip + Continue и останавливается по Stop', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([clickStep('s1')])]);
    mockScenarioReplay({ step_id: 's1', action: 'click', status: 'failed', duration_ms: 9, error: 'selector not found', screenshot_b64: null }, 'failed');

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-status="failed"]')).not.toBeNull();
    });
    expect(container.textContent).toContain('selector not found');
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();

    // Stop из баннера возвращает Play и прячет статусы ошибки.
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    await waitFor(() => {
      expect(container.querySelector('[data-status="failed"]')).toBeNull();
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    });
  });

  it('снимает и показывает скриншот ошибки шага в модале (BBA-FE-3)', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([clickStep('s1')])]);
    mockScenarioReplay({ step_id: 's1', action: 'click', status: 'failed', duration_ms: 9, error: 'element not found', screenshot_b64: 'ZmFrZXBuZw==' }, 'failed');

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-error-modal"]')).not.toBeNull();
    });
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toContain('data:image/png;base64,ZmFrZXBuZw==');
    // Закрытие модала.
    fireEvent.click(screen.getByLabelText('Закрыть'));
    await waitFor(() => {
      expect(container.querySelector('[data-testid="step-error-modal"]')).toBeNull();
    });
  });

  it('останавливает replay по Stop (в полёте)', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([waitStep('w1', '10000')])]);
    // replay не завершается — fetch висит, пока не остановим.
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;

    render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /stop/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy();
    });
  });
});

describe('BrowserStage — CandidateOverlay (BBA-FE-4)', () => {
  beforeEach(() => {
    __resetBrowserSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('обсерв-режим: рисует рамки кандидатов из backend и кликает элемент по рамке', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([])]);
    mockFetch((url) => {
      if (url.includes('/api/browser/elements')) {
        return resp(200, {
          ok: true,
          count: 1,
          elements: [
            { tag: 'button', role: 'button', text: 'Войти', cssSelector: '#login', rect: { x: 10, y: 10, w: 120, h: 32 } },
          ],
        });
      }
      if (url.includes('/api/browser/step/execute')) {
        return resp(200, { step_id: 's1', action: 'click', status: 'passed', duration_ms: 5, error: null, screenshot_b64: null });
      }
      if (url.includes('/api/browser/status')) {
        return resp(200, { ok: true, connected: true, url: 'http://juice-shop:3000', title: 'Juice', contexts: ['operator'], purpose: 'authoring', transport: 'playwright', runtime: 'container' });
      }
      return resp(200, { ok: true });
    });

    const { container } = render(<BrowserStage mode="record" onModeChange={() => {}} cdpConnected cdpObserving />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="candidate-frame"]')).not.toBeNull();
    });

    // Клик по рамке → живой клик элемента, не координатный.
    fireEvent.click(container.querySelector('[data-testid="candidate-frame"]') as HTMLElement);

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const hit = calls.find((c) => String(c[0]).includes('/api/browser/step/execute'));
      expect(hit).toBeTruthy();
      const body = JSON.parse(String(hit?.[1]?.body ?? '{}'));
      expect(body.step.action).toBe('click');
      expect(body.step.strategy).toBe('css');
      expect(body.step.target).toBe('#login');
    });
  });
});