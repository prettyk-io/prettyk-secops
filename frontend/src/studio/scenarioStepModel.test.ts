/**
 * SC-TEST-3: Wired Synchronizer — pill → DSL, DSL → pill roundtrip без потерь.
 * Тестирует stepToDSL() и deckDSL() из scenarioStepModel + ScenarioDeckStore.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { stepToDSL, emptyStep, type ActionKind, type StrategyKind, type ScenarioStepModel } from './scenarioStepModel';
import { useScenarioDeckStore } from './ScenarioDeckStore';

describe('stepToDSL — pill → DSL', () => {
  it('Open → "Open https://..."', () => {
    expect(stepToDSL({ id: '1', action: 'Open', strategy: 'css', strategyValue: '', payload: 'https://example.com', continueOnError: false, led: 'queued' })).toBe('Open https://example.com');
  });

  it('Open без payload → "Open about:blank"', () => {
    expect(stepToDSL({ id: '1', action: 'Open', strategy: 'css', strategyValue: '', payload: '', continueOnError: false, led: 'queued' })).toBe('Open about:blank');
  });

  it('Wait → "Wait 1000"', () => {
    expect(stepToDSL({ id: '1', action: 'Wait', strategy: 'css', strategyValue: '', payload: '1000', continueOnError: false, led: 'queued' })).toBe('Wait 1000');
  });

  it('Click → "Click css "#btn""', () => {
    expect(stepToDSL({ id: '1', action: 'Click', strategy: 'css', strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' })).toBe('Click css "#btn"');
  });

  it('Type → "Type css "#input" hello"', () => {
    expect(stepToDSL({ id: '1', action: 'Type', strategy: 'css', strategyValue: '#input', payload: 'hello', continueOnError: false, led: 'queued' })).toBe('Type css "#input" hello');
  });

  it('Spider → "SpiderScan"', () => {
    expect(stepToDSL({ id: '1', action: 'Spider', strategy: 'css', strategyValue: '', payload: '', continueOnError: false, led: 'queued' })).toBe('SpiderScan');
  });

  it('ActiveScan → "ActiveScan"', () => {
    expect(stepToDSL({ id: '1', action: 'ActiveScan', strategy: 'css', strategyValue: '', payload: '', continueOnError: false, led: 'queued' })).toBe('ActiveScan');
  });

  it('FuzzWave → "FuzzWave corpus"', () => {
    expect(stepToDSL({ id: '1', action: 'FuzzWave', strategy: 'css', strategyValue: '', payload: 'corpus', continueOnError: false, led: 'queued' })).toBe('FuzzWave corpus');
  });

  it('Let → "Let var = ""value"""', () => {
    expect(stepToDSL({ id: '1', action: 'Let', strategy: 'css', strategyValue: 'var', payload: '"value"', continueOnError: false, led: 'queued' })).toBe('Let var = "value"');
  });

  it('Secret → "Secret key ""val"""', () => {
    expect(stepToDSL({ id: '1', action: 'Secret', strategy: 'css', strategyValue: 'key', payload: '"val"', continueOnError: false, led: 'queued' })).toBe('Secret key "val"');
  });

  it('GenerateEmail → "GenerateEmail"', () => {
    expect(stepToDSL({ id: '1', action: 'GenerateEmail', strategy: 'css', strategyValue: '', payload: '', continueOnError: false, led: 'queued' })).toBe('GenerateEmail');
  });

  it('GeneratePhone → "GeneratePhone"', () => {
    expect(stepToDSL({ id: '1', action: 'GeneratePhone', strategy: 'css', strategyValue: '', payload: '', continueOnError: false, led: 'queued' })).toBe('GeneratePhone');
  });
});

describe('deckDSL — вся дека в DSL', () => {
  beforeEach(() => {
    useScenarioDeckStore.setState({
      decks: [
        {
          id: 'deck-1',
          title: 'Login Flow',
          description: '',
          continueOnError: false,
          collapsed: false,
          steps: [
            { id: '1', action: 'Open' as ActionKind, strategy: 'css' as StrategyKind, strategyValue: '', payload: 'https://login.example.com', continueOnError: false, led: 'queued' as const },
            { id: '2', action: 'Type' as ActionKind, strategy: 'css' as StrategyKind, strategyValue: '#username', payload: 'admin', continueOnError: false, led: 'queued' as const },
            { id: '3', action: 'Click' as ActionKind, strategy: 'css' as StrategyKind, strategyValue: '#submit', payload: '', continueOnError: false, led: 'queued' as const },
          ],
        },
      ],
    });
  });

  it('deckDSL возвращает DSL для каждого шага', () => {
    const dsl = useScenarioDeckStore.getState().deckDSL('deck-1');
    expect(dsl).toEqual([
      'Open https://login.example.com',
      'Type css "#username" admin',
      'Click css "#submit"',
    ]);
  });

  it('deckDSL возвращает пустой массив для несуществующей деки', () => {
    expect(useScenarioDeckStore.getState().deckDSL('nonexistent')).toEqual([]);
  });
});

describe('Roundtrip: pill → DSL → не теряем информацию', () => {
  it('Open roundtrip сохраняет URL', () => {
    const step: ScenarioStepModel = { id: '1', action: 'Open', strategy: 'css', strategyValue: '', payload: 'https://x.com', continueOnError: false, led: 'queued' };
    const dsl = stepToDSL(step);
    expect(dsl).toBe('Open https://x.com');
    // DSL содержит URL
    expect(dsl).toContain('https://x.com');
  });

  it('Click roundtrip сохраняет селектор', () => {
    const step: ScenarioStepModel = { id: '1', action: 'Click', strategy: 'css', strategyValue: '#login', payload: '', continueOnError: false, led: 'queued' };
    const dsl = stepToDSL(step);
    expect(dsl).toContain('#login');
    expect(dsl).toContain('Click');
    expect(dsl).toContain('css');
  });

  it('Type roundtrip сохраняет селектор и payload', () => {
    const step: ScenarioStepModel = { id: '1', action: 'Type', strategy: 'xpath', strategyValue: '//input', payload: 'text', continueOnError: false, led: 'queued' };
    const dsl = stepToDSL(step);
    expect(dsl).toContain('Type');
    expect(dsl).toContain('xpath');
    expect(dsl).toContain('//input');
    expect(dsl).toContain('text');
  });

  it('emptyStep генерирует валидный DSL', () => {
    const step = emptyStep('new-1');
    expect(step.action).toBe('Open');
    const dsl = stepToDSL(step);
    expect(dsl).toBe('Open about:blank');
  });
});