/**
 * Wire logical fallback suggestions — extract from constructorLanguage (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import {
  actionNames,
  formatDefault,
  formatParam,
  formatSignature,
  getAction,
  type KeywordCatalog,
} from '../keywords/catalog';
import {
  describeAction,
  parseConstructor,
  segmentAtOffset,
} from '../keywords/constructor';
import { modelOffsetToLogical, toLogicalConstructor } from '../keywords/offsets';
import { rootMethodSuggestions } from './methodIdSuggest';
import {
  matchingSugarAliases,
} from './monacoKeywordSugar';

export type WireFallbackContext = {
  catalog: KeywordCatalog;
  variables: readonly string[];
};

type OpenVar = { prefix: string; start: number; brace?: boolean };

export type WireFallbackDeps = {
  logicalRange: (
    model: monacoNs.editor.ITextModel,
    raw: string,
    start: number,
    end: number,
  ) => monacoNs.IRange;
  openVariablePrefix: (text: string) => OpenVar | undefined;
  variableItems: (
    monaco: typeof monacoNs,
    names: readonly string[],
    range: monacoNs.IRange,
    wrap: '$' | false,
  ) => monacoNs.languages.CompletionItem[];
};

export function suggestWireLogicalFallback(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  raw: string,
  active: WireFallbackContext,
  triggerSuggest: monacoNs.languages.Command,
  deps: WireFallbackDeps,
): { suggestions: monacoNs.languages.CompletionItem[] } {
  const logical = toLogicalConstructor(raw);
  const offset = modelOffsetToLogical(raw, model.getOffsetAt(position));
  const segment = segmentAtOffset(logical, offset);
  const parsed = parseConstructor(logical);
  const segmentRange = deps.logicalRange(model, raw, segment.start, segment.end);

  if (segment.index === 0) {
    return { suggestions: rootMethodSuggestions(monaco, segmentRange, triggerSuggest) };
  }
  if (segment.index === 1) {
    const names = actionNames(active.catalog, parsed.component);
    // DSL-F1: сахарные алиасы — короткие глаголы поверх канонических
    const sugar = matchingSugarAliases(names);
    const sugarItems: monacoNs.languages.CompletionItem[] = sugar.map((a) => {
      const keyword = getAction(active.catalog, parsed.component, a.canonical);
      const hasParams = (keyword?.params.length ?? 0) > 0;
      return {
        label: a.label,
        kind: monaco.languages.CompletionItemKind.Reference,
        insertText: hasParams ? `${a.canonical}|` : a.canonical,
        detail: keyword
          ? `${formatSignature(parsed.component, a.canonical, keyword).label}  (→ ${a.canonical})`
          : `→ ${a.canonical}`,
        sortText: `a_${a.label}`,
        range: segmentRange,
        ...(hasParams ? { command: triggerSuggest } : {}),
      } satisfies monacoNs.languages.CompletionItem;
    });
    const canonicalItems = names.map((name) => {
      const keyword = getAction(active.catalog, parsed.component, name);
      const hasParams = (keyword?.params.length ?? 0) > 0;
      return {
        label: name,
        kind: monaco.languages.CompletionItemKind.Method,
        insertText: hasParams ? `${name}|` : name,
        detail: keyword ? formatSignature(parsed.component, name, keyword).label : '',
        documentation: keyword
          ? { value: describeAction(parsed.component, name, keyword) }
          : undefined,
        range: segmentRange,
        ...(hasParams ? { command: triggerSuggest } : {}),
      } satisfies monacoNs.languages.CompletionItem;
    });
    return { suggestions: [...sugarItems, ...canonicalItems] };
  }

  const textBeforeCursor = logical.slice(segment.start, offset);
  const open = deps.openVariablePrefix(textBeforeCursor);
  if (open !== undefined) {
    const range = deps.logicalRange(model, raw, segment.start + open.start, offset);
    const filtered = active.variables.filter((v) => v.startsWith(open.prefix));
    const names = filtered.length > 0 ? filtered : active.variables;
    return { suggestions: deps.variableItems(monaco, names, range, false) };
  }

  const keyword = getAction(active.catalog, parsed.component, parsed.action);
  const argSuggestions: monacoNs.languages.CompletionItem[] = [];
  const argumentIndex = segment.index - 2;
  const param = keyword?.params[argumentIndex];
  if (keyword !== undefined && param !== undefined) {
    const defaultText = formatDefault(param);
    argSuggestions.push({
      label: param.name,
      kind: monaco.languages.CompletionItemKind.Property,
      insertText: defaultText === undefined ? '' : defaultText.replace(/^"|"$/g, ''),
      detail:
        `аргумент ${String(argumentIndex + 1)}: ${formatParam(param)}` +
        (param.type === undefined ? '' : ` : ${param.type}`),
      range: segmentRange,
      preselect: true,
    });
  }
  argSuggestions.push(...deps.variableItems(monaco, active.variables, segmentRange, '$'));
  return { suggestions: argSuggestions };
}
