/**
 * RP-VIZ: маппинг шага replay → кандидат из snapshot (pure).
 */
import { describe, it, expect } from 'vitest';
import { matchStepToCandidate, replayHighlightLabel, NO_TARGET_ACTIONS } from './replayHighlight';
import type { ScenarioStepModel } from '../studio/scenarioStepModel';
import type { CandidateElement } from './candidateInspect';

function step(overrides: Partial<ScenarioStepModel> = {}): ScenarioStepModel {
  return {
    id: 's1',
    action: 'Click',
    strategy: 'css',
    strategyValue: '',
    payload: '',
    continueOnError: false,
    led: 'queued',
    ...overrides,
  };
}

function candidate(cssSelector: string, overrides: Partial<CandidateElement> = {}): CandidateElement {
  return { id: cssSelector, tag: 'button', role: 'button', text: '', cssSelector, rect: { x: 10, y: 10, w: 100, h: 30 }, ...overrides };
}

const CANDIDATES: CandidateElement[] = [
  candidate('#login', { role: 'button', text: 'Войти' }),
  candidate('#name', { tag: 'input', role: 'textbox', text: 'Логин' }),
];

describe('RP-VIZ: matchStepToCandidate', () => {
  it('css-селектор → точное совпадение', () => {
    expect(matchStepToCandidate(step({ strategy: 'css', strategyValue: '#login' }), CANDIDATES)?.cssSelector).toBe('#login');
  });

  it('role-стратегия → совпадение по имени (text)', () => {
    expect(matchStepToCandidate(step({ action: 'Click', strategy: 'role', strategyValue: 'Войти' }), CANDIDATES)?.cssSelector).toBe('#login');
  });

  it('role-стратегия → совпадение по role (когда text пуст)', () => {
    const cs = [candidate('#txt', { tag: 'input', role: 'textbox', text: '' })];
    expect(matchStepToCandidate(step({ action: 'Type', strategy: 'role', strategyValue: 'textbox' }), cs)?.cssSelector).toBe('#txt');
  });

  it('нахождение по суффиксу селектора', () => {
    const cs = [candidate('form #login')];
    expect(matchStepToCandidate(step({ strategy: 'css', strategyValue: '#login' }), cs)?.cssSelector).toBe('form #login');
  });

  it('действие без таргета → null (Open/Wait/Wheel/Scroll/Drag)', () => {
    for (const action of ['Open', 'Wait', 'Wheel', 'Scroll', 'Drag']) {
      expect(matchStepToCandidate(step({ action: action as ScenarioStepModel['action'], strategyValue: '#login' }), CANDIDATES)).toBeNull();
    }
  });

  it('пустая strategyValue → null', () => {
    expect(matchStepToCandidate(step({ strategy: 'css', strategyValue: '' }), CANDIDATES)).toBeNull();
  });

  it('нет совпадения → null', () => {
    expect(matchStepToCandidate(step({ strategy: 'css', strategyValue: '#absent' }), CANDIDATES)).toBeNull();
  });
});

describe('RP-VIZ: replayHighlightLabel', () => {
  it('с таргетом → `Action name`', () => {
    const s = step({ action: 'Click', strategy: 'role', strategyValue: 'Войти' });
    expect(replayHighlightLabel(s, CANDIDATES[0]!)).toBe('Click Войти');
  });

  it('без таргета → действие', () => {
    expect(replayHighlightLabel(step({ action: 'Wait', payload: '1000' }), null)).toBe('Wait');
  });
});

describe('RP-VIZ: NO_TARGET_ACTIONS', () => {
  it('координатные/DSL-only действия исключены', () => {
    expect(NO_TARGET_ACTIONS.has('Wheel')).toBe(true);
    expect(NO_TARGET_ACTIONS.has('Drag')).toBe(true);
    expect(NO_TARGET_ACTIONS.has('Click')).toBe(false);
    expect(NO_TARGET_ACTIONS.has('Type')).toBe(false);
  });
});