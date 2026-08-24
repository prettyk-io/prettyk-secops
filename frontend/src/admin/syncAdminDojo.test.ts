// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEvidenceRegistryForTests } from './evidenceRegistry';
import { syncAdminDojoFromLive } from './syncAdminDojo';

describe('syncAdminDojoFromLive', () => {
  beforeEach(() => {
    resetEvidenceRegistryForTests();
  });

  it('merges evidence list + dojo program payload', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/evidence')) {
        return new Response(
          JSON.stringify({
            ok: true,
            list: [
              {
                check_id: 'chk_sync',
                deploy_id: 'dep_x',
                source: 'finalize',
                dojo: { stats: { critical: 1, high: 0 } },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/dojo/program')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'ok',
            items: {},
          }),
          { status: 200 },
        );
      }
      return new Response('nope', { status: 404 });
    });

    const result = await syncAdminDojoFromLive(fetchImpl as unknown as typeof fetch);
    expect(result.evidenceOk).toBe(true);
    expect(result.evidenceUpserted).toBe(1);
    expect(result.dojoStatus).toBe('ok');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('reports down when Live evidence fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const result = await syncAdminDojoFromLive(fetchImpl as unknown as typeof fetch);
    expect(result.evidenceOk).toBe(false);
    expect(result.dojoStatus).toBe('down');
  });
});
