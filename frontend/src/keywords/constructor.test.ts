/**
 * Тесты разбора и диагностики конструкторов на реальном каталоге keywords.json.
 */
import { describe, expect, it } from 'vitest';
import { ALLOWED_URL_DENY_MSG } from './allowedUrls';
import {
  analyzeConstructor,
  analyzeContextIncludeLines,
  analyzeOpenNavigationLines,
  CONTEXT_INCLUDE_FORMAT_MSG,
  flattenConstructorText,
  looksLikeLanguageScript,
  OPEN_ABSOLUTE_MSG,
  parseConstructor,
  segmentAtOffset,
  splitConstructor,
} from './constructor';
import { getAction, keywordCatalog, totalActionCount } from './catalog';
import { collectVariables } from './variables';

function messages(
  value: string,
  knownVariables: string[] = [],
  allowedExtraDomains = '',
): string[] {
  return analyzeConstructor(value, keywordCatalog, {
    knownVariables,
    allowedExtraDomains,
  }).map((diagnostic) => `${diagnostic.severity}: ${diagnostic.message}`);
}

function severities(
  value: string,
  knownVariables: string[] = [],
  allowedExtraDomains = '',
): string[] {
  return analyzeConstructor(value, keywordCatalog, {
    knownVariables,
    allowedExtraDomains,
  }).map((diagnostic) => diagnostic.severity);
}

describe('каталог keywords', () => {
  it('содержит все компоненты, которые регистрирует Controller', () => {
    expect(Object.keys(keywordCatalog.components).sort()).toEqual([
      'allure',
      'browser',
      'connector',
      'core',
      'data',
      'fuzz',
      'grpc',
      'http',
      'scanner',
      'webdriver',
    ]);
    expect(totalActionCount(keywordCatalog)).toBeGreaterThan(200);
  });

  it('для allure зарегистрированы только пять разрешённых методов', () => {
    expect(Object.keys(keywordCatalog.components.allure?.actions ?? {}).sort()).toEqual([
      'attach_file',
      'attach_html',
      'attach_json',
      'attach_screenshot',
      'attach_text',
    ]);
  });

  it('не содержит мёртвых функций уровня модуля из data_processor.py', () => {
    const core = keywordCatalog.components.core?.actions ?? {};
    for (const dead of ['add_custom_payload', 'get_payloads', 'start_oast_server', 'scan_grpc', 'start_fuzzer']) {
      expect(core[dead], `«${dead}» — вставка из scanner-адаптера, её не должно быть в core`).toBeUndefined();
    }
    expect(core.log_message).toBeDefined();
  });

  it('параметры webdriver|send_keys совпадают с сигнатурой метода', () => {
    const action = getAction(keywordCatalog, 'webdriver', 'send_keys');
    expect(action?.params.map((param) => param.name)).toEqual([
      'selector_type',
      'selector_value',
      'text',
      'clear_first',
      'timeout',
    ]);
  });
});

describe('splitConstructor', () => {
  it('разбивает строку и сохраняет смещения', () => {
    expect(splitConstructor('scanner|get_alerts|ctx')).toEqual([
      { index: 0, text: 'scanner', start: 0, end: 7 },
      { index: 1, text: 'get_alerts', start: 8, end: 18 },
      { index: 2, text: 'ctx', start: 19, end: 22 },
    ]);
  });

  it('сохраняет пустой аргумент в конце', () => {
    expect(splitConstructor('core|sleep|').map((segment) => segment.text)).toEqual(['core', 'sleep', '']);
  });

  it('не режет | внутри кавычек', () => {
    expect(
      splitConstructor('data|concat|Список [${q}, "|", ${bs}]').map((s) => s.text),
    ).toEqual(['data', 'concat', 'Список [${q}, "|", ${bs}]']);
  });

  it('определяет сегмент по позиции курсора', () => {
    expect(segmentAtOffset('scanner|get_alerts|ctx', 0).index).toBe(0);
    expect(segmentAtOffset('scanner|get_alerts|ctx', 3).index).toBe(0);
    expect(segmentAtOffset('scanner|get_alerts|ctx', 5).index).toBe(0);
    expect(segmentAtOffset('scanner|get_alerts|ctx', 18).index).toBe(1);
    expect(segmentAtOffset('scanner|get_alerts|ctx', 22).index).toBe(2);
  });

  it('раскладывает компонент, action и аргументы', () => {
    const parsed = parseConstructor('webdriver|open|https://example.com');
    expect(parsed.component).toBe('webdriver');
    expect(parsed.action).toBe('open');
    expect(parsed.args.map((argument) => argument.text)).toEqual(['https://example.com']);
  });
});

describe('диагностика конструктора', () => {
  it('корректные конструкторы из docs/scanner-1.json проходят без ошибок', () => {
    const samples = [
      'webdriver|open|/#/search',
      'webdriver|open_by_url|https://www.wikipedia.org',
      'scanner|create_context|wikipedia_ctx|Контекст для wikipedia',
      'scanner|create_and_force_user|wikipedia_ctx|test_user|test_login|test_password',
      'scanner|set_context_include|wikipedia_ctx|https://www.wikipedia.org.*',
      'scanner|active_scan|https://www.wikipedia.org|wikipedia_ctx|1',
      'scanner|passive_scan_wait|1',
      'scanner|get_alerts|wikipedia_ctx|High',
      'scanner|generate_report|html|scanner_report_wikipedia.html',
      'allure|attach_file|scanner_report_wikipedia.html|scanner Отчёт wikipedia',
      'core|log_message|Проверка завершена',
    ];
    for (const sample of samples) {
      expect(
        severities(sample, [], 'https://www.wikipedia.org|*.wikipedia.org'),
        sample,
      ).not.toContain('error');
    }
  });

  it('пустая строка — ошибка', () => {
    expect(severities('')).toEqual(['error']);
  });

  it('строка без разделителя — WiredError (нет |)', () => {
    const result = messages('открыть страницу');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('WiredError');
    expect(severities('открыть страницу')).toEqual(['error']);
  });

  it('неизвестный компонент — ошибка со списком доступных', () => {
    const result = messages('selenium|open|https://example.com');
    expect(result[0]).toContain('Неизвестный компонент');
    expect(result[0]).toContain('webdriver');
  });

  it('неизвестное действие — ошибка WiredError / Unknown action', () => {
    const result = messages('webdriver|navigate|https://example.com');
    expect(result[0]).toContain('не имеет действия');
    expect(result[0]).toMatch(/WiredError|Unknown action/);
  });

  it('лишний аргумент — ошибка про extra_args', () => {
    const result = messages('webdriver|open|https://example.com|true|лишнее');
    expect(result.some((message) => message.includes('extra_args'))).toBe(true);
  });

  it('незаданный обязательный параметр — ошибка', () => {
    const result = messages('webdriver|send_keys|css');
    expect(result.some((message) => message.includes('selector_value'))).toBe(true);
    expect(result.some((message) => message.includes('text'))).toBe(true);
  });

  it('необязательные параметры можно опускать', () => {
    expect(severities('webdriver|open|/#/home')).not.toContain('error');
    expect(severities('core|generate_random_string')).not.toContain('error');
  });

  it('аргумент в *args — ошибка, потому что рантайм передаёт параметры по имени', () => {
    const result = messages('webdriver|execute_script|return 1|argument');
    expect(result.some((message) => message.includes('*args'))).toBe(true);
  });

  it('целиковая подстановка ${var} допустима', () => {
    expect(severities('core|log_variable|alerts|${alerts_high}', ['alerts_high'])).not.toContain(
      'warning',
    );
  });

  it('инлайн-интерполяция ${base}/path допустима (resolve_arg)', () => {
    expect(severities('webdriver|open|${base_url}/login', ['base_url'])).toEqual([]);
  });

  it('неизвестная переменная — предупреждение, если список переменных известен', () => {
    const result = messages('core|log_variable|x|${missing}', ['alerts_high']);
    expect(result.some((message) => message.includes('не объявлена'))).toBe(true);
  });

  it('без списка переменных подстановки не проверяются', () => {
    expect(severities('core|log_variable|x|${anything}')).toEqual([]);
  });
});

describe('flattenConstructorText / language scripts', () => {
  it('схлопывает обычный wire в одну строку', () => {
    expect(flattenConstructorText('webdriver|click|\ncss|.x')).toBe('webdriver|click| css|.x');
  });

  it('сохраняет переносы в Если/Цикл', () => {
    const src = 'Если ${status} 200 {\n  webdriver|click|css|.ok\n}';
    expect(looksLikeLanguageScript(src)).toBe(true);
    expect(flattenConstructorText(src)).toContain('\n');
    expect(flattenConstructorText(src)).toContain('Если');
  });
});

describe('collectVariables', () => {
  it('собирает save_as шагов и id data-модулей', () => {
    const variables = collectVariables({
      test_suites: {
        scenarios: [
          {
            scenario_name: 'S1',
            steps: [{ constructor: 'scanner|get_alerts|ctx', save_as: 'alerts' }],
          },
        ],
        test_data_constructor: [{ id: 'fuzz_module', module_type: 'Фаззер' }],
      },
    });
    expect(variables).toEqual(['alerts', 'fuzz_module']);
  });

  it('достаёт имена из Пусть / data|let в шагах и макете страницы', () => {
    const variables = collectVariables({
      test_suites: {
        pages: {
          Home: {
            title: 'Home',
            constructor: 'Пусть ${email} = "a@b.c"',
          },
        },
        scenarios: [
          {
            scenario_name: 'S1',
            steps: [
              {
                constructor:
                  'Пусть ${user.role} = "admin"\nПусть ${names} = ["a"]\ndata|let|token|"x"',
              },
            ],
          },
        ],
      },
    });
    expect(variables).toEqual(['email', 'names', 'token', 'user']);
  });

  it('видит Пусть из S1 и save_as из S2 (фарш прогона)', () => {
    const s1Ctor =
      'Пусть ${role} = "admin"\nПусть ${payload} = Объект { "q": "x", "n": 1 }';
    expect(looksLikeLanguageScript(s1Ctor)).toBe(true);
    expect(flattenConstructorText(s1Ctor)).toContain('\n');
    expect(flattenConstructorText(s1Ctor)).toContain('Пусть ${payload}');

    const variables = collectVariables({
      test_suites: {
        scenarios: [
          {
            scenario_name: 'S1: фарш',
            steps: [{ constructor: s1Ctor }],
          },
          {
            scenario_name: 'S2: читает',
            steps: [
              {
                constructor: 'Лог "role=${role} q=${payload.q}"',
                save_as: 'logged',
              },
            ],
          },
        ],
      },
    });
    expect(variables).toEqual(['logged', 'payload', 'role']);
  });

  it('на пустых и некорректных данных возвращает пустой список', () => {
    expect(collectVariables(undefined)).toEqual([]);
    expect(collectVariables({})).toEqual([]);
    expect(collectVariables({ test_suites: { scenarios: 'нет' } })).toEqual([]);
  });
});

describe('language в поле constructor', () => {
  it('узнаёт ? try и Пусть как language-скрипт', () => {
    expect(looksLikeLanguageScript('? Нажать css .ok > Лог e >! Назад')).toBe(true);
    expect(looksLikeLanguageScript('? {\n\n} > {\n\n} >! {\n\n}')).toBe(true);
    expect(looksLikeLanguageScript('? {')).toBe(true);
    expect(looksLikeLanguageScript('? {\n  Пауза 1\n} > {\n  Лог e\n} >! {\n  Пауза 1\n}')).toBe(
      true,
    );
    expect(looksLikeLanguageScript('Пусть ${x} = "a"\nНажать css .ok')).toBe(true);
    expect(looksLikeLanguageScript('Лог "role=${role}"\nLogin.Войти')).toBe(true);
    expect(looksLikeLanguageScript('Лог "x"')).toBe(true);
    expect(looksLikeLanguageScript('ЛогСообщение "legacy"')).toBe(true);
    expect(looksLikeLanguageScript('Логировать "legacy"')).toBe(true);
    expect(looksLikeLanguageScript('Login.Войти')).toBe(true);
    expect(looksLikeLanguageScript('webdriver|open|https://x')).toBe(false);
  });

  it('не валит language wire-диагностикой «нет |»', () => {
    expect(
      severities('? Нажать css .ok > Лог e >! Назад'),
    ).not.toContain('error');
    expect(severities('Пусть ${role} = "admin"')).not.toContain('error');
  });

  it('flatten сохраняет переносы у language', () => {
    const src = 'Пусть ${a} = 1\nНажать css .ok';
    expect(flattenConstructorText(src)).toContain('\n');
    expect(flattenConstructorText('webdriver|open|https://x\ny')).toBe(
      'webdriver|open|https://x y',
    );
  });

  it('узнаёт макет Элемент / Операция как language', () => {
    expect(looksLikeLanguageScript('Элемент email = css #email')).toBe(true);
    expect(
      looksLikeLanguageScript('Операция Войти {\n  Нажать css .ok\n}'),
    ).toBe(true);
  });
});

describe('ВключитьВКонтекст allowlist / base_url', () => {
  it('без URL — ок; non-http — формат; вне allowlist — deny', () => {
    expect(
      analyzeContextIncludeLines('ВключитьВКонтекст juice_ctx', {
        baseUrl: 'http://juice-shop:3000',
      }),
    ).toEqual([]);
    const badFmt = analyzeContextIncludeLines('ВключитьВКонтекст juice_ctx nohttp', {
      baseUrl: 'http://juice-shop:3000',
    });
    expect(badFmt.some((d) => d.message === CONTEXT_INCLUDE_FORMAT_MSG)).toBe(true);
    const deny = analyzeContextIncludeLines(
      'ВключитьВКонтекст juice_ctx https://evil.test.*',
      { baseUrl: 'http://juice-shop:3000', allowedExtraDomains: '' },
    );
    expect(deny.some((d) => d.message === ALLOWED_URL_DENY_MSG)).toBe(true);
  });

  it('base_url origin и allowlist — без ошибок', () => {
    const ok = analyzeContextIncludeLines(
      'ВключитьВКонтекст juice_ctx http://juice-shop:3000.*\nВключитьВКонтекст juice_ctx https://rkn.gov.ru.*',
      {
        baseUrl: 'http://juice-shop:3000',
        allowedExtraDomains: 'https://rkn.gov.ru',
      },
    );
    expect(ok).toEqual([]);
  });
});

describe('Открыть / ОткрытьПоURL allowlist', () => {
  it('absolute Открыть — ошибка; relative/пусто ок', () => {
    const abs = analyzeOpenNavigationLines('Открыть https://evil.test/');
    expect(abs.some((d) => d.message === OPEN_ABSOLUTE_MSG)).toBe(true);
    expect(analyzeOpenNavigationLines('Открыть')).toEqual([]);
    expect(analyzeOpenNavigationLines('Открыть /#/login')).toEqual([]);
  });

  it('ОткрытьПоURL вне allowlist', () => {
    const diags = analyzeOpenNavigationLines(
      'ОткрытьПоURL https://evil.test/path',
      'juice-shop:3000|https://rkn.gov.ru',
    );
    expect(diags.some((d) => d.message === ALLOWED_URL_DENY_MSG)).toBe(true);
  });

  it('ОткрытьПоURL в allowlist — без ошибок; language тоже', () => {
    const ok = analyzeConstructor(
      'Пусть ${x} = 1\nОткрытьПоURL http://juice-shop:3000/#/a\nОткрыть /#/b',
      keywordCatalog,
      { allowedExtraDomains: 'juice-shop:3000' },
    );
    expect(ok.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
