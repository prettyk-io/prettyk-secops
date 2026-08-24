/**
 * CodeAction: alias MethodId → канон (ED3).
 */
import type * as monacoNs from 'monaco-editor';
import { methodIdAliases } from '../keywords/methodIds';

export interface AliasHit {
  alias: string;
  canonical: string;
  line: number;
  startColumn: number;
  endColumn: number;
}

/** Первое слово вызова на линии (MethodId). */
const LEADING_TOKEN_RE = /^\s*([A-Za-zА-Яа-яЁё_][\wА-Яа-яЁё]*)/;

export function findAliasAtLine(lineText: string, lineNumber: number): AliasHit | undefined {
  const match = LEADING_TOKEN_RE.exec(lineText);
  if (!match?.[1]) {
    return undefined;
  }
  const alias = match[1];
  const canonical = methodIdAliases[alias];
  if (!canonical || canonical === alias) {
    return undefined;
  }
  const startColumn = (match.index ?? 0) + match[0].indexOf(alias) + 1;
  return {
    alias,
    canonical,
    line: lineNumber,
    startColumn,
    endColumn: startColumn + alias.length,
  };
}

export function findAliasAtPosition(
  lineText: string,
  lineNumber: number,
  column: number,
): AliasHit | undefined {
  const hit = findAliasAtLine(lineText, lineNumber);
  if (!hit) {
    return undefined;
  }
  if (column < hit.startColumn || column > hit.endColumn) {
    return undefined;
  }
  return hit;
}

export function createPrettykCodeActionProvider(): monacoNs.languages.CodeActionProvider {
  return {
    provideCodeActions(model, range) {
      const line = range.startLineNumber;
      const lineText = model.getLineContent(line);
      const hit = findAliasAtPosition(lineText, line, range.startColumn);
      if (!hit) {
        return { actions: [], dispose: () => undefined };
      }
      const editRange: monacoNs.IRange = {
        startLineNumber: hit.line,
        startColumn: hit.startColumn,
        endLineNumber: hit.line,
        endColumn: hit.endColumn,
      };
      const action: monacoNs.languages.CodeAction = {
        title: `Заменить на канон «${hit.canonical}»`,
        kind: 'quickfix',
        isPreferred: true,
        edit: {
          edits: [
            {
              resource: model.uri,
              versionId: model.getVersionId(),
              textEdit: {
                range: editRange,
                text: hit.canonical,
              },
            },
          ],
        },
      };
      return {
        actions: [action],
        dispose: () => undefined,
      };
    },
  };
}
