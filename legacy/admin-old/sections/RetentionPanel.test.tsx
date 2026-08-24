// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { RetentionPanel } from './RetentionPanel';
import { fetchRetentionStatus, postRetentionClean } from '../adminApi';

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

describe('fetchRetentionStatus & postRetentionClean API', () => {
  it('normalizes retention status payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          total_bytes: 10485760,
          total_runs: 42,
          protected_runs: 5,
          categories: [
            {
              key: 'allure_reports',
              label: 'Allure-отчёты',
              bytes: 5242880,
              items_count: 20,
            },
          ],
          runs_index_protected: true,
        }),
        { status: 200 },
      ),
    );

    const status = await fetchRetentionStatus(fetchImpl);
    expect(status.ok).toBe(true);
    expect(status.total_bytes).toBe(10485760);
    expect(status.total_runs).toBe(42);
    expect(status.protected_runs).toBe(5);
    expect(status.categories).toHaveLength(1);
    expect(status.categories[0]?.key).toBe('allure_reports');
  });

  it('posts retention clean payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          freed_bytes: 2097152,
          deleted_items: 8,
        }),
        { status: 200 },
      ),
    );

    const res = await postRetentionClean({ days: 7 }, fetchImpl);
    expect(res.ok).toBe(true);
    expect(res.freed_bytes).toBe(2097152);
    expect(res.deleted_items).toBe(8);
  });
});

describe('RetentionPanel component', () => {
  it('renders KPI cards and storage categories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            total_bytes: 104857600,
            total_runs: 15,
            protected_runs: 3,
            categories: [
              {
                key: 'video_recordings',
                label: 'Видеозаписи (MP4)',
                bytes: 52428800,
                items_count: 10,
              },
              {
                key: 'runs_index',
                label: 'Мета-индекс реестра (runs_index.ndjson)',
                bytes: 1024,
                items_count: 1,
                protected: true,
              },
            ],
            runs_index_protected: true,
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <ConfigProvider locale={ruRU}>
        <RetentionPanel />
      </ConfigProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-retention')).toBeTruthy();
      expect(screen.getByTestId('ret-total-space')).toBeTruthy();
      expect(screen.getByTestId('clean-by-days-btn')).toBeTruthy();
      expect(screen.getByTestId('clean-temp-btn')).toBeTruthy();
    });

    vi.unstubAllGlobals();
  });
});
