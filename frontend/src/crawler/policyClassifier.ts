/**
 * CRAWL-3: Policy gate classifier — классификация элементов краулера.
 *
 * Получает массив правил (не хардкод-список) и массив interactive elements,
 * возвращает решение safe/dangerous/out-of-scope с причиной.
 *
 * DANGEROUS — не выполнять, записать как blocked.
 * OUT-OF-SCOPE — записать без выполнения (другой origin, mailto:, tel:, javascript:).
 * SAFE — выполнять.
 */

export type ClassificationVerdict = 'safe' | 'dangerous' | 'out_of_scope';

export interface ClassificationResult {
  verdict: ClassificationVerdict;
  /** Причина блокировки/out-of-scope (null для safe). */
  reason: string | null;
}

/** Элемент страницы, извлечённый краулером (CRAWL-1). */
export interface CrawlableElement {
  /** Playwright role или tag. */
  tag: string;
  /** Роль (button, link, textbox, tab, menuitem…). */
  role: string;
  /** Accessible name. */
  accessibleName: string;
  /** Текстовое содержимое. */
  text: string;
  /** href для <a> элементов. */
  href?: string;
  /** Атрибут type для input/button. */
  type?: string;
}

/** Правило политики (одна строка). */
export interface PolicyRule {
  /** 'dangerous' | 'out_of_scope' */
  verdict: Exclude<ClassificationVerdict, 'safe'>;
  /** Матчинг по полю элемента: accessibleName, text, role, tag, href, type. */
  field: 'accessibleName' | 'text' | 'role' | 'tag' | 'href' | 'type';
  /** Список значений для матчинга (case-insensitive). */
  values: string[];
  /** Причина для артефакта. */
  reason: string;
}

/** Дополнительные правила из конфига. */
export interface PolicyGateConfig {
  /** allowed_origins: только эти origin считаются in-scope. Пустой массив = всё in-scope. */
  allowedOrigins: string[];
  /** Кастомные правила политики поверх дефолтных. */
  extraRules?: PolicyRule[];
}

// ── Дефолтные правила (canon) ──

const DANGEROUS_RULES: PolicyRule[] = [
  { verdict: 'dangerous', field: 'accessibleName', values: ['logout', 'sign out', 'выйти', 'log out'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'text', values: ['выйти', 'sign out', 'logout', 'log out'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'accessibleName', values: ['delete', 'remove', 'удалить'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'text', values: ['удалить', 'delete', 'remove'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'accessibleName', values: ['pay', 'купить', 'checkout'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'accessibleName', values: ['reset', 'сбросить'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'accessibleName', values: ['change password', 'сменить пароль'], reason: 'dangerous_action' },
  { verdict: 'dangerous', field: 'accessibleName', values: ['deactivate', 'деактивировать'], reason: 'dangerous_action' },
];

const OUT_OF_SCOPE_PATTERNS = [/^mailto:/i, /^tel:/i, /^javascript:/i, /^#$/];

// ── Классификатор ──

/** Проверить href на out-of-scope паттерны. */
function hrefIsOutOfScope(href: string, allowedOrigins: string[]): boolean {
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(href)) return true;
  }
  if (allowedOrigins.length > 0) {
    try {
      const url = new URL(href, window.location.origin);
      if (!allowedOrigins.some((o) => url.origin.toLowerCase() === o.toLowerCase())) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

/** Классифицировать один элемент по массиву правил. */
export function classifyElement(
  el: CrawlableElement,
  rules: PolicyRule[],
  allowedOrigins: string[] = [],
): ClassificationResult {
  // OUT-OF-SCOPE: cross-origin ссылки, mailto:, tel:, javascript:
  if (el.role === 'link' || el.tag === 'a') {
    const href = el.href ?? '';
    if (hrefIsOutOfScope(href, allowedOrigins)) {
      return { verdict: 'out_of_scope', reason: allowedOrigins.length > 0 ? 'cross_origin' : 'unsafe_protocol' };
    }
  }

  // DANGEROUS: матчинг по правилам
  for (const rule of rules) {
    if (rule.verdict !== 'dangerous') continue;
    const fieldValue = el[rule.field];
    if (typeof fieldValue !== 'string') continue;
    const lower = fieldValue.toLowerCase();
    for (const pattern of rule.values) {
      if (lower.includes(pattern.toLowerCase())) {
        return { verdict: 'dangerous', reason: rule.reason };
      }
    }
  }

  return { verdict: 'safe', reason: null };
}

/** Классифицировать все элементы страницы. */
export function classifyAll(
  elements: CrawlableElement[],
  config: PolicyGateConfig = { allowedOrigins: [], extraRules: [] },
): Array<{ element: CrawlableElement; result: ClassificationResult }> {
  const rules = [...DANGEROUS_RULES, ...(config.extraRules ?? [])];
  return elements.map((el) => ({
    element: el,
    result: classifyElement(el, rules, config.allowedOrigins),
  }));
}

/** Собрать имена правил из дефолтов + extra. */
export function activeRules(config: PolicyGateConfig): PolicyRule[] {
  return [...DANGEROUS_RULES, ...(config.extraRules ?? [])];
}