/**
 * BBA-FE-4: общий контракт кандидатов для живого overlay инспекции.
 *
 * `CandidateElement` — единый контракт между FE (overlay) и backend
 * («кандидат-контракт», зона Boss). Единый источник селекторов — backend:
 * FE-перечисление DOM через eval ЗАПРЕЩЕНО.
 *
 * FE только ПОТРЕБЛЯЕТ список кандидатов (см. `BrowserSession.inspectCandidates`),
 * рисует кликабельные рамки и кликает элемент через POST /api/browser/step/execute.
 */

export interface CandidateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CandidateElement {
  /** Стабильный ключ для React (уникален по cssSelector + rect). */
  id: string;
  tag: string;
  role: string;
  text: string;
  /** Селектор, достаточный для живого клика по элементу (BBA-EXEC-1). */
  cssSelector: string;
  /** Bounding-box в CSS-пикселях вьюпорта браузера (viewport-relative). */
  rect: CandidateRect;
}

/**
 * Нормализовать ответ backend-эндпоинта кандидатов в `CandidateElement[]`.
 * Принимает как массив напрямую, так и обёртку `{ candidates: [...] }`.
 * Дефенсивно: пропускает мусор и элементы без селектора/rect.
 */
export function normalizeCandidates(raw: unknown): CandidateElement[] {
  const list: unknown[] = (() => {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const o = raw as { candidates?: unknown; elements?: unknown };
      if (Array.isArray(o.candidates)) return o.candidates;
      if (Array.isArray(o.elements)) return o.elements;
    }
    return [];
  })();

  const out: CandidateElement[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;

    const cssSelector = (() => {
      const v = o.cssSelector ?? o.selector ?? o.css_selector;
      return typeof v === 'string' && v.trim() ? v.trim() : '';
    })();
    if (!cssSelector) continue;

    const r = (o.rect ?? o.bbox) as Record<string, unknown> | undefined;
    const x = r?.x, y = r?.y;
    const w = r?.w ?? r?.width, h = r?.h ?? r?.height;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') continue;

    const rect: CandidateRect = { x, y, w, h };
    const tag = typeof o.tag === 'string' ? o.tag : '';
    const role = typeof o.role === 'string' ? o.role : '';
    const text = typeof o.text === 'string' ? o.text : '';

    const id = typeof o.id === 'string' && o.id
      ? o.id
      : `${cssSelector}:${rect.x}:${rect.y}`;

    out.push({ id, tag, role, text, cssSelector, rect });
  }
  return out;
}