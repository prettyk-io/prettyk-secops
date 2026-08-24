/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { attachFormNestedWheelBridge } from './appFormWheel';

describe('attachFormNestedWheelBridge', () => {
  it('forwards wheel from non-overflowing textarea scrollport to root', () => {
    const root = document.createElement('div');
    Object.defineProperty(root, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(root, 'scrollHeight', { value: 800, configurable: true });
    Object.defineProperty(root, 'clientHeight', { value: 400, configurable: true });

    const ta = document.createElement('textarea');
    root.appendChild(ta);
    document.body.appendChild(root);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === ta) {
        return { overflowY: 'auto' } as CSSStyleDeclaration;
      }
      return { overflowY: 'visible' } as CSSStyleDeclaration;
    });
    Object.defineProperty(ta, 'scrollHeight', { value: 80, configurable: true });
    Object.defineProperty(ta, 'clientHeight', { value: 80, configurable: true });
    Object.defineProperty(ta, 'scrollTop', { value: 0, writable: true, configurable: true });

    const detach = attachFormNestedWheelBridge(root);
    const ev = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    const prevented = !ta.dispatchEvent(ev);
    expect(prevented || ev.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(40);
    detach();
    document.body.removeChild(root);
    vi.restoreAllMocks();
  });
});
