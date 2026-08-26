import { describe, expect, it } from 'vitest';
import {
  collectStudioNodes,
  getAtPointer,
  setAtPointer,
} from './collectStudioNodes';
import { pageTabId, scenarioTabId } from './studioTabs';

describe('collectStudioNodes', () => {
  it('собирает pages и scenarios; дерево показывает python-id', () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: { login: { title: 'login', constructor: 'Элемент x = css .a' } },
        scenarios: [
          {
            scenario_name: 'smoke',
            steps: [{ id: 'open', constructor: 'Открыть ${url}' }],
          },
        ],
      },
    });
    expect(tree.pages).toHaveLength(1);
    expect(tree.pages[0]?.pageId).toBe('login');
    expect(tree.pages[0]?.title).toBe('login');
    expect(tree.pages[0]?.needsName).toBe(false);
    expect(tree.pages[0]?.invalidId).toBe(false);
    expect(tree.pages[0]?.tabId).toBe(pageTabId('login'));
    expect(tree.pages[0]?.path).toBe('/test_suites/pages/login/constructor');
    expect(tree.scenarios[0]?.title).toBe('smoke');
    expect(tree.scenarios[0]?.tabId).toBe(scenarioTabId(0));
    expect(tree.scenarios[0]?.path).toBe('/test_suites/scenarios/0/steps/0/constructor');
    expect(tree.scenarios[0]?.invalidId).toBe(false);
  });

  it('не теряет страницу с пустым ключом из Формы', () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: { '': { title: '', path: '' } },
      },
    });
    expect(tree.pages).toHaveLength(1);
    expect(tree.pages[0]?.needsName).toBe(true);
    expect(tree.pages[0]?.invalidId).toBe(true);
    expect(tree.pages[0]?.pageId).toBe('');
    expect(tree.pages[0]?.path).toBe('/test_suites/pages//constructor');
  });

  it('в дереве показывает ключ (python-id), не кириллический title', () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: { login_page: { title: 'СтраницаЛогина', constructor: '' } },
      },
    });
    expect(tree.pages[0]?.pageId).toBe('login_page');
    expect(tree.pages[0]?.title).toBe('login_page');
    expect(tree.pages[0]?.invalidId).toBe(false);
  });

  it('собирает модули, fuzzers и ресурсы; модуль — по id', () => {
    const tree = collectStudioNodes({
      test_suites: {
        test_data_constructor: [
          {
            id: 'ssh1',
            label: 'SSH коннектор',
            module_type: 'Коннектор',
            connector_fields: { connector_type: 'SSH', host: 'jump' },
          },
        ],
        fuzzers: [
          {
            id: 'juice_search_q',
            message: { source: 'template', url: 'http://x' },
            location: { kind: 'query_param', name: 'q' },
            corpus: 'intent_boundary',
          },
        ],
        imports: [{ path: 'data/a.txt', kind: 'data_file', as: 'users' }],
      },
    });
    expect(tree.modules).toHaveLength(1);
    expect(tree.modules[0]?.moduleId).toBe('ssh1');
    expect(tree.modules[0]?.title).toBe('ssh1');
    expect(tree.modules[0]?.path).toContain('/label');
    expect(tree.fuzzers).toHaveLength(1);
    expect(tree.fuzzers[0]?.title).toBe('juice_search_q');
    expect(tree.fuzzers[0]?.tabId).toBe('fuzzer:0');
    expect(tree.resources).toHaveLength(1);
    expect(tree.resources[0]?.title).toBe('users');
    expect(tree.resources[0]?.invalidId).toBe(false);
  });

  it('нормализует общую папку в groupId и участников разных sections', () => {
    const tree = collectStudioNodes({
      test_suites: {
        pages: { juice_login: { constructor: '' } },
        scenarios: [{ scenario_name: 'juice_shop_test_1', steps: [] }],
        imports: [{ path: 'data/users.csv', kind: 'data_file', as: 'users' }],
        editor_folders: {
          pages: [{ id: 'juice', title: 'Модели страниц Juice Shop', members: ['juice_login'] }],
          scenarios: [{ id: 'juice', title: 'Модели страниц Juice Shop', members: ['juice_shop_test_1'] }],
          modules: [],
          fuzzers: [],
          resources: [{ id: 'juice', title: 'Модели страниц Juice Shop', members: ['users'] }],
        },
      },
    });
    expect(tree.pages[0]?.groupId).toBe('pages:juice');
    expect(tree.scenarios[0]?.groupId).toBe('scenarios:juice');
    expect(tree.resources[0]?.groupId).toBe('resources:juice');
    expect(tree.groups).toEqual([
      { id: 'pages:juice', folderId: 'juice', section: 'pages', title: 'Модели страниц Juice Shop', memberTabIds: ['page:juice_login'] },
      { id: 'scenarios:juice', folderId: 'juice', section: 'scenarios', title: 'Модели страниц Juice Shop', memberTabIds: ['scenario:0'] },
      { id: 'resources:juice', folderId: 'juice', section: 'resources', title: 'Модели страниц Juice Shop', memberTabIds: ['resource:0'] },
    ]);
  });
  it('читает и пишет constructor без порчи соседей', () => {
    const data = {
      test_suites: {
        pages: { login: { constructor: 'a', failsafe: true } },
      },
    };
    expect(getAtPointer(data, '/test_suites/pages/login/constructor')).toBe('a');
    const next = setAtPointer(data, '/test_suites/pages/login/constructor', 'b') as typeof data;
    expect(next.test_suites.pages.login.constructor).toBe('b');
    expect(next.test_suites.pages.login.failsafe).toBe(true);
    expect(data.test_suites.pages.login.constructor).toBe('a');
  });
});
