/**
 * Wire component|action AC (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';
import { actionNames, formatSignature, getAction } from '../keywords/catalog';
import type { CompletionList } from './completionTypes';

export function suggestWireActions(
  monaco: typeof monacoNs,
  catalog: KeywordCatalog,
  lineText: string,
  defaultRange: monacoNs.IRange,
  componentNames: readonly string[],
  triggerSuggest?: monacoNs.languages.Command,
): CompletionList | undefined {
  const pipe = lineText.lastIndexOf('|');
  if (pipe < 0 || lineText.slice(pipe).includes(' ')) {
    return undefined;
  }
  const head = lineText.slice(0, pipe).trim();
  const component = head.split(/\s+/).pop() ?? '';
  if (!componentNames.includes(component)) {
    return undefined;
  }
  const names = actionNames(catalog, component);
  return {
    suggestions: names.map((name) => {
      const keyword = getAction(catalog, component, name);
      const hasParams = (keyword?.params.length ?? 0) > 0;
      return {
        label: name,
        kind: monaco.languages.CompletionItemKind.Method,
        insertText: hasParams ? `${name}|` : name,
        detail: keyword ? formatSignature(component, name, keyword).label : '',
        range: defaultRange,
        sortText: `0_${name}`,
        ...(hasParams && triggerSuggest ? { command: triggerSuggest } : {}),
      } satisfies monacoNs.languages.CompletionItem;
    }),
  };
}
