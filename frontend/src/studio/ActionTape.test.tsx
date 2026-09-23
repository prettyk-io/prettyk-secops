// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionTape } from './ActionTape';
import type { ScenarioStepModel } from './scenarioStepModel';

afterEach(cleanup);

function click(id: string): ScenarioStepModel {
  return { id, action: 'Click', strategy: 'role', strategyValue: 'Войти', payload: '', continueOnError: false, led: 'predicted', debugResult: null };
}

function typeStep(id: string): ScenarioStepModel {
  return { id, action: 'Type', strategy: 'role', strategyValue: 'Логин', payload: '$value', continueOnError: false, led: 'predicted', debugResult: null };
}

describe('BROWSER-STUDIO-1: ActionTape', () => {
  it('shows empty state when no steps', () => {
    render(<ActionTape steps={[]} recording={false} cdpConnected onRemoveStep={() => {}} onClear={() => {}} onSave={() => {}} />);
    expect(screen.getByText('Лента действий')).toBeTruthy();
    expect(screen.getByText(/Нажмите ● Record/)).toBeTruthy();
  });

  it('renders canonical DSL per step', () => {
    render(<ActionTape steps={[click('a'), typeStep('b')]} recording cdpConnected onRemoveStep={() => {}} onClear={() => {}} onSave={() => {}} />);
    expect(screen.getByText('Click role "Войти"')).toBeTruthy();
    expect(screen.getByText('Type role "Логин" $value')).toBeTruthy();
  });

  it('disables Save when empty and enables with steps', () => {
    const onSave = vi.fn();
    const { rerender } = render(<ActionTape steps={[]} recording={false} cdpConnected onRemoveStep={() => {}} onClear={() => {}} onSave={onSave} />);
    const saveBtn = screen.getByRole('button', { name: /Сохранить/ });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    rerender(<ActionTape steps={[click('a')]} recording={false} cdpConnected onRemoveStep={() => {}} onClear={() => {}} onSave={onSave} />);
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('remove + clear fire callbacks', () => {
    const onRemoveStep = vi.fn();
    const onClear = vi.fn();
    render(<ActionTape steps={[click('a'), click('b')]} recording={false} cdpConnected onRemoveStep={onRemoveStep} onClear={onClear} onSave={() => {}} />);

    const removeButtons = screen.getAllByTitle(/Удалить шаг/);
    fireEvent.click(removeButtons[0]!);
    expect(onRemoveStep).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: /Очистить/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});