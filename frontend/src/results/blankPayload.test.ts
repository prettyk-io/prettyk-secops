import { describe, expect, it } from 'vitest';
import { REDACT_PLACEHOLDER } from '../utils/redact';
import { TESTING_CONTOUR_STATEMENT, testingModeFromAuth } from './blankFields';
import { blankMarkdownFromPayload, renderBlankHtml, wrapDocSections } from './blankHtml';
import { buildBlankPayload } from './blankPayload';
import { exportContainsPlainSecret } from './validateGate';

describe('BlankPayload / official DAST blanks (MD→HTML)', () => {
  const secret = 'SuperSecretPass99';

  const formData = {
    meta: {
      project_id: 'juice-lab',
      initiator_name: 'Инициатор Тест',
      app_leader: 'Владелец Тест',
      assessment_purpose: 'scheduled',
    },
    Пароль: secret,
    infrastructure: { zap_mode: 'demon', browser_type: 'chrome' },
    security_configuration: {
      base_url_override: 'http://juice.example:3000',
      allowed_extra_domains: 'auth.example',
      scan_policy: 'custom_policy',
      auth_type: 'Без авторизации',
    },
    test_suites: {
      pages: {
        login: { constructor: `Секрет $pwd = "${secret}"\n` },
      },
      scenarios: [{ name: 'login_ok', steps: [{ constructor: '' }] }],
      fuzzers: [],
    },
  };

  it('form_snapshot маскирует пароль', () => {
    const payload = buildBlankPayload({ kind: 'regulation', formData });
    expect(JSON.stringify(payload.form_snapshot)).not.toContain(secret);
    expect(JSON.stringify(payload.form_snapshot)).toContain(REDACT_PLACEHOLDER);
    expect(payload.template_version).toBe('res-blank-0.6');
  });

  it('testingModeFromAuth: чёрный / серый ящик', () => {
    expect(testingModeFromAuth('Без авторизации')).toContain('чёрного ящика');
    expect(testingModeFromAuth('Bearer Token')).toContain('серого ящика');
  });

  it('wrapDocSections оборачивает h3; приложение помечает doc-appendix', () => {
    const wrapped = wrapDocSections(
      '<p>x</p><h3>A</h3><p>1</p><h3>7. Приложение. Доказательства</h3><p>2</p>',
    );
    expect(wrapped).toContain('class="doc-section"');
    expect(wrapped).toContain('doc-appendix');
    expect(wrapped.match(/doc-section/g)?.length).toBe(2);
  });

  it('regulation: цели/границы/контур, без «прогон» и «ретест»', () => {
    const payload = buildBlankPayload({ kind: 'regulation', formData });
    const md = blankMarkdownFromPayload(payload);
    expect(md).toContain('ТЕХНИЧЕСКОЕ ЗАДАНИЕ №');
    expect(md).toContain('Цели для проверки безопасности');
    expect(md).toContain('http://juice.example:3000');
    expect(md).toContain('Дополнительно запрошенные границы для проверки');
    expect(md).toContain('auth.example');
    expect(md).toContain('Сведения о контуре для тестирования');
    expect(md).toContain(TESTING_CONTOUR_STATEMENT);
    expect(md).toContain('перепроверк');
    expect(md.toLowerCase()).not.toContain('ретест');
    expect(md.toLowerCase()).not.toContain('прогон');
    expect(md).toContain('по результатам выполненных работ');
    expect(md).not.toContain('Chrome');

    const html = renderBlankHtml(payload);
    expect(exportContainsPlainSecret(html, [secret])).toBe(false);
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('class="page"');
    expect(html).toContain('class="doc-head"');
    expect(html).toContain('class="markdown-body"');
    expect(html).not.toContain('class="masthead"');
    expect(html).toContain('height: 80px');
    expect(html).toContain('Segoe UI');
    expect(html.toLowerCase()).not.toContain('прогон');
  });

  it('act: без жаргона стенда', () => {
    const payload = buildBlankPayload({
      kind: 'act',
      formData,
      run: {
        run_id: 'run-test-1',
        status: 'unknown',
        links: {
          live: 'http://127.0.0.1:8767/',
          allure: 'http://127.0.0.1:5050/',
        },
        summary: {
          risks: { high: 2, medium: 1, low: 0, info: 0 },
          executive_class: 'Watch',
        },
      },
    });
    const md = blankMarkdownFromPayload(payload);
    expect(md).toContain('АКТ №');
    expect(md).toContain('Идентификатор сеанса проверки');
    expect(md.toLowerCase()).not.toContain('прогон');
    expect(md.toLowerCase()).not.toContain('ретест');
    expect(md).toContain('| Высокий | 2 |');

    const html = renderBlankHtml(payload);
    expect(html).toContain('<table>');
    expect(html).toContain('doc-section');
    expect(html).toContain('doc-appendix');
    expect(html).toContain('class="sign-block"');
    expect(html).toContain('(подпись)');
    expect(html).toContain('(должность)');
    expect(html).toContain('(инициалы, фамилия)');
  });

  it('act: заключение и допуск с counts_source / audit / рекомендациями', () => {
    const payload = buildBlankPayload({
      kind: 'act',
      formData,
      run: {
        run_id: 'run-gate-1',
        status: 'failed',
        links: { allure: 'http://127.0.0.1:5050/', dojo: 'http://127.0.0.1:8081/' },
        gate: {
          failed: true,
          summary: {
            ci_gate: 'fail',
            ci_verdict: 'fail_gate',
            ci_exit_code: 2,
            counts_source: 'dojo_findings',
            filter_audit: { raw: 4, kept: 1, dropped_fp: 2, dropped_dup: 1 },
          },
        },
        summary: {
          risks: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          executive_class: 'High',
          recommendations: ['Закрыть High до следующего допуска'],
          allure_summary_line: 'Allure: passed=3, failed=0',
        },
      },
    });
    const md = blankMarkdownFromPayload(payload);
    expect(md).toContain('Заключение и допуск');
    expect(md).toContain('counts_source');
    expect(md).toContain('Dojo ACTIVE (findings)');
    expect(md).toContain('kept=1');
    expect(md).toContain('Закрыть High до следующего допуска');
    expect(md).toContain('Allure: passed=3, failed=0');
    expect(md).toContain('| Критический | 0 |');
    expect(md).toContain('Допуск: не пройден');
    expect(md).toContain('☑ требуется');
  });

  it('act: разведочный fail_allowed маркируется в списке сценариев', () => {
    const payload = buildBlankPayload({
      kind: 'act',
      formData,
      run: {
        run_id: 'run-disc-1',
        status: 'success',
        links: { allure: 'http://127.0.0.1:5050/' },
        gate: {
          failed: false,
          summary: {
            ci_gate: 'pass',
            ci_verdict: 'pass',
            ci_exit_code: 0,
          },
        },
        summary: {
          risks: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          executive_class: 'Pass',
          scenarios: [
            { name: 'probe', status: 'fail_allowed' },
            { name: 'main', status: 'ok' },
          ],
        },
      },
    });
    const md = blankMarkdownFromPayload(payload);
    expect(md).toContain('разведочная проверка (допустимый отказ)');
    expect(md).toContain('probe:');
    expect(md).toContain('main:');
  });

  it('act: fail_run не маскирует сбой исполнения под Critical ACTIVE', () => {
    const payload = buildBlankPayload({
      kind: 'act',
      formData,
      run: {
        run_id: 'run-crash-1',
        status: 'failed',
        links: { allure: 'http://127.0.0.1:5050/' },
        gate: {
          failed: false,
          summary: {
            ci_gate: 'pass',
            ci_verdict: 'fail_run',
            ci_exit_code: 1,
          },
        },
        summary: {
          risks: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          executive_class: 'Pass',
          recommendations: [
            'Исполнение: сбой (exit 1) — evidence/прогон не завершён штатно; допуск по ACTIVE считать недействительным до повторного успешного прогона.',
          ],
        },
      },
    });
    const md = blankMarkdownFromPayload(payload);
    expect(md).toContain('сбой исполнения');
    expect(md).toContain('допуск недействителен');
    expect(md).toContain('Исполнение: сбой');
    expect(md).not.toContain('критический уровень риска');
    expect(md).not.toContain('неудовлетворительная');
  });
});


