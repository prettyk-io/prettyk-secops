/**
 * @vitest-environment jsdom
 * WIRE-SYNC-F1: ScenarioDeckNode + бейджи DSL-блоков.
 *
 * Тесты: SCENARIO FAILSAFE в шапке, SOFT-бейдж, RECOVER-аккордеон,
 * TRY-BLOCK рамка, deep-link кнопка, отсутствие мусора на чистой карточке.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ScenarioDeckNode } from './ScenarioDeckNode';
import { useScenarioDeckStore } from './ScenarioDeckStore';

afterEach(() => cleanup());

function renderNode(deckId: string) {
  return render(
    <ReactFlowProvider>
      <ScenarioDeckNode
        id="node-1" type="scenarioDeck" position={{ x: 0, y: 0 }}
        data={{ deckId, title: 'Test Deck', description: '', stepCount: 0 }}
        selected={false} zIndex={0} isConnectable={true}
        positionAbsoluteX={0} positionAbsoluteY={0}
        dragging={false} deletable={true} selectable={true} draggable={true}
      />
    </ReactFlowProvider>
  );
}

function makeDeck(overrides: Partial<ReturnType<typeof useScenarioDeckStore.getState>['decks'][0]> = {}) {
  return {
    id: 'deck-1', title: 'Auth Flow', description: '',
    continueOnError: false, collapsed: false,
    steps: [
      { id: 's1', action: 'Open' as const, strategy: 'css' as const, strategyValue: '', payload: 'https://example.com', continueOnError: false, led: 'queued' as const, debugResult: null, dslLine: 2 },
      { id: 's2', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null, dslLine: 3 },
      { id: 's3', action: 'Type' as const, strategy: 'css' as const, strategyValue: '#input', payload: '$val', continueOnError: false, led: 'queued' as const, debugResult: null, dslLine: 4 },
    ],
    ...overrides,
  };
}

// Не упрощать: проверяем каждый тип бейджа отдельно

describe('WIRE-SYNC-F1: ScenarioDeckNode бейджи и оверлеи', () => {
  beforeEach(() => {
    useScenarioDeckStore.setState({ decks: [makeDeck()] });
  });

  // ── SOFT ──
  it('SOFT бейдж рендерится на шаге с blockMeta[kind=soft]', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        steps: [
          { id: 's1', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null,
            dslLine: 2, blockMeta: [{ kind: 'soft', title: 'SOFT' }] },
        ],
      })],
    });
    renderNode('deck-1');
    expect(screen.getByText('SOFT')).toBeTruthy();
  });

  // ── RECOVER ──
  it('RECOVER бейдж рендерится, по клику раскрывает шаги восстановления', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        steps: [
          { id: 's-primary', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null,
            dslLine: 2, blockMeta: [{ kind: 'recover', title: 'RECOVER' }],
            recoverSteps: [
              { id: 's-r1', action: 'Open' as const, strategy: 'css' as const, strategyValue: '', payload: '/recover', continueOnError: false, led: 'queued' as const, debugResult: null },
            ],
          },
        ],
      })],
    });
    renderNode('deck-1');

    // RECOVER бейдж виден (кнопка с текстом)
    const recoverLabel = screen.getByText('RECOVER');
    expect(recoverLabel).toBeTruthy();

    // По клику раскрывается аккордеон
    fireEvent.click(recoverLabel.closest('button')!);
    expect(screen.getByText('retry primary ×1')).toBeTruthy();

    // Read-only шаги восстановления: payload в input, проверяем через displayValue
    const recoverInput = screen.getByDisplayValue('/recover');
    expect(recoverInput).toBeTruthy();
    expect((recoverInput as HTMLInputElement).readOnly).toBe(false); // StepPillRow не ставит readonly — но onChange no-op
  });

  // ── SCENARIO FAILSAFE ──
  it('SCENARIO FAILSAFE в шапке деки при dslMeta.scenarioFailsafe', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        dslMeta: { scenarioFailsafe: true, tryBlockRanges: [], recoverBlocks: [] },
      })],
    });
    renderNode('deck-1');
    expect(screen.getByText('FAILSAFE')).toBeTruthy();
  });

  // ── TRY-BLOCK ──
  it('TRY-BLOCK рамка рендерится вокруг шагов в tryBlockRanges', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        dslMeta: {
          scenarioFailsafe: false,
          tryBlockRanges: [{ start: 0, end: 2 }],
          recoverBlocks: [],
        },
      })],
    });
    renderNode('deck-1');
    expect(screen.getByText('TRY-BLOCK')).toBeTruthy();
  });

  // ── Deep-link ──
  it('deep-link кнопка "↗ L14" на шаге с dslLine', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        steps: [
          { id: 's1', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null,
            dslLine: 14, blockMeta: [{ kind: 'soft', title: 'SOFT' }] },
        ],
      })],
    });
    const { container } = renderNode('deck-1');
    // Deep-link кнопка скрыта opacity:0, ищем через querySelector
    const deepLink = container.querySelector('.pk-step-deeplink');
    expect(deepLink).toBeTruthy();
    expect(deepLink!.textContent).toContain('L14');
    expect(deepLink!.getAttribute('title')).toContain('14');
  });

  // ── Нулевой шум ──
  it('чистая карточка без оверлеев — нет лишних бейджей', () => {
    useScenarioDeckStore.setState({
      decks: [makeDeck({
        steps: [
          { id: 's1', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null },
        ],
      })],
    });
    renderNode('deck-1');
    // Нет бейджей
    expect(screen.queryByText('SOFT')).toBeNull();
    expect(screen.queryByText('RECOVER')).toBeNull();
    expect(screen.queryByText('FAILSAFE')).toBeNull();
    expect(screen.queryByText('TRY-BLOCK')).toBeNull();
  });
});