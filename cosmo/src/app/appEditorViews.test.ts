// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  scheduleDeferredEditorViewCommit,
  scheduleEditorViewPersist,
  shouldKeepEditorView,
  withVisitedEditorView,
  type EditorView,
} from './appEditorViews';

describe('appEditorViews', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('withVisitedEditorView добавляет вкладку один раз', () => {
    const a = withVisitedEditorView(new Set<EditorView>(['form']), 'studio');
    expect([...a].sort()).toEqual(['form', 'studio']);
    const b = withVisitedEditorView(a, 'studio');
    expect(b).toBe(a);
  });

  it('shouldKeepEditorView держит active и уже посещённые', () => {
    const visited = new Set<EditorView>(['form', 'studio']);
    expect(shouldKeepEditorView('form', 'results', visited)).toBe(true);
    expect(shouldKeepEditorView('studio', 'results', visited)).toBe(true);
    expect(shouldKeepEditorView('results', 'results', visited)).toBe(true);
    expect(shouldKeepEditorView('results', 'form', new Set(['form']))).toBe(false);
  });

  it('scheduleEditorViewPersist не вызывает persist синхронно', () => {
    vi.stubGlobal(
      'requestIdleCallback',
      (cb: IdleRequestCallback) => {
        const id = window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 1 }), 0);
        return id;
      },
    );
    vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
    const persist = vi.fn();
    const cancel = scheduleEditorViewPersist(persist);
    expect(persist).not.toHaveBeenCalled();
    cancel();
  });

  it('scheduleDeferredEditorViewCommit не зовёт commit синхронно', () => {
    const commit = vi.fn();
    const cancel = scheduleDeferredEditorViewCommit(commit);
    expect(commit).not.toHaveBeenCalled();
    cancel();
  });
});
