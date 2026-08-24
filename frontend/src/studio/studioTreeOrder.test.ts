import { describe, expect, it } from 'vitest';
import { reorderStudioTreeMember } from './studioTreeOrder';

const formData = {
  test_suites: {
    pages: {
      login: { title: 'login' },
      profile: { title: 'profile' },
      register: { title: 'register' },
    },
    scenarios: [{ scenario_name: 'smoke' }, { scenario_name: 'regression' }],
    test_data_constructor: [{ id: 'auth' }, { id: 'catalog' }],
    fuzzers: [{ id: 'xss' }, { id: 'sqli' }],
    imports: [{ path: 'resources/users.txt', kind: 'data_file', as: 'users' }, { path: 'resources/urls.txt', kind: 'data_file', as: 'urls' }],
  },
};

describe('reorderStudioTreeMember', () => {
  it('переставляет pages, сохраняя порядок runtime-объекта', () => {
    const next = reorderStudioTreeMember(formData, 'pages', 'register', 'login', 'before') as {
      test_suites: { pages: Record<string, unknown> };
    };

    expect(Object.keys(next.test_suites.pages)).toEqual(['register', 'login', 'profile']);
  });

  it('переставляет сценарии, модули, fuzzers и ресурсы в runtime-массивах', () => {
    const scenarios = reorderStudioTreeMember(formData, 'scenarios', 'regression', 'smoke', 'before') as {
      test_suites: { scenarios: Array<{ scenario_name: string }> };
    };
    const modules = reorderStudioTreeMember(formData, 'modules', 'catalog', 'auth', 'before') as {
      test_suites: { test_data_constructor: Array<{ id: string }> };
    };
    const fuzzers = reorderStudioTreeMember(formData, 'fuzzers', 'sqli', 'xss', 'before') as {
      test_suites: { fuzzers: Array<{ id: string }> };
    };
    const resources = reorderStudioTreeMember(formData, 'resources', 'urls', 'users', 'before') as {
      test_suites: { imports: Array<{ as: string }> };
    };

    expect(scenarios.test_suites.scenarios.map((item) => item.scenario_name)).toEqual([
      'regression',
      'smoke',
    ]);
    expect(modules.test_suites.test_data_constructor.map((item) => item.id)).toEqual([
      'catalog',
      'auth',
    ]);
    expect(fuzzers.test_suites.fuzzers.map((item) => item.id)).toEqual(['sqli', 'xss']);
    expect(resources.test_suites.imports.map((item) => item.as)).toEqual(['urls', 'users']);
  });
});
