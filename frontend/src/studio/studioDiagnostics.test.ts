import { describe, expect, it } from 'vitest';
import { keywordCatalog } from '../keywords/catalog';
import { analyzeConstructor, flattenConstructorText } from '../keywords/constructor';
import {
  isPlainStudioConstructorTab,
  isStudioModuleTab,
  studioTabWireDiagnostics,
} from './studioDiagnostics';
import { addModule } from './studioModules';
import { moduleTabId, type StudioTab } from './studioTabs';

const URL_LIST = [
  '/#/',
  '/#/search',
  '/#/login',
  '/#/photo-wall',
  '/#/complain',
  '/#/score-board',
].join('\n');

function moduleTab(path: string, index = 0): StudioTab {
  return {
    id: moduleTabId(index),
    title: 'data_module',
    language: 'pk-constructor',
    path,
    readOnly: false,
    kind: 'constructor',
  };
}

describe('studioDiagnostics — модули без wire-валидации', () => {
  it('любой module:* — plain, диагностика пустая', () => {
    const naive = analyzeConstructor(flattenConstructorText(URL_LIST), keywordCatalog);
    expect(naive.some((d) => d.message.includes('разделителя'))).toBe(true);

    const dataTab = moduleTab(
      '/test_suites/test_data_constructor/0/data_storage_fields/editor',
    );
    const connectorTab = moduleTab(
      '/test_suites/test_data_constructor/0/connector_fields/constructor',
    );
    expect(isStudioModuleTab(dataTab)).toBe(true);
    expect(isStudioModuleTab(connectorTab)).toBe(true);
    expect(isPlainStudioConstructorTab({}, dataTab)).toBe(true);
    expect(isPlainStudioConstructorTab({}, connectorTab)).toBe(true);
    expect(studioTabWireDiagnostics({}, dataTab, URL_LIST, keywordCatalog)).toEqual([]);
    expect(
      studioTabWireDiagnostics({}, connectorTab, '/#/search', keywordCatalog),
    ).toEqual([]);
  });

  it('addModule data_module — без диагностики на URL-списке', () => {
    const formData = addModule({}, 'data_module')!;
    const tab = moduleTab(
      '/test_suites/test_data_constructor/0/data_storage_fields/editor',
    );
    expect(studioTabWireDiagnostics(formData, tab, URL_LIST, keywordCatalog)).toEqual([]);
  });

  it('страница — wire остаётся', () => {
    const pageTab: StudioTab = {
      id: 'page:login',
      title: 'login',
      language: 'pk-constructor',
      path: '/test_suites/pages/login/constructor',
      readOnly: false,
      kind: 'constructor',
    };
    expect(isStudioModuleTab(pageTab)).toBe(false);
    const diags = studioTabWireDiagnostics({}, pageTab, '/#/search', keywordCatalog);
    expect(diags.some((d) => d.message.includes('разделителя'))).toBe(true);
  });

  it('не ставит marker на тридцатой строке пустого padded-полотна', () => {
    const pageTab: StudioTab = {
      id: 'page:empty',
      title: 'empty',
      language: 'pk-constructor',
      path: '/test_suites/pages/empty/constructor',
      readOnly: false,
      kind: 'constructor',
    };
    const paddedEmptyCanvas = Array.from({ length: 30 }, () => '').join('\n');

    expect(studioTabWireDiagnostics({}, pageTab, paddedEmptyCanvas, keywordCatalog)).toEqual([]);
  });
});
