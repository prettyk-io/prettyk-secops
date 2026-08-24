/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_HOME_HASH,
  handleBrandHomeAnchorClick,
  handleBrandHomeAuxClick,
  openBrandHomeInNewTab,
} from './brandHomeNav';
import { AUTH_STORAGE_KEY } from './auth';

describe('brandHomeNav', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('plain LMB → preventDefault + onNavigate', () => {
    const onNavigate = vi.fn();
    const preventDefault = vi.fn();
    handleBrandHomeAnchorClick(
      { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault },
      onNavigate,
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+LMB → new tab, not onNavigate', () => {
    const onNavigate = vi.fn();
    const preventDefault = vi.fn();
    const blank = { sessionStorage: { setItem: vi.fn() }, location: { href: '' } };
    vi.spyOn(window, 'open').mockReturnValue(blank as unknown as Window);
    handleBrandHomeAnchorClick(
      { button: 0, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false, preventDefault },
      onNavigate,
    );
    expect(onNavigate).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
  });

  it('middle auxclick → new tab with auth seed', () => {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, 'admin');
    const setItem = vi.fn();
    const blank = { sessionStorage: { setItem }, location: { href: '' as string } };
    vi.spyOn(window, 'open').mockReturnValue(blank as unknown as Window);
    const preventDefault = vi.fn();
    handleBrandHomeAuxClick({ button: 1, preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalledWith(AUTH_STORAGE_KEY, 'admin');
    expect(blank.location.href).toContain(BRAND_HOME_HASH);
  });

  it('openBrandHomeInNewTab falls back if window.open blocked', () => {
    vi.spyOn(window, 'open')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    openBrandHomeInNewTab();
    expect(window.open).toHaveBeenCalledTimes(2);
  });
});
