import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  normalizeThemeId,
  THEME_IDS,
} from './catalog';
import { monacoThemeId } from './monacoThemes';

describe('theme light/dark', () => {
  it('две темы', () => {
    expect(THEME_IDS).toEqual(['light', 'dark']);
    for (const id of THEME_IDS) {
      expect(isThemeId(id)).toBe(true);
      const def = getTheme(id);
      expect(def.id).toBe(id);
      expect(def.group).toBe(id);
      expect(monacoThemeId(id)).toMatch(/^pk-/);
    }
  });

  it('мигрирует legacy id', () => {
    expect(normalizeThemeId('light')).toBe('light');
    expect(normalizeThemeId('dark')).toBe('dark');
    expect(normalizeThemeId('kosmo-light')).toBe('light');
    expect(normalizeThemeId('kosmo-dark')).toBe('dark');
    expect(normalizeThemeId('nord-harbor')).toBe('dark');
    expect(normalizeThemeId('paper-lab')).toBe('light');
    expect(normalizeThemeId('nope')).toBe(DEFAULT_THEME_ID);
  });

  it('default тема — dark', () => {
    expect(DEFAULT_THEME_ID).toBe('dark');
  });
});
