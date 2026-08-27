/**
 * Общие опции Monaco для формы и предпросмотра.
 */
import type { editor } from 'monaco-editor';
import type { ThemeId } from '../theme/catalog';
import { MONO_STACK } from '../theme/tokens';
import {
  editorExtrasForTheme,
  monacoThemeId as monacoThemeIdFromCatalog,
} from '../theme/monacoThemes';
import { CONSTRUCTOR_LINE_HEIGHT } from './constructorLayout';
import { PK_UNICODE_HIGHLIGHT } from './unicodeHighlight';
export {
  CONSTRUCTOR_EDITOR_HEIGHT,
  CONSTRUCTOR_LINE_HEIGHT,
  CONSTRUCTOR_VISIBLE_LINES,
} from './constructorLayout';

export function monacoThemeId(themeId: ThemeId): string {
  return monacoThemeIdFromCatalog(themeId);
}

/** Зазор после цифр до текста (Monaco layout). Не путать с CSS padding — тот на absolute .line-numbers с border-box схлопывается в 0. */
export const STUDIO_LINE_DECORATIONS_WIDTH = 10;

/**
 * Gutter Studio (PrettyK + WireK): одинаковая колонка номеров.
 * Ширина цифр — bindDynamicLineNumberChars; боковые отступы — CSS на .pk-studio-monaco (не на pane).
 */
export const STUDIO_LINE_GUTTER_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  lineNumbers: 'on',
  glyphMargin: false,
  /** PrettyK folding provider уже зарегистрирован — без этого маркеры мёртвые. */
  folding: true,
  showFoldingControls: 'mouseover',
  lineDecorationsWidth: STUDIO_LINE_DECORATIONS_WIDTH,
  lineNumbersMinChars: 1,
};

/** Компактный редактор конструктора / скрипта. */
export const COMPACT_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...STUDIO_LINE_GUTTER_OPTIONS,
  // runtime monaco 0.56; в public d.ts опции уже нет
  ...({ selectOnLineNumbers: false } as editor.IStandaloneEditorConstructionOptions),
  codeLens: true,
  guides: { indentation: true, highlightActiveIndentation: false, bracketPairs: false },
  minimap: { enabled: false },
  stickyScroll: { enabled: true },
  overviewRulerLanes: 3,
  overviewRulerBorder: true,
  hideCursorInOverviewRuler: true,
  scrollBeyondLastColumn: 0,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  wrappingStrategy: 'advanced',
  wordBasedSuggestions: 'off',
  renderLineHighlight: 'none',
  // Word-occurrences Monaco — нет; подсветка $var через DocumentHighlightProvider.
  occurrencesHighlight: 'off',
  selectionHighlight: true,
  matchBrackets: 'near',
  /** Alt+Click = multi-cursor (VS Code Win); Ctrl/⌘+Click = Go to Definition. */
  multiCursorModifier: 'alt',
  links: true,
  /** FE-ED-1: Def / Refs / Peek / Quick Fix из провайдеров PrettyK/WireK. */
  contextmenu: true,
  roundedSelection: false,
  cursorStyle: 'line-thin',
  automaticLayout: true,
  fixedOverflowWidgets: true,
  fontLigatures: true,
  find: {
    addExtraSpaceOnTop: false,
    autoFindInSelection: 'never',
    seedSearchStringFromSelection: 'never',
  },
  hover: { delay: 120 },
  suggest: { showWords: false, showStatusBar: true },
  quickSuggestions: { other: true, comments: false, strings: true },
  quickSuggestionsDelay: 120,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'off',
  scrollbar: {
    vertical: 'auto',
    horizontal: 'hidden',
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 3,
    handleMouseWheel: true,
    alwaysConsumeMouseWheel: false,
  },
  padding: { top: 6, bottom: 6 },
  fontSize: 13,
  fontFamily: MONO_STACK,
  unicodeHighlight: PK_UNICODE_HIGHLIGHT,
};

export const CONSTRUCTOR_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...COMPACT_EDITOR_OPTIONS,
  lineHeight: CONSTRUCTOR_LINE_HEIGHT,
  // semanticHighlighting выключен: slice1-провайдер (Секрет/Пусть/MethodId root)
  // перекрывал monarch pk.* токены дефолтным цветом без semanticTokenColors —
  // методы теряли цвет. Monarch красит всё сам (pk.keyword/method.zap/method.selenium).
  ...({ 'semanticHighlighting.enabled': false } as editor.IStandaloneEditorConstructionOptions),
};

export function constructorOptionsForTheme(
  themeId: ThemeId,
): editor.IStandaloneEditorConstructionOptions {
  return {
    ...CONSTRUCTOR_EDITOR_OPTIONS,
    ...editorExtrasForTheme(themeId),
    lineHeight: CONSTRUCTOR_LINE_HEIGHT,
  };
}

export const PREVIEW_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...STUDIO_LINE_GUTTER_OPTIONS,
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  automaticLayout: true,
  fontLigatures: true,
  fontSize: 12,
  fontFamily: MONO_STACK,
  renderLineHighlight: 'none',
  contextmenu: false,
  /* Как PrettyK COMPACT: зазор над подсветкой 1-й строки. */
  padding: { top: 6, bottom: 6 },
  scrollbar: {
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 3,
    alwaysConsumeMouseWheel: false,
  },
  unicodeHighlight: PK_UNICODE_HIGHLIGHT,
};

export function previewOptionsForTheme(
  themeId: ThemeId,
): editor.IStandaloneEditorConstructionOptions {
  const extras = editorExtrasForTheme(themeId);
  return {
    ...PREVIEW_EDITOR_OPTIONS,
    cursorStyle: extras.cursorStyle,
    renderLineHighlight: extras.renderLineHighlight,
    fontLigatures: extras.fontLigatures,
    fontFamily: extras.fontFamily ?? PREVIEW_EDITOR_OPTIONS.fontFamily,
  };
}
