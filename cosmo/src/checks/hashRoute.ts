/**
 * Hash-router SPA без react-router (NAV).
 */

import type { CheckView } from './types';

export type HashRoute =
  | { kind: 'login' }
  | { kind: 'home' }
  | { kind: 'setup' }
  | { kind: 'history' }
  | { kind: 'admin' }
  | { kind: 'lab' }
  | { kind: 'check'; checkId: string; view: CheckView };

function isCheckView(value: string): value is CheckView {
  return value === 'form' || value === 'studio' || value === 'results';
}

/** Разбор `location.hash` (`#/home`, `#/checks/uuid/form`). */
export function parseHash(hash: string): HashRoute {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { kind: 'home' };
  }

  const head = parts[0];
  if (head === 'login') {
    return { kind: 'login' };
  }
  if (head === 'home') {
    return { kind: 'home' };
  }
  if (head === 'setup') {
    return { kind: 'setup' };
  }
  if (head === 'history') {
    return { kind: 'history' };
  }
  if (head === 'admin') {
    return { kind: 'admin' };
  }
  if (head === 'lab') {
    return { kind: 'lab' };
  }
  if (head === 'policies') {
    // legacy hash → тот же экран, что admin
    return { kind: 'admin' };
  }
  if (head === 'checks' && parts[1]) {
    const viewPart = parts[2] ?? 'studio';
    const view = isCheckView(viewPart) ? viewPart : 'studio';
    return { kind: 'check', checkId: parts[1], view };
  }

  return { kind: 'home' };
}

export function formatHash(route: HashRoute): string {
  switch (route.kind) {
    case 'login':
      return '#/login';
    case 'home':
      return '#/home';
    case 'setup':
      return '#/setup';
    case 'history':
      return '#/history';
    case 'admin':
      return '#/admin';
    case 'lab':
      return '#/lab';
    case 'check':
      return `#/checks/${route.checkId}/${route.view}`;
    default:
      return '#/home';
  }
}

export function readHashRoute(): HashRoute {
  if (typeof window === 'undefined') {
    return { kind: 'home' };
  }
  return parseHash(window.location.hash || '#/home');
}

export function navigateHash(route: HashRoute): void {
  const next = formatHash(route);
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}
