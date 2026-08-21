import { describe, expect, it } from 'vitest';
import {
  applyLocatorHealToConstructor,
  healProposalSummary,
  parseLocatorHealLast,
} from './locatorHealPropose';

describe('locatorHealPropose', () => {
  it('parse ok proposal', () => {
    const p = parseLocatorHealLast({
      status: 'ok',
      old_type: 'id',
      old_value: 'login-btn',
      new_type: 'id',
      new_value: 'login-button-new',
      score: 0.72,
    });
    expect(p?.status).toBe('ok');
    expect(healProposalSummary(p!)).toContain('login-button-new');
  });

  it('apply replaces typed locator in canvas', () => {
    const canvas = 'Нажать id login-btn\nПауза 1';
    const { text, replaced } = applyLocatorHealToConstructor(canvas, {
      status: 'ok',
      old_type: 'id',
      old_value: 'login-btn',
      new_type: 'id',
      new_value: 'login-button-new',
    });
    expect(replaced).toBe(1);
    expect(text).toContain('id login-button-new');
    expect(text).not.toContain('login-btn');
  });

  it('miss does not rewrite', () => {
    const { replaced } = applyLocatorHealToConstructor('Нажать id x', {
      status: 'miss',
      old_value: 'x',
      new_value: 'y',
    });
    expect(replaced).toBe(0);
  });

  it('replaces bare value when type missing in line', () => {
    const { text, replaced } = applyLocatorHealToConstructor('Ждать login-btn', {
      status: 'ok',
      old_value: 'login-btn',
      new_type: 'id',
      new_value: 'login-v2',
    });
    expect(replaced).toBe(1);
    expect(text).toContain('login-v2');
  });
});
