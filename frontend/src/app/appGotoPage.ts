/**
 * Scroll form to page wrap by pageId (pk-goto-page).
 */
export function scrollFormToPageId(
  root: HTMLElement,
  pageId: string | undefined,
): void {
  if (!pageId) {
    root.querySelector('#section-test_suites')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    return;
  }
  const hosts = root.querySelectorAll('.pk-page-wrap');
  for (const host of Array.from(hosts)) {
    const input = host.querySelector<HTMLInputElement>('.pk-additional-key-input');
    if (input && input.value === pageId) {
      host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  root.querySelector('#section-test_suites')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function bindPkGotoPage(
  getRoot: () => HTMLElement | null,
  isStudioView: () => boolean,
): () => void {
  const onGotoPage = (event: Event) => {
    if (isStudioView()) {
      return;
    }
    const pageId = (event as CustomEvent<{ pageId?: string }>).detail?.pageId;
    const root = getRoot();
    if (!root) {
      return;
    }
    scrollFormToPageId(root, pageId);
  };
  window.addEventListener('pk-goto-page', onGotoPage);
  return () => {
    window.removeEventListener('pk-goto-page', onGotoPage);
  };
}
