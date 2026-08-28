/**
 * CRAWL-9: Multi-persona crawl.
 *
 * Обход одного SPA под разными ролями (anonymous, authenticated-user, admin)
 * с изолированными контекстами и раздельными графами состояний.
 *
 * CrawlerConfig.personas содержит цепочки auth_chain для каждой персоны.
 * Для каждой персоны создаётся изолированный BrowserContext.
 * В артефакте: persona_hash в каждом состоянии, матрица доступности.
 */

// ── Структуры конфига ──

/** Одно действие в auth_chain. */
export interface AuthStep {
  action: 'fill' | 'click' | 'navigate';
  /** Селектор (для fill/click). */
  selector?: string;
  /** Значение для fill. */
  value?: string;
  /** URL для navigate. */
  url?: string;
}

/** Конфиг одной персоны. */
export interface PersonaConfig {
  /** Уникальное имя персоны. */
  name: string;
  /** Роль: anonymous, authenticated-user, admin… */
  role: string;
  /** Цепочка действий для аутентификации (пустой массив = аноним). */
  authChain: AuthStep[];
  /** Дополнительный контекст (родительская персона, если наследует). */
  parentPersona?: string;
  /** Ярлык персоны для UI (Anonymous, User, Admin). */
  label?: string;
}

/** Конфиг multi-persona. */
export interface MultiPersonaConfig {
  personas: PersonaConfig[];
  /** Общие настройки краулера. */
  maxStatesPerPersona: number;
  /** Бюджет действий на персону. */
  maxActionsPerPersona: number;
}

// ── Состояние в артефакте ──

export type PersonaStateStatus = 'accessible' | 'blocked' | 'redirected';

export interface PersonaState {
  /** Уникальный state_id. */
  stateId: string;
  /** К какой персоне относится. */
  personaName: string;
  /** persona_hash = hash(name + role). */
  personaHash: string;
  /** Статус доступа к этому состоянию для данной персоны. */
  status: PersonaStateStatus;
  /** Причина блокировки (401, redirect, forbidden). */
  blockReason?: string;
}

// ── Матрица доступности ──

export interface AccessibilityMatrix {
  /** persona → state → status. */
  cells: Record<string, Record<string, PersonaStateStatus>>;
  /** Все имена персон. */
  personas: string[];
  /** Все state_id. */
  stateIds: string[];
}

/** Построить пустую матрицу. */
export function buildAccessibilityMatrix(
  personas: string[],
  stateIds: string[],
): AccessibilityMatrix {
  const cells: AccessibilityMatrix['cells'] = {};
  for (const p of personas) {
    cells[p] = {};
    for (const s of stateIds) {
      cells[p]![s] = 'accessible';
    }
  }
  return { cells, personas, stateIds };
}

/** Обновить ячейку матрицы. */
export function updateMatrixCell(
  matrix: AccessibilityMatrix,
  persona: string,
  stateId: string,
  status: PersonaStateStatus,
): AccessibilityMatrix {
  if (!matrix.cells[persona]) matrix.cells[persona] = {};
  matrix.cells[persona]![stateId] = status;
  return matrix;
}

/** Подсчитать статистику матрицы. */
export function matrixStats(matrix: AccessibilityMatrix): {
  total: number;
  accessible: number;
  blocked: number;
  redirected: number;
} {
  let total = 0, accessible = 0, blocked = 0, redirected = 0;
  for (const p of matrix.personas) {
    for (const s of matrix.stateIds) {
      const status = matrix.cells[p]?.[s] ?? 'accessible';
      total++;
      if (status === 'accessible') accessible++;
      else if (status === 'blocked') blocked++;
      else redirected++;
    }
  }
  return { total, accessible, blocked, redirected };
}

// ── Persona hash ──

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function personaHash(name: string, role: string): string {
  return simpleHash(`${name}:${role}`);
}

// ── Auth chain description ──

export function describeAuthChain(chain: AuthStep[]): string {
  if (chain.length === 0) return 'anonymous';
  return chain
    .map((s) => {
      if (s.action === 'navigate') return `→ ${s.url}`;
      if (s.action === 'fill') return `✎ ${s.selector}=${s.value}`;
      return `◎ ${s.selector}`;
    })
    .join(' → ');
}

// ── Multi-persona result ──

export interface MultiPersonaCrawlResult {
  /** Все состояния всех персон. */
  states: PersonaState[];
  /** Матрица доступности. */
  matrix: AccessibilityMatrix;
  /** Конфиг. */
  config: MultiPersonaConfig;
  /** Время начала/окончания. */
  startedAt: number;
  finishedAt?: number;
}

/** Создать пустой результат. */
export function createMultiPersonaResult(config: MultiPersonaConfig): MultiPersonaCrawlResult {
  return {
    states: [],
    matrix: buildAccessibilityMatrix(config.personas.map((p) => p.name), []),
    config,
    startedAt: Date.now(),
  };
}

/** Зарегистрировать состояние в результате. */
export function registerPersonaState(
  result: MultiPersonaCrawlResult,
  state: PersonaState,
): MultiPersonaCrawlResult {
  const states = [...result.states, state];
  const stateIds = [...new Set([...result.matrix.stateIds, state.stateId])];
  return {
    ...result,
    states,
    matrix: updateMatrixCell(
      { ...result.matrix, stateIds },
      state.personaName,
      state.stateId,
      state.status,
    ),
  };
}