import { describe, expect, it } from 'vitest';
import { matchStudioNavAction } from './studioEditorNavKeys';

const base = {
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

describe('matchStudioNavAction', () => {
  it('F12 / Shift+F12 / Alt+F12', () => {
    expect(matchStudioNavAction({ ...base, code: 'F12', key: 'F12' })).toBe(
      'editor.action.revealDefinition',
    );
    expect(
      matchStudioNavAction({ ...base, code: 'F12', key: 'F12', shiftKey: true }),
    ).toBe('editor.action.goToReferences');
    expect(matchStudioNavAction({ ...base, code: 'F12', key: 'F12', altKey: true })).toBe(
      'editor.action.peekDefinition',
    );
  });

  it('Ctrl+Shift+O outline на RU-раскладке по code', () => {
    expect(
      matchStudioNavAction({
        ...base,
        code: 'KeyO',
        key: 'щ',
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBe('editor.action.quickOutline');
  });

  it('Alt+← / Alt+→ navigate', () => {
    expect(matchStudioNavAction({ ...base, code: 'ArrowLeft', key: 'ArrowLeft', altKey: true })).toBe(
      'editor.action.navigateBack',
    );
    expect(
      matchStudioNavAction({ ...base, code: 'ArrowRight', key: 'ArrowRight', altKey: true }),
    ).toBe('editor.action.navigateForward');
  });

  it('Ctrl+D / Ctrl+Shift+L / Ctrl+G / Ctrl+.', () => {
    expect(matchStudioNavAction({ ...base, code: 'KeyD', key: 'в', ctrlKey: true })).toBe(
      'editor.action.addSelectionToNextFindMatch',
    );
    expect(
      matchStudioNavAction({ ...base, code: 'KeyL', key: 'д', ctrlKey: true, shiftKey: true }),
    ).toBe('editor.action.selectHighlights');
    expect(matchStudioNavAction({ ...base, code: 'KeyG', key: 'п', ctrlKey: true })).toBe(
      'editor.action.gotoLine',
    );
    expect(matchStudioNavAction({ ...base, code: 'Period', key: '.', ctrlKey: true })).toBe(
      'editor.action.quickFix',
    );
  });
});
