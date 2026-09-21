// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { ProgramOverview } from './ProgramOverview';
import { ThemeProvider } from '../../theme/ThemeProvider';

vi.mock('../syncAdminDojo', () => ({
  syncAdminDojoFromLive: vi.fn(async () => undefined),
}));

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
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  // Canvas 2D для @antv/g2 даёт общий jsdom-полифил
  // (src/monaco/vitest.monaco-polyfill.ts, setupFiles в vite.config.ts):
  // локальный неполный мок без setLineDash ронял рендер графика.
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProgramOverview', () => {
  it('renders Analysis chrome: toolbar, hero, KPI RU, legend, mini runs', () => {
    render(
      <ThemeProvider>
        <ConfigProvider locale={ruRU}>
          <ProgramOverview />
        </ConfigProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('admin-overview')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-toolbar')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-updated')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-period')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-semaphore')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-gate-legend')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-mini-runs')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-secondary')).toBeTruthy();
    expect(screen.getByText('Обзор')).toBeTruthy();
    expect(screen.getByText('Покрытие')).toBeTruthy();
    expect(screen.getByText('Открытые критические')).toBeTruthy();
    expect(screen.getByText('Проход по гейтам')).toBeTruthy();
    expect(screen.getByText('Последние запуски')).toBeTruthy();
  });
});
