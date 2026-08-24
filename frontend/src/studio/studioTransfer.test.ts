/**
 * IMPX-6 (Boss): sanity extract→merge roundtrip.
 */
import { describe, it, expect } from 'vitest';
import {
  extractEditorBlocks,
  mergeEditorBlocks,
  countBlocks,
} from './studioTransfer';

function makeSource(): unknown {
  return {
    meta: { project_id: 'source' },
    test_suites: {
      pages: {
        login_page: { title: 'login_page', path: '/login', constructor: 'Нажать кнопку' },
        home_page: { title: 'home_page', path: '/', constructor: '' },
      },
      scenarios: [
        { scenario_name: 'smoke', steps: [{ id: 's1', constructor: 'Нажать login_page' }] },
      ],
      test_data_constructor: [
        { id: 'auth_main', label: 'auth_main', module_type: 'Авторизация', auth_fields: { constructor: '' } },
        { id: 'openapi_core', label: 'openapi_core', module_type: 'OpenAPI', openapi_fields: {} },
      ],
      fuzzers: [
        { id: 'fuzz_search', label: 'fuzz_search', algorithm: 'sniper', targets: [] },
      ],
      imports: [
        { path: 'resources/payloads.txt', kind: 'data_file', as: 'payloads' },
      ],
      editor_folders: {
        pages: [{ id: 'folder_1', title: 'Auth', members: ['login_page'] }],
        scenarios: [],
        modules: [],
      },
    },
  };
}

describe('studioTransfer', () => {
  it('extractEditorBlocks извлекает все editor-блоки', () => {
    const blocks = extractEditorBlocks(makeSource());
    expect(Object.keys(blocks.pages)).toEqual(['login_page', 'home_page']);
    expect(blocks.scenarios).toHaveLength(1);
    expect(blocks.modules).toHaveLength(2);
    expect(blocks.fuzzers).toHaveLength(1);
    expect(blocks.resources).toHaveLength(1);
    expect(blocks.folders.pages).toHaveLength(1);
    expect(countBlocks(blocks)).toEqual({
      pages: 2,
      scenarios: 1,
      modules: 2,
      fuzzers: 1,
      resources: 1,
    });
  });

  it('extract не мутирует source formData', () => {
    const src = makeSource();
    const snapshot = JSON.stringify(src);
    extractEditorBlocks(src);
    expect(JSON.stringify(src)).toBe(snapshot);
  });

  it('merge вливает все блоки без дублей', () => {
    const blocks = extractEditorBlocks(makeSource());
    const target = {
      meta: { project_id: 'target' },
      test_suites: {
        pages: { existing_page: { title: 'existing_page', path: '', constructor: '' } },
        scenarios: [],
        test_data_constructor: [],
        fuzzers: [],
        imports: [],
        editor_folders: { pages: [], scenarios: [], modules: [] },
      },
    };
    const { data, report } = mergeEditorBlocks(target, blocks);
    const suites = (data as any).test_suites;
    expect(Object.keys(suites.pages).sort()).toEqual(['existing_page', 'home_page', 'login_page']);
    expect(suites.scenarios).toHaveLength(1);
    expect(suites.test_data_constructor).toHaveLength(2);
    expect(suites.fuzzers).toHaveLength(1);
    expect(suites.imports).toHaveLength(1);
    expect(report.added).toEqual({
      pages: 2,
      scenarios: 1,
      modules: 2,
      fuzzers: 1,
      resources: 1,
    });
    // папка перенесена
    expect(suites.editor_folders.pages).toHaveLength(1);
    expect(suites.editor_folders.pages[0].id).toBe('folder_1');
  });

  it('merge не дублирует уже существующие сущности', () => {
    const blocks = extractEditorBlocks(makeSource());
    const target = {
      test_suites: {
        pages: {
          login_page: { title: 'login_page', path: '/different', constructor: 'old' },
        },
        scenarios: [{ scenario_name: 'smoke', steps: [] }],
        test_data_constructor: [{ id: 'auth_main', label: 'auth_main', module_type: 'Авторизация' }],
        fuzzers: [{ id: 'fuzz_search', label: 'fuzz_search' }],
        imports: [{ path: 'resources/other.txt', kind: 'data_file', as: 'payloads' }],
        editor_folders: { pages: [], scenarios: [], modules: [] },
      },
    };
    const { data, report } = mergeEditorBlocks(target, blocks);
    const suites = (data as any).test_suites;
    // дубли пропущены → добавлено только по одному не-дублю
    expect(Object.keys(suites.pages).sort()).toEqual(['home_page', 'login_page']);
    expect(suites.pages.login_page.constructor).toBe('old'); // не перезаписано
    expect(suites.scenarios).toHaveLength(1);
    expect(suites.test_data_constructor).toHaveLength(2);
    expect(suites.fuzzers).toHaveLength(1);
    expect(suites.imports).toHaveLength(1);
    expect(report.added).toEqual({
      pages: 1,
      scenarios: 0,
      modules: 1,
      fuzzers: 0,
      resources: 0,
    });
  });

  it('merge не мутирует target и blocks', () => {
    const blocks = extractEditorBlocks(makeSource());
    const target = { test_suites: { pages: {} } };
    const blocksSnapshot = JSON.stringify(blocks);
    const targetSnapshot = JSON.stringify(target);
    mergeEditorBlocks(target, blocks);
    expect(JSON.stringify(blocks)).toBe(blocksSnapshot);
    expect(JSON.stringify(target)).toBe(targetSnapshot);
  });

  it('папки-дубли не плодятся', () => {
    const blocks = extractEditorBlocks(makeSource());
    const target = {
      test_suites: {
        pages: { login_page: { title: 'login_page' } },
        editor_folders: {
          pages: [{ id: 'folder_1', title: 'Existing', members: ['login_page'] }],
          scenarios: [],
          modules: [],
        },
      },
    };
    const { data } = mergeEditorBlocks(target, blocks);
    const folders = (data as any).test_suites.editor_folders.pages;
    expect(folders).toHaveLength(1);
    expect(folders[0].title).toBe('Existing');
  });
});
