/**
 * Monaco: light / dark.
 */
import type { editor } from 'monaco-editor';
import type { ThemeId } from './catalog';

export interface MonacoThemeBundle {
  themeId: string;
  data: editor.IStandaloneThemeData;
  editorExtras: editor.IStandaloneEditorConstructionOptions;
}

type Rule = editor.ITokenThemeRule;

function rules(map: Record<string, Omit<Rule, 'token'>>): Rule[] {
  return Object.entries(map).map(([token, rest]) => ({ token, ...rest }));
}

const BUNDLES: Record<ThemeId, MonacoThemeBundle> = {
  light: {
    themeId: 'pk-light',
    data: {
      base: 'vs',
      inherit: true,
      rules: rules({
        // WireK
        'pk.component': { foreground: '0284c7', fontStyle: 'bold' },
        'pk.action': { foreground: '6d28d9' },
        // PrettyK + общее; скобки = editor.foreground (чёрные), не selenium/variable
        'pk.argument': { foreground: '0f172a' },
        'pk.variable': { foreground: 'b45309' },
        'pk.variable.invalid': { foreground: 'b91c1c' },
        'delimiter.pk': { foreground: '020617' },
        delimiter: { foreground: '020617' },
        'pk.keyword': { foreground: '0e7490', fontStyle: 'bold' },
        'pk.scenario.failsafe': { foreground: 'ca8a04', fontStyle: 'bold' },
        'pk.facade': { foreground: '475569' },
        // 3 оттенка PrettyK: keyword / scanner(+локаторы) / selenium
        'pk.method.scanner': { foreground: '9a3412', fontStyle: 'bold' },
        'pk.method.selenium': { foreground: '1d4ed8', fontStyle: 'bold' },
        'pk.locator': { foreground: '9a3412', fontStyle: 'bold' },
        'pk.atheader': { foreground: 'ca8a04', fontStyle: 'bold' },
        'pk.comment': { foreground: '64748b', fontStyle: 'italic' },
        'pk.string': { foreground: '047857' },
        'pk.number': { foreground: 'be123c' },
      }),
      colors: {
        'editor.background': '#fbfdff',
        'editor.foreground': '#020617',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#020617',
        'editor.lineHighlightBackground': '#f1f5f9',
        'editor.selectionBackground': '#bae6fd88',
        'editorCursor.foreground': '#109bdf',
        'scrollbarSlider.background': '#94a3b866',
        'scrollbarSlider.hoverBackground': '#64748b99',
        'editorError.foreground': '#cf1322',
        'editorWarning.foreground': '#d97706',
        'editorBracketHighlight.foreground1': '#38bdf8',
        'editorBracketHighlight.foreground2': '#a855f7',
        'editorBracketHighlight.foreground3': '#f59e0b',
        'editorBracketHighlight.foreground4': '#22c55e',
        'editorBracketHighlight.foreground5': '#fb7185',
        'editorBracketHighlight.foreground6': '#fb923c',
        'editorBracketHighlight.unexpectedBracket.foreground': '#b91c1c',
      },
    },
    editorExtras: {
      cursorStyle: 'line-thin',
      renderLineHighlight: 'line',
      fontLigatures: true,
      bracketPairColorization: { enabled: true },
    },
  },
  dark: {
    themeId: 'pk-dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: rules({
        'pk.component': { foreground: '38bdf8', fontStyle: 'bold' },
        'pk.action': { foreground: 'ddd6fe' },
        'pk.argument': { foreground: 'f8fafc' },
        'pk.variable': { foreground: 'fbbf24' },
        'pk.variable.invalid': { foreground: 'f87171' },
        'delimiter.pk': { foreground: 'f1f5f9' },
        delimiter: { foreground: 'f1f5f9' },
        'pk.keyword': { foreground: '2dd4bf', fontStyle: 'bold' },
        'pk.scenario.failsafe': { foreground: 'facc15', fontStyle: 'bold' },
        'pk.facade': { foreground: 'cbd5e1' },
        'pk.method.scanner': { foreground: 'fb923c', fontStyle: 'bold' },
        'pk.method.selenium': { foreground: '60a5fa', fontStyle: 'bold' },
        'pk.locator': { foreground: 'fb923c', fontStyle: 'bold' },
        'pk.atheader': { foreground: 'facc15', fontStyle: 'bold' },
        'pk.comment': { foreground: '94a3b8', fontStyle: 'italic' },
        'pk.string': { foreground: '86efac' },
        'pk.number': { foreground: 'fda4af' },
      }),
      colors: {
        'editor.background': '#141a24',
        'editor.foreground': '#e2e8f0',
        'editorGutter.background': '#12171f',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#f8fafc',
        'editor.lineHighlightBackground': '#1e293b88',
        'editor.selectionBackground': '#0369a166',
        'editorCursor.foreground': '#7dd3fc',
        'scrollbarSlider.background': '#64748b66',
        'scrollbarSlider.hoverBackground': '#94a3b899',
        'editorError.foreground': '#f85149',
        'editorWarning.foreground': '#fbbf24',
        'editorBracketHighlight.foreground1': '#38bdf8',
        'editorBracketHighlight.foreground2': '#a855f7',
        'editorBracketHighlight.foreground3': '#f59e0b',
        'editorBracketHighlight.foreground4': '#22c55e',
        'editorBracketHighlight.foreground5': '#fb7185',
        'editorBracketHighlight.foreground6': '#fb923c',
        'editorBracketHighlight.unexpectedBracket.foreground': '#f87171',
      },
    },
    editorExtras: {
      cursorStyle: 'line',
      renderLineHighlight: 'all',
      fontLigatures: true,
      bracketPairColorization: { enabled: true },
    },
  },
};

export function monacoBundle(themeId: ThemeId): MonacoThemeBundle {
  return BUNDLES[themeId];
}

export function allMonacoBundles(): MonacoThemeBundle[] {
  return Object.values(BUNDLES);
}

export function monacoThemeId(themeId: ThemeId): string {
  return BUNDLES[themeId].themeId;
}

export function editorExtrasForTheme(
  themeId: ThemeId,
): editor.IStandaloneEditorConstructionOptions {
  return BUNDLES[themeId].editorExtras;
}
