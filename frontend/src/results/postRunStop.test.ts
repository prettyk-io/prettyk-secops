import { afterEach, describe, expect, it, vi } from 'vitest';
import { postRunStop } from './postRunStop';

describe('postRunStop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, run_id: 'abc' }),
      })),
    );
    await expect(postRunStop()).resolves.toEqual({ ok: true, run_id: 'abc' });
  });

  it('maps 409 to idle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: 'no run in progress' }),
      })),
    );
    await expect(postRunStop()).resolves.toMatchObject({
      ok: false,
      idle: true,
    });
  });
});
