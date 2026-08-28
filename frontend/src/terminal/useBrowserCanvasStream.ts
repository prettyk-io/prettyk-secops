/**
 * VP-F1: WebSocket canvas stream — приём JPEG-кадров и рендер на <canvas>.
 *
 * Протокол (binary, per message):
 *   [4 bytes: uint16BE width, uint16BE height] [JPEG data...]
 *
 * Использование: useBrowserCanvasStream(canvasRef, wsUrl)
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

export function useBrowserCanvasStream(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  wsUrl: string,
  connected: boolean,
): UseBrowserCanvasStreamResult {
  const frameInfo = useRef<CanvasFrameInfo>({ width: 0, height: 0, frameWidth: 1280, frameHeight: 800 });
  const framesReceived = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      const img = new Image();
      img.onload = () => {
        canvas.width = frameW > 0 ? frameW : 1280;
        canvas.height = frameH > 0 ? frameH : 800;
        // Масштабируем canvas под контейнер через CSS (через стили canvas)
        const containerW = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
        const containerH = canvas.parentElement?.clientHeight ?? canvas.clientHeight;
        const scale = Math.min(containerW / frameW, containerH / frameH);
        const displayW = frameW * scale;
        const displayH = frameH * scale;
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;
        ctx.drawImage(img, 0, 0);
      };
      img.src = URL.createObjectURL(blob);
      // Освобождаем URL после загрузки
      if (img.complete) URL.revokeObjectURL(img.src);
      else img.onload = () => { URL.revokeObjectURL(img.src); ctx.drawImage(img, 0, 0); };
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
  }, [canvasRef, wsUrl, connected]);

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