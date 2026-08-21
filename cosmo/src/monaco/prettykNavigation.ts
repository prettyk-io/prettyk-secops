/**
 * Definition + References для PrettyK (ED2):
 * - `$name` → Пусть/Секрет (текущий файл; иначе pages + modules — глобальные)
 * - `page.Op` → модель страницы / `Операция Op`
 */
import type * as monacoNs from 'monaco-editor';
import { isPlainObject } from '../utils/json';
import { getConstructorContext } from './constructorLanguage';
import { ensureStudioModel } from '../studio/studioModels';
import {
  collectVarOccurrences,
  findVarDefinition,
  findVarReferences,
  type VarOccurrence,
} from './prettykVarOccurrences';
import { findRefsInText } from '../keywords/refs';

export type { VarOccurrence };
export { collectVarOccurrences, findVarDefinition, findVarReferences };

const PAGE_CALL_RE = /^\s*([A-Za-z_]\w*)\.([\p{L}_][\p{L}\w]*)/u;

export type PageCallHit = {
  pageId: string;
  op: string;
  startColumn: number;
  endColumn: number;
  /** Колонка сразу после pageId (точка). */
  dotColumn: number;
  target: 'page' | 'op';
};

/** Имя переменной / модуля под курсором (`$x`, `${x}`, `x`). */
export function variableNameAt(
  lineText: string,
  column: number,
): { name: string; startColumn: number; endColumn: number } | undefined {
  for (const ref of findRefsInText(lineText)) {
    const startColumn = ref.start + 1;
    const endColumn = startColumn + ref.token.length;
    if (column >= startColumn && column <= endColumn && ref.path) {
      return { name: ref.path, startColumn, endColumn };
    }
  }
  const wordRe = /[A-Za-z_][\w.]*/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(lineText)) !== null) {
    const startColumn = match.index + 1;
    const endColumn = startColumn + match[0].length;
    if (column >= startColumn && column <= endColumn) {
      const name = match[0];
      if (name) {
        return { name, startColumn, endColumn };
      }
    }
  }
  return undefined;
}

export function pageCallAt(lineText: string, column: number): PageCallHit | undefined {
  const match = PAGE_CALL_RE.exec(lineText);
  if (!match) {
    return undefined;
  }
  const pageId = match[1] ?? '';
  const op = match[2] ?? '';
  const full = `${pageId}.${op}`;
  const fullAt = lineText.indexOf(full);
  if (fullAt < 0) {
    return undefined;
  }
  const startColumn = fullAt + 1;
  const endColumn = startColumn + full.length;
  if (column < startColumn || column > endColumn) {
    return undefined;
  }
  const dotColumn = startColumn + pageId.length;
  const target: 'page' | 'op' = column <= dotColumn ? 'page' : 'op';
  return { pageId, op, startColumn, endColumn, dotColumn, target };
}

function rangeOf(occ: VarOccurrence): monacoNs.IRange {
  return {
    startLineNumber: occ.line,
    startColumn: occ.startColumn,
    endLineNumber: occ.line,
    endColumn: occ.endColumn,
  };
}

function pageModelPath(pageId: string): string {
  return `pk://suite/pages/${encodeURIComponent(pageId)}.pk`;
}

function moduleModelPath(index: number): string {
  return `pk://suite/modules/${String(index)}.pk`;
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function pageConstructorFromForm(pageId: string): string | undefined {
  const formData = getConstructorContext()?.formData;
  if (!isPlainObject(formData)) {
    return undefined;
  }
  const suites = formData.test_suites;
  if (!isPlainObject(suites)) {
    return undefined;
  }
  const pages = suites.pages;
  if (!isPlainObject(pages)) {
    return undefined;
  }
  const page = pages[pageId];
  if (!isPlainObject(page)) {
    return undefined;
  }
  return stringField(page, 'constructor') ?? '';
}

type ModuleCtor = { index: number; id: string; text: string };

function listModuleConstructors(): ModuleCtor[] {
  const formData = getConstructorContext()?.formData;
  if (!isPlainObject(formData)) {
    return [];
  }
  const suites = formData.test_suites;
  if (!isPlainObject(suites)) {
    return [];
  }
  const list = suites.test_data_constructor;
  if (!Array.isArray(list)) {
    return [];
  }
  const out: ModuleCtor[] = [];
  list.forEach((item, index) => {
    if (!isPlainObject(item)) {
      return;
    }
    const id = stringField(item, 'id') ?? `module_${String(index)}`;
    out.push({
      index,
      id,
      text: stringField(item, 'constructor') ?? '',
    });
  });
  return out;
}

function listPageConstructors(): { pageId: string; text: string }[] {
  const formData = getConstructorContext()?.formData;
  if (!isPlainObject(formData)) {
    return [];
  }
  const suites = formData.test_suites;
  if (!isPlainObject(suites)) {
    return [];
  }
  const pages = suites.pages;
  if (!isPlainObject(pages)) {
    return [];
  }
  return Object.entries(pages).flatMap(([pageId, page]) => {
    if (!isPlainObject(page)) {
      return [];
    }
    return [{ pageId, text: stringField(page, 'constructor') ?? '' }];
  });
}

function ensurePageModel(
  monaco: typeof monacoNs,
  pageId: string,
): monacoNs.editor.ITextModel | null {
  const path = pageModelPath(pageId);
  const existing = monaco.editor.getModel(monaco.Uri.parse(path));
  if (existing) {
    return existing;
  }
  const text = pageConstructorFromForm(pageId);
  if (text === undefined) {
    return null;
  }
  return ensureStudioModel(monaco, path, text);
}

function ensureModuleModel(
  monaco: typeof monacoNs,
  mod: ModuleCtor,
): monacoNs.editor.ITextModel {
  const path = moduleModelPath(mod.index);
  const existing = monaco.editor.getModel(monaco.Uri.parse(path));
  if (existing) {
    return existing;
  }
  return ensureStudioModel(monaco, path, mod.text);
}

/** Ищем `Операция Op` / голое `Op` в макете страницы. */
export function findOperationLine(text: string, op: string): {
  line: number;
  startColumn: number;
  endColumn: number;
} | null {
  if (!op) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const opHead = new RegExp(
    `^(\\s*)Операция\\s+(${escapeRegExp(op)})(?=[\\s{]|$)`,
    'u',
  );
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const m = opHead.exec(raw);
    if (m) {
      const indent = m[1]?.length ?? 0;
      const startColumn = indent + 'Операция '.length + 1;
      return {
        line: i + 1,
        startColumn,
        endColumn: startColumn + op.length,
      };
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trimStart();
    if (trimmed === op || trimmed.startsWith(`${op} `) || trimmed.startsWith(`${op}|`)) {
      const col = raw.indexOf(op) + 1;
      return { line: i + 1, startColumn: col, endColumn: col + op.length };
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstContentLocation(
  model: monacoNs.editor.ITextModel,
): monacoNs.languages.Location {
  const lineCount = model.getLineCount();
  for (let line = 1; line <= lineCount; line += 1) {
    const text = model.getLineContent(line);
    if (text.trim()) {
      return {
        uri: model.uri,
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: Math.max(2, text.length + 1),
        },
      };
    }
  }
  return {
    uri: model.uri,
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
  };
}

/** Ищем операцию в page model; подгружаем text из formData при необходимости. */
export function findPageOperationLocation(
  monaco: typeof monacoNs,
  pageId: string,
  op: string,
  target: 'page' | 'op' = 'op',
): monacoNs.languages.Location | null {
  const model = ensurePageModel(monaco, pageId);
  if (!model) {
    return null;
  }
  if (target === 'page' || !op) {
    return firstContentLocation(model);
  }
  const hit = findOperationLine(model.getValue(), op);
  if (hit) {
    return {
      uri: model.uri,
      range: {
        startLineNumber: hit.line,
        startColumn: hit.startColumn,
        endLineNumber: hit.line,
        endColumn: hit.endColumn,
      },
    };
  }
  return firstContentLocation(model);
}

/**
 * Глобальные объявления: pages + modules (сценарии — только текущий model).
 */
export function findGlobalVarDefinition(
  monaco: typeof monacoNs,
  name: string,
  current?: monacoNs.editor.ITextModel,
): monacoNs.languages.Location | null {
  if (current) {
    const local = findVarDefinition(current.getValue(), name);
    if (local) {
      return { uri: current.uri, range: rangeOf(local) };
    }
  }

  for (const page of listPageConstructors()) {
    const model = ensurePageModel(monaco, page.pageId);
    if (!model) {
      continue;
    }
    const decl = findVarDefinition(model.getValue(), name);
    if (decl) {
      return { uri: model.uri, range: rangeOf(decl) };
    }
  }

  for (const mod of listModuleConstructors()) {
    const model = ensureModuleModel(monaco, mod);
    const decl = findVarDefinition(model.getValue(), name);
    if (decl) {
      return { uri: model.uri, range: rangeOf(decl) };
    }
  }

  return null;
}

export function createPrettykDefinitionProvider(
  monaco: typeof monacoNs,
): monacoNs.languages.DefinitionProvider {
  return {
    provideDefinition(model, position) {
      const lineText = model.getLineContent(position.lineNumber);

      // page.Op раньше word-match — иначе `register.` съедает variableNameAt.
      const page = pageCallAt(lineText, position.column);
      if (page) {
        const known = getConstructorContext()?.pageIds ?? [];
        if (known.length > 0 && !known.includes(page.pageId)) {
          return null;
        }
        return findPageOperationLocation(monaco, page.pageId, page.op, page.target);
      }

      const atVar = variableNameAt(lineText, position.column);
      if (atVar) {
        const name = atVar.name.replace(/\.$/, '');
        if (name) {
          const global = findGlobalVarDefinition(monaco, name, model);
          if (global) {
            return global;
          }
        }
        const knownPages = getConstructorContext()?.pageIds ?? [];
        if (knownPages.includes(atVar.name) || knownPages.includes(name)) {
          return findPageOperationLocation(monaco, name || atVar.name, '', 'page');
        }
      }
      return null;
    },
  };
}

export function createPrettykReferenceProvider(): monacoNs.languages.ReferenceProvider {
  return {
    provideReferences(model, position, context) {
      const lineText = model.getLineContent(position.lineNumber);
      const atVar = variableNameAt(lineText, position.column);
      if (!atVar) {
        return [];
      }
      const name = atVar.name.replace(/\.$/, '');
      const refs = findVarReferences(model.getValue(), name);
      const filtered = context.includeDeclaration ? refs : refs.filter((r) => !r.isDeclaration);
      return filtered.map((occ) => ({
        uri: model.uri,
        range: rangeOf(occ),
      }));
    },
  };
}

/** Cursor on `$var` → подсветка всех вхождений (Ctrl+Shift+L / read). */
export function createPrettykDocumentHighlightProvider(): monacoNs.languages.DocumentHighlightProvider {
  return {
    provideDocumentHighlights(model, position) {
      const lineText = model.getLineContent(position.lineNumber);
      const atVar = variableNameAt(lineText, position.column);
      if (!atVar?.name) {
        return [];
      }
      const name = atVar.name.replace(/\.$/, '');
      return findVarReferences(model.getValue(), name).map((occ) => ({
        range: rangeOf(occ),
        kind: occ.isDeclaration
          ? 2 /* DocumentHighlightKind.Write */
          : 1 /* DocumentHighlightKind.Read */,
      }));
    },
  };
}

/** Inline-пометка всех `$var` / `${var}`; при зажатом Ctrl/⌘ — подчёркивание всех. */
export function bindVariableDecorations(
  ed: monacoNs.editor.IStandaloneCodeEditor,
): monacoNs.IDisposable {
  const collection = ed.createDecorationsCollection();
  let ctrlHeld = false;

  const update = () => {
    const model = ed.getModel();
    if (!model) {
      collection.set([]);
      return;
    }
    const className = ctrlHeld
      ? 'pk-inline-variable pk-inline-variable--ctrl'
      : 'pk-inline-variable';
    const occurrences = collectVarOccurrences(model.getValue());
    const decorations = occurrences.map((occ) => ({
      range: {
        startLineNumber: occ.line,
        startColumn: occ.startColumn,
        endLineNumber: occ.line,
        endColumn: occ.endColumn,
      },
      options: {
        inlineClassName: className,
      },
    }));
    collection.set(decorations);
  };

  const syncCtrl = (event: KeyboardEvent | FocusEvent) => {
    const next =
      event instanceof KeyboardEvent ? Boolean(event.ctrlKey || event.metaKey) : false;
    if (next === ctrlHeld) {
      return;
    }
    ctrlHeld = next;
    update();
  };

  update();
  const sub = ed.onDidChangeModelContent(update);
  window.addEventListener('keydown', syncCtrl, true);
  window.addEventListener('keyup', syncCtrl, true);
  window.addEventListener('blur', syncCtrl);
  return {
    dispose() {
      sub.dispose();
      collection.set([]);
      window.removeEventListener('keydown', syncCtrl, true);
      window.removeEventListener('keyup', syncCtrl, true);
      window.removeEventListener('blur', syncCtrl);
    },
  };
}
