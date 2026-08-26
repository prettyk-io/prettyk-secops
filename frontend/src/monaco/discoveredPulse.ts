/**
 * POC-CDP-4: «✨ Discovered» — кратковременный пульс происхождения в Monaco.
 *
 * После Accept канонического шага свежая DSL-строка получает неоновый highlight,
 * а на gutter кратковременно зажигается «✨ Discovered». Self-cleanup через
 * DISCOVERED_PULSE_MS — пульс именно кратковременный, не перманентная маркировка.
 */
import type { editor } from 'monaco-editor';

/** Длительность пульса до снятия декорации. */
export const DISCOVERED_PULSE_MS = 1600;

/**
 * Подсветить строку как только что нарисованную «✨ Discovered».
 * Ставит line-декорацию (неоновый фон) + glyph-margin пульс, затем снимает.
 *
 * Безопасна: не трогает модель, не инжектит текст, работает только с
 * декорациями Monaco (не ломает SPA/вёрстку целевой страницы).
 */
export function flashDiscoveredLine(
  ed: editor.IStandaloneCodeEditor,
  lineNumber: number,
): void {
  const model = ed.getModel();
  if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) return;

  const decorations = ed.deltaDecorations([], [
    {
      range: {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: 'pk-discovered-line',
        glyphMarginClassName: 'pk-discovered-gutter',
      },
    },
  ]);

  ed.revealLineInCenter(lineNumber);

  setTimeout(() => {
    ed.deltaDecorations(decorations, []);
  }, DISCOVERED_PULSE_MS);
}
