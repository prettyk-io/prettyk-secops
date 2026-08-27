/**
 * CodeLens 2.0 — «Проверить конструктор» прямо в редакторе (STU-RAILS / ED-6).
 *
 * Одна ленза на первой строке конструктора.
 * Клик → window CustomEvent 'pk-validate-constructor' → Studio / EditorWorkbench
 * вызывают validateConstructorBackend() и показывают результат через markers.
 */
import type * as monacoNs from 'monaco-editor';

export const VALIDATE_CONSTRUCTOR_COMMAND_ID = 'pk-validate-constructor';

let commandRegistered = false;

/** Зарегистрировать команду (один раз). */
export function registerValidateConstructorCommand(monaco: typeof monacoNs): void {
  if (commandRegistered) {
    return;
  }
  commandRegistered = true;
  monaco.editor.registerCommand(
    VALIDATE_CONSTRUCTOR_COMMAND_ID,
    () => {
      window.dispatchEvent(new CustomEvent(VALIDATE_CONSTRUCTOR_COMMAND_ID));
    },
  );
}

export function createScenarioValidateCodeLensProvider(): monacoNs.languages.CodeLensProvider {
  return {
    provideCodeLenses(model) {
      const lineCount = model.getLineCount();
      // Нет смысла показывать лензу на пустом редакторе.
      if (lineCount === 0) {
        return { lenses: [], dispose: () => undefined };
      }
      return {
        lenses: [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            },
            id: 'pk-validate-constructor-lens',
            command: {
              id: VALIDATE_CONSTRUCTOR_COMMAND_ID,
              title: '▶ Проверить конструктор',
            },
          },
        ],
        dispose: () => undefined,
      };
    },
    resolveCodeLens(_model, codeLens) {
      return codeLens;
    },
  };
}