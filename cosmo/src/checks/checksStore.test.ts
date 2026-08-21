// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetChecksStoreForTests,
  createCheck,
  deleteCheck,
  deleteDraftCheck,
  getCheck,
  listChecks,
  mergeChecksSnapshots,
  saveCheckPrepared,
  touchOpened,
  updateCheck,
} from './checksStore';
import { CHECKS_STORAGE_KEY, type CheckInstance } from './types';

afterEach(() => {
  __resetChecksStoreForTests();
});

describe('checksStore', () => {
  it('создаёт и листит CheckInstance', () => {
    const item = createCheck({
      wired: { meta: { name: 'Lab check' } },
      status: 'draft',
    });
    expect(item.check_id).toBeTruthy();
    expect(item.title).toBe('Lab check');
    expect(listChecks().map((c) => c.check_id)).toContain(item.check_id);
    expect(getCheck(item.check_id)?.status).toBe('draft');
  });

  it('updateCheck пишет wired; deleteDraft только без runs', () => {
    const item = createCheck({ wired: { a: 1 }, status: 'draft' });
    updateCheck(item.check_id, { wired: { a: 2 } });
    expect((getCheck(item.check_id)?.wired as { a: number }).a).toBe(2);
    expect(deleteDraftCheck(item.check_id)).toBe(true);
    expect(getCheck(item.check_id)).toBeUndefined();
  });

  it('не удаляет check с runs через deleteDraft', () => {
    const item = createCheck({ wired: {}, status: 'draft' });
    const snap = JSON.parse(window.localStorage.getItem(CHECKS_STORAGE_KEY)!);
    snap.items[0].runs = [{ run_id: 'r1', status: 'success' }];
    window.localStorage.setItem(CHECKS_STORAGE_KEY, JSON.stringify(snap));
    expect(deleteDraftCheck(item.check_id)).toBe(false);
    expect(getCheck(item.check_id)).toBeTruthy();
  });

  it('updated_at только при изменении содержимого; touchOpened не двигает', () => {
    const item = createCheck({ wired: { a: 1 }, status: 'draft' });
    const t0 = getCheck(item.check_id)!.updated_at;
    updateCheck(item.check_id, { view: 'studio' });
    expect(getCheck(item.check_id)!.updated_at).toBe(t0);
    updateCheck(item.check_id, { wired: { a: 1 } });
    expect(getCheck(item.check_id)!.updated_at).toBe(t0);
    touchOpened(item.check_id);
    expect(getCheck(item.check_id)!.updated_at).toBe(t0);
    expect(getCheck(item.check_id)!.last_opened_at).toBeTruthy();
    updateCheck(item.check_id, { wired: { a: 2 } });
    expect(getCheck(item.check_id)!.updated_at).not.toBe(t0);
  });

  it('deleteCheck удаляет instance с runs', () => {
    const item = createCheck({ wired: {}, status: 'draft' });
    const snap = JSON.parse(window.localStorage.getItem(CHECKS_STORAGE_KEY)!);
    snap.items[0].runs = [{ run_id: 'r1', status: 'success' }];
    window.localStorage.setItem(CHECKS_STORAGE_KEY, JSON.stringify(snap));
    expect(deleteCheck(item.check_id)).toBe(true);
    expect(getCheck(item.check_id)).toBeUndefined();
  });

  it('saveCheckPrepared пишет буфер и draft → ready без правок', () => {
    const item = createCheck({ wired: { a: 1 }, status: 'draft' });
    const saved = saveCheckPrepared(item.check_id, {
      wired: { a: 1 },
      resource_contents: { urls: 'x' },
      view: 'form',
    });
    expect(saved?.status).toBe('ready');
    expect(getCheck(item.check_id)?.status).toBe('ready');
    expect(getCheck(item.check_id)?.resource_contents?.urls).toBe('x');
    expect(getCheck(item.check_id)?.view).toBe('form');
  });

  it('mergeChecksSnapshots берёт более свежий updated_at', () => {
    const base: CheckInstance = {
      check_id: 'chk_a',
      title: 'Local',
      status: 'draft',
      created_at: '2026-08-11T00:00:00.000Z',
      updated_at: '2026-08-11T01:00:00.000Z',
      wired: {},
      runs: [],
    };
    const remoteNewer: CheckInstance = {
      ...base,
      title: 'Remote',
      updated_at: '2026-08-11T02:00:00.000Z',
      status: 'ready',
    };
    const merged = mergeChecksSnapshots(
      { version: 1, items: [base] },
      { version: 1, items: [remoteNewer] },
    );
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]?.title).toBe('Remote');
    const keepLocal = mergeChecksSnapshots(
      { version: 1, items: [base] },
      {
        version: 1,
        items: [{ ...base, title: 'Stale remote', updated_at: '2026-08-10T00:00:00.000Z' }],
      },
    );
    expect(keepLocal.items[0]?.title).toBe('Local');
  });
});
