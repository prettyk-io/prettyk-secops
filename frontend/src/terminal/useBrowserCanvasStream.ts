/**
 * VP-F1: WebSocket canvas stream — приём JPEG-кадров и рендер на <canvas>.
 *
 * Протокол (binary, per message):
 *   [4 bytes: uint16BE width, uint16BE height] [JPEG data...]
 *
 * BBA-FE-1: адаптивный viewport.
 *   Размер canvas (CSS) больше НЕ пересчитывается только в img.onload.
 *   ResizeObserver следит за контейнером и перерисовывает fitted-размер при
 *   каждом изменении панели, даже когда страница статична и новых кадров нет.
 *
 * BROWSER-STUDIO-VIEWFIT-FE: подгонка удалённого viewport.
 *   ResizeObserver (debounce ~300ms) сообщает актуальный размер контейнера
 *   через `onContainerResize` — вызывающий шлёт его на POST /api/browser/viewport,
 *   чтобы стрим пришёл 1:1 без letterbox. При `connected` — первичная синхронизация.
 *
 * Использование: useBrowserCanvasStream(canvasRef, containerRef, wsUrl, connected, onContainerResize?)
 */
import { useEffect, useRef, useCallback } from 'react';

/** BROWSER-STUDIO-VIEWFIT-FE: окно debounce синхронизации размера контейнера (мс). */
export const VIEWPORT_SYNC_DEBOUNCE_MS = 300;

export interface CanvasFrameInfo {
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
}

export interface UseBrowserCanvasStreamResult {
  /** Последние размеры кадра. */
  frameInfo: React.RefObject<CanvasFrameInfo>;
  /** Счётчик полученных кадров. */
  framesReceived: React.RefObject<number>;
  /** Закрыть WS. */
  close: () => void;
}

/**
 * object-contain (aspect-fit): вписать контент frameW×frameH в контейнер
 * containerW×containerH с сохранением пропорции, занимая максимум полезной
 * ширины/высоты. Возвращает CSS-размеры canvas в px (null при нулевых входных).
 */
export function computeFittedCanvasSize(
  containerW: number,
  containerH: number,
  frameW: number,
  frameH: number,
): { width: number; height: number } | null {
  if (!containerW || !containerH || !frameW || !frameH) return null;
  const scale = Math.min(containerW / frameW, containerH / frameH);
  return {
    width: Math.max(1, Math.round(frameW * scale)),
    height: Math.max(1, Math.round(frameH * scale)),
  };
}

export function useBrowserCanvasStream(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  wsUrl: string,
  connected: boolean,
  onContainerResize?: (width: number, height: number) => void,
): UseBrowserCanvasStreamResult {
  const frameInfo = useRef<CanvasFrameInfo>({ width: 0, height: 0, frameWidth: 1280, frameHeight: 800 });
  const framesReceived = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── VIEWFIT-FE: debounced-синк размера контейнера ──
  // Колбэк держим в ref: ResizeObserver создаётся один раз и не должен
  // пересоздаваться при новом inline-колбэке на каждом рендере.
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContainerResizeRef = useRef(onContainerResize);
  onContainerResizeRef.current = onContainerResize;

  const scheduleViewportSync = useCallback(() => {
    if (!onContainerResizeRef.current) return;
    if (viewportTimerRef.current != null) clearTimeout(viewportTimerRef.current);
    viewportTimerRef.current = setTimeout(() => {
      viewportTimerRef.current = null;
      const container = containerRef.current;
      const report = onContainerResizeRef.current;
      if (!container || !report) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) report(width, height);
    }, VIEWPORT_SYNC_DEBOUNCE_MS);
  }, [containerRef]);

  // ── BBA-FE-1: fitted-размер canvas под текущий контейнер ──
  const applyFit = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const fi = frameInfo.current;
    const frameW = fi.frameWidth || canvas.width || 1280;
    const frameH = fi.frameHeight || canvas.height || 800;
    const fitted = computeFittedCanvasSize(
      container.clientWidth,
      container.clientHeight,
      frameW,
      frameH,
    );
    if (!fitted) return;
    canvas.style.width = `${fitted.width}px`;
    canvas.style.height = `${fitted.height}px`;
  }, [canvasRef, containerRef]);

  // ── BBA-FE-1: ResizeObserver на контейнер — ресайз без нового кадра ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') return;

    const schedule = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyFit();
      });
    };

    const observer = new ResizeObserver(() => {
      schedule();
      scheduleViewportSync();
    });
    observer.observe(container);
    schedule(); // первичная подгонка при монтировании
    scheduleViewportSync(); // VIEWFIT-FE: первичный синк при открытии деска

    return () => {
      observer.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (viewportTimerRef.current != null) {
        clearTimeout(viewportTimerRef.current);
        viewportTimerRef.current = null;
      }
    };
  }, [containerRef, applyFit, scheduleViewportSync]);

  // ── VIEWFIT-FE: браузер подключился — сразу синхронизировать размер ──
  useEffect(() => {
    if (connected) scheduleViewportSync();
  }, [connected, scheduleViewportSync]);

  const connect = useCallback(() => {
    if (!connected) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      framesReceived.current = 0;
    };

    ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const buf = event.data;
      if (buf.byteLength < 5) return; // минимум: 4 байта заголовка + 1 байт JPEG

      const view = new DataView(buf);
      const frameW = view.getUint16(0);
      const frameH = view.getUint16(2);
      const jpegStart = 4;
      const jpegData = new Uint8Array(buf, jpegStart);

      frameInfo.current = {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        frameWidth: frameW > 0 ? frameW : 1280,
        frameHeight: frameH > 0 ? frameH : 800,
      };
      framesReceived.current++;

      const blobUrl = URL.createObjectURL(new Blob([jpegData], { type: 'image/jpeg' }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        canvas.width = frameW > 0 ? frameW : 1280;
        canvas.height = frameH > 0 ? frameH : 800;
        ctx.drawImage(img, 0, 0);
        applyFit();
      };
      img.onerror = () => URL.revokeObjectURL(blobUrl);
      img.src = blobUrl;
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (connected) {
        reconnectTimerRef.current = setTimeout(connect, 1000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [canvasRef, containerRef, wsUrl, connected, applyFit]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const close = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return { frameInfo, framesReceived, close };
}
