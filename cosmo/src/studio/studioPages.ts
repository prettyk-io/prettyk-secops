/**
 * Мутации pages в formData из Редактора (создать / переименовать / удалить).
 * Имя листа = python-id = JSON-ключ = title.
 */
import { isPlaceholderAdditionalKey } from '../utils/keys';
import { defaultConstructorText } from './defaultConstructor';
import { displayNameError, isPythonTechId } from './pythonIds';
import { pageTitleCollision, rebuildPagesWithRenamedId } from './studioPageRename';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function ensurePagesRoot(formData: unknown): {
  root: Record<string, unknown>;
  suites: Record<string, unknown>;
  pages: Record<string, unknown>;
} {
  const root = { ...(asRecord(formData) ?? {}) };
  const suites = { ...(asRecord(root.test_suites) ?? {}) };
  const pages = { ...(asRecord(suites.pages) ?? {}) };
  return { root, suites, pages };
}

function commitPages(
  root: Record<string, unknown>,
  suites: Record<string, unknown>,
  pages: Record<string, unknown>,
): unknown {
  return {
    ...root,
    test_suites: {
      ...suites,
      pages,
    },
  };
}

/** Ключ pages.{id}: python-id. */
export function isValidPageId(pageId: string): boolean {
  return isPythonTechId(pageId);
}

export function pageIdError(pageId: string): string | undefined {
  const id = pageId.trim();
  if (!id) {
    return 'Укажите имя модели данных';
  }
  if (!isValidPageId(id)) {
    return 'Имя: латиница/цифры/_; с буквы или _ (login_page)';
  }
  return undefined;
}

export function pageDisplayError(name: string): string | undefined {
  return displayNameError(name, 'page');
}

export function listPageIds(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const pages = asRecord(suites?.pages);
  if (!pages) {
    return [];
  }
  return Object.keys(pages);
}

export function listPageTitles(formData: unknown): string[] {
  const suites = asRecord(asRecord(formData)?.test_suites);
  const pages = asRecord(suites?.pages);
  if (!pages) {
    return [];
  }
  const titles: string[] = [];
  for (const value of Object.values(pages)) {
    const title = asRecord(value)?.title;
    if (typeof title === 'string' && title.trim()) {
      titles.push(title.trim());
    }
  }
  return titles;
}

export function allocatePendingPageKey(pages: Record<string, unknown>): string {
  let n = 1;
  while (`_page_${String(n)}` in pages) {
    n += 1;
  }
  return `_page_${String(n)}`;
}

export function emptyPageBody(displayTitle: string, pageKey = '_page', title?: string): Record<string, unknown> {
  const id = displayTitle.trim() || pageKey;
  return {
    title: title?.trim() || id,
    path: '',
    constructor: defaultConstructorText(),
  };
}

function normalizePageBody(
  key: string,
  value: unknown,
): { body: Record<string, unknown>; changed: boolean } {
  const body = asRecord(value) ?? {};
  const next: Record<string, unknown> = { ...body };
  let changed = false;
  if (typeof next['constructor'] !== 'string') {
    next['constructor'] = '';
    changed = true;
  }
  if (typeof next.path !== 'string') {
    next.path = '';
    changed = true;
  }
  if (typeof next.title !== 'string') {
    next.title = isPlaceholderAdditionalKey(key) ? '' : key;
    changed = true;
  }
  return { body: next, changed };
}

/**
 * Страницы из Формы часто без `constructor` / с ключом-заглушкой.
 * Нормализует тела; ключи не трогает (переименование — в UI).
 */
export function normalizePagesInData(formData: unknown): unknown {
  const { root, suites, pages } = ensurePagesRoot(formData);
  if (Object.keys(pages).length === 0 && !asRecord(suites.pages)) {
    return formData;
  }
  let changed = false;
  const nextPages: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pages)) {
    const normalized = normalizePageBody(key, value);
    nextPages[key] = normalized.body;
    if (normalized.changed) {
      changed = true;
    }
  }
  if (!changed) {
    return formData;
  }
  return commitPages(root, suites, nextPages);
}

/**
 * Создать страницу: имя = python-id = JSON-ключ = title.
 */
export function addPage(formData: unknown, displayTitle: string, title?: string): unknown | undefined {
  const id = displayTitle.trim();
  if (pageDisplayError(id) || pageIdError(id)) {
    return undefined;
  }
  const { root, suites, pages } = ensurePagesRoot(formData);
  if (id in pages) {
    return undefined;
  }
  for (const value of Object.values(pages)) {
    const existing = asRecord(value)?.title;
    if (typeof existing === 'string' && existing.trim() === id) {
      return undefined;
    }
  }
  pages[id] = emptyPageBody(id, id, title);
  return commitPages(root, suites, pages);
}

export function removePage(formData: unknown, pageId: string): unknown {
  const { root, suites, pages } = ensurePagesRoot(formData);
  if (!(pageId in pages)) {
    return formData;
  }
  const next = { ...pages };
  delete next[pageId];
  return commitPages(root, suites, next);
}

/** Переименовать JSON-ключ страницы (tech); конфликт / пусто / невалид → undefined. */
export function renamePage(
  formData: unknown,
  fromId: string,
  toId: string,
): unknown | undefined {
  const nextId = toId.trim();
  if (!nextId || nextId === fromId) {
    return formData;
  }
  if (pageIdError(nextId)) {
    return undefined;
  }
  const { root, suites, pages } = ensurePagesRoot(formData);
  if (!(fromId in pages) || nextId in pages) {
    return undefined;
  }
  const body = asRecord(pages[fromId]) ?? emptyPageBody(nextId);
  return commitPages(
    root,
    suites,
    rebuildPagesWithRenamedId(pages, fromId, nextId, body),
  );
}

/**
 * Переименовать модель: новое имя = python-id = JSON-ключ = title.
 */
export function renamePageTitle(
  formData: unknown,
  pageId: string,
  nextTitle: string,
): unknown | undefined {
  const title = nextTitle.trim();
  if (pageDisplayError(title) || pageIdError(title)) {
    return undefined;
  }
  const { root, suites, pages } = ensurePagesRoot(formData);
  if (!(pageId in pages)) {
    return undefined;
  }
  if (pageTitleCollision(pages, pageId, title, asRecord)) {
    return undefined;
  }
  if (title === pageId) {
    const body = asRecord(pages[pageId]) ?? emptyPageBody(title);
    pages[pageId] = { ...body, title };
    return commitPages(root, suites, pages);
  }
  const body = asRecord(pages[pageId]) ?? emptyPageBody(title);
  return commitPages(
    root,
    suites,
    rebuildPagesWithRenamedId(pages, pageId, title, body),
  );
}
