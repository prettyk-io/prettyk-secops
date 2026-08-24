/**
 * Автокомплит для PrettyK (`prettyk`): слова языка, MethodId ui, ворота.
 * Тяжёлые строки — группа «Операция» (AC only). Wire-компоненты с корня скрыты.
 */
import type * as monacoNs from 'monaco-editor';
import { componentNames } from '../keywords/catalog';
import { getConstructorContext } from './constructorLanguage';
import {
  AT_DIRECTIVE_KEYWORDS,
  completionReplaceRange,
  languageKwItemsForModel,
  TRY_QUESTION_SNIPPET,
  TRY_RELATED_SNIPPETS,
} from './languageKeywords';
import {
  buildRootLanguageCompletion,
  suggestEarlyCompletionGates,
  suggestFilteredVariables,
  suggestTryQuestion,
} from './completionGates';
import { rootMethodSuggestions } from './methodIdSuggest';
import { createPrettykCodeActionProvider } from './prettykCodeActions';
import { createPrettykFoldingRangeProvider } from './prettykFolding';
import { createPrettykHoverProvider } from './prettykHover';
import {
  createPrettykDefinitionProvider,
  createPrettykDocumentHighlightProvider,
  createPrettykReferenceProvider,
} from './prettykNavigation';
import { createPrettykSignatureHelpProvider } from './prettykSignatureHelp';
import { formatPrettykDocument } from './prettykFormat';
import { createPrettykDocumentSymbolProvider } from './prettykSymbols';
import {
  collectPrettykSemanticSpans,
  encodePrettykSemanticTokens,
  PRETTYK_SEMANTIC_TOKEN_TYPES,
} from './prettykSemanticTokens';
import { PRETTYK_LANGUAGE_ID } from './setup';
import { registerSpiderCompletionProvider } from './spiderCompletions';

function linePrefix(model: monacoNs.editor.ITextModel, position: monacoNs.Position): string {
  return model.getLineContent(position.lineNumber).slice(0, position.column - 1);
}

function openVariablePrefix(
  textBeforeCursor: string,
): { prefix: string; startColumn: number; closeBrace: boolean } | undefined {
  const brace = textBeforeCursor.lastIndexOf('${');
  if (brace !== -1) {
    const tail = textBeforeCursor.slice(brace + 2);
    if (!tail.includes('}') && !/\s/.test(tail)) {
      return { prefix: tail, startColumn: brace + 3, closeBrace: true };
    }
  }
  const dollar = textBeforeCursor.lastIndexOf('$');
  if (dollar === -1 || textBeforeCursor[dollar + 1] === '{') {
    return undefined;
  }
  const tail = textBeforeCursor.slice(dollar + 1);
  if (!tail || /[\s"']/.test(tail[0] ?? '')) {
    return undefined;
  }
  return { prefix: tail, startColumn: dollar + 2, closeBrace: false };
}

function indentCol(lineText: string): number {
  let i = 0;
  while (i < lineText.length && (lineText[i] === ' ' || lineText[i] === '\t')) {
    i += 1;
  }
  return i + 1;
}

/** Completion для PrettyK — экспорт ради unit harness (ED0). */
export function createPrettykCompletionProvider(
  monaco: typeof monacoNs,
): monacoNs.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['$', '{', '.', '|', '?', ' ', '@'],
    provideCompletionItems(model, position) {
      const active = getConstructorContext();
      const lineText = linePrefix(model, position);
      const word = model.getWordUntilPosition(position);
      const defaultRange = completionReplaceRange(monaco, model, position);
      const triggerSuggest: monacoNs.languages.Command = {
        id: 'editor.action.triggerSuggest',
        title: 'Подсказать дальше',
      };

      const openVar = openVariablePrefix(lineText);
      if (openVar !== undefined && active) {
        return suggestFilteredVariables(
          monaco,
          active.variables,
          openVar.prefix,
          {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: openVar.startColumn,
            endColumn: position.column,
          },
          (name) => (openVar.closeBrace ? `${name}}` : name),
        );
      }

      const trimmedStart = lineText.trimStart();
      const lineStartCol = indentCol(lineText);

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

      const atLineStart = trimmedStart === word.word || trimmedStart === '' || trimmedStart === '?';

      if (trimmedStart.startsWith('@')) {
        const rest = trimmedStart.slice(1);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: lineStartCol,
          endColumn: position.column,
        };
        const filtered = rest
          ? AT_DIRECTIVE_KEYWORDS.filter((k) => {
              const label = k.label.startsWith('@ ') ? k.label.slice(2) : k.label;
              return label.toLowerCase().startsWith(rest.toLowerCase());
            })
          : [...AT_DIRECTIVE_KEYWORDS];
        return { suggestions: languageKwItemsForModel(monaco, filtered, range, '0_', model) };
      }

      if (!(atLineStart || word.word.length > 0)) {
        return {
          suggestions: [
            ...rootMethodSuggestions(monaco, defaultRange, triggerSuggest),
            ...(active
              ? active.variables.map((name) => ({
                  label: `$${name}`,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: `$${name}`,
                  detail: 'переменная манифеста',
                  range: defaultRange,
                  sortText: `6_${name}`,
                }))
              : []),
          ],
        };
      }

      return buildRootLanguageCompletion(
        monaco,
        model,
        defaultRange,
        triggerSuggest,
        TRY_RELATED_SNIPPETS,
        {
          includeGates: atLineStart,
          extra: [
            ...rootMethodSuggestions(monaco, defaultRange, triggerSuggest),
            ...(active
              ? active.variables.map((name) => ({
                  label: `$${name}`,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  insertText: `$${name}`,
                  detail: 'переменная манифеста',
                  range: defaultRange,
                  sortText: `6_${name}`,
                }))
              : []),
          ],
        },
      );
    },
  };
}

type FeatureDisposables = {
  completion?: { dispose: () => void };
  symbols?: { dispose: () => void };
  definition?: { dispose: () => void };
  references?: { dispose: () => void };
  documentHighlight?: { dispose: () => void };
  codeAction?: { dispose: () => void };
  folding?: { dispose: () => void };
  hover?: { dispose: () => void };
  signature?: { dispose: () => void };
  semantic?: { dispose: () => void };
  formatting?: { dispose: () => void };
};

const FEATURES_KEY = '__pkScriptLanguageFeatures';

function featureStore(): FeatureDisposables {
  const g = globalThis as typeof globalThis & {
    [FEATURES_KEY]?: FeatureDisposables;
  };
  if (!g[FEATURES_KEY]) {
    g[FEATURES_KEY] = {};
  }
  return g[FEATURES_KEY];
}

/** Регистрация AC + DSL services; повторный вызов (HMR) снимает предыдущие провайдеры. */
export function registerScriptLanguageFeatures(monaco: typeof monacoNs): void {
  const store = featureStore();
  store.completion?.dispose();
  store.symbols?.dispose();
  store.definition?.dispose();
  store.references?.dispose();
  store.documentHighlight?.dispose();
  store.codeAction?.dispose();
  store.folding?.dispose();
  store.hover?.dispose();
  store.signature?.dispose();
  store.semantic?.dispose();
  store.formatting?.dispose();
  store.completion = monaco.languages.registerCompletionItemProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykCompletionProvider(monaco),
  );
  store.symbols = monaco.languages.registerDocumentSymbolProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykDocumentSymbolProvider(monaco),
  );
  store.definition = monaco.languages.registerDefinitionProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykDefinitionProvider(monaco),
  );
  store.references = monaco.languages.registerReferenceProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykReferenceProvider(),
  );
  store.documentHighlight = monaco.languages.registerDocumentHighlightProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykDocumentHighlightProvider(),
  );
  store.codeAction = monaco.languages.registerCodeActionProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykCodeActionProvider(),
  );
  store.folding = monaco.languages.registerFoldingRangeProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykFoldingRangeProvider(monaco),
  );
  store.hover = monaco.languages.registerHoverProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykHoverProvider(),
  );
  store.signature = monaco.languages.registerSignatureHelpProvider(
    PRETTYK_LANGUAGE_ID,
    createPrettykSignatureHelpProvider(),
  );
  // FE-12 slice1: Секрет + MethodId root only (не весь grammar).
  store.semantic = monaco.languages.registerDocumentSemanticTokensProvider(
    PRETTYK_LANGUAGE_ID,
    {
      getLegend: () => ({
        tokenTypes: [...PRETTYK_SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [],
      }),
      provideDocumentSemanticTokens: (model) => {
        const spans = collectPrettykSemanticSpans(model.getValue());
        return { data: encodePrettykSemanticTokens(spans) };
      },
      releaseDocumentSemanticTokens: () => undefined,
    },
  );
  registerSpiderCompletionProvider(monaco);
  store.formatting = monaco.languages.registerDocumentFormattingEditProvider(
    PRETTYK_LANGUAGE_ID,
    {
      provideDocumentFormattingEdits(model) {
        const { formatted } = formatPrettykDocument(model.getValue());
        const lastLine = model.getLineCount();
        const lastCol = model.getLineMaxColumn(lastLine);
        return [{
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: lastLine,
            endColumn: lastCol,
          },
          text: formatted,
        }];
      },
    },
  );
}
