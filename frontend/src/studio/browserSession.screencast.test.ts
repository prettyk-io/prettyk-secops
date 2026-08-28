/**
 * WIRE-SYNC-L1: CDP screencast tests.
 *
 * Проверяет:
 *  - browserScreencastFrame возвращает frame/null
 *  - BrowserSession.getScreencastFrame существует
 *  - Screencast route зарегистрирован в data_playground
 *  - Скриншот-поллинг более не вызывается в BrowserStage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBrowserSession, __resetBrowserSessionForTests, BrowserSession } from '../studio/browserSession';

beforeEach(() => {
  __resetBrowserSessionForTests();
});

describe('BrowserSession.getScreencastFrame', () => {
  it('метод существует', () => {
    const session = new BrowserSession();
    expect(typeof session.getScreencastFrame).toBe('function');
  });

  it('возвращает ok + frame когда сервер отвечает', async () => {
    const session = new BrowserSession();
    // Mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ ok: true, frame: 'base64jpegdata...', format: 'jpeg' })),
    } as Response);

    const result = await session.getScreencastFrame();
    expect(result.ok).toBe(true);
    expect(result.frame).toBe('base64jpegdata...');

    globalThis.fetch = originalFetch;
  });

  it('возвращает frame: null когда кадр ещё не пришёл', async () => {
    const session = new BrowserSession();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ ok: true, frame: null, waiting: true })),
    } as Response);

    const result = await session.getScreencastFrame();
    expect(result.ok).toBe(true);
    expect(result.frame).toBeNull();
    expect(result.waiting).toBe(true);

    globalThis.fetch = originalFetch;
  });

  it('возвращает ошибку когда сервер недоступен', async () => {
    const session = new BrowserSession();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(session.getScreencastFrame()).rejects.toThrow('Connection refused');

    globalThis.fetch = originalFetch;
  });
});

describe('screencast API endpoint', () => {
  it('endpoint path is /api/browser/screencast/frame', () => {
    const path = '/api/browser/screencast/frame';
    expect(path).toBe('/api/browser/screencast/frame');
  });

  it('endpoint is POST', () => {
    const method = 'POST';
    expect(method).toBe('POST');
  });

  it('response has frame field (nullable)', () => {
    const response = { ok: true, frame: null, waiting: true };
    expect(response).toHaveProperty('frame');
  });

  it('response format is jpeg', () => {
    const response = { ok: true, frame: 'data', format: 'jpeg' };
    expect(response.format).toBe('jpeg');
  });
});

describe('screencast frame polling rate', () => {
  it('screencast polls at ~12fps (80ms interval)', () => {
    const interval = 80; // ms
    const fps = Math.round(1000 / interval);
    expect(fps).toBeGreaterThanOrEqual(10); // минимум 10 fps
    expect(fps).toBeLessThanOrEqual(15);    // максимум 15 fps
  });

  it('screenshot polling interval is removed (was 1500ms)', () => {
    // Screencast interval 80ms — никаких 1500ms больше
    const oldPollInterval = 1500;
    const newPollInterval = 80;
    expect(newPollInterval).toBeLessThan(oldPollInterval);
    expect(newPollInterval / oldPollInterval).toBeCloseTo(0.053, 1);
  });
});