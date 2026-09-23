// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { CdpObservation } from '../studio/browserSession';
import { useCdpRecorder } from './useCdpRecorder';

afterEach(cleanup);

const h = vi.hoisted(() => ({
  startObserve: vi.fn(),
  stopObserve: vi.fn(),
  getObservedEvent: vi.fn(),
}));

vi.mock('../studio/browserSession', () => ({
  getBrowserSession: () => ({
    startObserve: h.startObserve,
    stopObserve: h.stopObserve,
    getObservedEvent: h.getObservedEvent,
  }),
}));

function makeObservation(overrides: Partial<CdpObservation> = {}): CdpObservation {
  return {
    eventId: 'cdp-1',
    timestamp: Date.now(),
    action: 'click',
    element: {
      tag: 'button',
      id: 'submit-btn',
      text: 'Войти',
      rect: { x: 38, y: 52, w: 24, h: 6 },
      role: 'button',
      accessibleName: 'Войти',
    },
    candidates: [
      { kind: 'semantic', value: 'page.getByRole("button", {name: "Войти"})', score: 0.85, tier: 'T0', unique: true },
    ],
    isAmbiguous: false,
    valueClass: 'unknown',
    ...overrides,
  };
}

describe('BROWSER-STUDIO-1: autoCommit mode', () => {
  beforeEach(() => {
    h.startObserve.mockReset();
    h.stopObserve.mockReset();
    h.getObservedEvent.mockReset();
  });

  it('auto-commits a clean observation into onStepAccepted (no Accept)', async () => {
    h.startObserve.mockResolvedValue({ ok: true });
    h.getObservedEvent.mockResolvedValue({ ok: true, connected: true, observing: true, event: makeObservation() });
    const onAccepted = vi.fn();

    const { result } = renderHook(() => useCdpRecorder({ deckId: 'd', autoCommit: true, onStepAccepted: onAccepted }));
    await act(async () => { await result.current.startRecording(); });

    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    const step = onAccepted.mock.calls[0]![0].step;
    expect(step.action).toBe('Click');
    expect(step.strategyValue).toBe('Войти');
  });

  it('dedupes the same event across polls — exactly one step', async () => {
    h.startObserve.mockResolvedValue({ ok: true });
    h.getObservedEvent.mockResolvedValue({ ok: true, connected: true, observing: true, event: makeObservation() });
    const onAccepted = vi.fn();

    const { result } = renderHook(() => useCdpRecorder({ deckId: 'd', autoCommit: true, onStepAccepted: onAccepted }));
    await act(async () => { await result.current.startRecording(); });
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));

    // Ещё несколько poll-тиков — событие повторяется, но дубликат гейтится.
    await act(async () => { await new Promise((r) => setTimeout(r, 650)); });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('still blocks ambiguous observations in autoCommit', async () => {
    h.startObserve.mockResolvedValue({ ok: true });
    h.getObservedEvent.mockResolvedValue({ ok: true, connected: true, observing: true, event: makeObservation({ isAmbiguous: true }) });
    const onAccepted = vi.fn();

    const { result } = renderHook(() => useCdpRecorder({ deckId: 'd', autoCommit: true, onStepAccepted: onAccepted }));
    await act(async () => { await result.current.startRecording(); });
    await waitFor(() => expect(h.getObservedEvent).toHaveBeenCalled());

    expect(onAccepted).not.toHaveBeenCalled();
  });
});