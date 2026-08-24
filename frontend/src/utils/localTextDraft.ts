/**
 * Локальный draft текстового поля: Backspace не гонит родителя на каждый символ.
 * Паттерн как в PkBaseInputTemplate / PkTextareaWidget.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

export const LOCAL_TEXT_FLUSH_MS = 180;

export function useLocalTextDraft(
  committed: string,
  onFlush: (value: string) => void,
  flushMs: number = LOCAL_TEXT_FLUSH_MS,
): {
  draft: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  flushNow: (next?: string) => void;
} {
  const [draft, setDraft] = useState(committed);
  const [focused, setFocused] = useState(false);
  const draftRef = useRef(draft);
  const flushTimer = useRef<number | undefined>(undefined);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;
  draftRef.current = draft;

  useEffect(() => {
    if (!focused) {
      setDraft(committed);
    }
  }, [committed, focused]);

  useEffect(
    () => () => {
      if (flushTimer.current !== undefined) {
        window.clearTimeout(flushTimer.current);
      }
    },
    [],
  );

  const flushNow = (next: string = draftRef.current): void => {
    if (flushTimer.current !== undefined) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = undefined;
    }
    onFlushRef.current(next);
  };

  return {
    draft,
    onChange: (event) => {
      const next = event.target.value;
      setDraft(next);
      if (flushTimer.current !== undefined) {
        window.clearTimeout(flushTimer.current);
      }
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = undefined;
        onFlushRef.current(next);
      }, flushMs);
    },
    onFocus: () => {
      setFocused(true);
    },
    onBlur: () => {
      setFocused(false);
      flushNow();
    },
    flushNow,
  };
}
