import { describe, expect, it } from 'vitest';
import {
  applyLocatorLabelToConstructor,
  labelProposalSummary,
  parseLocatorLabelLast,
} from './locatorLabelPropose';

describe('locatorLabelPropose', () => {
  it('parse ok proposal', () => {
    const p = parseLocatorLabelLast({
      status: 'ok',
      label: 'Войти',
      new_type: 'id',
      new_value: 'loginButton',
      score: 1.2,
      n: 1,
    });
    expect(p?.status).toBe('ok');
    expect(labelProposalSummary(p!)).toContain('loginButton');
  });

  it('apply hardens Нажать > label', () => {
    const canvas = 'Нажать > Войти\nПауза 1';
    const { text, replaced } = applyLocatorLabelToConstructor(canvas, {
      status: 'ok',
      label: 'Войти',
      new_type: 'id',
      new_value: 'loginButton',
    });
    expect(replaced).toBe(1);
    expect(text).toContain('Нажать id loginButton');
    expect(text).not.toContain('> Войти');
  });

  it('keeps fill value after label', () => {
    const { text, replaced } = applyLocatorLabelToConstructor(
      'ВставитьТекст > Email ivan@lab.test',
      {
        status: 'ok',
        label: 'Email',
        new_type: 'id',
        new_value: 'email',
      },
    );
    expect(replaced).toBe(1);
    expect(text).toBe('ВставитьТекст id email ivan@lab.test');
  });

  it('miss does not rewrite', () => {
    const { replaced } = applyLocatorLabelToConstructor('Нажать > Войти', {
      status: 'miss',
      label: 'Войти',
      new_type: 'id',
      new_value: 'x',
    });
    expect(replaced).toBe(0);
  });
});
