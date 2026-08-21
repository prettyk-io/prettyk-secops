import { describe, expect, it } from 'vitest';
import {
  applyValuePackToBindings,
  collectChainBindings,
  dataModuleEditorText,
  defaultChainFields,
  listDataModuleIds,
  normalizeChainFields,
  parsePropertiesValuePack,
  parseValuePack,
  updateChainModule,
} from './chainModuleFields';
import { addChainModule, CHAIN_MODULE_TYPE } from './studioModules';

describe('chainModuleFields', () => {
  it('normalizes slots, step roles and defaults', () => {
    const n = normalizeChainFields({
      har_as: 'pay',
      steps: [{ method: 'POST', url: 'https://a/login', role: 'pre' }],
      slots: [{ id: 'authorization', location: 'header', enabled: true, bind: 'literal:X' }],
    });
    expect(n.har_as).toBe('pay');
    expect(n.include_sequence_scan).toBe(true);
    expect(n.slots[0]?.bind).toBe('literal:X');
    expect(n.steps[0]?.role).toBe('precondition');
  });

  it('addChainModule + updateChainModule', () => {
    const created = addChainModule({}, 'flow_a') as Record<string, unknown>;
    expect(created).toBeTruthy();
    const mod = (
      created.test_suites as { test_data_constructor: Array<Record<string, unknown>> }
    ).test_data_constructor[0];
    if (!mod) throw new Error('no module');
    expect(mod.module_type).toBe(CHAIN_MODULE_TYPE);
    const next = updateChainModule(created, 0, {
      source_har: '{"log":{"entries":[]}}',
    });
    const chain = (next as { test_suites: { test_data_constructor: Array<{ chain_fields: unknown }> } })
      .test_suites.test_data_constructor[0];
    if (!chain) throw new Error('no module');
    expect(normalizeChainFields(chain.chain_fields).source_har).toContain('entries');
  });

  it('collectChainBindings from bindings and literal binds', () => {
    const data = {
      test_suites: {
        test_data_constructor: [
          {
            module_type: 'Цепь',
            chain_fields: defaultChainFields({
              bindings: { authorization: 'Bearer A' },
              slots: [
                {
                  id: 'csrf',
                  location: 'header',
                  key: 'X-CSRF',
                  recorded_value: 'old',
                  enabled: true,
                  bind: 'literal:fresh',
                  apply: 'step',
                  match: '',
                },
              ],
            }),
          },
        ],
      },
    };
    const b = collectChainBindings(data);
    expect(b.authorization).toBe('Bearer A');
    expect(b.csrf).toBe('fresh');
  });

  it('normalizes map apply/match and value pack JSON→bindings', () => {
    const n = normalizeChainFields({
      slots: [{ id: 'authorization', apply: 'all', match: '/api' }],
      value_pack_module: 'chain_vals',
    });
    expect(n.slots[0]?.apply).toBe('all');
    expect(n.slots[0]?.match).toBe('/api');
    expect(n.value_pack_module).toBe('chain_vals');
    const pack = parseValuePack('{"authorization":"Bearer Z"}');
    expect(pack.rows[0]?.authorization).toBe('Bearer Z');
    const prop = parsePropertiesValuePack(
      'authorization=Bearer A\n#csrf=tok\n',
    );
    expect(prop.row.authorization).toBe('Bearer A');
    expect(prop.row.csrf).toBe('tok');
    const merged = applyValuePackToBindings({}, 'authorization=Bearer B\n');
    expect(merged.rowCount).toBe(1);
    expect(merged.bindings.authorization).toBe('Bearer B');
  });

  it('lists data modules and reads editor for value pack', () => {
    const data = {
      test_suites: {
        test_data_constructor: [
          {
            id: 'auth_data',
            module_type: 'Модуль работы с данными',
            data_storage_fields: {
              editor: 'authorization=Bearer X\n#csrf=y\n',
            },
          },
          { id: 'flow', module_type: 'Цепь', chain_fields: {} },
        ],
      },
    };
    expect(listDataModuleIds(data)).toEqual(['auth_data']);
    expect(dataModuleEditorText(data, 'auth_data')).toContain('authorization=');
  });
});
