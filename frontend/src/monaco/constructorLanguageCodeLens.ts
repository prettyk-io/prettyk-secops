/**
 * Page-call CodeLens for WireK / PrettyK (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import type { KeywordCatalog } from '../keywords/catalog';

/** Вызов страницы: `login.Войти` в начале строки. */
const PAGE_CALL_LINE_RE = /^\s*([A-Za-z_]\w*)\./;

type GetContext = () =>
  | { catalog: KeywordCatalog; variables: readonly string[]; pageIds: readonly string[] }
  | undefined;

export function createConstructorCodeLensProvider(
  getContext: GetContext,
  gotoPageCommandId: string,
): monacoNs.languages.CodeLensProvider {
  return {
    provideCodeLenses(model) {
      const active = getContext();
      const pageIds = new Set(active?.pageIds ?? []);
      if (pageIds.size === 0) {
        return { lenses: [], dispose: () => undefined };
      }
      const lenses: monacoNs.languages.CodeLens[] = [];
      const lineCount = model.getLineCount();
      for (let line = 1; line <= lineCount; line += 1) {
        const text = model.getLineContent(line);
        const match = PAGE_CALL_LINE_RE.exec(text);
        if (!match) {
          continue;
        }
        const pageId = match[1] ?? '';
        if (!pageIds.has(pageId)) {
          continue;
        }
        lenses.push({
          range: {
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: Math.max(2, text.length + 1),
          },
          id: `pk-page-${pageId}-${String(line)}`,
          command: {
            id: gotoPageCommandId,
            title: `Страница «${pageId}»`,
            arguments: [pageId],
          },
        });
      }
      return {
        lenses,
        dispose: () => undefined,
      };
    },
    resolveCodeLens(_model, codeLens) {
      return codeLens;
    },
  };
}
