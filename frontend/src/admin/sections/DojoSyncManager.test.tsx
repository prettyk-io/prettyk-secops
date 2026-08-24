// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { DojoSyncManager } from './DojoSyncManager';

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
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OK_STATUS = {
  ok: true,
  running: false,
  last_sync_at: 1700000000,
  last_sync_ok: true,
  pushed: 3,
  deduped: 1,
  active_count: 3,
  suppressed_count: 1,
  last_error: null,
  test_id: null,
};

describe('DojoSyncManager component', () => {
  it('renders status cards after fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(OK_STATUS), { status: 200 })),
    );

    render(
      <ConfigProvider locale={ruRU}>
        <DojoSyncManager />
      </ConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dojo-sync-manager')).toBeTruthy();
      expect(screen.getByTestId('dojo-sync-trigger')).toBeTruthy();
    });
    expect(screen.getByText('Отправлено')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('shows down state when Live is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    render(
      <ConfigProvider locale={ruRU}>
        <DojoSyncManager />
      </ConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dojo-sync-down')).toBeTruthy();
    });
  });

  it('triggers sync via POST', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/trigger')) {
        return new Response(JSON.stringify({ ok: true, started: true }), { status: 200 });
      }
      return new Response(JSON.stringify(OK_STATUS), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);

    render(
      <ConfigProvider locale={ruRU}>
        <DojoSyncManager />
      </ConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dojo-sync-trigger')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('dojo-sync-trigger'));

    await waitFor(() => {
      const triggerCall = fetchImpl.mock.calls.find((c) =>
        String(c[0]).includes('/trigger'),
      );
      expect(triggerCall).toBeTruthy();
      expect(triggerCall?.[1]?.method).toBe('POST');
    });
  });
});
