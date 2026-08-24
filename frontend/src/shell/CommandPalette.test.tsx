// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { setStudioCommandHost } from './studioCommandHost';

beforeAll(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  setStudioCommandHost(null);
  cleanup();
});

describe('CommandPalette', () => {
  it('открывается по Ctrl+K и ведёт на историю', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(screen.getByPlaceholderText('Команда…')).toBeTruthy();
    fireEvent.click(screen.getByText('История'));
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'history' });
  });

  it('ловит Ctrl+K по code=KeyK при русской раскладке (key ≠ k)', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    fireEvent.keyDown(window, { key: 'л', code: 'KeyK', ctrlKey: true });
    expect(screen.getByPlaceholderText('Команда…')).toBeTruthy();
  });

  it('ловит Ctrl+K в capture даже если Monaco stopPropagation на bubble', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    const monacoish = document.createElement('textarea');
    document.body.appendChild(monacoish);
    monacoish.addEventListener('keydown', (e) => e.stopPropagation());
    monacoish.focus();
    fireEvent.keyDown(monacoish, { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true });
    expect(screen.getAllByPlaceholderText('Команда…').length).toBeGreaterThanOrEqual(1);
    monacoish.remove();
  });

  it('второй слой Studio: открыть сущность и Validate', () => {
    const openEntity = vi.fn();
    const validate = vi.fn();
    setStudioCommandHost({
      entities: [
        {
          kind: 'scenario',
          id: 'scenario:0',
          label: 'login_flow',
          tabId: 'scenario:0',
        },
      ],
      tabs: [{ id: 'scenario:0', title: 'login_flow' }],
      activeTabId: 'scenario:0',
      openEntity,
      create: vi.fn(),
      switchTab: vi.fn(),
      closeActiveTab: vi.fn(),
      validate,
      goToDefinition: vi.fn(),
      goToReferences: vi.fn(),
      peekDefinition: vi.fn(),
      navigateBack: vi.fn(),
      quickFix: vi.fn(),
      showOutline: vi.fn(),
      gotoLine: vi.fn(),
      selectHighlights: vi.fn(),
    });
    render(<CommandPalette onNavigate={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /login_flow.*Сценарий/i }));
    expect(openEntity).toHaveBeenCalledWith('scenario:0');

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /Validate/i }));
    expect(validate).toHaveBeenCalled();
  });

  it('Studio: Go to Line и Select all occurrences из палитры', () => {
    const gotoLine = vi.fn();
    const selectHighlights = vi.fn();
    setStudioCommandHost({
      entities: [],
      tabs: [{ id: 'scenario:0', title: 'login_flow' }],
      activeTabId: 'scenario:0',
      openEntity: vi.fn(),
      create: vi.fn(),
      switchTab: vi.fn(),
      closeActiveTab: vi.fn(),
      validate: vi.fn(),
      goToDefinition: vi.fn(),
      goToReferences: vi.fn(),
      peekDefinition: vi.fn(),
      navigateBack: vi.fn(),
      quickFix: vi.fn(),
      showOutline: vi.fn(),
      gotoLine,
      selectHighlights,
    });
    render(<CommandPalette onNavigate={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /Go to Line/i }));
    expect(gotoLine).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.click(screen.getByRole('option', { name: /Select all occurrences/i }));
    expect(selectHighlights).toHaveBeenCalled();
  });

  it('открывается по Ctrl+P и Ctrl+Shift+P', () => {
    const onNavigate = vi.fn();
    render(<CommandPalette onNavigate={onNavigate} />);
    fireEvent.keyDown(window, { key: 'p', code: 'KeyP', ctrlKey: true });
    expect(screen.getByPlaceholderText('Команда…')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true });
    expect(screen.getByPlaceholderText('Команда…')).toBeTruthy();
  });
});
