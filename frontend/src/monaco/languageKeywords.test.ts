import { describe, expect, it } from 'vitest';
import {
  completionReplaceRange,
  lineTailEmptyAfterRange,
  languageKwItems,
} from './languageKeywords';
import type * as monacoNs from 'monaco-editor';

const fakeMonaco = {
  languages: {
    CompletionItemKind: { Keyword: 1, Snippet: 2 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  },
  editor: {
    getEditors: () => [],
  },
} as unknown as typeof monacoNs;

const range: monacoNs.IRange = {
  startLineNumber: 1,
  endLineNumber: 1,
  startColumn: 1,
  endColumn: 5,
};

describe('lineTailEmptyAfterRange', () => {
  it('empty / whitespace after range → true', () => {
    expect(lineTailEmptyAfterRange('Секр', 5)).toBe(true);
    expect(lineTailEmptyAfterRange('Секр   ', 5)).toBe(true);
  });

  it('non-empty after range → false', () => {
    expect(lineTailEmptyAfterRange('Секр Пусть $x = 1', 5)).toBe(false);
    expect(lineTailEmptyAfterRange('Пусть $password = "x"', 6)).toBe(false);
  });
});

describe('languageKwItems constructor vs keyword', () => {
  const kw = [
    {
      label: 'Секрет',
      insertText: 'Секрет $${1:name} = ${2:value}',
      detail: 'секрет',
    },
  ];

  it('full snippet when tail empty', () => {
    const [item] = languageKwItems(fakeMonaco, kw, range, '0_', true, '');
    expect(item?.insertText).toBe('Секрет $${1:name} = ${2:value}');
  });

  it('keyword only when tail not empty; space if glued', () => {
    const [glued] = languageKwItems(fakeMonaco, kw, range, '0_', false, 'Пусть $x');
    expect(glued?.insertText).toBe('Секрет ');
    const [spaced] = languageKwItems(fakeMonaco, kw, range, '0_', false, ' $x');
    expect(spaced?.insertText).toBe('Секрет');
  });
});

describe('completionReplaceRange', () => {
  it('расширяет word-range до выделения', () => {
    const model = {
      getWordUntilPosition: () => ({ startColumn: 10, endColumn: 14 }),
    } as unknown as monacoNs.editor.ITextModel;
    const monacoWithSel = {
      editor: {
        getEditors: () => [
          {
            getModel: () => model,
            getSelection: () => ({
              isEmpty: () => false,
              startLineNumber: 3,
              endLineNumber: 3,
              startColumn: 3,
              endColumn: 20,
            }),
          },
        ],
      },
    } as unknown as typeof monacoNs;
    const pos = { lineNumber: 3, column: 14 } as monacoNs.Position;
    expect(completionReplaceRange(monacoWithSel, model, pos)).toEqual({
      startLineNumber: 3,
      endLineNumber: 3,
      startColumn: 3,
      endColumn: 20,
    });
  });
});
