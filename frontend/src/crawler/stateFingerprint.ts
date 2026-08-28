/**
 * CRAWL-2: State fingerprinting + дедупликация + бюджет состояний.
 *
 * Вычисляет state_key из стабильных атрибутов страницы,
 * детектит повторы ДО выполнения действия, ведёт visited-реестр,
 * останавливает обход при превышении max_states.
 */

export interface StateFingerprint {
  /** Нормализованный URL (без query string, без trailing slash). */
  normalizedUrl: string;
  /** Путь без хоста (route). */
  route: string;
  /** Имена заголовков h1-h3, отсортированные. */
  headings: string[];
  /** Accessible names интерактивных элементов, отсортированные без дублей. */
  interactiveNames: string[];
  /** Признак наличия модального окна или диалога. */
  hasDialog: boolean;
  /** Усечённый AX-дайджест (первые 3 уровня). */
  axDigest: string;
}

export interface VisitedEntry {
  stateKey: string;
  /** Сколько раз посещено. */
  visitCount: number;
  /** Время первого посещения. */
  firstSeenAt: number;
}

export interface CrawlerBudget {
  /** Максимум уникальных состояний. */
  maxStates: number;
  /** Максимум действий суммарно. */
  maxActions: number;
  /** Истекшие состояния (stateKey). */
  visited: Map<string, VisitedEntry>;
  /** Счётчик выполненных действий. */
  actionsTaken: number;
}

export interface BudgetDecision {
  /** Можно ли продолжать обход? */
  allowed: boolean;
  /** Причина остановки (null если можно продолжать). */
  stopReason: string | null;
  /** Сколько состояний осталось необойденными (в очереди). */
  queuedCount: number;
}

// ── Нормализация URL ──

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url, 'http://localhost');
    // Убрать query string и trailing slash
    let path = u.pathname.replace(/\/$/, '') || '/';
    return `${u.origin}${path}`;
  } catch {
    return url;
  }
}

function routeFromUrl(url: string): string {
  try {
    const u = new URL(url, 'http://localhost');
    let p = u.pathname + u.hash;
    return p.replace(/\/$/, '') || '/#/';
  } catch {
    return url;
  }
}

// ── AX-дайджест ──

function axDigest(node: unknown, depth: number): string {
  if (depth > 3) return '';
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  const role = n.role ?? '';
  const name = n.name ?? '';
  const children = n.children;
  let parts = `${role}:${name}`;
  if (Array.isArray(children) && depth < 3) {
    const childDigests = children
      .map((c) => axDigest(c, depth + 1))
      .filter(Boolean)
      .sort()
      .slice(0, 10);
    if (childDigests.length > 0) parts += `[${childDigests.join(',')}]`;
  }
  return parts;
}

// ── StateKey ──

function hashFingerprint(fp: StateFingerprint): string {
  const norm = [
    fp.normalizedUrl,
    fp.route,
    fp.interactiveNames.join('|'),
    fp.headings.join('|'),
    fp.hasDialog ? 'DIALOG' : 'NO_DIALOG',
    fp.axDigest.slice(0, 200),
  ].join('\x00');
  let h = 0;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) - h) + norm.charCodeAt(i);
    h |= 0;
  }
  return `${fp.route}::${h.toString(36)}`;
}

// ── Построить fingerprint ──

export function buildFingerprint(input: {
  url: string;
  headings: string[];
  interactiveElements: Array<{ accessibleName: string; role: string }>;
  axTree: unknown;
}): StateFingerprint {
  const interactiveNames = [
    ...new Set(input.interactiveElements.map((e) => e.accessibleName).filter(Boolean).sort()),
  ];
  const sortedHeadings = [...new Set(input.headings.filter(Boolean).sort())];

  return {
    normalizedUrl: normalizeUrl(input.url),
    route: routeFromUrl(input.url),
    headings: sortedHeadings,
    interactiveNames,
    hasDialog: input.interactiveElements.some((e) => e.role === 'dialog'),
    axDigest: axDigest(input.axTree, 0),
  };
}

/** StateKey из fingerprint. */
export function stateKey(fp: StateFingerprint): string {
  return hashFingerprint(fp);
}

// ── Бюджет: посетить состояние ──

export function tryVisitState(
  budget: CrawlerBudget,
  key: string,
  /** Количество состояний в очереди. */
  queuedCount: number,
): BudgetDecision {
  const visited = budget.visited;

  if (visited.has(key)) {
    const entry = visited.get(key)!;
    entry.visitCount++;
    return { allowed: false, stopReason: 'duplicate', queuedCount };
  }

  if (visited.size >= budget.maxStates) {
    return { allowed: false, stopReason: 'budget_exhausted', queuedCount };
  }

  visited.set(key, {
    stateKey: key,
    visitCount: 1,
    firstSeenAt: Date.now(),
  });

  return { allowed: true, stopReason: null, queuedCount };
}

/** Создать бюджет. */
export function createBudget(maxStates = 50, maxActions = 500): CrawlerBudget {
  return {
    maxStates,
    maxActions,
    visited: new Map(),
    actionsTaken: 0,
  };
}

/** Учесть выполненное действие. */
export function recordAction(budget: CrawlerBudget): void {
  budget.actionsTaken++;
}

/** Статистика бюджета. */
export function budgetStats(budget: CrawlerBudget): {
  visited: number;
  actions: number;
  remaining: number;
} {
  return {
    visited: budget.visited.size,
    actions: budget.actionsTaken,
    remaining: budget.maxStates - budget.visited.size,
  };
}