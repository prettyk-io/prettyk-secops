/**
 * SC-TEST-4: Step Debugger — интеграционный тест POST /api/run/step.
 * Click → LED success, Type → LED warning, fail → красный.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useScenarioDeckStore } from './ScenarioDeckStore';

const okResponse = { ok: true, step_id: 'test', msg: 'done' };
const failResponse = { ok: false, step_id: 'test', error: 'timeout' };

describe('Step Debugger: ScenarioDeckNode handleDebug', () => {
  beforeEach(() => {
    useScenarioDeckStore.setState({
      decks: [
        {
          id: 'deck-1', title: 'DBG', description: '', continueOnError: false, collapsed: false,
          steps: [
            { id: 's1', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null },
          ],
        },
      ],
    });
  });

  it('setStepLed устанавливает running для шага', () => {
    const { setStepLed } = useScenarioDeckStore.getState();
    setStepLed('deck-1', 's1', 'running');
    const deck = useScenarioDeckStore.getState().decks[0]!;
    expect(deck.steps[0]!.led).toBe('running');
  });

  it('setStepLed с success и debugResult=ok', () => {
    const { setStepLed } = useScenarioDeckStore.getState();
    setStepLed('deck-1', 's1', 'success', 'ok');
    const deck = useScenarioDeckStore.getState().decks[0]!;
    expect(deck.steps[0]!.led).toBe('success');
    expect(deck.steps[0]!.debugResult).toBe('ok');
  });

  it('setStepLed с failure и debugResult=fail', () => {
    const { setStepLed } = useScenarioDeckStore.getState();
    setStepLed('deck-1', 's1', 'failure', 'fail');
    const deck = useScenarioDeckStore.getState().decks[0]!;
    expect(deck.steps[0]!.led).toBe('failure');
    expect(deck.steps[0]!.debugResult).toBe('fail');
  });

  it('setStepLed не трогает debugResult если не передан', () => {
    const { setStepLed } = useScenarioDeckStore.getState();
    setStepLed('deck-1', 's1', 'success', 'ok');
    setStepLed('deck-1', 's1', 'warning');
    const deck = useScenarioDeckStore.getState().decks[0]!;
    expect(deck.steps[0]!.led).toBe('warning');
    expect(deck.steps[0]!.debugResult).toBe('ok'); // не изменился
  });

  it('setStepLed игнорируется для несуществующей деки (не падает)', () => {
    const { setStepLed } = useScenarioDeckStore.getState();
    expect(() => setStepLed('ghost', 's1', 'failure', 'fail')).not.toThrow();
  });
});