/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  computeDraftHash,
  scheduleDraftSave,
  flushDraft,
  clearDraft,
  isDraftDirty,
  markDraftClean,
  restoreDraftIfNewer,
  disableDraftPersistenceForTests,
  enableDraftPersistenceForTests,
  DRAFT_SAVE_DEBOUNCE_MS,
  type DraftPayload,
} from '../checks/draftPersistence';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CHECK_ID = 'test-check-123';

function makeWired(title: string): Record<string, unknown> {
  return { meta: { name: title, target: 'https://example.com' }, test_suites: { scenarios: [] } };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useFakeTimers();
  disableDraftPersistenceForTests();
  enableDraftPersistenceForTests();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  disableDraftPersistenceForTests();
});

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

describe('computeDraftHash', () => {
  it('produces deterministic hashes', () => {
    const a = computeDraftHash({ a: 1 }, {});
    const b = computeDraftHash({ a: 1 }, {});
    expect(a).toBe(b);
  });

  it('changes with wired content', () => {
    const a = computeDraftHash({ a: 1 }, {});
    const b = computeDraftHash({ a: 2 }, {});
    expect(a).not.toBe(b);
  });

  it('changes with resources', () => {
    const a = computeDraftHash({ a: 1 }, {});
    const b = computeDraftHash({ a: 1 }, { key: 'val' });
    expect(a).not.toBe(b);
  });

  it('returns hex string', () => {
    const hash = computeDraftHash({}, {});
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ---------------------------------------------------------------------------
// Dirty guard
// ---------------------------------------------------------------------------

describe('isDraftDirty', () => {
  it('returns true before any save', () => {
    expect(isDraftDirty(CHECK_ID, makeWired('T'), {})).toBe(true);
  });

  it('returns false after markDraftClean', () => {
    const wired = makeWired('T');
    markDraftClean(CHECK_ID, wired, {});
    expect(isDraftDirty(CHECK_ID, wired, {})).toBe(false);
  });

  it('returns true after content change', () => {
    const wired = makeWired('T');
    markDraftClean(CHECK_ID, wired, {});
    expect(isDraftDirty(CHECK_ID, { ...wired, meta: { name: 'U' } }, {})).toBe(true);
  });

  it('is per-checkId independent', () => {
    markDraftClean('a', makeWired('A'), {});
    markDraftClean('b', makeWired('B'), {});
    expect(isDraftDirty('a', makeWired('A'), {})).toBe(false);
    expect(isDraftDirty('b', makeWired('C'), {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schedule + Debounce
// ---------------------------------------------------------------------------

describe('scheduleDraftSave', () => {
  it('does not save immediately — waits for debounce', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    scheduleDraftSave(CHECK_ID, makeWired('T1'), {});
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(50);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('skips save if hash unchanged', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const wired = makeWired('T');

    // First save
    scheduleDraftSave(CHECK_ID, wired, {});
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockClear();

    // Same hash — no second save
    scheduleDraftSave(CHECK_ID, wired, {});
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('debounces multiple rapid changes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    // Three rapid changes
    scheduleDraftSave(CHECK_ID, makeWired('T1'), {});
    scheduleDraftSave(CHECK_ID, makeWired('T2'), {});
    scheduleDraftSave(CHECK_ID, makeWired('T3'), {});

    // All within debounce window — no saves yet
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(50);

    // Only one save — the latest
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('sends correct payload to server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const wired = makeWired('Test Check');
    const resources = { 'file.txt': 'hello' };

    scheduleDraftSave(CHECK_ID, wired, resources, 'editor');
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(50);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/checks/${CHECK_ID}/draft`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBeDefined();

    const body = JSON.parse(init.body as string) as DraftPayload;
    expect(body.meta.checkId).toBe(CHECK_ID);
    expect(body.meta.surface).toBe('editor');
    expect(body.wired).toEqual(wired);
    expect(body.resource_contents).toEqual(resources);

    fetchSpy.mockRestore();
  });

  it('does nothing when disabled', () => {
    disableDraftPersistenceForTests();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    scheduleDraftSave(CHECK_ID, makeWired('T'), {});
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Flush (immediate save)
// ---------------------------------------------------------------------------

describe('flushDraft', () => {
  it('saves immediately without waiting for debounce', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await flushDraft(CHECK_ID, makeWired('T'), {}, 'studio');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('marks draft clean after successful flush', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const wired = makeWired('T');
    await flushDraft(CHECK_ID, wired, {});

    expect(isDraftDirty(CHECK_ID, wired, {})).toBe(false);
    fetchSpy.mockRestore();
  });

  it('returns false when server fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const result = await flushDraft(CHECK_ID, makeWired('T'), {});
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fetch draft from server
// ---------------------------------------------------------------------------

describe('restoreDraftIfNewer', () => {
  it('returns null when server has no draft', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const result = await restoreDraftIfNewer(CHECK_ID, '2024-01-01T00:00:00.000Z');
    expect(result).toBeNull();
  });

  it('returns draft when server version is newer', async () => {
    const draftPayload: DraftPayload = {
      wired: makeWired('Restored'),
      resource_contents: {},
      meta: {
        checkId: CHECK_ID,
        contentHash: 'abc12345',
        savedAt: Date.now(),
        surface: 'editor',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(draftPayload), { status: 200 }),
    );

    const result = await restoreDraftIfNewer(CHECK_ID, '2024-01-01T00:00:00.000Z');
    expect(result).not.toBeNull();
    expect(result?.wired).toEqual(makeWired('Restored'));
  });

  it('returns null when server draft is older than local', async () => {
    const oldDate = new Date('2024-01-01').getTime();
    const draftPayload: DraftPayload = {
      wired: makeWired('Old'),
      resource_contents: {},
      meta: {
        checkId: CHECK_ID,
        contentHash: 'abc12345',
        savedAt: oldDate,
        surface: 'editor',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(draftPayload), { status: 200 }),
    );

    // Local is newer
    const result = await restoreDraftIfNewer(CHECK_ID, new Date().toISOString());
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await restoreDraftIfNewer(CHECK_ID, '2024-01-01T00:00:00.000Z');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearDraft
// ---------------------------------------------------------------------------

describe('clearDraft', () => {
  it('sends DELETE to server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    await clearDraft(CHECK_ID);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/api/checks/${CHECK_ID}/draft`);
    expect(init.method).toBe('DELETE');
    fetchSpy.mockRestore();
  });

  it('clears local hash tracking', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const wired = makeWired('T');
    markDraftClean(CHECK_ID, wired, {});
    expect(isDraftDirty(CHECK_ID, wired, {})).toBe(false);

    await clearDraft(CHECK_ID);

    // After clearing, hash is unknown → dirty
    expect(isDraftDirty(CHECK_ID, wired, {})).toBe(true);
  });
});