/** Detects 20s of inactivity inside a graph container. */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export function useGraphIdle(containerRef: RefObject<HTMLElement | null>, idleMs = 20_000): { isIdle: boolean } {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), idleMs);
  }, [idleMs]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetTimer();
    el.addEventListener('pointermove', resetTimer, { passive: true });
    el.addEventListener('pointerdown', resetTimer, { passive: true });
    el.addEventListener('wheel', resetTimer, { passive: true });
    return () => {
      el.removeEventListener('pointermove', resetTimer);
      el.removeEventListener('pointerdown', resetTimer);
      el.removeEventListener('wheel', resetTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [containerRef, resetTimer]);

  return { isIdle };
}