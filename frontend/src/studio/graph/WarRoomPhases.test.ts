/**
 * WR-TEST-5: War Room 5 фаз — интеграционный тест store-состояний
 * Ignition → Action Conveyor → Heavy Strike → Impact Bloom → Aftermath
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useScenarioDeckStore } from '../ScenarioDeckStore';

describe('War Room 5 фаз — store integration', () => {
  beforeEach(() => {
    useScenarioDeckStore.setState({
      decks: [
        {
          id: 'wr-1', title: 'Login Attack', description: '', continueOnError: false, collapsed: false,
          steps: [
            { id: 's1', action: 'Open' as const, strategy: 'css' as const, strategyValue: '', payload: 'https://target.com', continueOnError: false, led: 'queued' as const, debugResult: null },
            { id: 's2', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#login', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null },
            { id: 's3', action: 'FuzzWave' as const, strategy: 'css' as const, strategyValue: '', payload: 'xss', continueOnError: false, led: 'queued' as const, debugResult: null },
          ],
        },
      ],
      warRoom: false,
      runPhase: 'idle',
      cameraFocus: null,
    });
  });

  it('Фаза 1: Ignition — warRoom=false, runPhase=idle', () => {
    const state = useScenarioDeckStore.getState();
    expect(state.warRoom).toBe(false);
    expect(state.runPhase).toBe('idle');
  });

  it('Фаза 2: Action Conveyor — setWarRoom(true), шаги queued', () => {
    const { setWarRoom } = useScenarioDeckStore.getState();
    setWarRoom(true);
    const state = useScenarioDeckStore.getState();
    expect(state.warRoom).toBe(true);
    expect(state.decks[0]!.steps[0]!.led).toBe('queued');
  });

  it('Фаза 3: Heavy Strike — шаги LED меняются на running→success/failure', () => {
    const { setWarRoom, setStepLed } = useScenarioDeckStore.getState();
    setWarRoom(true);
    setStepLed('wr-1', 's1', 'running');
    expect(useScenarioDeckStore.getState().decks[0]!.steps[0]!.led).toBe('running');
    setStepLed('wr-1', 's1', 'success', 'ok');
    setStepLed('wr-1', 's2', 'running');
    setStepLed('wr-1', 's2', 'success', 'ok');
    setStepLed('wr-1', 's3', 'running');
    setStepLed('wr-1', 's3', 'failure', 'fail');
    const state = useScenarioDeckStore.getState();
    expect(state.decks[0]!.steps[0]!.debugResult).toBe('ok');
    expect(state.decks[0]!.steps[1]!.debugResult).toBe('ok');
    expect(state.decks[0]!.steps[2]!.debugResult).toBe('fail');
  });

  it('Фаза 4: Impact Bloom — requestCameraFocus / consumeCameraFocus', () => {
    const { requestCameraFocus, consumeCameraFocus } = useScenarioDeckStore.getState();
    requestCameraFocus('node-login');
    expect(useScenarioDeckStore.getState().cameraFocus).toBe('node-login');
    const focus = consumeCameraFocus();
    expect(focus).toBe('node-login');
    expect(useScenarioDeckStore.getState().cameraFocus).toBeNull();
  });

  it('Фаза 5: Aftermath — setWarRoom(false), runPhase завершён', () => {
    const { setWarRoom } = useScenarioDeckStore.getState();
    setWarRoom(false);
    expect(useScenarioDeckStore.getState().warRoom).toBe(false);
    // runPhase defaults to idle
    expect(useScenarioDeckStore.getState().runPhase).toBe('idle');
  });

  it('deckDSL возвращает DSL для War Room деки', () => {
    const dsl = useScenarioDeckStore.getState().deckDSL('wr-1');
    expect(dsl).toHaveLength(3);
    expect(dsl[0]).toBe('Open https://target.com');
    expect(dsl[1]).toBe('Click css "#login"');
    expect(dsl[2]).toBe('FuzzWave xss');
  });

  it('все 5 фаз воспроизводятся последовательно без рассинхрона', () => {
    const store = useScenarioDeckStore.getState();

    // 1. Ignition
    store.setWarRoom(false);
    // 2. Action Conveyor
    store.setWarRoom(true);
    expect(useScenarioDeckStore.getState().warRoom).toBe(true);
    // 3. Heavy Strike
    store.setStepLed('wr-1', 's1', 'running');
    store.setStepLed('wr-1', 's1', 'success', 'ok');
    store.setStepLed('wr-1', 's2', 'success', 'ok');
    store.setStepLed('wr-1', 's3', 'failure', 'fail');
    // 4. Impact Bloom
    store.requestCameraFocus('node-s1');
    const cam = store.consumeCameraFocus();
    expect(cam).toBe('node-s1');
    // 5. Aftermath
    store.setWarRoom(false);
    expect(useScenarioDeckStore.getState().warRoom).toBe(false);

    // Проверка: все шаги сохранили свои LED
    const final = useScenarioDeckStore.getState().decks[0]!;
    expect(final.steps[0]!.led).toBe('success');
    expect(final.steps[1]!.led).toBe('success');
    expect(final.steps[2]!.led).toBe('failure');
  });
});