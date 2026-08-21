import { describe, expect, it } from 'vitest';
import { displayNameError, isPythonTechId } from './pythonIds';

describe('pythonIds', () => {
  it('принимает python-id', () => {
    expect(isPythonTechId('login_page')).toBe(true);
    expect(isPythonTechId('_mod')).toBe(true);
    expect(isPythonTechId('s1')).toBe(true);
  });

  it('режет кириллицу, цифры в начале, пустое', () => {
    expect(isPythonTechId('Страница')).toBe(false);
    expect(isPythonTechId('123')).toBe(false);
    expect(isPythonTechId('')).toBe(false);
    expect(displayNameError('login_page', 'page')).toBeUndefined();
    expect(displayNameError('СтраницаЛогина', 'page')).toBeTruthy();
    expect(displayNameError('   ', 'scenario')).toBeTruthy();
    expect(displayNameError('data_module', 'module')).toBeUndefined();
  });
});
