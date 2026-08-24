// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminRunRow } from './collectAdminRuns';
import {
  clearLiveRunsIndexCache,
  fetchLiveRunsIndexCached,
  mergeLocalAndLiveRuns,
} from './mergeLiveAdminRuns';

describe('mergeLocalAndLiveRuns', () => {
  it('dedupes by run_id and prefers local title', () => {
    const local: AdminRunRow[] = [
      {
        key: 'c1:r1',
        check_id: 'c1',
        check_title: 'Local title',
        run_id: 'r1',
        status: 'success',
        started_at: '2026-08-12T10:00:00Z',
      },
      {
        key: 'c2:rx',
        check_id: 'c2',
        check_title: 'Beta check',
        run_id: 'rx',
        status: 'idle',
      },
    ];
    const merged = mergeLocalAndLiveRuns(local, [
      { run_id: 'r1', check_id: 'c1', status: 'failed' },
      { run_id: 'r2', check_id: 'c2', status: 'success', ended_at: '2026-08-12T11:00:00Z' },
    ]);
    expect(merged.map((r) => r.run_id)).toEqual(['r2', 'r1', 'rx']);
    expect(merged.find((r) => r.run_id === 'r1')?.check_title).toBe('Local title');
    expect(merged.find((r) => r.run_id === 'r2')?.check_title).toBe('Beta check');
  });
});

describe('fetchLiveRunsIndexCached', () => {
  afterEach(() => {
    clearLiveRunsIndexCache();
    vi.unstubAllGlobals();
  });

  it('reuses TTL cache within window', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ run_id: 'r1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const a = await fetchLiveRunsIndexCached('http://127.0.0.1:8767', {
      limit: 10,
      ttlMs: 60_000,
    });
    const b = await fetchLiveRunsIndexCached('http://127.0.0.1:8767', {
      limit: 10,
      ttlMs: 60_000,
    });
    expect(a).toEqual([{ run_id: 'r1' }]);
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
