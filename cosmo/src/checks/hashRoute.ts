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
  | { kind: 'control' }
  | { kind: 'dashboard' }
  | { kind: 'lab' }
  | { kind: 'studio-v2' }
  | { kind: 'design-playground' }
  | { kind: 'design-admin' }
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
  if (head === 'studio-v2') {
    return { kind: 'studio-v2' };
  }
  if (head === 'design-playground') {
    return { kind: 'design-playground' };
  }
  if (head === 'design-admin') {
    return { kind: 'design-admin' };
  }
  if (head === 'control') {
    return { kind: 'control' };
  }
  if (head === 'dashboard') {
    return { kind: 'dashboard' };
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
    case 'studio-v2':
      return '#/studio-v2';
    case 'design-playground':
      return '#/design-playground';
    case 'design-admin':
      return '#/design-admin';
    case 'control':
      return '#/control';
    case 'dashboard':
      return '#/dashboard';
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

export function getRouteTitle(route: HashRoute): string {
  switch (route.kind) {
    case 'login':
      return 'prettyK Login';
    case 'home':
      return 'prettyK Home';
    case 'setup':
      return 'prettyK Setup';
    case 'history':
      return 'prettyK History';
    case 'admin':
      return 'prettyK SecOps Admin';
    case 'control':
      return 'prettyK Control';
    case 'dashboard':
      return 'prettyK Dashboard';
    case 'lab':
      return 'prettyK Lab';
    case 'studio-v2':
      return 'prettyK Studio';
    case 'design-playground':
      return 'prettyK Lab Design Playground';
    case 'design-admin':
      return 'prettyK Admin Design Playground';
    case 'check':
      if (route.view === 'form') return 'prettyK Editor';
      if (route.view === 'results') return 'prettyK Results';
      return 'prettyK Studio';
    default:
      return 'prettyK';
  }
}

export function syncDocumentTitle(route: HashRoute): void {
  if (typeof document !== 'undefined') {
    document.title = getRouteTitle(route);
  }
}

export function navigateHash(route: HashRoute): void {
  const next = formatHash(route);
  syncDocumentTitle(route);
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}
