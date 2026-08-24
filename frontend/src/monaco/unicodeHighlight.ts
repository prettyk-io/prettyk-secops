/**
 * MethodId — кириллица; Monaco по умолчанию подсвечивает «похожие» о/е/р как ASCII.
 */
import type { editor } from 'monaco-editor';

export const PK_UNICODE_HIGHLIGHT: editor.IEditorOptions['unicodeHighlight'] = {
  ambiguousCharacters: false,
  nonBasicASCII: false,
  includeComments: false,
  includeStrings: false,
  allowedLocales: { _os: true, _vscode: true, ru: true },
};
