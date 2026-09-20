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
 * Использование: useBrowserCanvasStream(canvasRef, containerRef, wsUrl, connected)
 */
import { useEffect, useRef, useCallback } from 'react';

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
): UseBrowserCanvasStreamResult {
  const frameInfo = useRef<CanvasFrameInfo>({ width: 0, height: 0, frameWidth: 1280, frameHeight: 800 });
  const framesReceived = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

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

    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    schedule(); // первичная подгонка при монтировании

    return () => {
      observer.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [containerRef, applyFit]);

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
