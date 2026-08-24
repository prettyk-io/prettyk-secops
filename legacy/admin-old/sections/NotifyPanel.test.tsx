// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { NotifyPanel } from './NotifyPanel';

afterEach(() => cleanup());

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
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('NotifyPanel', () => {
  it('renders empty state with create button', () => {
    render(
      <ConfigProvider locale={ruRU}>
        <App>
          <NotifyPanel />
        </App>
      </ConfigProvider>,
    );
    expect(screen.getByTestId('admin-notify')).toBeTruthy();
    expect(screen.getByText('Правила оповещений')).toBeTruthy();
    expect(screen.getByText('Добавить правило')).toBeTruthy();
    expect(screen.getByText('Правил пока нет — создай первое')).toBeTruthy();
  });

  it('opens create modal from button', async () => {
    render(
      <ConfigProvider locale={ruRU}>
        <App>
          <NotifyPanel />
        </App>
      </ConfigProvider>,
    );
    fireEvent.click(screen.getByText('Добавить правило'));
    expect(await screen.findByText('Новое оповещение')).toBeTruthy();
    expect(screen.getByText('Команда (код приложения + роль)')).toBeTruthy();
    expect(screen.getByText('Добавить команду')).toBeTruthy();
  });
});
