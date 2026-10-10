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
  adoptDraftRevision,
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
import {
  disableDraftPersistenceForTests,
  enableDraftPersistenceForTests,
  DRAFT_SAVE_DEBOUNCE_MS,
  DRAFT_FLUSH_MAX_MS,
} from '../checks/draftPersistence';

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

/** 409-ответ сервера с чужим черновиком (revision — серверная версия). */
function conflict409(revision: number): Response {
  return new Response(
    JSON.stringify({
      conflict: true,
      revision,
      theirs: {
        wired: makeWired('Other tab edit'),
        resource_contents: {},
        meta: { checkId: CHECK_ID, contentHash: 'abc', savedAt: Date.now() },
      },
    }),
    { status: 409 },
  );
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

  it('adoptDraftRevision не понижает известный revision (monotonic)', () => {
    adoptDraftRevision(CHECK_ID, 3);
    expect(getDraftRevision(CHECK_ID)).toBe(3);
    adoptDraftRevision(CHECK_ID, 2);
    expect(getDraftRevision(CHECK_ID)).toBe(3);
    adoptDraftRevision(CHECK_ID, 5);
    expect(getDraftRevision(CHECK_ID)).toBe(5);
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(conflict409(3));

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('My edit'), {});
    expect(result.ok).toBe(false);
    const conflict = result as DraftConflict;
    expect(conflict.serverRevision).toBe(3);
    expect(conflict.ourRevision).toBe(1);
    expect((conflict.theirs.wired as { meta: { name: string } }).meta.name).toBe('Other tab edit');
    // DRAFT-CONFLICT-TRUTH: реальный конфликт адоптит серверную версию → следующий save пройдёт.
    expect(getDraftRevision(CHECK_ID)).toBe(3);
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
// DRAFT-CONFLICT-TRUTH: тихий adopt / дедуп эпизода
// ---------------------------------------------------------------------------

describe('DRAFT-CONFLICT-TRUTH', () => {
  it('свежая сессия + чужой черновик: тихий adopt + ретрай, без варнинга', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(conflict409(1))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 2, ok: true }), { status: 200 }),
      );

    let warned = 0;
    const unsub = onDraftConflict(() => {
      warned += 1;
    });

    const result = await saveDraftRevisioned(CHECK_ID, makeWired('T'), {});
    expect(result.ok).toBe(true);
    expect((result as DraftSaveResult).revision).toBe(2);
    expect(warned).toBe(0);
    expect(getPendingConflict(CHECK_ID)).toBeUndefined();
    expect(getDraftRevision(CHECK_ID)).toBe(2);

    const headers = fetchSpy.mock.calls.map(
      (c) => (c[1] as RequestInit).headers as Record<string, string>,
    );
    expect(headers[0]?.['X-Draft-Revision']).toBe('0');
    expect(headers[1]?.['X-Draft-Revision']).toBe('1');
    unsub();
  });

  it('известный revision + 409: один варнинг на эпизод, adopt разрешает следующий save', async () => {
    setDraftRevision(CHECK_ID, 1);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(conflict409(3))
      .mockResolvedValueOnce(conflict409(3)) // повторный autosave до разрешения — молчит
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 4, ok: true }), { status: 200 }),
      );

    let warned = 0;
    const unsub = onDraftConflict(() => {
      warned += 1;
    });

    const r1 = await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(r1.ok).toBe(false);
    expect(warned).toBe(1);
    expect(getDraftRevision(CHECK_ID)).toBe(3); // adopt серверной версии

    const r2 = await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(r2.ok).toBe(false);
    expect(warned).toBe(1); // дедуп по serverRevision

    const r3 = await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(r3.ok).toBe(true);
    expect(warned).toBe(1);

    const third = fetchSpy.mock.calls[2]?.[1] as RequestInit;
    expect((third.headers as Record<string, string>)['X-Draft-Revision']).toBe('3');
    unsub();
  });

  it('после успешного save новый эпизод конфликта озвучивается снова', async () => {
    setDraftRevision(CHECK_ID, 1);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(conflict409(3))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 4, ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(conflict409(5))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 6, ok: true }), { status: 200 }),
      );

    let warned = 0;
    const unsub = onDraftConflict(() => {
      warned += 1;
    });

    await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(warned).toBe(1); // эпизод serverRevision=3

    await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(warned).toBe(1); // успех закрыл эпизод

    await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(warned).toBe(2); // новый эпизод serverRevision=5

    await saveDraftRevisioned(CHECK_ID, makeWired('A'), {});
    expect(warned).toBe(2);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// DRAFT-AUTOSAVE-CADENCE: дебаунс / потолок / сериализация
// ---------------------------------------------------------------------------

describe('DRAFT-AUTOSAVE-CADENCE', () => {
  function okResponse(revision: number): Response {
    return new Response(JSON.stringify({ ok: true, revision }), { status: 200 });
  }

  it('серия быстрых правок = один PUT с последним содержимым', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(1));
      scheduleRevisionedSave(CHECK_ID, makeWired('v1'), {});
      await vi.advanceTimersByTimeAsync(100);
      scheduleRevisionedSave(CHECK_ID, makeWired('v2'), {});
      await vi.advanceTimersByTimeAsync(100);
      scheduleRevisionedSave(CHECK_ID, makeWired('v3'), {});
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
      );
      expect((body.wired as { meta: { name: string } }).meta.name).toBe('v3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('повтор того же содержимого не шлёт PUT (dedup)', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(1));
      scheduleRevisionedSave(CHECK_ID, makeWired('same'), {});
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      scheduleRevisionedSave(CHECK_ID, makeWired('same'), {});
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('потолок 30s: при непрерывных правках сохраняем без паузы', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(1));
      // «Печатает непрерывно»: правка каждые 500ms, дебаунс ни разу не срабатывает.
      for (let i = 0; i < 62; i++) {
        scheduleRevisionedSave(CHECK_ID, makeWired(`edit-${i}`), {});
        await vi.advanceTimersByTimeAsync(500);
      }
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);
      const last = JSON.parse(
        (fetchSpy.mock.calls.at(-1)?.[1] as RequestInit).body as string,
      );
      expect((last.wired as { meta: { name: string } }).meta.name).toBe('edit-61');
    } finally {
      vi.useRealTimers();
    }
  });

  it('явный save отменяет отложенный и сохраняет актуальное', async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(1));
      scheduleRevisionedSave(CHECK_ID, makeWired('stale'), {});
      const r = await flushDraftRevisioned(CHECK_ID, makeWired('fresh'), {});
      expect(r.ok).toBe(true);
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(
        (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
      );
      expect((body.wired as { meta: { name: string } }).meta.name).toBe('fresh');
    } finally {
      vi.useRealTimers();
    }
  });

  it('параллельные PUT сериализуются; следующая правка идёт с адоптированным revision', async () => {
    vi.useFakeTimers();
    try {
      let releaseFirst: (r: Response) => void = () => {};
      const gate = new Promise<Response>((resolve) => {
        releaseFirst = resolve;
      });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValueOnce(gate)
        .mockResolvedValueOnce(okResponse(2));
      let warned = 0;
      const unsub = onDraftConflict(() => {
        warned += 1;
      });

      scheduleRevisionedSave(CHECK_ID, makeWired('v1'), {});
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 10); // PUT #1 — висит
      scheduleRevisionedSave(CHECK_ID, makeWired('v2'), {}); // правка в полёте
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 10); // debounce v2 — in-flight
      expect(fetchSpy).toHaveBeenCalledTimes(1); // параллельного PUT нет

      releaseFirst(okResponse(2));
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 50);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const second = fetchSpy.mock.calls[1]?.[1] as RequestInit;
      expect((second.headers as Record<string, string>)['X-Draft-Revision']).toBe('2');
      const body = JSON.parse(second.body as string);
      expect((body.wired as { meta: { name: string } }).meta.name).toBe('v2');
      expect(warned).toBe(0);
      unsub();
    } finally {
      vi.useRealTimers();
    }
  });

  it('явный save во время in-flight: старое не перезаписывает новое', async () => {
    vi.useFakeTimers();
    try {
      let releaseFirst: (r: Response) => void = () => {};
      const gate = new Promise<Response>((resolve) => {
        releaseFirst = resolve;
      });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValueOnce(gate)
        .mockResolvedValueOnce(okResponse(2));

      scheduleRevisionedSave(CHECK_ID, makeWired('old'), {});
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS + 10); // PUT(old) — висит
      const flushPromise = flushDraftRevisioned(CHECK_ID, makeWired('new'), {});
      await vi.advanceTimersByTimeAsync(50);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // flush ждёт in-flight

      releaseFirst(okResponse(2));
      await vi.advanceTimersByTimeAsync(50);
      const r = await flushPromise;
      expect(r.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const second = fetchSpy.mock.calls[1]?.[1] as RequestInit;
      const body = JSON.parse(second.body as string);
      expect((body.wired as { meta: { name: string } }).meta.name).toBe('new');

      // Отложенного stale-PUT после явного save не остаётся.
      await vi.advanceTimersByTimeAsync(DRAFT_FLUSH_MAX_MS + 50);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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