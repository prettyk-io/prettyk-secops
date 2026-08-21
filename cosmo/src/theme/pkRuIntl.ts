/**
 * ADM-RU-INTL: Pro `ru_RU` с патчами кривого машинного перевода.
 * Не трогаем node_modules — один intl-объект в ProConfigProvider.
 */
import { createIntl, ruRUIntl } from '@ant-design/pro-components';
import type { IntlType } from '@ant-design/pro-provider';

/** Ключи getMessage → нормальный RU (поверх stock ruRUIntl). */
export const PK_RU_INTL_PATCHES: Readonly<Record<string, string>> = {
  // stock: «Открытый чемпионат мира по теннису» / «По адресу:»
  'switch.open': 'Вкл',
  'switch.close': 'Выкл',
  // stock: «добавить ряд данных»
  'editableTable.action.add': 'Добавить строку',
};

/** Stock Pro RU до патча — для тестов/диффа. */
export const STOCK_RU_SWITCH = {
  open: ruRUIntl.getMessage('switch.open', 'open'),
  close: ruRUIntl.getMessage('switch.close', 'close'),
} as const;

function buildLocaleMap(): Record<string, unknown> {
  // Восстанавливаем дерево из getMessage stock + патчи (без deep-import locale).
  const keys = [
    'moneySymbol',
    'form.lightFilter.more',
    'form.lightFilter.clear',
    'form.lightFilter.confirm',
    'form.lightFilter.itemUnit',
    'tableForm.search',
    'tableForm.reset',
    'tableForm.submit',
    'tableForm.collapsed',
    'tableForm.expand',
    'tableForm.inputPlaceholder',
    'tableForm.selectPlaceholder',
    'alert.clear',
    'alert.selected',
    'alert.item',
    'pagination.total.range',
    'pagination.total.total',
    'pagination.total.item',
    'tableToolBar.leftPin',
    'tableToolBar.rightPin',
    'tableToolBar.noPin',
    'tableToolBar.leftFixedTitle',
    'tableToolBar.rightFixedTitle',
    'tableToolBar.noFixedTitle',
    'tableToolBar.reset',
    'tableToolBar.columnDisplay',
    'tableToolBar.columnSetting',
    'tableToolBar.fullScreen',
    'tableToolBar.exitFullScreen',
    'tableToolBar.reload',
    'tableToolBar.density',
    'tableToolBar.densityDefault',
    'tableToolBar.densityLarger',
    'tableToolBar.densityMiddle',
    'tableToolBar.densitySmall',
    'stepsForm.next',
    'stepsForm.prev',
    'stepsForm.submit',
    'loginForm.submitText',
    'editableTable.action.save',
    'editableTable.action.cancel',
    'editableTable.action.delete',
    'editableTable.action.add',
    'switch.open',
    'switch.close',
  ];
  const root: Record<string, unknown> = {};
  for (const key of keys) {
    const value = PK_RU_INTL_PATCHES[key] ?? ruRUIntl.getMessage(key, '');
    setPath(root, key, value);
  }
  return root;
}

function setPath(root: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (p === undefined) continue;
    const next = cur[p];
    if (!next || typeof next !== 'object') {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf !== undefined) {
    cur[leaf] = value;
  }
}

export const pkRuIntl: IntlType = createIntl('ru_RU', buildLocaleMap());
