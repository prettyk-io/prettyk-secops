/**
 * Rename для PrettyK (PK-TRM-8 / E1): переименование переменных `$name` / `${name}`.
 * Только простые идентификаторы (без `.` / `[]` / `ENV:`); `$` и `${}` сохраняются.
 */
import type * as monacoNs from 'monaco-editor';
import { findRefsInText } from '../keywords/refs';
import { findVarDefinition } from './prettykVarOccurrences';

const SIMPLE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface RefHit {
  token: string;
  path: string;
  start: number;
  end: number;
}

/** Ссылка переменной под курсором (`$name` / `${name}`), либо undefined. */
function refAtPosition(lineText: string, column: number): RefHit | undefined {
  for (const ref of findRefsInText(lineText)) {
    const startColumn = ref.start + 1;
    const endColumn = startColumn + ref.token.length;
    if (column >= startColumn && column <= endColumn && ref.path) {
      return ref as RefHit;
    }
  }
  return undefined;
}

/** Диапазон только имени внутри `$name` / `${name}` — без `$` и фигурных скобок. */
function nameSpanOf(ref: RefHit, line: number, name: string): monacoNs.IRange {
  let start0: number;
  if (ref.token.startsWith('${')) {
    const inner = ref.token.slice(2, -1);
    const lead = inner.length - inner.trimStart().length;
    start0 = ref.start + 2 + lead;
  } else {
    start0 = ref.start + 1;
  }
  return {
    startLineNumber: line,
    startColumn: start0 + 1,
    endLineNumber: line,
    endColumn: start0 + 1 + name.length,
  };
}

export function createPrettykRenameProvider(): monacoNs.languages.RenameProvider {
  return {
    resolveRenameLocation(model, position) {
      const lineText = model.getLineContent(position.lineNumber);
      const ref = refAtPosition(lineText, position.column);
      if (!ref) {
        return null;
      }
      const name = ref.path;
      if (!name || !SIMPLE_IDENT_RE.test(name)) {
        return null;
      }
      // Переименование только объявленных переменных (Пусть/Секрет).
      if (!findVarDefinition(model.getValue(), name)) {
        return null;
      }
      return {
        range: nameSpanOf(ref, position.lineNumber, name),
        text: name,
      };
    },
    provideRenameEdits(model, position, newName) {
      if (!newName || !SIMPLE_IDENT_RE.test(newName)) {
        return null;
      }
      const lineText = model.getLineContent(position.lineNumber);
      const ref = refAtPosition(lineText, position.column);
      if (!ref) {
        return null;
      }
      const name = ref.path;
      if (!name || !SIMPLE_IDENT_RE.test(name) || name === newName) {
        return null;
      }

      const lines = model.getValue().split(/\r?\n/);
      const edits: monacoNs.languages.IWorkspaceTextEdit[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i] ?? '';
        for (const hit of findRefsInText(raw)) {
          if (hit.path !== name) {
            continue;
          }
          edits.push({
            resource: model.uri,
            versionId: model.getVersionId(),
            textEdit: {
              range: nameSpanOf(hit as RefHit, i + 1, name),
              text: newName,
            },
          });
        }
      }
      if (edits.length === 0) {
        return null;
      }
      return { edits };
    },
  };
}
