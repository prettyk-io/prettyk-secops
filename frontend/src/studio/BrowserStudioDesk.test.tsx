/**
 * @vitest-environment jsdom
 * BROWSER-STUDIO-VFILL: левая колонка — flex-колонка, стейдж растянут на её высоту
 * (flex-1 / min-h-0), полоса Author/Record/Debug прижата к низу стейджа.
 *
 * BROWSER-STUDIO-DESK-LIVE-BADGE: бейдж деска и баннер ActionTape берут статус из
 * живой сессии (`cdpLive` = `getBrowserSession().getLastStatus()`), а не из
 * `recorder.state.cdpConnected` (тот true только во время записи).
 *
 * jsdom не считает layout, поэтому проверяем структурные классы/иерархию, которые
 * задают поведение flexbox: раньше контейнер был block (`flex-1 min-w-0 h-full`),
 * из-за чего flex-1 у BrowserStage не действовал и вьюпорт схлопывался до контента.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { BrowserStudioDesk } from './BrowserStudioDesk';
import { __resetBrowserSessionForTests } from './browserSession';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** CDP недоступен: нет живого статуса → WS/поллинг не поднимают лишних сетевых путей. */
function mockFetchDown(): void {
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status: 503,
    statusText: 'CDP down',
    json: async () => ({}),
    text: async () => '',
  })) as unknown as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Живой статус сессии: `BrowserSession.getStatus()` читает `/api/browser/status`. */
function mockLiveStatus(connected: boolean): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
    if (url.includes('/api/browser/status')) {
      return jsonResponse({
        ok: true,
        connected,
        url: 'http://juice-shop:3000',
        title: 'Juice',
        contexts: ['operator'],
        purpose: 'authoring',
        transport: 'playwright',
        runtime: 'container',
      });
    }
    return jsonResponse({ ok: true });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __resetBrowserSessionForTests();
  mockFetchDown();
});

function renderDesk() {
  return render(
    <BrowserStudioDesk
      initialRecording={false}
      onClose={() => {}}
      onSaveToCurrent={() => {}}
      onSaveToNewScenario={() => undefined}
    />,
  );
}

function stageColumn(): HTMLElement {
  return screen.getByTestId('browser-studio-stage-column');
}

function connectionBadge(): HTMLElement {
  return screen.getByTestId('desk-connection-badge');
}

describe('BrowserStudioDesk — раскладка (BROWSER-STUDIO-VFILL)', () => {
  it('левая колонка — flex-колонка (не block), иначе flex-1 стейджа не работает', () => {
    renderDesk();
    const col = stageColumn();
    expect(col.classList.contains('flex')).toBe(true);
    expect(col.classList.contains('flex-col')).toBe(true);
    expect(col.classList.contains('flex-1')).toBe(true);
    expect(col.classList.contains('min-w-0')).toBe(true);
    expect(col.classList.contains('min-h-0')).toBe(true);
  });

  it('стейдж — единственный и растягиваемый child колонки (flex-1 min-h-0)', () => {
    renderDesk();
    const col = stageColumn();
    expect(col.children.length).toBe(1);
    const stage = col.firstElementChild as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.classList.contains('flex-1')).toBe(true);
    expect(stage.classList.contains('min-h-0')).toBe(true);
  });

  it('полоса Author/Record/Debug прижата к низу стейджа (последний child + shrink-0)', () => {
    renderDesk();
    const stage = stageColumn().firstElementChild as HTMLElement;
    const authorBtn = screen.getByRole('button', { name: /Author/ });
    const modeBar = authorBtn.parentElement as HTMLElement;
    expect(modeBar).not.toBeNull();
    expect(modeBar.classList.contains('shrink-0')).toBe(true);
    expect(stage.lastElementChild).toBe(modeBar);
  });

  it('лента (ActionTape) — правая колонка фиксированной ширины рядом с колонкой стейджа', () => {
    renderDesk();
    const col = stageColumn();
    const body = col.parentElement as HTMLElement;
    expect(body.classList.contains('flex')).toBe(true);
    expect(body.classList.contains('flex-row')).toBe(true);
    expect(body.classList.contains('min-h-0')).toBe(true);
    const tape = body.lastElementChild as HTMLElement;
    expect(tape).not.toBe(col);
    expect(tape.classList.contains('w-[380px]')).toBe(true);
    expect(tape.classList.contains('shrink-0')).toBe(true);
    expect(col.nextElementSibling).toBe(tape);
  });
});

describe('BrowserStudioDesk — бейдж/баннер по живой сессии (BROWSER-STUDIO-DESK-LIVE-BADGE)', () => {
  it('author-режим + живой браузер: бейдж зелёный из сессии, баннера ленты нет', async () => {
    mockLiveStatus(true);
    renderDesk();

    const badge = connectionBadge();
    // Рекордер в author-режиме not connected (observe-поллинга нет) — источник именно сессия.
    await waitFor(() => expect(badge.getAttribute('data-connected')).toBe('true'));
    expect(badge.textContent).toContain('браузер подключён');
    expect(screen.queryByText(/Браузер не подключён/)).toBeNull();
  });

  it('реальное отключение: бейдж красный, баннер ленты виден', async () => {
    mockLiveStatus(false);
    renderDesk();

    const badge = connectionBadge();
    await waitFor(() => expect(badge.getAttribute('data-connected')).toBe('false'));
    expect(badge.textContent).toContain('браузер не подключён');
    expect(screen.getByText(/Браузер не подключён/)).toBeTruthy();
  });
});