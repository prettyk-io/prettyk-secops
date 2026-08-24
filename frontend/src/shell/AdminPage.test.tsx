// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { AdminPage } from './AdminPage';
import { ThemeProvider } from '../theme/ThemeProvider';

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

describe('AdminPage', () => {
  it(
    'renders SecOps shell without ambient video; default Overview (V6)',
    { timeout: 30_000 },
    async () => {
      const { container } = render(
        <ThemeProvider>
          <AdminPage
            onBackHome={vi.fn()}
            onInitFromDeploy={vi.fn()}
            onOpenCheck={vi.fn()}
          />
        </ThemeProvider>,
      );

      expect(screen.getByTestId('admin-page')).toBeTruthy();
      await waitFor(() => {
        expect(screen.getByTestId('admin-overview')).toBeTruthy();
      });
      await waitFor(() => {
        expect(screen.getAllByText('Обзор').length).toBeGreaterThan(0);
      });
      expect(container.querySelector('.pk-shell-bg-video')).toBeNull();
      await waitFor(() => {
        expect(screen.getByTestId('ov-hero')).toBeTruthy();
      });
    },
  );
});
