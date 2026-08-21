import { describe, expect, it, vi } from 'vitest';
import { scrollFormToPageId } from './appGotoPage';

describe('scrollFormToPageId', () => {
  it('scrolls matching page wrap into view', () => {
    const scrollIntoView = vi.fn();
    const input = { value: 'login' } as HTMLInputElement;
    const host = {
      querySelector: vi.fn(() => input),
      scrollIntoView,
    } as unknown as HTMLElement;
    const root = {
      querySelectorAll: vi.fn(() => [host]),
      querySelector: vi.fn(),
    } as unknown as HTMLElement;

    scrollFormToPageId(root, 'login');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('falls back to test_suites section', () => {
    const scrollIntoView = vi.fn();
    const section = { scrollIntoView } as unknown as HTMLElement;
    const root = {
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn((sel: string) => (sel === '#section-test_suites' ? section : null)),
    } as unknown as HTMLElement;

    scrollFormToPageId(root, 'missing');
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
