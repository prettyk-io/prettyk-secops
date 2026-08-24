/**
 * Идентификаторы страниц манифеста (test_suites.pages) — для Monaco CodeLens.
 */

export function collectPageIds(formData: unknown): string[] {
  if (formData === null || typeof formData !== 'object' || Array.isArray(formData)) {
    return [];
  }
  const suites = (formData as Record<string, unknown>).test_suites;
  if (suites === null || typeof suites !== 'object' || Array.isArray(suites)) {
    return [];
  }
  const pages = (suites as Record<string, unknown>).pages;
  if (pages === null || typeof pages !== 'object' || Array.isArray(pages)) {
    return [];
  }
  return collectPageIdsFromPages(pages as Record<string, unknown>);
}

/** Кэш по ссылке pages: при правках формы pages не меняется. */
const pageIdsCache = new WeakMap<object, string[]>();

function collectPageIdsFromPages(pages: Record<string, unknown>): string[] {
  const cached = pageIdsCache.get(pages);
  if (cached) {
    return cached;
  }
  const result = Object.keys(pages).filter((key) => key.length > 0);
  pageIdsCache.set(pages, result);
  return result;
}
