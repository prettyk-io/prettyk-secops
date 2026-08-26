/**
 * E2: Gutter Run — unit tests.
 * @vitest-environment jsdom
 */
import './vitest.monaco-polyfill';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindRunGutter } from './runGutter';
import { createPrettykModel, monaco } from './providerTestHarness';

const models: ReturnType<typeof createPrettykModel>[] = [];
let disposables: Array<{ dispose: () => void }> = [];

function model(text: string) {
  const m = createPrettykModel(text);
  models.push(m);
  return m;
}

/** Create a standalone editor with the given model. */
function createEditor(m: ReturnType<typeof model>) {
  const el = document.createElement('div');
  el.style.width = '400px';
  el.style.height = '200px';
  document.body.appendChild(el);
  const ed = monaco.editor.create(el, {
    model: m,
    glyphMargin: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    automaticLayout: true,
  });
  return ed;
}

beforeEach(() => {
  disposables = [];
});

afterEach(() => {
  for (const d of disposables) d.dispose();
  while (models.length > 0) {
    models.pop()?.dispose();
  }
  for (const leftover of monaco.editor.getModels()) {
    if (leftover.uri.toString().startsWith('pk://test/')) {
      leftover.dispose();
    }
  }
});

describe('E2 runGutter', () => {
  it('binds and disposes without errors', () => {
    const m = model('Нажать кнопка\nЛог результат');
    const ed = createEditor(m);
    const onRunStep = vi.fn();
    const disp = bindRunGutter(ed, monaco, { onRunStep });
    void disp;
    disp.dispose();
    ed.dispose();
    expect(onRunStep).not.toHaveBeenCalled();
  });

  it('calls onRunStep on glyph margin click on executable line', () => {
    const m = model('Нажать кнопка\nЛог результат');
    const ed = createEditor(m);
    const onRunStep = vi.fn();
    const _disp = bindRunGutter(ed, monaco, { onRunStep });

    // Context menu action: focus editor first (precondition = editorTextFocus).
    ed.focus();
    const action = ed.getAction('pk-run-step');
    expect(action).toBeTruthy();
    action?.run();
    // Default position is (1,1) → onRunStep(line=1).
    expect(onRunStep).toHaveBeenCalledWith(1);

    ed.dispose();
  });

  it('context menu: Run All fires onRunAll', () => {
    const m = model('Нажать кнопка\n# комментарий\nЛог результат');
    const ed = createEditor(m);
    const onRunAll = vi.fn();
    const _disp = bindRunGutter(ed, monaco, { onRunAll });

    ed.focus();
    const action = ed.getAction('pk-run-all');
    expect(action).toBeTruthy();
    action?.run();
    expect(onRunAll).toHaveBeenCalledTimes(1);

    ed.dispose();
  });

  it('context menu: Run from Cursor fires onRunFromCursor', () => {
    const m = model('Нажать кнопка\nЛог результат');
    const ed = createEditor(m);
    const onRunFromCursor = vi.fn();
    const _disp = bindRunGutter(ed, monaco, { onRunFromCursor });

    ed.setPosition({ lineNumber: 2, column: 3 });
    ed.focus();
    const action = ed.getAction('pk-run-from-cursor');
    expect(action).toBeTruthy();
    action?.run();
    expect(onRunFromCursor).toHaveBeenCalledWith(2);

    ed.dispose();
  });

  it('idle dot decorations exist on executable lines', () => {
    const m = model('Нажать кнопка\n# комментарий\nЛог результат');
    const ed = createEditor(m);
    const _disp = bindRunGutter(ed, monaco, {});

    const line1Decos = ed.getLineDecorations(1);
    const line2Decos = ed.getLineDecorations(2);
    const line3Decos = ed.getLineDecorations(3);

    const hasIdle = (decs: typeof line1Decos) =>
      decs?.some((d) => d.options.glyphMarginClassName === 'pk-gutter-idle');

    expect(hasIdle(line1Decos)).toBe(true);
    expect(hasIdle(line2Decos)).toBe(false);
    expect(hasIdle(line3Decos)).toBe(true);

    ed.dispose();
  });
});