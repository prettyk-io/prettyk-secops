// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetChecksStoreForTests,
  createCheck,
} from '../checks/checksStore';
import { ThemeProvider } from '../theme/ThemeProvider';
import { HistoryPage } from './HistoryPage';

vi.mock('../checks/checksRemote', () => ({
  pullChecksFromServer: vi.fn().mockResolvedValue(false),
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
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640,
  });
});

beforeEach(() => {
  __resetChecksStoreForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHistory(
  props: { onBackHome?: () => void; onOpenCheck?: (id: string) => void } = {},
): void {
  render(
    <ThemeProvider>
      <HistoryPage
        onBackHome={props.onBackHome ?? vi.fn()}
        onOpenCheck={props.onOpenCheck ?? vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe('HistoryPage', () => {
  it('колонки Создано/Обновлено/Запусков и назад', () => {
    createCheck({
      wired: { meta: { name: 'Alpha check' } },
      status: 'draft',
    });
    const onBackHome = vi.fn();
    renderHistory({ onBackHome });
    expect(screen.getByText('Создано')).toBeTruthy();
    expect(screen.getByText('Обновлено')).toBeTruthy();
    expect(screen.getByText('Запусков')).toBeTruthy();
    expect(screen.queryByText('Прогоны')).toBeNull();
    expect(screen.getByText('Alpha check')).toBeTruthy();
    expect(screen.getByText('Черновик')).toBeTruthy();
    fireEvent.click(screen.getByTestId('history-back'));
    expect(onBackHome).toHaveBeenCalled();
  });

  it('статус ready отображается как Подготовлен', () => {
    createCheck({
      wired: { meta: { name: 'Ready check' } },
      status: 'ready',
    });
    renderHistory();
    expect(screen.getByText('Подготовлен')).toBeTruthy();
    expect(screen.queryByText('Готово')).toBeNull();
  });

  it('кнопка аудита очистки на месте', () => {
    createCheck({
      wired: { meta: { name: 'Audit btn' } },
      status: 'draft',
    });
    renderHistory();
    expect(screen.getByTestId('history-artifacts-audit')).toBeTruthy();
  });

  it('badge hold и блокировка purge при legal_hold', async () => {
    const created = createCheck({
      wired: { meta: { name: 'Held check' } },
      status: 'draft',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          checks: {
            [created.check_id]: { has_artifacts: true, legal_hold: true },
          },
        }),
      }),
    );
    renderHistory();
    expect(
      await screen.findByTestId(`history-hold-badge-${created.check_id}`),
    ).toBeTruthy();
    expect(screen.getByTestId(`history-art-badge-${created.check_id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`history-delete-${created.check_id}`));
    const purge = screen.getByTestId('history-purge-artifacts');
    const input = purge.querySelector('input') ?? purge;
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('history-purge-hold-note')).toBeTruthy();
  });

  it('held: confirm delete не зовёт purge API', async () => {
    const created = createCheck({
      wired: { meta: { name: 'Held no-purge' } },
      status: 'draft',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        checks: {
          [created.check_id]: { has_artifacts: true, legal_hold: true },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    renderHistory();
    await screen.findByTestId(`history-hold-badge-${created.check_id}`);
    fireEvent.click(screen.getByTestId(`history-delete-${created.check_id}`));
    const dialog = await screen.findByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      /удалить/i.test(b.textContent || ''),
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);
    const purgeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0] || '').includes('/api/artifacts/purge'),
    );
    expect(purgeCalls).toHaveLength(0);
  });
});
