import type * as monacoNs from 'monaco-editor';
import { CONSTRUCTOR_VISIBLE_LINES } from './constructorLayout';

export function missingLineBreaks(
  lineCount: number,
  minimumLines = CONSTRUCTOR_VISIBLE_LINES,
): string {
  return lineCount < minimumLines ? '\n'.repeat(minimumLines - lineCount) : '';
}

/**
 * Целевой размер полотна: минимум 32; рост сверх 32 — только когда контент
 * уже занял 32+ строк (плюс не больше одной пустой строки «под курсор»).
 */
export function targetConstructorLineCount(
  lineCount: number,
  lastNonEmptyLineNumber: number,
  minimumLines = CONSTRUCTOR_VISIBLE_LINES,
): number {
  const contentThrough = Math.max(0, lastNonEmptyLineNumber);
  if (contentThrough < minimumLines) {
    return minimumLines;
  }
  const trailing = Math.max(0, lineCount - contentThrough);
  return contentThrough + Math.min(trailing, 1);
}

export function lastNonEmptyLineNumber(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.trim().length > 0) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * Конструктор: пол ≥ 32 и потолок на пустой Enter в хвосте.
 * Запись через Monaco, чтобы undo / onChange оставались согласованы.
 */
export function bindMinimumConstructorLines(
  editor: monacoNs.editor.IStandaloneCodeEditor,
  minimumLines = CONSTRUCTOR_VISIBLE_LINES,
): monacoNs.IDisposable {
  let correcting = false;

  const restoreCanvas = () => {
    if (correcting) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }

    const lineCount = model.getLineCount();
    const lines: string[] = [];
    for (let i = 1; i <= lineCount; i += 1) {
      lines.push(model.getLineContent(i));
    }
    const target = targetConstructorLineCount(
      lineCount,
      lastNonEmptyLineNumber(lines),
      minimumLines,
    );

    if (lineCount === target) {
      return;
    }

    correcting = true;
    try {
      if (lineCount < target) {
        const lastLine = lineCount;
        editor.executeEdits('pk-minimum-constructor-lines', [
          {
            range: {
              startLineNumber: lastLine,
              startColumn: model.getLineMaxColumn(lastLine),
              endLineNumber: lastLine,
              endColumn: model.getLineMaxColumn(lastLine),
            },
            text: '\n'.repeat(target - lineCount),
            forceMoveMarkers: true,
          },
        ]);
        return;
      }

      const sel = editor.getSelection();
      editor.executeEdits('pk-clamp-constructor-lines', [
        {
          range: {
            startLineNumber: target,
            startColumn: model.getLineMaxColumn(target),
            endLineNumber: lineCount,
            endColumn: model.getLineMaxColumn(lineCount),
          },
          text: '',
          forceMoveMarkers: true,
        },
      ]);
      if (sel && sel.startLineNumber > target) {
        const col = model.getLineMaxColumn(target);
        editor.setPosition({ lineNumber: target, column: col });
      }
    } finally {
      correcting = false;
    }
  };

  restoreCanvas();
  const content = editor.onDidChangeModelContent(restoreCanvas);
  const modelChange = editor.onDidChangeModel(restoreCanvas);
  return {
    dispose() {
      content.dispose();
      modelChange.dispose();
    },
  };
}
