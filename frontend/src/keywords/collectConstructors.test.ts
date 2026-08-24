import { describe, expect, it } from 'vitest';
import { collectConstructorFields } from './constructor';

describe('collectConstructorFields', () => {
  it('собирает непустые constructor из сценариев и страниц', () => {
    const found = collectConstructorFields({
      test_suites: {
        pages: { login: { constructor: 'Элемент x = css .a' } },
        scenarios: [
          {
            scenario_name: 'S',
            steps: [
              { constructor: 'Лог "ok"' },
              { constructor: '   ' },
              { constructor: 'ОбойтиСтраницы ${data_module}' },
            ],
          },
        ],
        test_data_constructor: [
          {
            module_type: 'Коннектор',
            connector_fields: { constructor: 'ssh|exec|uname' },
          },
          {
            module_type: 'Модуль работы с данными',
            data_storage_fields: { editor: '/#/search' },
          },
        ],
      },
    });
    expect(found.map((item) => item.text)).toEqual([
      'Элемент x = css .a',
      'Лог "ok"',
      'ОбойтиСтраницы ${data_module}',
    ]);
    expect(found[0]?.path).toContain('pages');
    expect(found[1]?.path).toContain('steps');
    expect(found.some((item) => item.path.includes('test_data_constructor'))).toBe(false);
  });
});
