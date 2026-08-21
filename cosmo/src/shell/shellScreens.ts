/**
 * Экраны оболочки без react-router.
 */

export const SHELL_SCREEN_KEY = 'pk.shell.screen';

export type ShellScreen = 'home' | 'history' | 'workspace';

export function isShellScreen(value: string): value is ShellScreen {
  return value === 'home' || value === 'history' || value === 'workspace';
}

export function readShellScreen(): ShellScreen {
  try {
    const raw = window.sessionStorage.getItem(SHELL_SCREEN_KEY);
    if (raw && isShellScreen(raw)) {
      return raw;
    }
    return 'home';
  } catch {
    return 'home';
  }
}

export function writeShellScreen(screen: ShellScreen): void {
  try {
    window.sessionStorage.setItem(SHELL_SCREEN_KEY, screen);
  } catch {
    /* ignore */
  }
}
