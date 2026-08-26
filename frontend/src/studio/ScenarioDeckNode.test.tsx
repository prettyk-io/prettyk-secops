/**
 * @vitest-environment jsdom
 * SC-TEST-1: ScenarioDeckNode — рендер 3 шагов, сворачивание, счётчик, Add Step
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ScenarioDeckNode, type ScenarioDeckNodeData } from './ScenarioDeckNode';
import { useScenarioDeckStore } from './ScenarioDeckStore';

afterEach(() => cleanup());

function Wrapper({ deckId }: { deckId: string }) {
  return (
    <ReactFlowProvider>
      <ScenarioDeckNode
        id="node-1"
        type="scenarioDeck"
        position={{ x: 0, y: 0 }}
        data={{ deckId, title: 'Test Deck', description: '', stepCount: 0 }}
        selected={false}
        zIndex={0}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        deletable={true}
        selectable={true}
        draggable={true}
      />
    </ReactFlowProvider>
  );
}

beforeEach(() => {
  useScenarioDeckStore.setState({
    decks: [
      {
        id: 'deck-1',
        title: 'Test Deck',
        description: '',
        continueOnError: false,
        collapsed: false,
        steps: [
          { id: 's1', action: 'Open' as const, strategy: 'css' as const, strategyValue: '', payload: 'https://example.com', continueOnError: false, led: 'queued' as const, debugResult: null },
          { id: 's2', action: 'Click' as const, strategy: 'css' as const, strategyValue: '#btn', payload: '', continueOnError: false, led: 'queued' as const, debugResult: null },
          { id: 's3', action: 'Type' as const, strategy: 'css' as const, strategyValue: '#input', payload: 'hello', continueOnError: false, led: 'queued' as const, debugResult: null },
        ],
      },
    ],
  });
});

describe('ScenarioDeckNode', () => {
  it('рендерит заголовок деки', () => {
    render(<Wrapper deckId="deck-1" />);
    expect(screen.getByText('Test Deck')).toBeTruthy();
  });

  it('показывает счётчик шагов', () => {
    render(<Wrapper deckId="deck-1" />);
    expect(screen.getByText('3 шагов')).toBeTruthy();
  });

  it('рендерит три строки шагов', () => {
    render(<Wrapper deckId="deck-1" />);
    // StepPillRow показывает номер шага (1-indexed)
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('сворачивает деку по клику на заголовок', () => {
    render(<Wrapper deckId="deck-1" />);
    // После сворачивания шаги скрыты
    const header = screen.getByText('Test Deck').closest('div')!;
    fireEvent.click(header);
    // После сворачивания шагов нет
    expect(screen.queryByText('Добавить шаг')).toBeNull();
  });

  it('добавляет шаг по кнопке "Добавить шаг"', () => {
    render(<Wrapper deckId="deck-1" />);
    // Кнопка "Добавить шаг" — Button из shadcn/ui, ищем по роли
    const buttons = screen.getAllByRole('button');
    const addBtn = buttons.find(b => b.textContent?.includes('Добавить шаг'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(screen.getByText('4 шагов')).toBeTruthy();
  });

  it('показывает заглушку при пустой деке', () => {
    useScenarioDeckStore.setState({
      decks: [{ id: 'empty', title: 'Empty', description: '', continueOnError: false, collapsed: false, steps: [] }],
    });
    render(<Wrapper deckId="empty" />);
    expect(screen.getByText('Нет шагов. Добавьте первый шаг ниже.')).toBeTruthy();
  });

  it('возвращает null для несуществующей деки', () => {
    const { container } = render(<Wrapper deckId="nonexistent" />);
    expect(container.firstChild).toBeNull();
  });
});