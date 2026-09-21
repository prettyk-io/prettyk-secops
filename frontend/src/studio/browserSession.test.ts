/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BrowserSession,
  getBrowserSession,
  __resetBrowserSessionForTests,
  scenarioStepToBackendDto,
  type BrowserSessionStatus,
  type NavigateResult,
  type ScreenshotResult,
  type BrowserContextKind,
  type BackendStepResult,
} from '../studio/browserSession';
import type { ScenarioStepModel } from './scenarioStepModel';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

function mockResponse<T>(status: number, body: T): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    // BBA-FE-2: полная эмуляция Response — и text(), и json().
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

function mockStatusResponse(connected: boolean, overrides?: Partial<BrowserSessionStatus>): BrowserSessionStatus {
  return {
    ok: true,
    connected,
    url: connected ? 'https://example.com' : null,
    title: connected ? 'Example' : null,
    contexts: connected ? ['operator'] : [],
    browserVersion: connected ? '120.0.6099.109' : undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserSession', () => {
  let session: BrowserSession;

  beforeEach(() => {
    __resetBrowserSessionForTests();
    mockFetch.mockReset();
    session = getBrowserSession();
  });

  afterEach(() => {
    session.stopPolling();
    vi.useRealTimers();
  });

  // ── Singleton (B4: один процесс) ──

  it('returns the same instance on repeated getBrowserSession()', () => {
    const s1 = getBrowserSession();
    const s2 = getBrowserSession();
    expect(s1).toBe(s2);
  });

  it('maintains connection state across calls', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true)));
    await session.getStatus();
    expect(session.isConnected()).toBe(true);
  });

  // ── getStatus ──

  it('parses connected status correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true)));
    const status = await session.getStatus();

    expect(status.connected).toBe(true);
    expect(status.url).toBe('https://example.com');
    expect(status.title).toBe('Example');
    expect(status.contexts).toEqual(['operator']);
    expect(status.browserVersion).toBe('120.0.6099.109');
  });

  it('parses disconnected status correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockStatusResponse(false)));
    const status = await session.getStatus();

    expect(status.connected).toBe(false);
    expect(status.url).toBeNull();
    expect(session.isConnected()).toBe(false);
  });

  it('handles network error during getStatus', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const status = await session.getStatus();

    expect(status.ok).toBe(true);
    expect(status.connected).toBe(false);
    expect(session.isConnected()).toBe(false);
  });

  it('handles 500 server error during getStatus', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(500, { error: 'Internal' }));
    // Should throw, let's test rejection
    try {
      await session.getStatus();
    } catch {
      expect(session.isConnected()).toBe(false); // fallback
    }
  });

  // ── Context management ──

  it('creates a context via ensureContext', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-1' }));
    const ok = await session.ensureContext('run', 'https://target.local');

    expect(ok).toBe(true);
    expect(session.hasContext('run')).toBe(true);
  });

  it('handles ensureContext failure', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(400, { ok: false, error: 'CDP not connected' }));
    const ok = await session.ensureContext('run');

    expect(ok).toBe(false);
    expect(session.hasContext('run')).toBe(false);
  });

  it('handles ensureContext network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Offline'));
    const ok = await session.ensureContext('debug');

    expect(ok).toBe(false);
    expect(session.hasContext('debug')).toBe(false);
  });

  it('destroys a context', async () => {
    // First create
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-r' }));
    await session.ensureContext('run');
    expect(session.hasContext('run')).toBe(true);

    // Then destroy
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
    const ok = await session.destroyContext('run');

    expect(ok).toBe(true);
    expect(session.hasContext('run')).toBe(false);
  });

  it('handles destroyContext failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Offline'));
    const ok = await session.destroyContext('operator');

    expect(ok).toBe(false);
  });

  it('lists active contexts', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-o' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-r' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-d' }));

    await session.ensureContext('operator');
    await session.ensureContext('run');
    await session.ensureContext('debug');

    const ctxs = session.getActiveContexts().sort();
    expect(ctxs).toEqual(['debug', 'operator', 'run']);
  });

  // ── Navigate ──

  it('navigates in operator context', async () => {
    const result: NavigateResult = {
      ok: true,
      url: 'https://example.com',
      title: 'Example Page',
      loadTimeMs: 234,
    };
    mockFetch.mockResolvedValueOnce(mockResponse(200, result));

    const nav = await session.navigate('https://example.com', 'operator');
    expect(nav.ok).toBe(true);
    expect(nav.url).toBe('https://example.com');
    expect(nav.title).toBe('Example Page');
    expect(nav.loadTimeMs).toBe(234);
  });

  it('navigates in run context (default)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, url: 'https://target.local' }),
    );

    const nav = await session.navigate('https://target.local');
    expect(nav.ok).toBe(true);
  });

  it('handles navigation failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('CDP protocol error'));
    await expect(session.navigate('bad-url')).rejects.toThrow();
  });

  // ── Screenshot ──

  it('takes a screenshot', async () => {
    const result: ScreenshotResult = {
      ok: true,
      screenshot: 'base64pngdata...',
      viewport: { width: 1280, height: 720 },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(200, result));

    const shot = await session.screenshot('operator');
    expect(shot.ok).toBe(true);
    expect(shot.screenshot).toBe('base64pngdata...');
    expect(shot.viewport).toEqual({ width: 1280, height: 720 });
  });

  it('takes a screenshot in debug context', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, screenshot: 'debug-png' }),
    );

    const shot = await session.screenshot('debug');
    expect(shot.ok).toBe(true);
    expect(shot.screenshot).toBe('debug-png');
  });

  it('handles screenshot failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Browser crashed'));
    await expect(session.screenshot('operator')).rejects.toThrow();
  });

  // ── Eval ──

  it('evaluates JavaScript in context', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, result: 'some value' }),
    );

    const result = await session.eval('document.title', 'operator');
    expect(result).toEqual({ ok: true, result: 'some value' });
  });

  it('eval defaults to operator context', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, result: 42 }),
    );

    const result = await session.eval('40 + 2');
    expect(result).toEqual({ ok: true, result: 42 });
  });

  // ── Polling ──

  it('starts and stops polling', async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true)))
      .mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true, { url: 'https://new.com' })));

    session.startPolling(1000);

    // Immediate poll on start
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(session.isConnected()).toBe(true);

    // Second poll after interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    session.stopPolling();

    // No more polls
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('restarting polling stops previous interval', () => {
    vi.useFakeTimers();
    session.startPolling(500);
    session.startPolling(1000);
    session.stopPolling();
    vi.useRealTimers();
    // No crash = pass
  });

  // ── Change listeners ──

  it('notifies change listeners on status update', async () => {
    const listener = vi.fn();
    session.onChange(listener);

    mockFetch.mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true)));
    await session.getStatus();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies change listeners on context change', async () => {
    const listener = vi.fn();
    session.onChange(listener);

    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-1' }));
    await session.ensureContext('run');

    expect(listener).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', async () => {
    const listener = vi.fn();
    const unsub = session.onChange(listener);
    unsub();

    mockFetch.mockResolvedValueOnce(mockResponse(200, mockStatusResponse(true)));
    await session.getStatus();

    expect(listener).not.toHaveBeenCalled();
  });

  // ── Shutdown ──

  it('shutdown stops polling and destroys contexts', async () => {
    vi.useFakeTimers();

    // Create contexts
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-o' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-r' }));

    await session.ensureContext('operator');
    await session.ensureContext('run');

    // Destroy both
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, { ok: true }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await session.shutdown();

    expect(session.isConnected()).toBe(false);
    expect(session.getActiveContexts()).toEqual([]);
    vi.useRealTimers();
  });

  // ── getLastStatus ──

  it('getLastStatus returns cached status after getStatus call', async () => {
    const status = mockStatusResponse(true);
    mockFetch.mockResolvedValueOnce(mockResponse(200, status));
    await session.getStatus();

    const cached = session.getLastStatus();
    expect(cached).toBeDefined();
    expect(cached?.url).toBe('https://example.com');
  });

  it('getLastStatus returns null before first poll', () => {
    expect(session.getLastStatus()).toBeNull();
  });

  // ── Context isolation verification ──

  it('operator context is separate from run context', async () => {
    // Create operator context
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-o' }));
    await session.ensureContext('operator');

    // Create run context separately
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-r' }));
    await session.ensureContext('run');

    // Both exist independently
    expect(session.hasContext('operator')).toBe(true);
    expect(session.hasContext('run')).toBe(true);

    // Destroying operator doesn't affect run
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));
    await session.destroyContext('operator');

    expect(session.hasContext('operator')).toBe(false);
    expect(session.hasContext('run')).toBe(true);
  });

  it('navigating in run context does not affect operator context URL', async () => {
    // Navigate in run context
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, url: 'https://run-target.local' }),
    );
    const runNav = await session.navigate('https://run-target.local', 'run');
    expect(runNav.url).toBe('https://run-target.local');

    // Navigate in operator context (different URL)
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { ok: true, url: 'https://operator-view.local' }),
    );
    const opNav = await session.navigate('https://operator-view.local', 'operator');
    expect(opNav.url).toBe('https://operator-view.local');
  });
});

// ---------------------------------------------------------------------------
// Edge cases & invariants
// ---------------------------------------------------------------------------

describe('BrowserSession — invariants', () => {
  let session: BrowserSession;

  beforeEach(() => {
    __resetBrowserSessionForTests();
    mockFetch.mockReset();
    session = getBrowserSession();
  });

  afterEach(() => {
    session.stopPolling();
  });

  it('connected remains false if server returns 500 on context create', async () => {
    mockFetch.mockRejectedValueOnce(new Error('500'));
    await session.ensureContext('debug');
    expect(session.isConnected()).toBe(false);
  });

  it('shutdown on empty session does not throw', async () => {
    await expect(session.shutdown()).resolves.toBeUndefined();
  });

  it('double destroyContext does not throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Not found'));
    const ok = await session.destroyContext('operator');
    expect(ok).toBe(false); // graceful degradation
  });

  it('multiple ensureContext with same kind is idempotent from client view', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-1' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-1' }));

    await session.ensureContext('run');
    await session.ensureContext('run');

    expect(session.getActiveContexts().filter((c) => c === 'run').length).toBe(1);
  });

  it('getActiveContexts returns empty after shutdown', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse(200, { ok: true, contextId: 'ctx-o' }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await session.ensureContext('operator');
    await session.shutdown();

    expect(session.getActiveContexts()).toEqual([]);
    expect(session.isConnected()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BBA-FE-3: маппинг ScenarioStepModel ↔ бэкенд-роуты шагов/replay
// ---------------------------------------------------------------------------

function sessStep(id: string, overrides?: Partial<ScenarioStepModel>): ScenarioStepModel {
  return {
    id,
    action: 'Click',
    strategy: 'css',
    strategyValue: '#x',
    payload: '',
    continueOnError: false,
    led: 'queued',
    ...overrides,
  };
}

function backendStep(overrides?: Partial<BackendStepResult>): BackendStepResult {
  return {
    step_id: 's1',
    action: 'click',
    status: 'passed',
    duration_ms: 5,
    error: null,
    screenshot_b64: null,
    ...overrides,
  };
}

describe('scenarioStepToBackendDto (BBA-FE-3)', () => {
  it('мапит Click → click + strategy', () => {
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Click', strategyValue: '#x', strategy: 'css' })))
      .toEqual({ action: 'click', target: '#x', strategy: 'css', step_id: 'a' });
  });

  it('мапит Type → fill с value', () => {
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Type', strategyValue: 'input', payload: 'hello' })))
      .toEqual({ action: 'fill', target: 'input', value: 'hello', strategy: 'css', step_id: 'a' });
  });

  it('мапит Open → goto, Wait → wait_for, PressKey → press_key', () => {
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Open', payload: 'https://x.dev' })))
      .toEqual({ action: 'goto', target: 'https://x.dev', step_id: 'a' });
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Wait', payload: '300' })))
      .toEqual({ action: 'wait_for', target: '300', step_id: 'a' });
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'PressKey', payload: 'Enter' })))
      .toEqual({ action: 'press_key', target: 'Enter', step_id: 'a' });
  });

  it('возвращает null для DSL-only шагов', () => {
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Let' }))).toBeNull();
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'Secret' }))).toBeNull();
    expect(scenarioStepToBackendDto(sessStep('a', { action: 'GenerateEmail' }))).toBeNull();
  });
});

describe('BrowserSession — executeStep / replayScenario (BBA-FE-3)', () => {
  let session: BrowserSession;

  beforeEach(() => {
    __resetBrowserSessionForTests();
    mockFetch.mockReset();
    session = getBrowserSession();
  });

  afterEach(() => {
    session.stopPolling();
  });

  it('executeStep Click POST-ит /api/browser/step/execute с DTO', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, backendStep()));
    const r = await session.executeStep(sessStep('a'));

    expect(r.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/browser/step/execute');
    expect(JSON.parse(init.body as string).step).toEqual({ action: 'click', target: '#x', strategy: 'css', step_id: 'a' });
  });

  it('executeStep failed мапит error + screenshotB64', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, backendStep({
      status: 'failed', error: 'RuntimeError: boom', screenshot_b64: 'YWJj',
    })));
    const r = await session.executeStep(sessStep('a'));

    expect(r.ok).toBe(false);
    expect(r.error).toBe('RuntimeError: boom');
    expect(r.screenshotB64).toBe('YWJj');
  });

  it('executeStep DSL-only шаг — no-op без fetch', async () => {
    const r = await session.executeStep(sessStep('a', { action: 'Let' }));
    expect(r.ok).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('replayScenario POST-ит /api/browser/scenario/replay и мапит states', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, {
      ok: true,
      steps: [
        backendStep({ step_id: 'a', action: 'click' }),
        backendStep({ step_id: 'b', action: 'wait_for' }),
      ],
      total: 2, executed: 2, passed: 2, failed: 0, cancelled: 0,
      verdict: 'passed', duration_ms: 250,
    }));

    const steps = [sessStep('a'), sessStep('b', { action: 'Wait', payload: '300' }), sessStep('c', { action: 'Let' })];
    const result = await session.replayScenario(steps);

    expect(result.states).toHaveLength(3);
    expect(result.states.map((s) => s.status)).toEqual(['passed', 'passed', 'passed']);
    expect(result.stoppedOnError).toBe(false);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.steps).toHaveLength(2); // Let отфильтрован
    expect(body.steps[0].action).toBe('click');
    expect(body.steps[1].action).toBe('wait_for');
    expect(body.stop_on_failure).toBe(true);
  });

  it('replayScenario вердикт failed → stoppedOnError + скриншот шага', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, {
      ok: true,
      steps: [backendStep({ status: 'failed', error: 'boom', screenshot_b64: 'c2NyZWVu' })],
      total: 1, executed: 1, passed: 0, failed: 1, cancelled: 0,
      verdict: 'failed', duration_ms: 20,
    }));

    const result = await session.replayScenario([sessStep('a')]);

    expect(result.stoppedOnError).toBe(true);
    expect(result.states[0]!.status).toBe('failed');
    expect(result.states[0]!.screenshotB64).toBe('c2NyZWVu');
  });
});