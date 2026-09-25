/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { computeFittedCanvasSize, useBrowserCanvasStream, VIEWPORT_SYNC_DEBOUNCE_MS } from './useBrowserCanvasStream';

describe('BBA-FE-1: computeFittedCanvasSize (responsive aspect-fit)', () => {
  it('same aspect → fills container exactly (no bars, no distortion)', () => {
    const r = computeFittedCanvasSize(1280, 800, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('wider container → height-limited, fills height, horizontal letterbox', () => {
    // frame 1280×800 (1.6), container 1600×800 (2.0)
    const r = computeFittedCanvasSize(1600, 800, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('taller container → width-limited, fills width, vertical letterbox', () => {
    // frame 1280×800 (1.6), container 1280×1600 (0.8)
    const r = computeFittedCanvasSize(1280, 1600, 1280, 800)!;
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it('downscale keeps aspect when frame is larger than container', () => {
    const r = computeFittedCanvasSize(640, 400, 1280, 800)!;
    expect(r.width).toBe(640);
    expect(r.height).toBe(400);
  });

  it('resize: same frame re-fits to a larger container (no stale size)', () => {
    const small = computeFittedCanvasSize(960, 600, 1280, 800)!;
    const large = computeFittedCanvasSize(1920, 1200, 1280, 800)!;
    expect(small.width).toBe(960);
    expect(small.height).toBe(600);
    expect(large.width).toBe(1920);
    expect(large.height).toBe(1200);
    expect(large.width / large.height).toBeCloseTo(1280 / 800, 5);
  });

  it('zero sizes → null', () => {
    expect(computeFittedCanvasSize(0, 800, 1280, 800)).toBeNull();
    expect(computeFittedCanvasSize(640, 400, 0, 800)).toBeNull();
    expect(computeFittedCanvasSize(640, 400, 1280, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BROWSER-STUDIO-VIEWFIT-FE: debounced-синк размера контейнера
// ---------------------------------------------------------------------------

class ResizeObserverStub {
  static lastCallback: (() => void) | null = null;
  constructor(cb: () => void) { ResizeObserverStub.lastCallback = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
}

class WebSocketStub {
  static OPEN = 1;
  readyState = 0;
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close() {}
}

function makeContainer(width: number | null, height: number | null): HTMLDivElement {
  const el = document.createElement('div');
  if (width !== null) Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  if (height !== null) Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  return el;
}

describe('BROWSER-STUDIO-VIEWFIT-FE: debounced container resize sync', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    ResizeObserverStub.lastCallback = null;
  });

  function renderStream(
    container: HTMLDivElement,
    connected: boolean,
    onResize: (width: number, height: number) => void,
  ) {
    const canvas = document.createElement('canvas');
    return renderHook(() => useBrowserCanvasStream(
      { current: canvas },
      { current: container },
      'ws://relay:9224/api/browser/canvas',
      connected,
      onResize,
    ));
  }

  it('resize контейнера → onContainerResize(width, height) после debounce', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('WebSocket', WebSocketStub);
    const container = makeContainer(1083, 661);
    const onResize = vi.fn();

    renderStream(container, false, onResize);
    expect(onResize).not.toHaveBeenCalled();

    act(() => { ResizeObserverStub.lastCallback?.(); });
    act(() => { vi.advanceTimersByTime(VIEWPORT_SYNC_DEBOUNCE_MS); });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(1083, 661);
  });

  it('серия resize схлопывается в один вызов (debounce)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('WebSocket', WebSocketStub);
    const container = makeContainer(1083, 661);
    const onResize = vi.fn();

    renderStream(container, false, onResize);

    act(() => { vi.advanceTimersByTime(200); });
    act(() => { ResizeObserverStub.lastCallback?.(); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { ResizeObserverStub.lastCallback?.(); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onResize).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(100); });
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('connected=true → первичная синхронизация размера (debounced)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('WebSocket', WebSocketStub);
    const container = makeContainer(1083, 661);
    const onResize = vi.fn();

    renderStream(container, true, onResize);
    act(() => { vi.advanceTimersByTime(VIEWPORT_SYNC_DEBOUNCE_MS); });

    expect(onResize).toHaveBeenCalledWith(1083, 661);
  });

  it('нулевой контейнер → размер не отправляется', () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('WebSocket', WebSocketStub);
    const container = makeContainer(null, null);
    const onResize = vi.fn();

    renderStream(container, false, onResize);
    act(() => { vi.advanceTimersByTime(VIEWPORT_SYNC_DEBOUNCE_MS * 2); });

    expect(onResize).not.toHaveBeenCalled();
  });
});
