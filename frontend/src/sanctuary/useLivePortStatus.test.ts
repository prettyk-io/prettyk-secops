import { describe, expect, it, vi } from 'vitest';
import { pingPort, runtimeNodes } from './useLivePortStatus';
import type { SanctuaryMapNode } from './systemMapModel';

function okResponse(ok: boolean): Response {
  return { ok } as Response;
}

function makeNode(id: string, healthEndpoint?: string): SanctuaryMapNode {
  return {
    id,
    label: id,
    level: 'system',
    status: 'infrastructure',
    lenses: ['runtime'],
    portMeta: healthEndpoint
      ? { port: 8080, protocol: 'http', healthEndpoint }
      : undefined,
  };
}

describe('pingPort (B3: честный статус)', () => {
  it('2xx → alive', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(true)) as unknown as typeof fetch;
    await expect(pingPort('http://x/', { fetchFn })).resolves.toBe('alive');
  });

  it('не-2xx (сервер ответил, но нездоров) → down', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(false)) as unknown as typeof fetch;
    await expect(pingPort('http://x/', { fetchFn })).resolves.toBe('down');
  });

  it('fetch упал (CORS/сеть/таймаут) → unknown, не врём down', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('CORS')) as unknown as typeof fetch;
    await expect(pingPort('http://x/', { fetchFn })).resolves.toBe('unknown');
  });
});

describe('runtimeNodes (B3: не-рантаймный)', () => {
  it('только узлы с portMeta.healthEndpoint считаются рантаймными', () => {
    const nodes = [
      makeNode('live', 'http://127.0.0.1:8080/'),
      makeNode('no-port'),
    ];
    expect(runtimeNodes(nodes).map((n) => n.id)).toEqual(['live']);
  });
});
