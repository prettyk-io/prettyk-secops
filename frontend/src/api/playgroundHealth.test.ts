import { describe, expect, it, vi } from 'vitest';
import { fetchPlaygroundHealth } from './playgroundHealth';

describe('fetchPlaygroundHealth', () => {
  it('up при ok:true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    expect(await fetchPlaygroundHealth(fetchImpl as unknown as typeof fetch)).toBe('up');
  });

  it('down при сети/HTTP', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchPlaygroundHealth(fetchImpl as unknown as typeof fetch)).toBe('down');
  });
});
