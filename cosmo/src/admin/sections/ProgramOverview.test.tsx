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

  // @antv/g2 canvas mock — jsdom has no <canvas>
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    configurable: true,
    value: () => ({
      clearRect: () => undefined,
      fillRect: () => undefined,
      fillText: () => undefined,
      arc: () => undefined,
      beginPath: () => undefined,
      closePath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      scale: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      setTransform: () => undefined,
      transform: () => undefined,
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      getImageData: () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
      createImageData: () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
      putImageData: () => undefined,
      rect: () => undefined,
      ellipse: () => undefined,
      arcTo: () => undefined,
      bezierCurveTo: () => undefined,
      drawImage: () => undefined,
      isPointInPath: () => false,
      quadraticCurveTo: () => undefined,
      canvas: { width: 0, height: 0 },
      clip: () => undefined,
    }),
  });
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
