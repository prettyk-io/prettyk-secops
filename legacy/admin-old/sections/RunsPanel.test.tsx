// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { RunsPanel } from './RunsPanel';

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
});

describe('RunsPanel', () => {
  it('shows ProTable density/setting toolbar (VIS-2)', { timeout: 30_000 }, () => {
    const { container } = render(
      <ConfigProvider locale={ruRU}>
        <RunsPanel onOpenCheck={vi.fn()} />
      </ConfigProvider>,
    );
    expect(screen.getByTestId('admin-runs')).toBeTruthy();
    expect(container.querySelector('.ant-pro-table')).toBeTruthy();
    expect(
      container.querySelector('.ant-pro-table-list-toolbar-setting-items'),
    ).toBeTruthy();
  });
});
