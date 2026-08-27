/**
 * PW-E4 — Execution live video source.
 *
 * Live-вид прогона: headed-браузер стримится через noVNC. Этот хук читает
 * `novnc_url` из live meta (тот же канал, что веб-драйвер заполняет при
 * старте сессии) и направляет его в execution store как источник видео.
 * Без noVNC → placeholder (не пустой desktop с обманкой «успех»).
 */
import { useEffect } from 'react';
import { LIVE_META_URL } from '../../api/apiBase';
import { useExecutionStore } from './useExecutionStore';

interface LiveMetaLike {
  novnc_url?: unknown;
  live_url?: unknown;
}

const POLL_MS = 4000;

export function useExecutionVideoSource(): void {
  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`${LIVE_META_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const meta = (await res.json()) as LiveMetaLike;
        const novncUrl = typeof meta?.novnc_url === 'string' && meta.novnc_url.trim() !== ''
          ? meta.novnc_url
          : null;

        const store = useExecutionStore.getState();
        if (novncUrl) {
          store.setVideo({ source: 'novnc', novncUrl });
        }
        // Нет noVNC → оставляем текущее состояние (placeholder/recording),
        // не затираем уже финализированную запись.
      } catch {
        /* live meta недоступен — стрим остаётся как есть */
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
}
