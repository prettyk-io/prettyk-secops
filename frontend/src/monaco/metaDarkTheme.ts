/**
 * Monaco Theme Adapter for Meta Dark & Meta Light (PK-EC-3)
 *
 * Maps CSS tokens / Meta Design tokens to Monaco editor theme:
 * - Editor background = --pk-bg-surface / #0B101C (never pure black #000)
 * - Gutter = --pk-bg-surface / #0B101C
 * - Active line = --pk-cyan @ 0.08 / rgba(56, 189, 248, 0.08)
 * - Keywords = --pk-violet (#818CF8)
 * - Strings = --pk-cyan (#38BDF8)
 * - Comments = --pk-text-muted (#64748B)
 * - Selection = --pk-cyan @ 0.15 / rgba(56, 189, 248, 0.15)
 * - Cursor = --pk-cyan (#38BDF8)
 */

import type { editor } from 'monaco-editor';

export const META_DARK_MONACO_THEME_ID = 'prettyk-meta-dark';
export const META_LIGHT_MONACO_THEME_ID = 'prettyk-meta-light';

export interface MetaThemeCssTokens {
  bgSurface: string;
  bgDefault: string;
  cyan: string;
  violet: string;
  textMuted: string;
  textPrimary: string;
  selectionBg: string;
  lineHighlightBg: string;
  gutterForeground: string;
  activeGutterForeground: string;
  border: string;
}

export const CANON_META_DARK_TOKENS: MetaThemeCssTokens = {
  bgSurface: '#0B101C',
  bgDefault: '#080C16',
  cyan: '#38BDF8',
  violet: '#818CF8',
  textMuted: '#64748B',
  textPrimary: '#F1F5F9',
  selectionBg: '#38BDF826', // 15% opacity
  lineHighlightBg: '#38BDF814', // 8% opacity
  gutterForeground: '#64748B',
  activeGutterForeground: '#38BDF8',
  border: '#1E293B',
};

export const CANON_META_LIGHT_TOKENS: MetaThemeCssTokens = {
  bgSurface: '#FFFFFF',
  bgDefault: '#F8FAFC',
  cyan: '#0284C7',
  violet: '#6366F1',
  textMuted: '#64748B',
  textPrimary: '#0F172A',
  selectionBg: '#0284C726',
  lineHighlightBg: '#0284C70D',
  gutterForeground: '#94A3B8',
  activeGutterForeground: '#0284C7',
  border: '#CBD5E1',
};

/**
 * Resolves CSS tokens from document.documentElement or computed style,
 * with graceful fallback to Canon Meta Dark values.
 */
export function resolveMetaTokens(isLight = false): MetaThemeCssTokens {
  const fallback = isLight ? CANON_META_LIGHT_TOKENS : CANON_META_DARK_TOKENS;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }

  try {
    const computed = window.getComputedStyle(document.documentElement);
    const getVar = (name: string, def: string) => {
      const val = computed.getPropertyValue(name).trim();
      return val.length > 0 ? val : def;
    };

    return {
      bgSurface: getVar('--pk-bg-surface', fallback.bgSurface),
      bgDefault: getVar('--pk-bg-default', fallback.bgDefault),
      cyan: getVar('--pk-cyan', fallback.cyan),
      violet: getVar('--pk-violet', fallback.violet),
      textMuted: getVar('--pk-text-muted', fallback.textMuted),
      textPrimary: getVar('--pk-text-primary', fallback.textPrimary),
      selectionBg: getVar('--pk-selection-bg', fallback.selectionBg),
      lineHighlightBg: getVar('--pk-line-highlight-bg', fallback.lineHighlightBg),
      gutterForeground: getVar('--pk-gutter-fg', fallback.gutterForeground),
      activeGutterForeground: getVar('--pk-gutter-active-fg', fallback.activeGutterForeground),
      border: getVar('--pk-border', fallback.border),
    };
  } catch {
    return fallback;
  }
}

/**
 * Builds Monaco theme data for Meta Dark.
 */
export function buildMonacoMetaDarkTheme(customTokens?: Partial<MetaThemeCssTokens>): editor.IStandaloneThemeData {
  const tokens = { ...CANON_META_DARK_TOKENS, ...customTokens };

  return {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'pk.component', foreground: tokens.cyan.replace('#', ''), fontStyle: 'bold' },
      { token: 'pk.keyword', foreground: tokens.violet.replace('#', ''), fontStyle: 'bold' },
      { token: 'keyword', foreground: tokens.violet.replace('#', ''), fontStyle: 'bold' },
      { token: 'pk.string', foreground: tokens.cyan.replace('#', '') },
      { token: 'string', foreground: tokens.cyan.replace('#', '') },
      { token: 'pk.comment', foreground: tokens.textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'comment', foreground: tokens.textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'pk.argument', foreground: tokens.textPrimary.replace('#', '') },
      { token: 'pk.variable', foreground: 'FBBF24' },
      { token: 'pk.action', foreground: 'DDD6FE' },
      { token: 'delimiter', foreground: 'F1F5F9' },
      { token: 'delimiter.pk', foreground: 'F1F5F9' },
    ],
    colors: {
      'editor.background': tokens.bgSurface,
      'editorGutter.background': tokens.bgSurface,
      'editor.foreground': tokens.textPrimary,
      'editorLineNumber.foreground': tokens.gutterForeground,
      'editorLineNumber.activeForeground': tokens.activeGutterForeground,
      'editor.lineHighlightBackground': tokens.lineHighlightBg,
      'editor.selectionBackground': tokens.selectionBg,
      'editorCursor.foreground': tokens.cyan,
      'editorWidget.background': tokens.bgSurface,
      'editorWidget.border': tokens.border,
    },
  };
}

/**
 * Builds Monaco theme data for Meta Light.
 */
export function buildMonacoMetaLightTheme(customTokens?: Partial<MetaThemeCssTokens>): editor.IStandaloneThemeData {
  const tokens = { ...CANON_META_LIGHT_TOKENS, ...customTokens };

  return {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'pk.component', foreground: tokens.cyan.replace('#', ''), fontStyle: 'bold' },
      { token: 'pk.keyword', foreground: tokens.violet.replace('#', ''), fontStyle: 'bold' },
      { token: 'keyword', foreground: tokens.violet.replace('#', ''), fontStyle: 'bold' },
      { token: 'pk.string', foreground: tokens.cyan.replace('#', '') },
      { token: 'string', foreground: tokens.cyan.replace('#', '') },
      { token: 'pk.comment', foreground: tokens.textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'comment', foreground: tokens.textMuted.replace('#', ''), fontStyle: 'italic' },
      { token: 'pk.argument', foreground: tokens.textPrimary.replace('#', '') },
      { token: 'pk.variable', foreground: 'B45309' },
      { token: 'pk.action', foreground: '6D28D9' },
      { token: 'delimiter', foreground: '020617' },
      { token: 'delimiter.pk', foreground: '020617' },
    ],
    colors: {
      'editor.background': tokens.bgSurface,
      'editorGutter.background': tokens.bgSurface,
      'editor.foreground': tokens.textPrimary,
      'editorLineNumber.foreground': tokens.gutterForeground,
      'editorLineNumber.activeForeground': tokens.activeGutterForeground,
      'editor.lineHighlightBackground': tokens.lineHighlightBg,
      'editor.selectionBackground': tokens.selectionBg,
      'editorCursor.foreground': tokens.cyan,
      'editorWidget.background': tokens.bgSurface,
      'editorWidget.border': tokens.border,
    },
  };
}

/**
 * Idempotently registers Meta Dark and Meta Light themes with Monaco instance.
 */
export function registerMonacoMetaThemes(monacoInstance: typeof import('monaco-editor')) {
  if (!monacoInstance || !monacoInstance.editor) return;

  const darkTokens = resolveMetaTokens(false);
  const lightTokens = resolveMetaTokens(true);

  monacoInstance.editor.defineTheme(META_DARK_MONACO_THEME_ID, buildMonacoMetaDarkTheme(darkTokens));
  monacoInstance.editor.defineTheme(META_LIGHT_MONACO_THEME_ID, buildMonacoMetaLightTheme(lightTokens));
}
