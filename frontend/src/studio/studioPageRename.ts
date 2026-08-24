/**
 * renamePageTitle collision + rebuild helpers (S3776).
 */

type AsRecord = (value: unknown) => Record<string, unknown> | undefined;

export function pageTitleCollision(
  pages: Record<string, unknown>,
  pageId: string,
  title: string,
  asRecord: AsRecord,
): boolean {
  for (const [key, value] of Object.entries(pages)) {
    if (key === pageId) {
      continue;
    }
    if (key === title) {
      return true;
    }
    const existing = asRecord(value)?.title;
    if (typeof existing === 'string' && existing.trim() === title) {
      return true;
    }
  }
  return false;
}

export function rebuildPagesWithRenamedId(
  pages: Record<string, unknown>,
  pageId: string,
  title: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const nextPages: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pages)) {
    if (key === pageId) {
      nextPages[title] = {
        ...body,
        title,
        path: typeof body.path === 'string' ? body.path : '',
        constructor: typeof body['constructor'] === 'string' ? body['constructor'] : '',
      };
    } else {
      nextPages[key] = value;
    }
  }
  return nextPages;
}
