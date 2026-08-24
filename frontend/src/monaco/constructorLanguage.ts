/**
 * Языковые возможности `pk-constructor`: автодополнение по позиции курсора, подсказка
 * сигнатуры, hover и маркеры диагностики.
 *
 * На пустой / языковой строке — те же keywords, что в песочнице (включая `?`).
 * Wire `component|…` — по текущей строке с `|`.
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import { componentNames } from '../keywords/catalog';
import type { ConstructorDiagnostic } from '../keywords/constructor';
import { looksLikeLanguageScript } from '../keywords/constructor';
import { logicalOffsetToModel } from '../keywords/offsets';
import {
  completionReplaceRange,
  TRY_QUESTION_SNIPPET,
  TRY_RELATED_SNIPPETS,
} from './languageKeywords';
import {
  buildRootLanguageCompletion,
  suggestEarlyCompletionGates,
  suggestFilteredVariables,
  suggestTryQuestion,
} from './completionGates';
import { createConstructorCodeLensProvider } from './constructorLanguageCodeLens';
import { createConstructorHoverProvider } from './constructorLanguageHover';
import { createConstructorSignatureHelpProvider } from './constructorLanguageSignature';
import { rootMethodSuggestions } from './methodIdSuggest';
import { CONSTRUCTOR_LANGUAGE_ID, PRETTYK_LANGUAGE_ID } from './setup';
import { suggestWireLogicalFallback as suggestWireLogicalFallbackImpl } from './wireCompletionFallback';

export const CONSTRUCTOR_MARKER_OWNER = 'pk-constructor';
/** CodeLens / scroll к разделу pages в форме. */
export const GOTO_PAGE_COMMAND_ID = 'pk.gotoPageSection';

export interface ConstructorContext {
  catalog: KeywordCatalog;
  variables: readonly string[];
  pageIds: readonly string[];
  /** Live formData — goto page.Op / глобальные Пусть·Секрет (pages+modules). */
  formData?: unknown;
}

let context: ConstructorContext | undefined;
let gotoPageCommandRegistered = false;

export function setConstructorContext(next: ConstructorContext): void {
  context = next;
}

/** Общий контекст для constructor + песочницы (catalog / variables). */
export function getConstructorContext(): ConstructorContext | undefined {
  return context;
}

/** Незакрытая подстановка: `...$par` или legacy `...${par` */
function openVariablePrefix(
  textBeforeCursor: string,
): { prefix: string; start: number; brace: boolean } | undefined {
  const braceOpen = textBeforeCursor.lastIndexOf('${');
  if (braceOpen !== -1) {
    const tail = textBeforeCursor.slice(braceOpen + 2);
    if (!tail.includes('}') && !tail.includes('|') && !/\s/.test(tail)) {
      return { prefix: tail, start: braceOpen + 2, brace: true };
    }
  }
  const dollar = textBeforeCursor.lastIndexOf('$');
  if (dollar === -1) {
    return undefined;
  }
  if (textBeforeCursor[dollar + 1] === '{') {
    return undefined;
  }
  const tail = textBeforeCursor.slice(dollar + 1);
  if (!tail || /[\s"|']/.test(tail[0] ?? '')) {
    return undefined;
  }
  if (/[^A-Za-z0-9_.\[\-]/.test(tail)) {
    return undefined;
  }
  return { prefix: tail, start: dollar + 1, brace: false };
}

function variableItems(
  monaco: typeof monacoNs,
  variables: readonly string[],
  range: monacoNs.IRange,
  wrap: '$' | false,
): monacoNs.languages.CompletionItem[] {
  return variables.map((name) => {
    let label = name;
    let insertText = name;
    if (wrap === '$') {
      label = `$${name}`;
      insertText = `$${name}`;
    }
    return {
      label,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText,
      detail: 'переменная манифеста',
      documentation: {
        value: 'Из save_as, Пусть/Секрет, макета страницы или data-модуля. Канон: `$имя`.',
      },
      range,
    };
  });
}

function logicalRange(
  model: monacoNs.editor.ITextModel,
  raw: string,
  logicalStart: number,
  logicalEnd: number,
): monacoNs.IRange {
  const start = model.getPositionAt(logicalOffsetToModel(raw, logicalStart));
  const end = model.getPositionAt(logicalOffsetToModel(raw, Math.max(logicalEnd, logicalStart)));
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: Math.max(end.column, start.column + 1),
  };
}

function linePrefix(model: monacoNs.editor.ITextModel, position: monacoNs.Position): string {
  return model.getLineContent(position.lineNumber).slice(0, position.column - 1);
}

function indentCol(lineText: string): number {
  let i = 0;
  while (i < lineText.length && (lineText[i] === ' ' || lineText[i] === '\t')) {
    i += 1;
  }
  return i + 1;
}

function createCompletionProvider(monaco: typeof monacoNs): monacoNs.languages.CompletionItemProvider {
  const triggerSuggest: monacoNs.languages.Command = {
    id: 'editor.action.triggerSuggest',
    title: 'Подсказать дальше',
  };

  return {
    triggerCharacters: ['|', '{', '.', '?', '$', ' ', '@'],
    provideCompletionItems(model, position) {
      const active = context;
      const raw = model.getValue();
      const lineText = linePrefix(model, position);
      const trimmedStart = lineText.trimStart();
      const lineStartCol = indentCol(lineText);
      const word = model.getWordUntilPosition(position);
      const defaultRange = completionReplaceRange(monaco, model, position);

      const openVarLine = openVariablePrefix(lineText);
      if (openVarLine !== undefined && active) {
        return suggestFilteredVariables(
          monaco,
          active.variables,
          openVarLine.prefix,
          {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: openVarLine.start + 1,
            endColumn: position.column,
          },
          (name) => `${name}}`,
        );
      }

      const early = suggestEarlyCompletionGates({
        monaco,
        model,
        position,
        trimmedStart,
        lineText,
        lineStartCol,
        defaultRange,
        word,
        triggerSuggest,
        catalog: active?.catalog,
        componentNamesList: componentNames,
        formData: active?.formData,
      });
      if (early) {
        return early;
      }

      const tryHit = suggestTryQuestion(
        monaco,
        model,
        position,
        trimmedStart,
        lineText,
        lineStartCol,
        TRY_QUESTION_SNIPPET,
      );
      if (tryHit) {
        return tryHit;
      }

      const atLineStart =
        trimmedStart === word.word || trimmedStart === '' || trimmedStart === '?';
      const useLanguageRoot =
        atLineStart ||
        looksLikeLanguageScript(raw) ||
        trimmedStart.length === 0 ||
        !trimmedStart.includes('|');

      if (useLanguageRoot && (atLineStart || word.word.length > 0 || trimmedStart === '')) {
        const root = buildRootLanguageCompletion(
          monaco,
          model,
          defaultRange,
          triggerSuggest,
          TRY_RELATED_SNIPPETS,
          {
            includeGates: atLineStart || trimmedStart === '',
            extra: [
              ...rootMethodSuggestions(monaco, defaultRange, triggerSuggest),
              ...(active ? variableItems(monaco, active.variables, defaultRange, '$') : []),
            ],
          },
        );
        return root;
      }

      if (!active) {
        return { suggestions: [] };
      }
      return suggestWireLogicalFallback(
        monaco,
        model,
        position,
        raw,
        active,
        triggerSuggest,
      );
    },
  };
}

function suggestWireLogicalFallback(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  raw: string,
  active: NonNullable<typeof context>,
  triggerSuggest: monacoNs.languages.Command,
): { suggestions: monacoNs.languages.CompletionItem[] } {
  return suggestWireLogicalFallbackImpl(monaco, model, position, raw, active, triggerSuggest, {
    logicalRange,
    openVariablePrefix,
    variableItems,
  });
}

type FeatureDisposables = {
  completion?: { dispose: () => void };
  signature?: { dispose: () => void };
  hover?: { dispose: () => void };
  codeLens?: { dispose: () => void };
  /** Паритет PrettyK (ED5): те же page CodeLens, что на WireK. */
  prettykCodeLens?: { dispose: () => void };
};

const FEATURES_KEY = '__pkConstructorLanguageFeatures';

function featureStore(): FeatureDisposables {
  const g = globalThis as typeof globalThis & {
    [FEATURES_KEY]?: FeatureDisposables;
  };
  if (!g[FEATURES_KEY]) {
    g[FEATURES_KEY] = {};
  }
  return g[FEATURES_KEY];
}

/** Регистрация AC/signature/hover/CodeLens; повторный вызов (HMR) снимает предыдущие. */
export function registerConstructorLanguageFeatures(monaco: typeof monacoNs): void {
  if (!gotoPageCommandRegistered) {
    monaco.editor.registerCommand(GOTO_PAGE_COMMAND_ID, (_accessor, pageId: unknown) => {
      if (typeof pageId !== 'string' || pageId.length === 0) {
        return;
      }
      window.dispatchEvent(new CustomEvent('pk-goto-page', { detail: { pageId } }));
    });
    gotoPageCommandRegistered = true;
  }
  const store = featureStore();
  store.completion?.dispose();
  store.signature?.dispose();
  store.hover?.dispose();
  store.codeLens?.dispose();
  store.prettykCodeLens?.dispose();
  store.completion = monaco.languages.registerCompletionItemProvider(
    CONSTRUCTOR_LANGUAGE_ID,
    createCompletionProvider(monaco),
  );
  store.signature = monaco.languages.registerSignatureHelpProvider(
    CONSTRUCTOR_LANGUAGE_ID,
    createConstructorSignatureHelpProvider(() => context),
  );
  store.hover = monaco.languages.registerHoverProvider(
    CONSTRUCTOR_LANGUAGE_ID,
    createConstructorHoverProvider(() => context, logicalRange),
  );
  const pageLenses = createConstructorCodeLensProvider(() => context, GOTO_PAGE_COMMAND_ID);
  store.codeLens = monaco.languages.registerCodeLensProvider(
    CONSTRUCTOR_LANGUAGE_ID,
    pageLenses,
  );
  store.prettykCodeLens = monaco.languages.registerCodeLensProvider(
    PRETTYK_LANGUAGE_ID,
    pageLenses,
  );
}

/** Переносит диагностику в маркеры редактора (подчёркивание + всплывающая подсказка). */
export function applyDiagnostics(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  diagnostics: readonly ConstructorDiagnostic[],
): void {
  const raw = model.getValue();
  const markers: monacoNs.editor.IMarkerData[] = diagnostics.map((diagnostic) => {
    const end = Math.max(diagnostic.end, diagnostic.start + 1);
    const range =
      diagnostic.coordinateSpace === 'model'
        ? {
            startLineNumber: model.getPositionAt(diagnostic.start).lineNumber,
            startColumn: model.getPositionAt(diagnostic.start).column,
            endLineNumber: model.getPositionAt(end).lineNumber,
            endColumn: model.getPositionAt(end).column,
          }
        : logicalRange(model, raw, diagnostic.start, end);
    return {
      severity:
        diagnostic.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: diagnostic.message,
      ...range,
    };
  });
  monaco.editor.setModelMarkers(model, CONSTRUCTOR_MARKER_OWNER, markers);
}
