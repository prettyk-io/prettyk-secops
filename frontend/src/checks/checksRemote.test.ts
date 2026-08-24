// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetChecksRemoteForTests,
  pullChecksFromServer,
  pushChecksToServer,
} from './checksRemote';
import {
  __resetChecksStoreForTests,
  createCheck,
  listChecks,
  readChecksSnapshot,
} from './checksStore';

afterEach(() => {
  __resetChecksRemoteForTests();
  __resetChecksStoreForTests();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  __resetChecksRemoteForTests();
  __resetChecksStoreForTests();
});

describe('checksRemote', () => {
  it('pull merges newer remote check into local', async () => {
    const local = createCheck({
      wired: { meta: { name: 'Local' } },
      status: 'draft',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 1,
        items: [
          {
            check_id: local.check_id,
            title: 'Remote newer',
            status: 'ready',
            created_at: local.created_at,
            updated_at: '2099-01-01T00:00:00.000Z',
            wired: { meta: { name: 'Remote newer' } },
            resource_contents: {},
            view: 'form',
            runs: [{ run_id: 'r-remote', status: 'success' }],
          },
          {
            check_id: 'chk_only_remote',
            title: 'Only remote',
            status: 'draft',
            created_at: '2026-08-11T00:00:00.000Z',
            updated_at: '2026-08-11T00:00:00.000Z',
            wired: {},
            runs: [],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const changed = await pullChecksFromServer();
    expect(changed).toBe(true);
    expect(getTitle(local.check_id)).toBe('Remote newer');
    expect(listChecks().some((c) => c.check_id === 'chk_only_remote')).toBe(true);
  });

  it('push sends versioned snapshot', async () => {
    createCheck({ wired: { meta: { name: 'Push me' } }, status: 'draft' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, count: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await pushChecksToServer(readChecksSnapshot());
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PUT');
    const body = JSON.parse(String(init.body)) as { version: number; items: unknown[] };
    expect(body.version).toBe(1);
    expect(body.items).toHaveLength(1);
  });
});

function getTitle(checkId: string): string | undefined {
  return listChecks().find((c) => c.check_id === checkId)?.title;
}
