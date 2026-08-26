/**
 * E2 / PK-TRM-8: Gutter Run — play button (▶), idle dots (○), контекстное меню.
 *
 * Glyph margin: ▶ появляется при наведении на непустую строку.
 * Клик → onRunStep(lineNumber).
 * Контекстное меню: Run Step / Run from Cursor / Run All.
 */
import type { editor, IDisposable } from 'monaco-editor';
import type * as monacoNs from 'monaco-editor';

export interface RunGutterCallbacks {
  /** Запустить указанную строку (1-based). */
  onRunStep?: (lineNumber: number) => void;
  /** Запустить всё. */
  onRunAll?: () => void;
  /** Запустить от текущей строки до конца. */
  onRunFromCursor?: (lineNumber: number) => void;
}

const GLYPH_DECORATION_KEY = 'pk-run-gutter-glyph';
const IDLE_DECORATION_KEY = 'pk-run-gutter-idle';

/** Строка: непустая и не startsWith `#` (комментарий) — executable. */
function isExecutableLine(raw: string): boolean {
  const trimmed = raw.trimStart();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

/** Перерисовывает idle-точки (○) на всех executable строках. */
function applyIdleDots(
  ed: editor.IStandaloneCodeEditor,
  idleCollection: editor.IEditorDecorationsCollection,
): void {
  const model = ed.getModel();
  if (!model) {
    idleCollection.set([]);
    return;
  }
  const count = model.getLineCount();
  const decos: editor.IModelDeltaDecoration[] = [];
  for (let i = 1; i <= count; i += 1) {
    const raw = model.getLineContent(i);
    if (isExecutableLine(raw)) {
      decos.push({
        range: {
          startLineNumber: i, startColumn: 1,
          endLineNumber: i, endColumn: 1,
        },
        options: {
          glyphMarginClassName: 'pk-gutter-idle',
        },
      });
    }
  }
  idleCollection.set(decos);
}

export function bindRunGutter(
  ed: editor.IStandaloneCodeEditor,
  monaco: typeof monacoNs,
  callbacks: RunGutterCallbacks,
): IDisposable {
  const { onRunStep, onRunAll, onRunFromCursor } = callbacks;

  // ── Idle dots (static: ○ на executable строках) ──
  const idleCollection = ed.createDecorationsCollection();
  let hoverLine: number | null = null;

  const model = ed.getModel();

  // ── Play button (dynamic: ▶ на hover) ──
  const playCollection = ed.createDecorationsCollection();

  const updatePlayButton = () => {
    if (hoverLine === null || !model) {
      playCollection.set([]);
      return;
    }
    if (hoverLine < 1 || hoverLine > model.getLineCount()) {
      playCollection.set([]);
      return;
    }
    const raw = model.getLineContent(hoverLine);
    if (!isExecutableLine(raw)) {
      playCollection.set([]);
      return;
    }
    playCollection.set([{
      range: {
        startLineNumber: hoverLine, startColumn: 1,
        endLineNumber: hoverLine, endColumn: 1,
      },
      options: {
        glyphMarginClassName: 'pk-gutter-play',
      },
    }]);
  };

  // ── Mouse hover → play glyph ──
  const mouseDisposable = ed.onMouseMove((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      if (hoverLine !== null) {
        hoverLine = null;
        updatePlayButton();
      }
      return;
    }
    const line = e.target.position?.lineNumber;
    if (line === hoverLine) return;
    hoverLine = line ?? null;
    updatePlayButton();
  });

  const mouseLeaveDisposable = ed.onMouseLeave(() => {
    if (hoverLine !== null) {
      hoverLine = null;
      updatePlayButton();
    }
  });

  // ── Click glyph → onRunStep ──
  const glyphClickDisposable = ed.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const line = e.target.position?.lineNumber;
    if (!line || !model) return;
    const raw = model.getLineContent(line);
    if (!isExecutableLine(raw)) return;
    e.event.preventDefault();
    ed.focus();
    ed.setPosition({ lineNumber: line, column: 1 });
    onRunStep?.(line);
  });

  // ── Idle dots update on content change ──
  const contentDisposable = ed.onDidChangeModelContent(() => {
    applyIdleDots(ed, idleCollection);
    if (hoverLine !== null) updatePlayButton();
  });
  applyIdleDots(ed, idleCollection);

  // ── Model switch → re-apply idle dots ──
  const modelDisposable = ed.onDidChangeModel(() => {
    applyIdleDots(ed, idleCollection);
    if (hoverLine !== null) updatePlayButton();
  });

  // ── Context menu actions ──
  const actionRunStep = ed.addAction({
    id: 'pk-run-step',
    label: '▶  Run Step',
    contextMenuGroupId: 'pk-run',
    contextMenuOrder: 1,
    run: () => {
      const pos = ed.getPosition();
      if (pos) onRunStep?.(pos.lineNumber);
    },
  });

  const actionRunFromCursor = ed.addAction({
    id: 'pk-run-from-cursor',
    label: '▶▶ Run from Cursor',
    contextMenuGroupId: 'pk-run',
    contextMenuOrder: 2,
    run: () => {
      const pos = ed.getPosition();
      if (pos) onRunFromCursor?.(pos.lineNumber);
    },
  });

  const actionRunAll = ed.addAction({
    id: 'pk-run-all',
    label: '▶▶▶ Run All',
    contextMenuGroupId: 'pk-run',
    contextMenuOrder: 3,
    run: () => {
      onRunAll?.();
    },
  });

  return {
    dispose() {
      idleCollection.set([]);
      playCollection.set([]);
      mouseDisposable.dispose();
      mouseLeaveDisposable.dispose();
      glyphClickDisposable.dispose();
      contentDisposable.dispose();
      actionRunStep.dispose();
      actionRunFromCursor.dispose();
      actionRunAll.dispose();
      modelDisposable.dispose();
    },
  };
}