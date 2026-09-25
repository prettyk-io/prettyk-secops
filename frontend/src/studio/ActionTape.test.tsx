// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionTape, type ActionTapeProps } from './ActionTape';
import type { ScenarioStepModel } from './scenarioStepModel';
import type { ReplayStepState } from '../terminal/replayRunner';

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  cleanup();
});

function click(id: string): ScenarioStepModel {
  return { id, action: 'Click', strategy: 'role', strategyValue: 'Войти', payload: '', continueOnError: false, led: 'predicted', debugResult: null };
}

function typeStep(id: string): ScenarioStepModel {
  return { id, action: 'Type', strategy: 'role', strategyValue: 'Логин', payload: '$value', continueOnError: false, led: 'predicted', debugResult: null };
}

function renderTape(overrides: Partial<ActionTapeProps> = {}) {
  const props: ActionTapeProps = {
    steps: [],
    recording: false,
    cdpConnected: true,
    replayEnabled: false,
    replaying: false,
    replayStates: {},
    onRemoveStep: () => {},
    onMoveStep: () => {},
    onClear: () => {},
    onSave: () => {},
    onReplay: () => {},
    onStopReplay: () => {},
    ...overrides,
  };
  return render(<ActionTape {...props} />);
}

describe('BROWSER-STUDIO-1: ActionTape', () => {
  it('shows empty state when no steps', () => {
    renderTape();
    expect(screen.getByText('Лента действий')).toBeTruthy();
    expect(screen.getByText(/Нажмите ● Record/)).toBeTruthy();
  });

  it('renders canonical DSL per step', () => {
    renderTape({ steps: [click('a'), typeStep('b')], recording: true });
    expect(screen.getByText('Click role "Войти"')).toBeTruthy();
    expect(screen.getByText('Type role "Логин" $value')).toBeTruthy();
  });

  it('disables Save when empty and enables with steps', () => {
    const onSave = vi.fn();
    const { rerender } = renderTape({ onSave });
    const saveBtn = screen.getByRole('button', { name: /Сохранить/ });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ActionTape
        steps={[click('a')]} recording={false} cdpConnected replayEnabled={false} replaying={false} replayStates={{}}
        onRemoveStep={() => {}} onMoveStep={() => {}} onClear={() => {}} onSave={onSave} onReplay={() => {}} onStopReplay={() => {}}
      />,
    );
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('remove + clear fire callbacks', () => {
    const onRemoveStep = vi.fn();
    const onClear = vi.fn();
    renderTape({ steps: [click('a'), click('b')], onRemoveStep, onClear });

    const removeButtons = screen.getAllByTitle(/Удалить шаг/);
    fireEvent.click(removeButtons[0]!);
    expect(onRemoveStep).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: /Очистить/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('STUDIO-TAPE-OPS: ActionTape reorder', () => {
  it('fires onMoveStep with correct index+dir and disables first/last', () => {
    const onMoveStep = vi.fn();
    renderTape({ steps: [click('a'), click('b'), click('c')], onMoveStep });

    const ups = screen.getAllByTitle('Переместить вверх');
    const downs = screen.getAllByTitle('Переместить вниз');
    expect(ups.length).toBe(3);
    expect(downs.length).toBe(3);

    // Первый шаг: ▲ заблокирован, ▼ активен.
    expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
    expect((downs[0] as HTMLButtonElement).disabled).toBe(false);
    // Последний шаг: ▼ заблокирован, ▲ активен.
    expect((ups[2] as HTMLButtonElement).disabled).toBe(false);
    expect((downs[2] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(downs[0]!);
    expect(onMoveStep).toHaveBeenCalledWith(0, 1);
    fireEvent.click(ups[1]!);
    expect(onMoveStep).toHaveBeenCalledWith(1, -1);
  });

  it('disables reorder buttons while replaying', () => {
    renderTape({ steps: [click('a'), click('b')], replaying: true });
    const up = screen.getAllByTitle('Переместить вверх')[1]!;
    const down = screen.getAllByTitle('Переместить вниз')[0]!;
    expect((up as HTMLButtonElement).disabled).toBe(true);
    expect((down as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('STUDIO-TAPE-OPS: ActionTape replay', () => {
  it('disables Play when no steps/CDP and fires onReplay when enabled', () => {
    const onReplay = vi.fn();
    const { rerender } = renderTape({ steps: [click('a')], replayEnabled: false, onReplay });
    const playBtn = screen.getByRole('button', { name: /Воспроизвести/ });
    expect((playBtn as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ActionTape
        steps={[click('a')]} recording={false} cdpConnected replayEnabled replaying={false} replayStates={{}}
        onRemoveStep={() => {}} onMoveStep={() => {}} onClear={() => {}} onSave={() => {}} onReplay={onReplay} onStopReplay={() => {}}
      />,
    );
    const enabled = screen.getByRole('button', { name: /Воспроизвести/ });
    expect((enabled as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enabled);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('switches Play → Stop while replaying and fires onStopReplay', () => {
    const onStopReplay = vi.fn();
    renderTape({ steps: [click('a'), click('b')], replayEnabled: true, replaying: true, onStopReplay });
    expect(screen.queryByRole('button', { name: /Воспроизвести/ })).toBeNull();
    const stopBtn = screen.getByRole('button', { name: /Остановить/ });
    fireEvent.click(stopBtn);
    expect(onStopReplay).toHaveBeenCalledTimes(1);
  });

  it('visualizes idle/running/passed/failed per step', () => {
    const steps = [click('a'), click('b'), click('c'), click('d')];
    const replayStates: Record<string, ReplayStepState> = {
      a: { stepId: 'a', index: 0, status: 'idle' },
      b: { stepId: 'b', index: 1, status: 'running' },
      c: { stepId: 'c', index: 2, status: 'passed' },
      d: { stepId: 'd', index: 3, status: 'failed', error: 'step boom' },
    };
    renderTape({ steps, replaying: true, replayStates });

    expect(screen.getByTestId('tape-step-status-0').getAttribute('data-status')).toBe('idle');
    expect(screen.getByTestId('tape-step-status-1').getAttribute('data-status')).toBe('running');
    expect(screen.getByTestId('tape-step-status-2').getAttribute('data-status')).toBe('passed');
    expect(screen.getByTestId('tape-step-status-3').getAttribute('data-status')).toBe('failed');
    // Тултип ошибки на failed-шаге.
    expect(screen.getByTitle('step boom')).toBeTruthy();
  });
});

describe('STUDIO-TAPE-OPS: ActionTape auto-scroll', () => {
  it('scrolls to the fresh step when steps grow', () => {
    const scrollIntoView = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;

    const { rerender } = renderTape({ steps: [click('a')] });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <ActionTape
        steps={[click('a'), typeStep('b')]} recording={false} cdpConnected replayEnabled={false} replaying={false} replayStates={{}}
        onRemoveStep={() => {}} onMoveStep={() => {}} onClear={() => {}} onSave={() => {}} onReplay={() => {}} onStopReplay={() => {}}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});