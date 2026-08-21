/** Вкладки Editor: keep-alive и отложенный persist `view`. */

export type EditorView = 'studio' | 'results' | 'form';

export function withVisitedEditorView(
  visited: ReadonlySet<EditorView>,
  view: EditorView,
): Set<EditorView> {
  if (visited.has(view)) {
    return visited instanceof Set ? visited : new Set(visited);
  }
  const next = new Set(visited);
  next.add(view);
  return next;
}

export function shouldKeepEditorView(
  view: EditorView,
  active: EditorView,
  visited: ReadonlySet<EditorView>,
): boolean {
  return view === active || visited.has(view);
}

/**
 * Persist поля `view` после paint — не блокировать Segmented active.
 * Возвращает cancel().
 */
export function scheduleEditorViewPersist(persist: () => void): () => void {
  let cancelled = false;
  const run = (): void => {
    if (!cancelled) {
      persist();
    }
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(run, { timeout: 200 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idleId);
    };
  }
  const timeoutId = window.setTimeout(run, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}

/**
 * Смена контента после двух rAF — сначала paint Segmented/chrome.
 */
export function scheduleDeferredEditorViewCommit(commit: () => void): () => void {
  let cancelled = false;
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (!cancelled) {
        commit();
      }
    });
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    window.cancelAnimationFrame(raf2);
  };
}
