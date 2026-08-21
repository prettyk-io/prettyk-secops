/**
 * Ранние ветки автокомплита PrettyK / constructor — вынесены из provideCompletionItems (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import { matchKeywordPrefix } from '../keywords/textScan';
import { suggestAssignRhs as suggestAssignRhsImpl } from './completionAssignRhs';
import type { CompletionList } from './completionTypes';
import { suggestWireActions as suggestWireActionsImpl } from './completionWireActions';
import { suggestFuzzWaveArgs } from './completionFuzzWave';
import {
  AT_DIRECTIVE_KEYWORDS,
  languageKwItemsForModel,
  OBJECT_KEYWORDS,
  OPERATION_KEYWORDS,
  ROOT_LANGUAGE_KEYWORDS,
  type LanguageKw,
} from './languageKeywords';
import { facadeMethodSuggestions, parseFacadePrefix } from './methodIdSuggest';

export type { CompletionList } from './completionTypes';

function lineRange(
  position: monacoNs.Position,
  startColumn: number,
  endColumn: number,
): monacoNs.IRange {
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn,
  };
}

export function suggestKeywordGate(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineStartCol: number,
  gate: 'Операция' | 'Объект',
  keywords: readonly LanguageKw[],
): CompletionList | undefined {
  const matched = matchKeywordPrefix(trimmedStart, gate);
  if (!matched) {
    return undefined;
  }
  const rest = matched.rest;
  const range = lineRange(position, lineStartCol, position.column);
  const filtered = rest
    ? keywords.filter((k) => k.label.toLowerCase().startsWith(rest.trim().toLowerCase()))
    : keywords;
  return { suggestions: languageKwItemsForModel(monaco, filtered, range, '0_', model) };
}

export function suggestFacadeMethods(
  monaco: typeof monacoNs,
  trimmedStart: string,
  defaultRange: monacoNs.IRange,
): CompletionList | undefined {
  const facadeCtx = parseFacadePrefix(trimmedStart);
  if (!facadeCtx || !trimmedStart.includes(' ')) {
    return undefined;
  }
  return { suggestions: facadeMethodSuggestions(monaco, facadeCtx.facade, defaultRange) };
}

export function suggestWireActions(
  monaco: typeof monacoNs,
  catalog: KeywordCatalog,
  lineText: string,
  defaultRange: monacoNs.IRange,
  componentNames: readonly string[],
  triggerSuggest?: monacoNs.languages.Command,
): CompletionList | undefined {
  return suggestWireActionsImpl(
    monaco,
    catalog,
    lineText,
    defaultRange,
    componentNames,
    triggerSuggest,
  );
}

export function suggestAssignRhs(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineText: string,
  word: { startColumn: number; endColumn: number },
  triggerSuggest: monacoNs.languages.Command,
): CompletionList | undefined {
  return suggestAssignRhsImpl(
    monaco,
    model,
    position,
    trimmedStart,
    lineText,
    word,
    triggerSuggest,
  );
}

/** @-directives (Description/Title/Tag/Author). */
export function suggestAtDirectives(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineStartCol: number,
): CompletionList | undefined {
  if (!trimmedStart.startsWith('@')) {
    return undefined;
  }
  const rest = trimmedStart.slice(1);
  const range = lineRange(position, lineStartCol, position.column);
  const filtered = rest
    ? AT_DIRECTIVE_KEYWORDS.filter((k) => {
        const label = k.label.startsWith('@ ') ? k.label.slice(2) : k.label;
        return label.toLowerCase().startsWith(rest.toLowerCase());
      })
    : [...AT_DIRECTIVE_KEYWORDS];
  if (filtered.length === 0) {
    return undefined;
  }
  return { suggestions: languageKwItemsForModel(monaco, filtered, range, '0_', model) };
}

export function suggestOpOrObjGate(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineStartCol: number,
): CompletionList | undefined {
  return (
    suggestKeywordGate(
      monaco,
      model,
      position,
      trimmedStart,
      lineStartCol,
      'Операция',
      OPERATION_KEYWORDS,
    ) ??
    suggestKeywordGate(
      monaco,
      model,
      position,
      trimmedStart,
      lineStartCol,
      'Объект',
      OBJECT_KEYWORDS,
    )
  );
}

export function suggestTryQuestion(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineText: string,
  lineStartCol: number,
  snippet: LanguageKw,
): CompletionList | undefined {
  if (!(trimmedStart === '?' || (trimmedStart === '' && lineText.endsWith('?')))) {
    return undefined;
  }
  const qCol = lineText.lastIndexOf('?') + 1;
  const range = lineRange(position, qCol > 0 ? qCol : lineStartCol, position.column);
  const suggestions = languageKwItemsForModel(monaco, [snippet], range, '0_', model);
  if (trimmedStart === '?') {
    return { suggestions };
  }
  return { suggestions };
}

export function pushRootLanguageGates(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  defaultRange: monacoNs.IRange,
  triggerSuggest: monacoNs.languages.Command,
  tryRelated: readonly LanguageKw[],
  into: monacoNs.languages.CompletionItem[],
): void {
  into.push({
    label: 'Объект',
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: 'Объект ',
    detail: 'контейнеры / локаторы (AC) → Пусть … =',
    documentation: {
      value:
        'Не runtime-ворота. Выбери тип — вставится `Пусть $x = Объект|Список|Элемент…`. В сценарии пиши без префикса-ворот.',
    },
    range: defaultRange,
    sortText: '0_Объект',
    command: triggerSuggest,
  });
  into.push({
    label: 'Операция',
    kind: monaco.languages.CompletionItemKind.Module,
    insertText: 'Операция ',
    detail: 'строки / regex (AC) → Пусть … =',
    documentation: {
      value:
        'Не runtime-ворота. Выбери глагол — вставится `Пусть $x = …`. В сценарии пиши без префикса Операция.',
    },
    range: defaultRange,
    sortText: '0_Операция',
    command: triggerSuggest,
  });
  into.push(...languageKwItemsForModel(monaco, tryRelated, defaultRange, '0_try_', model));
}

export function suggestFilteredVariables(
  monaco: typeof monacoNs,
  variables: readonly string[],
  prefix: string,
  range: monacoNs.IRange,
  insert: (name: string) => string,
  sortPrefix = '0_',
): CompletionList {
  const filtered = variables.filter((v) =>
    v.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  const names = filtered.length > 0 ? filtered : [...variables];
  return {
    suggestions: names.map((name) => ({
      label: name,
      kind: monaco.languages.CompletionItemKind.Variable,
      insertText: insert(name),
      detail: 'переменная',
      range,
      sortText: `${sortPrefix}${name}`,
    })),
  };
}

/** Корень PrettyK/constructor: keywords + ворота + optional try seed. */
export function buildRootLanguageCompletion(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  defaultRange: monacoNs.IRange,
  triggerSuggest: monacoNs.languages.Command,
  tryRelated: readonly LanguageKw[],
  opts: {
    seed?: monacoNs.languages.CompletionItem[];
    includeGates: boolean;
    extra?: monacoNs.languages.CompletionItem[];
  },
): CompletionList {
  const suggestions: monacoNs.languages.CompletionItem[] = [...(opts.seed ?? [])];
  suggestions.push(
    ...languageKwItemsForModel(monaco, ROOT_LANGUAGE_KEYWORDS, defaultRange, '0_', model),
  );
  if (opts.includeGates) {
    pushRootLanguageGates(monaco, model, defaultRange, triggerSuggest, tryRelated, suggestions);
  }
  if (opts.extra) {
    suggestions.push(...opts.extra);
  }
  return { suggestions };
}

export type EarlyCompletionGateArgs = {
  monaco: typeof monacoNs;
  model: monacoNs.editor.ITextModel;
  position: monacoNs.Position;
  trimmedStart: string;
  lineText: string;
  lineStartCol: number;
  defaultRange: monacoNs.IRange;
  word: { startColumn: number; endColumn: number };
  triggerSuggest: monacoNs.languages.Command;
  catalog: KeywordCatalog | undefined;
  componentNamesList: readonly string[];
  formData?: unknown;
};

/** Ранние ветки AC до root — общий оркестратор. */
export function suggestEarlyCompletionGates(
  args: EarlyCompletionGateArgs,
): CompletionList | undefined {
  const {
    monaco,
    model,
    position,
    trimmedStart,
    lineText,
    lineStartCol,
    defaultRange,
    word,
    triggerSuggest,
    catalog,
    componentNamesList,
    formData,
  } = args;
  const atDir = suggestAtDirectives(monaco, model, position, trimmedStart, lineStartCol);
  if (atDir) {
    return atDir;
  }
  const gate = suggestOpOrObjGate(monaco, model, position, trimmedStart, lineStartCol);
  if (gate) {
    return gate;
  }
  const fuzzWave = suggestFuzzWaveArgs(monaco, trimmedStart, defaultRange, formData);
  if (fuzzWave) {
    return fuzzWave;
  }
  const facade = suggestFacadeMethods(monaco, trimmedStart, defaultRange);
  if (facade) {
    return facade;
  }
  if (catalog) {
    const wire = suggestWireActions(
      monaco,
      catalog,
      lineText,
      defaultRange,
      componentNamesList,
      triggerSuggest,
    );
    if (wire) {
      return wire;
    }
  }
  return suggestAssignRhs(
    monaco,
    model,
    position,
    trimmedStart,
    lineText,
    word,
    triggerSuggest,
  );
}
