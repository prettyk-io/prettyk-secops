/**
 * VS Code / IDEA-ништяки навигации в Studio Monaco.
 * F12 / Ctrl+P браузер иначе крадёт — ловим в capture, когда editor focused.
 */
import type { editor } from 'monaco-editor';

export type StudioNavActionId =
  | 'editor.action.revealDefinition'
  | 'editor.action.goToReferences'
  | 'editor.action.peekDefinition'
  | 'editor.action.quickOutline'
  | 'editor.action.gotoSymbol'
  | 'editor.action.navigateBack'
  | 'editor.action.navigateForward'
  | 'editor.action.quickFix'
  | 'editor.action.addSelectionToNextFindMatch'
  | 'editor.action.selectHighlights'
  | 'editor.action.gotoLine';

type Chord = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  codes: string[];
  keys?: string[];
  action: StudioNavActionId;
};

const NAV_CHORDS: Chord[] = [
  { mod: false, alt: false, shift: false, codes: ['F12'], action: 'editor.action.revealDefinition' },
  { mod: false, alt: false, shift: true, codes: ['F12'], action: 'editor.action.goToReferences' },
  { mod: false, alt: true, shift: false, codes: ['F12'], action: 'editor.action.peekDefinition' },
  {
    mod: true,
    alt: false,
    shift: true,
    codes: ['KeyO'],
    keys: ['o'],
    action: 'editor.action.quickOutline',
  },
  { mod: false, alt: true, shift: false, codes: ['ArrowLeft'], action: 'editor.action.navigateBack' },
  {
    mod: false,
    alt: true,
    shift: false,
    codes: ['ArrowRight'],
    action: 'editor.action.navigateForward',
  },
  { mod: true, alt: false, shift: false, codes: ['Period'], action: 'editor.action.quickFix' },
  {
    mod: true,
    alt: false,
    shift: false,
    codes: ['KeyD'],
    keys: ['d'],
    action: 'editor.action.addSelectionToNextFindMatch',
  },
  {
    mod: true,
    alt: false,
    shift: true,
    codes: ['KeyL'],
    keys: ['l'],
    action: 'editor.action.selectHighlights',
  },
  {
    mod: true,
    alt: false,
    shift: false,
    codes: ['KeyG'],
    keys: ['g'],
    action: 'editor.action.gotoLine',
  },
];

function chordMatches(
  chord: Chord,
  mod: boolean,
  altKey: boolean,
  shiftKey: boolean,
  code: string,
  key: string,
): boolean {
  if (chord.mod !== mod || chord.alt !== altKey || chord.shift !== shiftKey) {
    return false;
  }
  if (chord.codes.includes(code)) {
    return true;
  }
  return Boolean(chord.keys?.includes(key));
}

/** Чистый матч — для unit-тестов без Monaco. */
export function matchStudioNavAction(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): StudioNavActionId | null {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  for (const chord of NAV_CHORDS) {
    if (chordMatches(chord, mod, event.altKey, event.shiftKey, event.code, key)) {
      return chord.action;
    }
  }
  return null;
}

function editorFocused(ed: editor.IStandaloneCodeEditor): boolean {
  if (ed.hasTextFocus()) {
    return true;
  }
  const node = ed.getDomNode();
  return Boolean(node?.contains(document.activeElement));
}

async function runEditorAction(
  ed: editor.IStandaloneCodeEditor,
  id: StudioNavActionId,
): Promise<void> {
  const primary = ed.getAction(id);
  if (primary) {
    await primary.run();
    return;
  }
  if (id === 'editor.action.quickOutline') {
    await ed.getAction('editor.action.gotoSymbol')?.run();
  }
}

/**
 * Capture-listener пока жив editor. Возвращает disposer.
 */
export function bindStudioEditorNavKeys(ed: editor.IStandaloneCodeEditor): { dispose: () => void } {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!editorFocused(ed)) {
      return;
    }
    const actionId = matchStudioNavAction(event);
    if (!actionId) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    runEditorAction(ed, actionId).catch(() => undefined);
  };
  window.addEventListener('keydown', onKeyDown, true);
  return {
    dispose: () => window.removeEventListener('keydown', onKeyDown, true),
  };
}
