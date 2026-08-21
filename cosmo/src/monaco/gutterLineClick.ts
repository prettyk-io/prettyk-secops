/**
 * Клик по gutter номеров: курсор в начало строки, без выделения.
 * selectOnLineNumbers:false сам по себе только гасит select — позицию не ставит.
 */
import type { editor, IDisposable } from 'monaco-editor';
import type * as monacoNs from 'monaco-editor';

export function bindGutterLineCursor(
  ed: editor.IStandaloneCodeEditor,
  monaco: typeof monacoNs,
): IDisposable {
  return ed.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
      return;
    }
    const line =
      e.target.position?.lineNumber ?? e.target.range?.startLineNumber ?? undefined;
    if (line === undefined) {
      return;
    }
    e.event.preventDefault();
    ed.focus();
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.setSelection({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    });
  });
}
