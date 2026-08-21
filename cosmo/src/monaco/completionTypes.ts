/**
 * Shared Monaco completion list shape.
 */
import type * as monacoNs from 'monaco-editor';

export type CompletionList = { suggestions: monacoNs.languages.CompletionItem[] };
