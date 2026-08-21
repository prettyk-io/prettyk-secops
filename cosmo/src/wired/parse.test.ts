/**
 * Тесты для parse.ts — парсер legacy formData → typed Wired.
 * RK-MANIFEST-2.
 */

import { describe, it, expect } from 'vitest';
import { parseWired } from './parse';

describe('parseWired', () => {
  const legacySample = {
    meta: {
      project_id: 'owasp-zap-tests',
      initiator_name: 'someone@dev',
      app_leader: 'itlead@dev',
      assessment_purpose: 'scheduled',
      generate_act: false,
      scheduled_info: 'Плановая',
    },
    infrastructure: {
      base_url_override: 'http://runner01.dev.spaceport.ru:8080',
      allowed_extra_domains: 'rkn.gov.ru',
      zap_mode: 'demon',
      browser_type: 'chrome',
      debug_mode: false,
    },
    security_configuration: {
      scan_policy: 'custom_policy',
      auth_type: 'Без авторизации',
      auth_details: {},
      active_auth_module: '',
    },
    test_suites: {
      imports: [
        'data.txt',
        { path: 'fuzz.txt', kind: 'fuzz_corpus' },
        { path: 'spec.yaml', kind: 'openapi_spec', as: 'my-spec' },
      ],
      pages: {
        page1: { title: 'Стартовая', path: '/start', constructor: '// code' },
        page2: { title: 'Логин', path: '/login', constructor: '' },
      },
      scenarios: [
        {
          scenario_id: 's1',
          scenario_name: 'Главный',
          description: 'Основной сценарий',
          continue_on_error: false,
          steps: [
            {
              step_id: 's1s1',
              description: 'Открыть страницу',
              constructor: '',
              expect_error: false,
              retry_count: 1,
              retry_delay_sec: 2,
              continue_on_error: false,
              save_var: '',
            },
          ],
        },
      ],
      test_data_constructor: [
        {
          module_type: 'Фаззер',
          id: 'fz-1',
          name: 'SQLi fuzz',
          intent: 'fuzz_sqli',
          fuzzing_fields: {
            http_template: { method: 'POST', url: '/search', headers: {}, follow_redirect: true },
            query_target: { param: 'q', corpus: 'sql_corpus' },
            poc_limits: { max_requests: 200, requests_per_sec: 5, request_timeout_sec: 15 },
            anomaly_watch: { mark_5xx: true, delay_threshold_ms: 800 },
          },
        },
        {
          module_type: 'Авторизация',
          id: 'auth-1',
          auth_fields: {
            dialect: 'browser_form',
            login_url: 'http://localhost/login',
            username_selector: '#user',
            password_selector: '#pass',
          },
        },
        {
          module_type: 'OpenAPI',
          id: 'oa-1',
          openapi_fields: {
            schema_mode: 'resource',
            schema_resource: 'my-spec',
            allow_zap_import: true,
            auth_module_id: 'auth-1',
          },
        },
        {
          module_type: 'GraphQL',
          id: 'gql-1',
          graphql_fields: {
            schema_mode: 'introspection',
            endpoint_path: '/graphql',
            allow_zap_scan: true,
          },
        },
        {
          module_type: 'gRPC',
          id: 'grpc-1',
          grpc_fields: {
            proto_resource: 'proto-pack',
          },
        },
        {
          module_type: 'Цепь',
          id: 'chain-1',
          chain_fields: {
            har_resource: 'login.har',
            sequence_name: 'Login Sequence',
            bindings: { user: 'test', pass: 'secret' },
            value_pack_module: 'dm-1',
          },
        },
        {
          module_type: 'Модуль работы с данными',
          id: 'dm-1',
          data_fields: {
            source: 'csv',
            editor: 'inline',
            output_format: 'json',
          },
        },
        {
          module_type: 'Коннектор',
          id: 'conn-1',
          connector_fields: {
            connector_type: 'postgres',
            notes: 'prod replica',
            host: 'localhost',
            port: 5432,
          },
        },
      ],
      fuzzers: [
        { url: '/api/x', method: 'POST', corpus: 'xss' },
      ],
      folders: {
        modules: [{ folder_id: 'f1', title: 'Мои модули', members: ['fz-1', 'auth-1'] }],
      },
    },
  };

  it('читает regulation.meta', () => {
    const r = parseWired(legacySample);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    const m = r.wired.regulation.meta;
    expect(m.project_id).toBe('owasp-zap-tests');
    expect(m.assessment_purpose).toBe('scheduled');
    expect(m.generate_act).toBe(false);
    expect(m.scheduled_info).toBe('Плановая');
    expect(m.release_domain).toBeUndefined();
    expect(m.emergency_reason).toBeUndefined();
  });

  it('читает regulation.infrastructure', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const infra = r.wired.regulation.infrastructure;
    expect(infra.base_url_override).toBe('http://runner01.dev.spaceport.ru:8080');
    expect(infra.zap_mode).toBe('demon');
    expect(infra.browser_type).toBe('chrome');
    expect(infra.debug_mode).toBe(false);
    expect(infra.allowed_extra_domains).toBe('rkn.gov.ru');
  });

  it('читает regulation.security_configuration', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const sec = r.wired.regulation.security_configuration;
    expect(sec.scan_policy).toBe('custom_policy');
    expect(sec.auth_type).toBe('Без авторизации');
    expect(sec.active_auth_module).toBe('');
  });

  it('читает imports', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const imports = r.wired.editor.imports;
    expect(imports.length).toBe(3);
    expect(imports[0]!).toEqual({ path: 'data.txt', kind: 'data_file' });
    expect(imports[1]!).toEqual({ path: 'fuzz.txt', kind: 'fuzz_corpus' });
    expect(imports[2]!).toEqual({ path: 'spec.yaml', kind: 'openapi_spec', stream_name: 'my-spec' });
  });

  it('читает pages', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const pages = r.wired.editor.pages;
    expect(pages.length).toBe(2);
    expect(pages[0]!).toEqual({ title: 'Стартовая', path: '/start', constructor: '// code' });
    expect(pages[1]!).toEqual({ title: 'Логин', path: '/login', constructor: '' });
  });

  it('читает scenarios', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const sc = r.wired.editor.scenarios;
    expect(sc.length).toBe(1);
    expect(sc[0]!.title).toBe('Главный');
    expect(sc[0]!.scenario_id).toBe('s1');
    expect(sc[0]!.steps.length).toBe(1);
    expect(sc[0]!.steps[0]!.step_id).toBe('s1s1');
    expect(sc[0]!.steps[0]!.retry_count).toBe(1);
  });

  it('читает modules — fuzzer', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const fuzzers = r.wired.editor.modules.fuzzers;
    expect(fuzzers.length).toBe(1);
    expect(fuzzers[0]!.id).toBe('fz-1');
    expect(fuzzers[0]!.intent).toBe('fuzz_sqli');
    expect(fuzzers[0]!.http_template?.method).toBe('POST');
    expect(fuzzers[0]!.query_target?.param).toBe('q');
    expect(fuzzers[0]!.limits?.max_requests).toBe(200);
    expect(fuzzers[0]!.anomaly?.mark_5xx).toBe(true);
  });

  it('читает modules — auth', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const auth = r.wired.editor.modules.auth;
    expect(auth.length).toBe(1);
    expect(auth[0]!.id).toBe('auth-1');
    expect(auth[0]!.dialect).toBe('browser_form');
    expect(auth[0]!.login_url).toBe('http://localhost/login');
  });

  it('читает modules — OpenAPI / GraphQL / gRPC', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const { openapi, graphql, grpc } = r.wired.editor.modules;
    expect(openapi.length).toBe(1);
    expect(openapi[0]!.schema_mode).toBe('resource');
    expect(openapi[0]!.auth_module_id).toBe('auth-1');

    expect(graphql.length).toBe(1);
    expect(graphql[0]!.schema_mode).toBe('introspection');
    expect(graphql[0]!.allow_zap_scan).toBe(true);

    expect(grpc.length).toBe(1);
    expect(grpc[0]!.proto_resource).toBe('proto-pack');
  });

  it('читает modules — chain / data / connector', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const { chain, data, connectors } = r.wired.editor.modules;
    expect(chain.length).toBe(1);
    expect(chain[0]!.har_resource).toBe('login.har');
    expect(chain[0]!.play_bindings).toEqual({ user: 'test', pass: 'secret' });

    expect(data.length).toBe(1);
    expect(data[0]!.id).toBe('dm-1');
    expect(data[0]!.source).toBe('csv');

    expect(connectors.length).toBe(1);
    expect(connectors[0]!.kind).toBe('postgres');
    expect(connectors[0]!.host).toBe('localhost');
  });

  it('читает fuzzer_targets', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const targets = r.wired.editor.fuzzer_targets;
    expect(targets.length).toBe(1);
    expect(targets[0]!).toEqual({ url: '/api/x', method: 'POST', corpus: 'xss', body_template: '' });
  });

  it('читает folders', () => {
    const r = parseWired(legacySample);
    if (!r.ok) throw new Error('unreachable');
    const folders = r.wired.editor.folders;
    expect(folders).toBeDefined();
    expect(folders!.modules).toHaveLength(1);
    expect(folders!.modules![0]!.title).toBe('Мои модули');
  });

  it('пустой вход → ошибка', () => {
    const r = parseWired(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('объектом');
  });

  it('пустой объект → дефолты', () => {
    const r = parseWired({});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.wired.regulation.meta.project_id).toBe('owasp-zap-tests');
    expect(r.wired.regulation.infrastructure.zap_mode).toBe('demon');
    expect(r.wired.editor.imports).toEqual([]);
    expect(r.wired.editor.pages).toEqual([]);
    expect(r.wired.editor.scenarios).toEqual([]);
  });
});
