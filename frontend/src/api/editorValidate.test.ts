import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateConstructorBackend, validateConstructorsBatch } from './editorValidate';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetchJson(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })),
  );
}

describe('validateConstructorBackend', () => {
  it('fail-closed: diagnostics не массив → null', async () => {
    stubFetchJson({ ok: true, diagnostics: null });
    expect(await validateConstructorBackend('x')).toBeNull();
    stubFetchJson({ ok: true });
    expect(await validateConstructorBackend('x')).toBeNull();
  });

  it('массив diagnostics → список', async () => {
    stubFetchJson({
      ok: false,
      diagnostics: [{ severity: 'error', message: 'bad', start: 0, end: 1 }],
    });
    const diags = await validateConstructorBackend('x');
    expect(diags).toHaveLength(1);
    expect(diags?.[0]?.message).toContain('bad');
  });
});

describe('validateConstructorsBatch', () => {
  it('fail-closed: results не массив → null', async () => {
    stubFetchJson({ ok: true, results: null });
    expect(
      await validateConstructorsBatch([{ id: 'a', path: '/p', text: 'x' }]),
    ).toBeNull();
    stubFetchJson({ ok: true });
    expect(
      await validateConstructorsBatch([{ id: 'a', path: '/p', text: 'x' }]),
    ).toBeNull();
  });

  it('пустой results → [] (не null)', async () => {
    stubFetchJson({ ok: true, results: [] });
    expect(
      await validateConstructorsBatch([{ id: 'a', path: '/p', text: 'x' }]),
    ).toEqual([]);
  });
});
