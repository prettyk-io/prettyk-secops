/**
 * onMount PrettyK Monaco — вынесено из StudioWorkspace (S3776).
 */
import type { editor } from 'monaco-editor';
import type * as monacoNs from 'monaco-editor';
import {
  applyDiagnostics,
  CONSTRUCTOR_MARKER_OWNER,
} from '../monaco/constructorLanguage';
import type { ConstructorDiagnostic } from '../keywords/constructor';
import { bindGutterLineCursor } from '../monaco/gutterLineClick';
import { bindDynamicLineNumberChars } from '../monaco/lineNumberDigits';
import { bindMinimumConstructorLines } from '../monaco/minimumLines';
import { bindVariableDecorations } from '../monaco/prettykNavigation';
import { clearPrettykDiagnostics } from '../monaco/prettykDiagnostics';
import { symbolAtCursor } from '../monaco/studioCursorSymbol';
import { bindStudioEditorNavKeys } from '../monaco/studioEditorNavKeys';
import type { StudioTab } from './studioTabs';

type BindArgs = {
  monaco: typeof monacoNs;
  isPlainDataActive: boolean;
  diagnostics: ConstructorDiagnostic[];
  paintCursorHud: (line: number, column: number, symbol?: string) => void;
  openTabsRef: { current: StudioTab[] };
  activeTabIdRef: { current: string | undefined };
  flushTab: (tab: StudioTab | undefined) => void;
  setEditor: (instance: editor.IStandaloneCodeEditor) => void;
};

function paintHudFromEditor(
  instance: editor.IStandaloneCodeEditor,
  paintCursorHud: BindArgs['paintCursorHud'],
  line: number,
  column: number,
): void {
  const model = instance.getModel();
  const lineText = model?.getLineContent(line) ?? '';
  paintCursorHud(line, column, symbolAtCursor(lineText, column));
}

export function bindStudioPrettyEditor(
  instance: editor.IStandaloneCodeEditor,
  args: BindArgs,
): void {
  const {
    monaco,
    isPlainDataActive,
    diagnostics,
    paintCursorHud,
    openTabsRef,
    activeTabIdRef,
    flushTab,
    setEditor,
  } = args;
  setEditor(instance);
  const model = instance.getModel();
  if (model) {
    // A model may have been opened before the unified constructor diagnostics ran.
    // Remove the legacy owner so two validators cannot paint competing markers.
    clearPrettykDiagnostics(monaco, model);
    if (isPlainDataActive) {
      monaco.editor.setModelMarkers(model, CONSTRUCTOR_MARKER_OWNER, []);
    } else {
      applyDiagnostics(monaco, model, diagnostics);
    }
  }
  const pos0 = instance.getPosition();
  if (pos0) {
    paintHudFromEditor(instance, paintCursorHud, pos0.lineNumber, pos0.column);
  }
  const dCursor = instance.onDidChangeCursorPosition((event) => {
    paintHudFromEditor(
      instance,
      paintCursorHud,
      event.position.lineNumber,
      event.position.column,
    );
  });
  const dGutter = bindGutterLineCursor(instance, monaco);
  const dMinimumLines = bindMinimumConstructorLines(instance);
  const dLineDigits = bindDynamicLineNumberChars(instance);
  const dVars = bindVariableDecorations(instance);
  const dNavKeys = bindStudioEditorNavKeys(instance);
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    const current = openTabsRef.current.find((item) => item.id === activeTabIdRef.current);
    flushTab(current);
  });

  const MICRO_PX = 8;
  const prettykScrollbar = (vertical: 'auto' | 'hidden') => ({
    vertical,
    horizontal: 'hidden' as const,
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 0,
    handleMouseWheel: true,
    alwaysConsumeMouseWheel: false,
  });

  let clampRaf = 0;
  let lastVertical: 'auto' | 'hidden' | null = null;
  const clampPrettykMicroScroll = (): void => {
    if (clampRaf !== 0) {
      return;
    }
    clampRaf = window.requestAnimationFrame(() => {
      clampRaf = 0;
      const overflow = instance.getScrollHeight() - instance.getLayoutInfo().height;
      if (overflow > 0 && overflow <= MICRO_PX) {
        instance.setScrollTop(0);
        if (lastVertical !== 'hidden') {
          lastVertical = 'hidden';
          instance.updateOptions({ scrollbar: prettykScrollbar('hidden') });
        }
      } else if (overflow > MICRO_PX && lastVertical !== 'auto') {
        lastVertical = 'auto';
        instance.updateOptions({ scrollbar: prettykScrollbar('auto') });
      }
    });
  };

  const dLayout = instance.onDidLayoutChange(clampPrettykMicroScroll);
  const dContent = instance.onDidContentSizeChange(clampPrettykMicroScroll);
  const dScroll = instance.onDidScrollChange(() => {
    const overflow = instance.getScrollHeight() - instance.getLayoutInfo().height;
    if (overflow <= MICRO_PX && instance.getScrollTop() !== 0) {
      instance.setScrollTop(0);
    }
  });
  clampPrettykMicroScroll();
  instance.onDidDispose(() => {
    if (clampRaf !== 0) {
      window.cancelAnimationFrame(clampRaf);
    }
    dCursor.dispose();
    dGutter.dispose();
    dLineDigits.dispose();
    dMinimumLines.dispose();
    dVars.dispose();
    dNavKeys.dispose();
    dLayout.dispose();
    dContent.dispose();
    dScroll.dispose();
  });
}
