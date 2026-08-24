// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { AppsLedgerPanel } from './AppsLedgerPanel';
import { fetchRunApps } from '../adminApi';

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

describe('fetchRunApps', () => {
  it('normalizes /api/runs/apps payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          apps: [
            {
              app_code: 'IB_WEB',
              first_run_ts: 1000,
              last_run_ts: 3000,
              deploys: [
                {
                  deploy_url: 'https://ib.local/',
                  instances: [
                    {
                      instance_id: 'ck1',
                      check_id: 'ck1',
                      run_id: 'r2',
                      last_run_ts: 3000,
                      status: 'success',
                      owner: 'appsec',
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const apps = await fetchRunApps(fetchImpl);
    expect(apps).toHaveLength(1);
    expect(apps[0]?.app_code).toBe('IB_WEB');
    expect(apps[0]?.deploys[0]?.instances[0]?.run_id).toBe('r2');
  });

  it('returns [] on non-ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const apps = await fetchRunApps(fetchImpl);
    expect(apps).toEqual([]);
  });
});

describe('AppsLedgerPanel', () => {
  it('renders empty state when no apps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ apps: [] }), { status: 200 }),
      ),
    );
    render(
      <ConfigProvider locale={ruRU}>
        <AppsLedgerPanel />
      </ConfigProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('admin-apps-empty')).toBeTruthy();
    });
    vi.unstubAllGlobals();
  });

  it('renders app rows from fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            apps: [
              {
                app_code: 'PAYMENT',
                first_run_ts: 1000,
                last_run_ts: 2000,
                deploys: [
                  {
                    deploy_url: 'https://pay.local/',
                    instances: [
                      {
                        instance_id: 'i1',
                        check_id: 'c1',
                        run_id: 'r9',
                        last_run_ts: 2000,
                        status: 'success',
                        owner: 'secops',
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <ConfigProvider locale={ruRU}>
        <AppsLedgerPanel />
      </ConfigProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('PAYMENT')).toBeTruthy();
    });
    vi.unstubAllGlobals();
  });
});
