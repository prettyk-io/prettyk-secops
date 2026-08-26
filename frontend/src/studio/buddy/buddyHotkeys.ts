/**
 * CO-PILOT META (PoC) — Buddy хоткеи.
 *
 * Enter = Apply, Esc = Reject, 1..9 = чипсы, Space = Stop/Take Control.
 * Хук слушает глобальный keydown, guard на input/textarea/select/contentEditable.
 */
import { useEffect, useRef } from 'react';

export interface BuddyHotkeyHandlers {
  onApply?: () => void;
  onReject?: () => void;
  /** Номер чипса 1..9. */
  onChip?: (hotkey: number) => void;
  onTakeControl?: () => void;
  /** Включать ли обработку (например, только когда док развёрнут). */
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Подписать на Buddy-хоткеи. Возвращает ref-enabled через замыкание не нужно —
 * `enabled` читается из ref, чтобы не пересоздавать слушатель каждый рендер.
 */
export function useBuddyHotkeys(handlers: BuddyHotkeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const h = ref.current;
      if (!h.enabled) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        h.onApply?.();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        h.onReject?.();
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        h.onTakeControl?.();
        return;
      }
      // 1..9 чипсы (только верхний ряд, не numpad — numpad даёт event.code Digit1)
      const digit = /^[1-9]$/.test(event.key) ? Number(event.key) : null;
      if (digit !== null) {
        event.preventDefault();
        h.onChip?.(digit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
