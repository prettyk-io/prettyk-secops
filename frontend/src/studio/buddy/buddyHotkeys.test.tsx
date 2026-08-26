// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuddyHotkeys } from './buddyHotkeys';

function fireKey(key: string, code?: string, opts: { target?: EventTarget; ctrl?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code: code ?? key,
    bubbles: true,
    cancelable: true,
    ctrlKey: opts.ctrl ?? false,
  });
  // jsdom не выставляет target у window-события; для editable-test используем input
  window.dispatchEvent(event);
  return event;
}

describe('useBuddyHotkeys (BUD hotkeys)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Enter → onApply, Esc → onReject, Space → onTakeControl, 1..9 → onChip', () => {
    const h = {
      onApply: vi.fn(),
      onReject: vi.fn(),
      onChip: vi.fn(),
      onTakeControl: vi.fn(),
      enabled: true,
    };
    renderHook(() => useBuddyHotkeys(h));

    act(() => { fireKey('Enter'); });
    act(() => { fireKey('Escape'); });
    act(() => { fireKey(' ', 'Space'); });
    act(() => { fireKey('3'); });

    expect(h.onApply).toHaveBeenCalledTimes(1);
    expect(h.onReject).toHaveBeenCalledTimes(1);
    expect(h.onTakeControl).toHaveBeenCalledTimes(1);
    expect(h.onChip).toHaveBeenCalledWith(3);
  });

  it('не срабатывает при enabled=false', () => {
    const h = { onApply: vi.fn(), enabled: false };
    renderHook(() => useBuddyHotkeys(h));
    act(() => { fireKey('Enter'); });
    expect(h.onApply).not.toHaveBeenCalled();
  });

  it('не срабатывает при ctrl/meta', () => {
    const h = { onApply: vi.fn(), enabled: true };
    renderHook(() => useBuddyHotkeys(h));
    act(() => { fireKey('Enter', 'Enter', { ctrl: true }); });
    expect(h.onApply).not.toHaveBeenCalled();
  });
});
