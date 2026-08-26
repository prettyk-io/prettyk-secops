/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  saveDraftRevisioned,
  flushDraftRevisioned,
  scheduleRevisionedSave,
  getDraftRevision,
  setDraftRevision,
  clearDraftRevision,
  onDraftConflict,
  getPendingConflict,
  resolveConflict,
  diffDslLines,
  wiredsAreEqual,
  resourcesAreEqual,
  __resetRevisionStateForTests,
  type DraftSaveResult,
  type DraftConflict,
  type PendingConflict,
} from '../checks/draftRevision';
import { disableDraftPersistenceForTests, enableDraftPersistenceForTests } from '../checks/draftPersistence';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CHECK_ID = 'test-check-456';

beforeEach(() => {
  __resetRevisionStateForTests();
  disableDraftPersistenceForTests();
  enableDraftPersistenceForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  __resetRevisionStateForTests();
  vi.restoreAllMocks();
});

function makeWired(title: string): Record<string, unknown> {
  return { meta: { name: title, target: 'https://example.com' }, test_suites: { scenarios: [] } };
}

// ---------------------------------------------------------------------------
// Revision state
// ---------------------------------------------------------------------------

describe('Revision state management', () => {
  it('starts with no revision', () => {
    expect(getDraftRevision(CHECK_ID)).toBeUndefined();
  });

  it('setDraftRevision → getDraftRevision round-trips', () => {
    setDraftRevision(CHECK_ID, 5);
    expect(getDraftRevision(CHECK_ID)).toBe(5);
  });

  it('clearDraftRevision removes revision', () => {
    setDraftRevision(CHECK_ID, 5);
    clearDraftRevision(CHECK_ID);
    expect(getDraftRevision(CHECK_ID)).toBeUndefined();
  });

  it('revisions are per-checkId', () => {
    setDraftRevision('a', 1);
    setDraftRevision('b', 2);
    expect(getDraftRevision('a')).toBe(1);
    expect(getDraftRevision('b')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// saveDraftRevisioned
// ---------------------------------------------------------------------------

describe('saveDraftRevisioned', () => {
  it('first save (no revision) sends expectedRevision=0 and gets revision=1', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ revision: 1, ok: true }), { status: 200 }),
    );

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(result.ok).toBe(true);
    expect((result as DraftSaveResult).revision).toBe(1);
    expect(getDraftRevision(CHECK_ID)).toBe(1);
  });

  it('second save sends expectedRevision=1', async () => {
    setDraftRevision(CHECK_ID, 1);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ revision: 2, ok: true }), { status: 200 }),
    );

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(result.ok).toBe(true);
    expect((result as DraftSaveResult).revision).toBe(2);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Draft-Revision']).toBe('1');
  });

  it('conflict (409) returns DraftConflict', async () => {
    setDraftRevision(CHECK_ID, 1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conflict: true,
          revision: 3,
          theirs: {
            wired: makeWired('Other tab edit'),
            resource_contents: {},
            meta: { checkId: CHECK_ID, contentHash: 'abc', savedAt: Date.now() },
          },
        }),
        { status: 409 },
      ),
    );

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('My edit'), {});
    expect(result.ok).toBe(false);
    const conflict = result as DraftConflict;
    expect(conflict.serverRevision).toBe(3);
    expect(conflict.ourRevision).toBe(1);
    expect((conflict.theirs.wired as { meta: { name: string } }).meta.name).toBe('Other tab edit');
  });

  it('on network error, returns ok:true with current revision (degraded mode)', async () => {
    setDraftRevision(CHECK_ID, 5);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(result.ok).toBe(true);
    expect((result as DraftSaveResult).revision).toBe(5);
  });

  it('on non-200 non-409, returns conflict-like', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'internal' }), { status: 500 }),
    );

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(result.ok).toBe(false);
    expect((result as DraftConflict).serverRevision).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Conflict reporting
// ---------------------------------------------------------------------------

describe('Conflict reporting', () => {
  it('reports conflict via listener on 409', async () => {
    setDraftRevision(CHECK_ID, 1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conflict: true,
          revision: 3,
          theirs: {
            wired: makeWired('Other'),
            resource_contents: {},
            meta: { checkId: CHECK_ID, contentHash: 'abc', savedAt: Date.now() },
          },
        }),
        { status: 409 },
      ),
    );

    let caught: PendingConflict | undefined;
    const unsub = onDraftConflict((c) => { caught = c; });

    await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(caught).toBeDefined();
    expect(caught?.checkId).toBe(CHECK_ID);
    expect(caught?.conflict.serverRevision).toBe(3);

    unsub();
  });

  it('getPendingConflict returns unresolved conflict', async () => {
    setDraftRevision(CHECK_ID, 1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conflict: true,
          revision: 2,
          theirs: {
            wired: makeWired('Other'),
            resource_contents: {},
            meta: { checkId: CHECK_ID, contentHash: 'abc', savedAt: Date.now() },
          },
        }),
        { status: 409 },
      ),
    );

    await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});

    const pending = getPendingConflict(CHECK_ID);
    expect(pending).toBeDefined();
    expect(pending?.conflict.serverRevision).toBe(2);
  });

  it('resolveConflict clears pending and sets revision', async () => {
    setDraftRevision(CHECK_ID, 1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          conflict: true,
          revision: 2,
          theirs: {
            wired: makeWired('Other'),
            resource_contents: {},
            meta: { checkId: CHECK_ID, contentHash: 'abc', savedAt: Date.now() },
          },
        }),
        { status: 409 },
      ),
    );

    await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(getPendingConflict(CHECK_ID)).toBeDefined();

    resolveConflict(CHECK_ID, 5);
    expect(getPendingConflict(CHECK_ID)).toBeUndefined();
    expect(getDraftRevision(CHECK_ID)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

describe('diffDslLines', () => {
  it('identical texts produce all space markers', () => {
    const result = diffDslLines('line1\nline2', 'line1\nline2');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.marker === ' ')).toBe(true);
  });

  it('added line produces + marker', () => {
    const result = diffDslLines('line1', 'line1\nline2');
    expect(result[0]!.marker).toBe(' ');
    expect(result[1]!.marker).toBe('+');
    expect(result[1]!.text).toBe('line2');
  });

  it('removed line produces - marker', () => {
    const result = diffDslLines('line1\nline2', 'line1');
    expect(result[0]!.marker).toBe(' ');
    expect(result[1]!.marker).toBe('-');
    expect(result[1]!.text).toBe('line2');
  });

  it('changed line produces both - and + markers', () => {
    const result = diffDslLines('old line', 'new line');
    expect(result[0]!.marker).toBe('-');
    expect(result[0]!.text).toBe('old line');
    expect(result[1]!.marker).toBe('+');
    expect(result[1]!.text).toBe('new line');
  });
});

describe('wiredsAreEqual', () => {
  it('equal objects return true', () => {
    expect(wiredsAreEqual({ a: 1 }, { a: 1 })).toBe(true);
  });

  it('different objects return false', () => {
    expect(wiredsAreEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('resourcesAreEqual', () => {
  it('equal maps return true', () => {
    expect(resourcesAreEqual({ a: '1' }, { a: '1' })).toBe(true);
  });

  it('different values return false', () => {
    expect(resourcesAreEqual({ a: '1' }, { a: '2' })).toBe(false);
  });

  it('different keys return false', () => {
    expect(resourcesAreEqual({ a: '1' }, { b: '1' })).toBe(false);
  });
});