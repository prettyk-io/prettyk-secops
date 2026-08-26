import { describe, expect, it } from 'vitest';
import {
  createEditorFolder,
  moveEditorFolderMember,
  readEditorFolders,
  removeEditorFolder,
  renameEditorFolder,
  replaceEditorFolderMember,
} from './studioFolders';

const suite = {
  test_suites: {
    pages: { login: { title: 'login' } },
    scenarios: [{ scenario_name: 'Вход', steps: [] }],
    test_data_constructor: [{ id: 'users', module_type: 'Модуль работы с данными' }],
  },
};

describe('studioFolders', () => {
  it('создаёт пустую папку с русским названием', () => {
    const created = createEditorFolder(suite, 'pages', 'Авторизация');

    expect(created).toBeDefined();
    expect(readEditorFolders(created?.data).pages).toEqual([
      { id: 'folder_1', title: 'Авторизация', members: [] },
    ]);
  });

  it('перемещает сценарий, синхронизирует Allure description и переименовывает папку', () => {
    const created = createEditorFolder(suite, 'scenarios', 'Smoke')!;
    const moved = moveEditorFolderMember(created.data, 'scenarios', 'Вход', created.folder.id)!;
    expect((moved as typeof suite).test_suites.scenarios[0]).toMatchObject({
      scenario_name: 'Вход',
      description: 'Smoke',
    });

    const renamed = renameEditorFolder(moved, 'scenarios', created.folder.id, 'Регресс')!;
    expect((renamed as typeof suite).test_suites.scenarios[0]).toMatchObject({
      description: 'Регресс',
    });
  });

  it('очищает ссылку и description при удалении папки или возврате в корень', () => {
    const created = createEditorFolder(suite, 'scenarios', 'Smoke')!;
    const moved = moveEditorFolderMember(created.data, 'scenarios', 'Вход', created.folder.id)!;
    const root = moveEditorFolderMember(moved, 'scenarios', 'Вход')!;
    expect((root as typeof suite).test_suites.scenarios[0]).not.toHaveProperty('description');

    const again = moveEditorFolderMember(root, 'scenarios', 'Вход', created.folder.id)!;
    const removed = removeEditorFolder(again, 'scenarios', created.folder.id)!;
    expect(readEditorFolders(removed).scenarios).toEqual([]);
    expect((removed as typeof suite).test_suites.scenarios[0]).not.toHaveProperty('description');
  });

  it('обновляет ссылки папки после rename и удаляет после удаления сущности', () => {
    const created = createEditorFolder(suite, 'modules', 'Данные')!;
    const moved = moveEditorFolderMember(created.data, 'modules', 'users', created.folder.id)!;
    const renamed = replaceEditorFolderMember(moved, 'modules', 'users', 'accounts');
    expect(readEditorFolders(renamed).modules[0]?.members).toEqual(['accounts']);

    const removed = replaceEditorFolderMember(renamed, 'modules', 'accounts');
    expect(readEditorFolders(removed).modules[0]?.members).toEqual([]);
  });

  it('сохраняет алфавитный порядок папки вопреки якорю drop', () => {
    const withFolder = {
      test_suites: {
        ...suite.test_suites,
        pages: {
          login: { title: 'login' },
          profile: { title: 'profile' },
        },
        editor_folders: {
          pages: [{ id: 'folder_1', title: 'Авторизация', members: ['login', 'profile'] }],
          scenarios: [],
          modules: [],
        },
      },
    };

    const reordered = moveEditorFolderMember(
      withFolder,
      'pages',
      'profile',
      'folder_1',
      { anchorMember: 'login', placement: 'before' },
    )!;

    expect(readEditorFolders(reordered).pages[0]?.members).toEqual(['login', 'profile']);
  });

  it('сортирует новые элементы группы: символы, цифры, Latin, кириллица', () => {
    const created = createEditorFolder(suite, 'scenarios', 'Smoke')!;
    const members = ['Якорь', 'zeta', '10-login', '!draft'];
    const sorted = members.reduce(
      (data, member) => moveEditorFolderMember(data, 'scenarios', member, created.folder.id)!,
      created.data,
    );

    expect(readEditorFolders(sorted).scenarios[0]?.members).toEqual([
      '!draft',
      '10-login',
      'zeta',
      'Якорь',
    ]);
  });
});
