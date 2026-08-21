/**
 * Пусть/Секрет RHS AC (S3776).
 */
import type * as monacoNs from 'monaco-editor';
import {
  languageKwItemsForModel,
  OBJECT_RHS,
  OPERATION_RHS,
  ROOT_LANGUAGE_KEYWORDS,
} from './languageKeywords';
import { rhsMethodSuggestions } from './methodIdSuggest';
import type { CompletionList } from './completionTypes';

const RHS_LABELS = new Set([
  'Склеить',
  'Содержит',
  'Обрезать',
  'СовпадаетРег',
  'ЗаменитьРег',
  'Размер',
]);

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

export function suggestAssignRhs(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  position: monacoNs.Position,
  trimmedStart: string,
  lineText: string,
  word: { startColumn: number; endColumn: number },
  triggerSuggest: monacoNs.languages.Command,
): CompletionList | undefined {
  const eqIdx = lineText.lastIndexOf('=');
  const assignHead = trimmedStart.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  if ((assignHead !== 'пусть' && assignHead !== 'секрет') || eqIdx < 0) {
    return undefined;
  }
  const rhs = trimmedStart.slice(trimmedStart.indexOf('=') + 1).trimStart();
  const rhsStartCol = eqIdx + 2;
  const range = lineRange(
    position,
    rhs.trim() ? word.startColumn : Math.max(rhsStartCol, word.startColumn),
    word.endColumn,
  );
  const pool = [
    ...ROOT_LANGUAGE_KEYWORDS.filter((k) => RHS_LABELS.has(k.label)),
    ...OBJECT_RHS,
    ...OPERATION_RHS,
  ];
  const filtered = rhs.trim()
    ? pool.filter((k) =>
        k.label.toLowerCase().startsWith(rhs.trim().split(/\s/)[0]!.toLowerCase()),
      )
    : pool;
  const calls = rhsMethodSuggestions(monaco, rhs, range, triggerSuggest);
  const words = languageKwItemsForModel(monaco, filtered, range, '0_', model);
  if (words.length || calls.length) {
    return { suggestions: [...words, ...calls] };
  }
  return { suggestions: languageKwItemsForModel(monaco, pool, range, '0_', model) };
}
