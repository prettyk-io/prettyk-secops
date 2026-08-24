/**
 * Ширина gutter номеров строк — как в VS Code: по числу цифр у последней строки.
 * 1–9 → 1, 10–99 → 2, 100–999 → 3, 1000+ → 4… Без запаса «под будущее».
 * lineDecorationsWidth держим явно — Monaco/react иногда сбрасывает в 0 при updateOptions.
 */
import type * as monacoNs from 'monaco-editor';
import { STUDIO_LINE_DECORATIONS_WIDTH } from './editorOptions';

export function lineNumbersMinCharsForLineCount(lineCount: number): number {
  const n = Math.max(1, Math.floor(lineCount));
  return String(n).length;
}

export type DynamicLineNumberCharsBinding = monacoNs.IDisposable & {
  sync: () => void;
};

export function bindDynamicLineNumberChars(
  editor: monacoNs.editor.IStandaloneCodeEditor,
): DynamicLineNumberCharsBinding {
  let lastChars = -1;

  const sync = () => {
    const model = editor.getModel();
    const lineCount = model?.getLineCount() ?? 1;
    const chars = lineNumbersMinCharsForLineCount(lineCount);
    if (chars === lastChars) {
      return;
    }
    lastChars = chars;
    /* decorationsWidth каждый раз с minChars — иначе чужой updateOptions может обнулить зазор. */
    editor.updateOptions({
      lineNumbersMinChars: chars,
      lineDecorationsWidth: STUDIO_LINE_DECORATIONS_WIDTH,
    });
  };

  sync();
  const content = editor.onDidChangeModelContent(sync);
  const modelChange = editor.onDidChangeModel(sync);
  return {
    sync,
    dispose() {
      content.dispose();
      modelChange.dispose();
    },
  };
}
