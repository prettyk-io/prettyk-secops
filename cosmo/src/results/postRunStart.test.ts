// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, login } from '../shell/auth';
import {
  TRAFFIC_INSERTION_FEED_STORAGE_KEY,
  writeTrafficInsertionFeedOptIn,
} from '../studio/trafficInsertionFeed';
import { postRunStart } from './postRunStart';

describe('postRunStart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
    try {
      localStorage.removeItem(TRAFFIC_INSERTION_FEED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });

  it('POSTs runtime wired + resource_contents to playground', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, run_id: 'abc', pid: 9 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await postRunStart(
      { meta: { name: 't' } },
      undefined,
      { checkout: '{"log":{"entries":[]}}' },
      { authorization: 'Bearer LIVE' },
    );
    expect(result).toEqual({ ok: true, run_id: 'abc', pid: 9 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/run/start');
    const body = JSON.parse(String(init.body)) as {
      wired: unknown;
      resource_contents?: Record<string, string>;
      chain_bindings?: Record<string, string>;
      owner_user_id?: string;
      env?: Record<string, string>;
    };
    expect(body.wired).toBeTruthy();
    expect(body.resource_contents?.checkout).toContain('entries');
    expect(body.chain_bindings?.authorization).toBe('Bearer LIVE');
    expect(body.env).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes traffic-feed env when Studio opt-in is on', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    });
    writeTrafficInsertionFeedOptIn(true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, run_id: 'tf', pid: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await postRunStart({ meta: { name: 't' } });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      env?: Record<string, string>;
    };
    expect(body.env).toEqual({ KDT_TRAFFIC_INSERTION_FEED: '1' });
  });

  it('maps 409 to alreadyRunning', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: 'run already in progress' }),
      }),
    );
    const result = await postRunStart({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.alreadyRunning).toBe(true);
    }
  });

  it('maps network failure to unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const result = await postRunStart({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unreachable).toBe(true);
    }
  });
});

// PURE-URL-FREE (2026-08-21): canOverrideScanUrl=true для всех ролей.
// Старый тест «expert: seals smuggled URL» удалён — URL больше не стрипается.
// При custom-деплое с возвратом банковских ограничений: восстановить тест из git history.
