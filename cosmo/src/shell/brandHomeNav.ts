/**
 * Навигация марки SecOps / PrettyK → home.
 * ЛКМ — через onNavigate (dirty-guard в текущей вкладке).
 * СКМ / Ctrl|Cmd+клик — новая вкладка с копией auth sessionStorage.
 */

import { AUTH_STORAGE_KEY } from './auth';
import { SHELL_SCREEN_KEY } from './shellScreens';

export const BRAND_HOME_HASH = '#/home';

export function brandHomeHref(): string {
  return `${window.location.pathname}${window.location.search}${BRAND_HOME_HASH}`;
}

export function openBrandHomeInNewTab(): void {
  const href = brandHomeHref();
  const w = window.open('about:blank', '_blank');
  if (!w) {
    window.open(href, '_blank');
    return;
  }
  try {
    const user = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (user) {
      w.sessionStorage.setItem(AUTH_STORAGE_KEY, user);
    }
    w.sessionStorage.setItem(SHELL_SCREEN_KEY, 'home');
  } catch {
    /* ignore */
  }
  w.location.href = href;
}

/** Plain primary click → intercept. Modified / non-primary → browser or new-tab helper. */
export function handleBrandHomeAnchorClick(
  e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void },
  onNavigate?: () => void,
): void {
  if (e.button !== 0) {
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    openBrandHomeInNewTab();
    return;
  }
  if (e.shiftKey || e.altKey) {
    return;
  }
  e.preventDefault();
  onNavigate?.();
}

export function handleBrandHomeAuxClick(e: {
  button: number;
  preventDefault: () => void;
}): void {
  if (e.button !== 1) {
    return;
  }
  e.preventDefault();
  openBrandHomeInNewTab();
}
