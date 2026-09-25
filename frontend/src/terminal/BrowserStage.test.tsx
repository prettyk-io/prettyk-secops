/**
 * @vitest-environment jsdom
 * VP-F1/VP-F2: BrowserStage рендерит <canvas> (не <img>), не поллит скриншоты.
 * BBA-FE-2: replay runner в BrowserStage — статусы шагов, ошибка, Continue/Stop.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
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

function mockFetch(respond: (url: string) => Response | Promise<Response>): void {
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

  function stepExecResp(step: {
    step_id: string;
    action: string;
    status: 'passed' | 'failed';
    duration_ms: number;
    error: string | null;
    screenshot_b64: string | null;
  }) {
    return resp(200, step);
  }

  // RP-VIZ: replay теперь пошаговый — POST /api/browser/step/execute (не batch scenario/replay).
  function mockStepExecute(
    step: Parameters<typeof stepExecResp>[0],
    elements: unknown[] = [],
  ) {
    mockFetch((url) => {
      if (url.includes('/api/browser/status')) {
        return resp(200, { ok: true, connected: true, url: 'http://juice-shop:3000', title: 'Juice', contexts: ['operator'], purpose: 'authoring', transport: 'playwright', runtime: 'container' });
      }
      if (url.includes('/api/browser/elements')) {
        return resp(200, { ok: true, count: elements.length, elements });
      }
      if (url.includes('/api/browser/step/execute')) {
        return stepExecResp(step);
      }
      return resp(200, { ok: true });
    });
  }

  it('запускает replay и помечает шаг passed', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([clickStep('s1')])]);
    mockStepExecute({ step_id: 's1', action: 'click', status: 'passed', duration_ms: 12, error: null, screenshot_b64: null });

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-status="passed"]')).not.toBeNull();
    });
  });

  it('показывает ошибку шага вместо немого skip + Continue и останавливается по Stop', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([clickStep('s1')])]);
    mockStepExecute({ step_id: 's1', action: 'click', status: 'failed', duration_ms: 9, error: 'selector not found', screenshot_b64: null });

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
    mockStepExecute({ step_id: 's1', action: 'click', status: 'failed', duration_ms: 9, error: 'element not found', screenshot_b64: 'ZmFrZXBuZw==' });

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

  it('RP-VIZ: подсвечивает активный шаг рамкой на живом кадре', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([
      { id: 's1', action: 'Click', strategy: 'css', strategyValue: '#login', payload: '', continueOnError: false, led: 'queued' },
    ])]);
    // step/execute висит, пока шаг «running» — даём увидеть подсветку до resolve.
    let resolveStep!: (r: Response) => void;
    mockFetch((url) => {
      if (url.includes('/api/browser/status')) {
        return resp(200, { ok: true, connected: true, url: 'http://juice-shop:3000', title: 'Juice', contexts: ['operator'], purpose: 'authoring', transport: 'playwright', runtime: 'container' });
      }
      if (url.includes('/api/browser/elements')) {
        return resp(200, { ok: true, count: 1, elements: [{ tag: 'button', role: 'button', text: 'Войти', cssSelector: '#login', rect: { x: 10, y: 10, w: 120, h: 32 } }] });
      }
      if (url.includes('/api/browser/step/execute')) {
        return new Promise<Response>((resolve) => { resolveStep = resolve; });
      }
      return resp(200, { ok: true });
    });

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="replay-active-frame"]')).not.toBeNull();
      expect(container.textContent).toContain('Click Войти');
    });

    resolveStep(resp(200, { step_id: 's1', action: 'click', status: 'passed', duration_ms: 12, error: null, screenshot_b64: null }));
    await waitFor(() => {
      expect(container.querySelector('[data-status="passed"]')).not.toBeNull();
    });
  });

  it('RP-VIZ: ошибка шага → красный маркер на элементе', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([
      { id: 's1', action: 'Click', strategy: 'css', strategyValue: '#login', payload: '', continueOnError: false, led: 'queued' },
    ])]);
    mockStepExecute(
      { step_id: 's1', action: 'click', status: 'failed', duration_ms: 9, error: 'selector not found', screenshot_b64: null },
      [{ tag: 'button', role: 'button', text: 'Войти', cssSelector: '#login', rect: { x: 10, y: 10, w: 120, h: 32 } }],
    );

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);

    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(container.querySelector('[data-testid="replay-error-frame"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="replay-error-context"]')?.textContent).toContain('selector not found');
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

describe('BrowserStage — колесо мыши (BROWSER-STUDIO-SCROLL)', () => {
  beforeEach(() => {
    __resetBrowserSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockConnected(): void {
    mockFetch((url) => {
      if (url.includes('/api/browser/status')) {
        return resp(200, { ok: true, connected: true, url: 'http://juice-shop:3000', title: 'Juice', contexts: ['operator'], purpose: 'authoring', transport: 'playwright', runtime: 'container' });
      }
      return resp(200, { ok: true });
    });
  }

  async function renderWithCanvas(): Promise<HTMLCanvasElement> {
    useScenarioDeckStore.getState().setDecks([deckWith([])]);
    mockConnected();
    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);
    await waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
    return canvas;
  }

  it('батчит дельты и шлёт /api/browser/wheel с координатами вьюпорта', async () => {
    const canvas = await renderWithCanvas();

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 120, clientX: 200, clientY: 150 });
    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 80, clientX: 200, clientY: 150 });

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const wheelCalls = calls.filter((c) => String(c[0]).includes('/api/browser/wheel'));
      expect(wheelCalls).toHaveLength(1);
      const body = JSON.parse(String(wheelCalls[0]?.[1]?.body ?? '{}'));
      expect(body.dy).toBe(200);
      expect(body.x).toBe(640);
      expect(body.y).toBe(400);
    });
  });

  it('не шлёт запрос при нулевых дельтах', async () => {
    const canvas = await renderWithCanvas();

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 0, clientX: 200, clientY: 150 });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter((c) => String(c[0]).includes('/api/browser/wheel'))).toHaveLength(0);
  });

  it('ловит wheel с оверлея кандидатов (событие всплывает на контейнер вьюпорта)', async () => {
    const canvas = await renderWithCanvas();
    const viewport = (canvas.closest('div.relative') as HTMLElement).parentElement as HTMLElement;

    fireEvent.wheel(viewport, { deltaX: 0, deltaY: 60, clientX: 200, clientY: 150 });

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const wheelCalls = calls.filter((c) => String(c[0]).includes('/api/browser/wheel'));
      expect(wheelCalls).toHaveLength(1);
      const body = JSON.parse(String(wheelCalls[0]?.[1]?.body ?? '{}'));
      expect(body.dy).toBe(60);
    });
  });
});

describe('BrowserStage — VIEWFIT-FE (подгонка удалённого viewport)', () => {
  class ResizeObserverStub {
    static lastCallback: (() => void) | null = null;
    constructor(cb: () => void) { ResizeObserverStub.lastCallback = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  beforeEach(() => {
    __resetBrowserSessionForTests();
    ResizeObserverStub.lastCallback = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const connectedStatus = {
    ok: true,
    connected: true,
    url: 'http://juice-shop:3000',
    title: 'Juice',
    contexts: ['operator'],
    purpose: 'authoring',
    transport: 'playwright',
    runtime: 'container',
  };

  function viewportCalls(): Array<{ width?: number; height?: number }> {
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    return calls
      .filter((c) => String(c[0]).includes('/api/browser/viewport'))
      .map((c) => JSON.parse(String(c[1]?.body ?? '{}')));
  }

  it('размер контейнера уходит на POST /api/browser/viewport (debounce), дубли не шлются', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([])]);
    mockFetch((url) => {
      if (url.includes('/api/browser/status')) return resp(200, connectedStatus);
      if (url.includes('/api/browser/viewport')) return resp(200, { ok: true, viewportWidth: 1083, viewportHeight: 661, clamped: false });
      return resp(200, { ok: true });
    });

    render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);
    const vp = screen.getByTestId('browser-stage-viewport');
    Object.defineProperty(vp, 'clientWidth', { value: 1083, configurable: true });
    Object.defineProperty(vp, 'clientHeight', { value: 661, configurable: true });

    await waitFor(() => {
      expect(viewportCalls().length).toBeGreaterThan(0);
    }, { timeout: 2000 });
    expect(viewportCalls()[0]).toEqual({ width: 1083, height: 661 });

    // Дать успешному ответу осесть в дедупе, затем повторить тот же размер.
    await new Promise((r) => setTimeout(r, 60));
    act(() => { ResizeObserverStub.lastCallback?.(); });
    await new Promise((r) => setTimeout(r, 450));
    expect(viewportCalls()).toHaveLength(1);
  });

  it('BE недоступен (500) → запрос падает тихо, деск жив (aspect-fit fallback)', async () => {
    useScenarioDeckStore.getState().setDecks([deckWith([])]);
    mockFetch((url) => {
      if (url.includes('/api/browser/status')) return resp(200, connectedStatus);
      if (url.includes('/api/browser/viewport')) return resp(500, { ok: false, error: 'backend down' });
      return resp(200, { ok: true });
    });

    const { container } = render(<BrowserStage mode="author" onModeChange={() => {}} cdpConnected />);
    const vp = screen.getByTestId('browser-stage-viewport');
    Object.defineProperty(vp, 'clientWidth', { value: 1083, configurable: true });
    Object.defineProperty(vp, 'clientHeight', { value: 661, configurable: true });

    await waitFor(() => {
      expect(viewportCalls().length).toBeGreaterThan(0);
    }, { timeout: 2000 });
    await waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
  });
});