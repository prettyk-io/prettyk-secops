/**
 * @vitest-environment node
 * BBA-FE-4: контракт CandidateElement + normalizeCandidates (backend-ответ → FE).
 */
import { describe, it, expect } from 'vitest';
import { normalizeCandidates } from './candidateInspect';
import type { CandidateElement } from './candidateInspect';

function ok(): CandidateElement {
  return {
    id: 'c1',
    tag: 'button',
    role: 'button',
    text: 'Войти',
    cssSelector: '#login',
    rect: { x: 10, y: 20, w: 100, h: 30 },
  };
}

describe('candidateInspect — normalizeCandidates', () => {
  it('принимает массив кандидатов напрямую', () => {
    const out = normalizeCandidates([ok()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(ok());
  });

  it('принимает обёртку { candidates: [...] }', () => {
    const out = normalizeCandidates({ ok: true, candidates: [ok()] });
    expect(out).toHaveLength(1);
    expect(out[0]!.cssSelector).toBe('#login');
  });

  it('принимает обёртку { elements: [...] } (backend BBA-7)', () => {
    const out = normalizeCandidates({ ok: true, elements: [ok()], count: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.cssSelector).toBe('#login');
  });

  it('терпит snake_case aliases (css_selector, width/height)', () => {
    const out = normalizeCandidates([{
      tag: 'input',
      role: 'textbox',
      text: 'email',
      css_selector: 'input[name=email]',
      rect: { x: 0, y: 0, width: 200, height: 32 },
    }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.cssSelector).toBe('input[name=email]');
    expect(out[0]!.rect).toEqual({ x: 0, y: 0, w: 200, h: 32 });
  });

  it('принимает реальный backend-контракт { selector, bbox } (BBA-7)', () => {
    const out = normalizeCandidates([{
      tag: 'button',
      role: 'button',
      text: 'Войти',
      selector: '#login',
      bbox: { x: 10, y: 20, width: 100, height: 30 },
    }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.cssSelector).toBe('#login');
    expect(out[0]!.rect).toEqual({ x: 10, y: 20, w: 100, h: 30 });
  });

  it('генерирует id из cssSelector+rect', () => {
    const out = normalizeCandidates([{ tag: 'a', role: 'link', text: '', cssSelector: '#x', rect: { x: 1, y: 2, w: 3, h: 4 } }]);
    expect(out[0]!.id).toBe('#x:1:2');
  });

  it('отбрасывает мусор и элементы без селектора/rect', () => {
    const raw = [
      { tag: 'a', rect: { x: 0, y: 0, w: 10, h: 10 } },            // нет cssSelector
      { tag: 'a', cssSelector: '#x' },                              // нет rect
      { tag: 'a', cssSelector: '#y', rect: { x: 0, y: 0, w: 10, h: 10 } },
      'garbage',
      null,
    ];
    const out = normalizeCandidates(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.cssSelector).toBe('#y');
  });

  it('не-массив / не-обёртка → []', () => {
    expect(normalizeCandidates(null)).toEqual([]);
    expect(normalizeCandidates({ foo: 1 })).toEqual([]);
    expect(normalizeCandidates('x')).toEqual([]);
  });
});