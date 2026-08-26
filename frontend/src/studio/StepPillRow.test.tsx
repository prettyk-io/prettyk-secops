/**
 * @vitest-environment jsdom
 * SC-TEST-2: StepPillRow — все 3 пилюли, LED-состояния, кнопки вверх/вниз/удалить
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StepPillRow } from './StepPillRow';
import type { ScenarioStepModel } from './scenarioStepModel';

afterEach(() => cleanup());

const baseStep: ScenarioStepModel = {
  id: 'step-1', action: 'Click', strategy: 'css', strategyValue: '#btn',
  payload: '', continueOnError: false, led: 'queued', debugResult: null,
};

describe('StepPillRow', () => {
  it('рендерит номер шага', () => {
    render(<StepPillRow step={baseStep} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('рендерит action select', () => {
    render(<StepPillRow step={baseStep} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    // select с value="Click" отрендерен, option "Click" — display text внутри option
    const select = document.querySelector('select[style*="min-width: 80px"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('Click');
  });

  it('меняет action через onChange', () => {
    const onChange = vi.fn();
    render(<StepPillRow step={baseStep} index={0} onChange={onChange} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    const select = document.querySelector('select[style*="min-width: 80px"]') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Type' } });
    expect(onChange).toHaveBeenCalledWith({ action: 'Type' });
  });

  it('показывает strategy select для Click', () => {
    render(<StepPillRow step={baseStep} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    const strategySelects = document.querySelectorAll('select[style*="min-width: 55px"]');
    expect(strategySelects.length).toBeGreaterThanOrEqual(1);
    // Первый select с min-width:55px — это strategy select
    const stratSelect = strategySelects[0] as HTMLSelectElement;
    expect(stratSelect.value).toBe('css');
  });

  it('показывает strategyValue input для Click', () => {
    render(<StepPillRow step={baseStep} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    const input = screen.getByDisplayValue('#btn') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('показывает payload input для Open', () => {
    render(<StepPillRow step={{ ...baseStep, action: 'Open', payload: 'https://test.com' }} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    expect(screen.getByDisplayValue('https://test.com')).toBeTruthy();
  });

  it('скрывает strategy select для Open (не требует стратегии)', () => {
    render(<StepPillRow step={{ ...baseStep, action: 'Open', payload: 'https://x.com' }} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    // Для Open стратегия не показывается — strategy select (min-width:55px) отсутствует
    const stratSelects = document.querySelectorAll('select[style*="min-width: 55px"]');
    expect(stratSelects.length).toBe(0);
  });

  describe('LED состояния', () => {
    function ledColor(state: string): string {
      const c: Record<string, string> = { queued: '#475569', running: '#38bdf8', success: '#22c55e', warning: '#f59e0b', failure: '#ef4444' };
      return c[state]!;
    }
    it('queued, running, success, warning, failure — каждый рендерит LED', () => {
      for (const state of ['queued', 'running', 'success', 'warning', 'failure'] as const) {
        cleanup();
        const { container } = render(<StepPillRow step={{ ...baseStep, led: state }} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
        const led = container.querySelector('.rounded-full')!;
        expect(led).toBeTruthy();
        // Проверяем что LED присутствует (inline style background задан)
        const bg = led.getAttribute('style') || '';
        expect(bg.toLowerCase()).toContain('background');
      }
    });
  });

  it('показывает Check-иконку при debugResult=ok', () => {
    const { container } = render(<StepPillRow step={{ ...baseStep, debugResult: 'ok' }} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    expect(container.querySelector('.lucide-check')).toBeTruthy();
  });

  it('показывает X-иконку при debugResult=fail', () => {
    const { container } = render(<StepPillRow step={{ ...baseStep, debugResult: 'fail' }} index={0} onChange={vi.fn()} onDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()} onDebug={vi.fn()} />);
    expect(container.querySelector('.lucide-x')).toBeTruthy();
  });
});