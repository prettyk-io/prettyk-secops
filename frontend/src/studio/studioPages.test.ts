import { describe, expect, it } from 'vitest';
import {
  addPage,
  isValidPageId,
  listPageIds,
  listPageTitles,
  normalizePagesInData,
  pageDisplayError,
  pageIdError,
  removePage,
  renamePage,
  renamePageTitle,
} from './studioPages';

describe('studioPages', () => {
  it('создаёт страницу: имя = ключ = title; пустое полотно', () => {
    const next = addPage({ meta: {} }, 'loginPage') as {
      test_suites: { pages: Record<string, { title: string; constructor: string }> };
    };
    const ids = listPageIds(next);
    expect(ids).toEqual(['loginPage']);
    const page = next.test_suites.pages.loginPage;
    expect(page?.title).toBe('loginPage');
    expect(String(page?.constructor).includes('@')).toBe(false);
    expect(listPageTitles(next)).toEqual(['loginPage']);
  });

  it('не создаёт дубликат; кириллица в имени запрещена', () => {
    const base = addPage({}, 'page_a');
    expect(addPage(base, 'page_a')).toBeUndefined();
    expect(pageDisplayError('Страница')).toBeTruthy();
    expect(pageDisplayError('login_page')).toBeUndefined();
    expect(pageDisplayError('')).toBeTruthy();
    expect(isValidPageId('login_page')).toBe(true);
    expect(pageIdError('логин')).toMatch(/латиница/);
  });

  it('нормализует страницы из Формы без constructor', () => {
    const raw = {
      test_suites: {
        pages: {
          mainPage: { title: 'Main', path: '/' },
          '': { title: '' },
        },
      },
    };
    const next = normalizePagesInData(raw) as {
      test_suites: { pages: Record<string, { constructor: string; path: string }> };
    };
    expect(next.test_suites.pages.mainPage?.constructor).toBe('');
    expect(next.test_suites.pages['']?.constructor).toBe('');
    expect(next.test_suites.pages.mainPage?.path).toBe('/');
  });

  it('переименовывает ключ и title вместе', () => {
    const created = addPage({}, 'page_a')!;
    const renamedTitle = renamePageTitle(created, 'page_a', 'login_page') as {
      test_suites: { pages: Record<string, { title: string; constructor: string }> };
    };
    expect(listPageIds(renamedTitle)).toEqual(['login_page']);
    expect(renamedTitle.test_suites.pages.login_page?.title).toBe('login_page');
    const renamed = renamePage(renamedTitle, 'login_page', 'other_page') as {
      test_suites: { pages: Record<string, unknown> };
    };
    expect(Object.keys(renamed.test_suites.pages)).toEqual(['other_page']);
    const removed = removePage(renamed, 'other_page') as {
      test_suites: { pages: Record<string, unknown> };
    };
    expect(Object.keys(removed.test_suites.pages)).toEqual([]);
  });
});
