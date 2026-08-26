import { describe, expect, it } from 'vitest';
import {
  AUTH_MODULE_TYPE,
  CONNECTOR_MODULE_TYPE,
  addAuthModule,
  addConnectorModule,
  addModule,
  emptyModule,
  isAuthModule,
  isConnectorModule,
  isDataUrlListModule,
  moduleDisplayError,
  moduleEditorPointer,
  moduleIdError,
  moduleRecordAt,
  removeModule,
  renameModule,
  renameModuleLabel,
} from './studioModules';

describe('studioModules', () => {
  it('создаёт data-модуль: id = label; пустое полотно', () => {
    const next = addModule({ test_suites: {} }, 'data_module') as {
      test_suites: {
        test_data_constructor: {
          id: string;
          label: string;
          module_type: string;
          data_storage_fields: {
            source_type: string;
            process_id: string;
            editor: string;
          };
        }[];
      };
    };
    expect(next.test_suites.test_data_constructor).toHaveLength(1);
    expect(next.test_suites.test_data_constructor[0]?.id).toBe('data_module');
    expect(next.test_suites.test_data_constructor[0]?.label).toBe('data_module');
    expect(next.test_suites.test_data_constructor[0]?.module_type).toBe(
      'Модуль работы с данными',
    );
    expect(
      next.test_suites.test_data_constructor[0]?.data_storage_fields.process_id,
    ).toBe('additional_urls');
    expect(
      String(next.test_suites.test_data_constructor[0]?.data_storage_fields.editor).includes('@'),
    ).toBe(false);
    expect(moduleEditorPointer(0, 'Модуль работы с данными')).toBe(
      '/test_suites/test_data_constructor/0/data_storage_fields/editor',
    );
  });

  it('data_module — URL-список, не wire', () => {
    const next = addModule({}, 'urls')!;
    expect(isDataUrlListModule(moduleRecordAt(next, 0))).toBe(true);
  });

  it('auth-модуль: type Авторизация + auth_fields.constructor + active pointer', () => {
    const next = addAuthModule({}, 'auth_login') as {
      security_configuration?: { active_auth_module?: string };
      test_suites: {
        test_data_constructor: {
          module_type: string;
          auth_fields: { constructor: string };
        }[];
      };
    };
    const mod = next.test_suites.test_data_constructor[0];
    expect(mod?.module_type).toBe(AUTH_MODULE_TYPE);
    expect(isAuthModule(mod as Record<string, unknown>)).toBe(true);
    expect(mod?.auth_fields.constructor).toContain('auth=bearer');
    expect(mod?.auth_fields.constructor).toContain('auth=chain');
    expect(next.security_configuration?.active_auth_module).toBe('auth_login');
    expect(moduleEditorPointer(0, AUTH_MODULE_TYPE)).toBe(
      '/test_suites/test_data_constructor/0/auth_fields/constructor',
    );
  });

  it('connector-модуль: слот без типа до активации', () => {
    const next = addConnectorModule({}, 'pg_ro') as {
      test_suites: {
        test_data_constructor: {
          module_type: string;
          connector_fields: { connector_type: string | null };
        }[];
      };
    };
    const mod = next.test_suites.test_data_constructor[0];
    expect(mod?.module_type).toBe(CONNECTOR_MODULE_TYPE);
    expect(isConnectorModule(mod as Record<string, unknown>)).toBe(true);
    expect(mod?.connector_fields.connector_type).toBeNull();
    expect(moduleEditorPointer(0, CONNECTOR_MODULE_TYPE)).toBe(
      '/test_suites/test_data_constructor/0/label',
    );
  });

  it('Фаззер scaffold = request/injection, не legacy masks', () => {
    const mod = emptyModule('juice_q', 'Фаззер');
    expect(mod.fuzzing_fields).toEqual({
      request: {
        method: 'GET',
        url: 'http://juice-shop:3000/rest/products/search',
      },
      injection: {
        query_param: 'q',
        corpus: 'fuzz_payloads',
      },
    });
    expect(moduleEditorPointer(0, 'Фаззер')).toBe(
      '/test_suites/test_data_constructor/0/label',
    );
  });

  it('имя только python-id', () => {
    expect(moduleDisplayError('Модуль')).toBeTruthy();
    expect(moduleDisplayError('data_module')).toBeUndefined();
    expect(moduleIdError('логин')).toMatch(/латиница/);
    expect(addModule({}, 'Модуль')).toBeUndefined();
  });

  it('rename id+label вместе', () => {
    const created = addModule({}, 'mod_a')!;
    const labeled = renameModuleLabel(created, 0, 'mod_b') as {
      test_suites: { test_data_constructor: { id: string; label: string }[] };
    };
    expect(labeled.test_suites.test_data_constructor[0]?.id).toBe('mod_b');
    expect(labeled.test_suites.test_data_constructor[0]?.label).toBe('mod_b');
    const renamed = renameModule(labeled, 0, 'other_mod') as {
      test_suites: { test_data_constructor: { id: string; label: string }[] };
    };
    expect(renamed.test_suites.test_data_constructor[0]?.id).toBe('other_mod');
    expect(renamed.test_suites.test_data_constructor[0]?.label).toBe('other_mod');
    const removed = removeModule(renamed, 0) as {
      test_suites: { test_data_constructor: unknown[] };
    };
    expect(removed.test_suites.test_data_constructor).toEqual([]);
  });
});
