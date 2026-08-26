import { describe, it, expect } from 'vitest';
import {
  CANON_META_DARK_TOKENS,
  CANON_META_LIGHT_TOKENS,
  buildMonacoMetaDarkTheme,
  buildMonacoMetaLightTheme,
  resolveMetaTokens,
  META_DARK_MONACO_THEME_ID,
  META_LIGHT_MONACO_THEME_ID,
} from './metaDarkTheme';

describe('Monaco Theme Adapter (PK-EC-3)', () => {
  it('has valid theme IDs for Meta Dark and Meta Light', () => {
    expect(META_DARK_MONACO_THEME_ID).toBe('prettyk-meta-dark');
    expect(META_LIGHT_MONACO_THEME_ID).toBe('prettyk-meta-light');
  });

  it('builds Meta Dark theme data matching exact CSS token specification', () => {
    const theme = buildMonacoMetaDarkTheme();
    expect(theme.base).toBe('vs-dark');
    expect(theme.inherit).toBe(true);

    // Verify colors
    expect(theme.colors['editor.background']).toBe('#0B101C');
    expect(theme.colors['editorGutter.background']).toBe('#0B101C');
    expect(theme.colors['editorCursor.foreground']).toBe('#38BDF8');
    expect(theme.colors['editor.lineHighlightBackground']).toBe('#38BDF814');
    expect(theme.colors['editor.selectionBackground']).toBe('#38BDF826');

    // Verify token syntax highlighting rules
    const kwRule = theme.rules.find((r) => r.token === 'pk.keyword' || r.token === 'keyword');
    expect(kwRule?.foreground).toBe('818CF8'); // Violet

    const strRule = theme.rules.find((r) => r.token === 'pk.string' || r.token === 'string');
    expect(strRule?.foreground).toBe('38BDF8'); // Cyan

    const cmtRule = theme.rules.find((r) => r.token === 'pk.comment' || r.token === 'comment');
    expect(cmtRule?.foreground).toBe('64748B'); // Muted
  });

  it('builds Meta Light theme data with valid light palette tokens', () => {
    const theme = buildMonacoMetaLightTheme();
    expect(theme.base).toBe('vs');
    expect(theme.colors['editor.background']).toBe('#FFFFFF');
    expect(theme.colors['editorCursor.foreground']).toBe('#0284C7');
  });

  it('resolves fallback tokens when window/document is mock or missing', () => {
    const darkTokens = resolveMetaTokens(false);
    expect(darkTokens.bgSurface).toBe(CANON_META_DARK_TOKENS.bgSurface);
    expect(darkTokens.cyan).toBe(CANON_META_DARK_TOKENS.cyan);
    expect(darkTokens.violet).toBe(CANON_META_DARK_TOKENS.violet);

    const lightTokens = resolveMetaTokens(true);
    expect(lightTokens.bgSurface).toBe(CANON_META_LIGHT_TOKENS.bgSurface);
    expect(lightTokens.cyan).toBe(CANON_META_LIGHT_TOKENS.cyan);
  });
});
