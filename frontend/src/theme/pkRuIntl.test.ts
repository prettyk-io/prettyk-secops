import { describe, expect, it } from 'vitest';
import { ruRUIntl } from '@ant-design/pro-components';
import { PK_RU_INTL_PATCHES, STOCK_RU_SWITCH, pkRuIntl } from './pkRuIntl';

describe('pkRuIntl (ADM-RU-INTL)', () => {
  it('stock Pro RU still has broken switch strings (document delta)', () => {
    expect(STOCK_RU_SWITCH.open).toMatch(/чемпионат|теннис/i);
    expect(STOCK_RU_SWITCH.close).toMatch(/адресу/i);
  });

  it('patches switch + editable add; keeps tableForm expand/collapse semantics', () => {
    expect(pkRuIntl.getMessage('switch.open', 'open')).toBe('Вкл');
    expect(pkRuIntl.getMessage('switch.close', 'close')).toBe('Выкл');
    expect(pkRuIntl.getMessage('editableTable.action.add', 'x')).toBe(
      'Добавить строку',
    );
    // как EN: collapsed→Expand, expand→Collapse
    expect(pkRuIntl.getMessage('tableForm.collapsed', 'x')).toBe('Развернуть');
    expect(pkRuIntl.getMessage('tableForm.expand', 'x')).toBe('Свернуть');
    expect(Object.keys(PK_RU_INTL_PATCHES)).toEqual([
      'switch.open',
      'switch.close',
      'editableTable.action.add',
    ]);
  });

  it('keeps healthy toolbar RU from stock', () => {
    expect(pkRuIntl.getMessage('tableToolBar.reload', 'x')).toBe(
      ruRUIntl.getMessage('tableToolBar.reload', 'x'),
    );
    expect(pkRuIntl.getMessage('tableToolBar.density', 'x')).toBe('Размер');
  });
});
