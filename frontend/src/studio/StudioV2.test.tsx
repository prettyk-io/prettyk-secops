// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { StudioV2 } from './StudioV2';

// ── Heavy deps mocks (Monaco, CDP, buddy dock, tree, canvas) ──
vi.mock('@monaco-editor/react', () => ({
  default: (props: { value?: string; language?: string; onChange?: (v: string) => void }) => (
    <div data-testid="mock-monaco-editor" data-language={props.language ?? ''}>
      <textarea
        data-testid="monaco-textarea"
        value={props.value ?? ''}
        onChange={(e) => props.onChange?.(e.target.value)}
      />
    </div>
  ),
  DiffEditor: () => <div data-testid="mock-diff-editor" />,
}));

vi.mock('../monaco/setup', () => ({
  setupMonaco: () => ({}),
  DARK_THEME_ID: 'pk-dark',
  PRETTYK_LANGUAGE_ID: 'prettyk',
}));

vi.mock('../monaco/constructorLanguage', () => ({
  registerConstructorLanguageFeatures: () => {},
  setConstructorContext: () => {},
  applyDiagnostics: () => {},
}));

vi.mock('../monaco/scriptLanguage', () => ({
  registerScriptLanguageFeatures: () => {},
}));

vi.mock('../monaco/editorOptions', () => ({
  CONSTRUCTOR_EDITOR_OPTIONS: {},
  COMPACT_EDITOR_OPTIONS: {},
}));

vi.mock('../monaco/runGutter', () => ({
  bindRunGutter: () => ({ dispose() {} }),
}));

vi.mock('../monaco/constructorDiagnosticsMerge', () => ({
  mergeConstructorDiagnostics: (local: unknown[], backend: unknown[] | null) =>
    backend ?? [...(local as unknown[])],
}));

vi.mock('./StudioExplorer', () => ({
  StudioExplorer: (props: { formData?: unknown }) => (
    <div data-testid="studio-explorer" data-formdata={JSON.stringify(props.formData ?? null)} />
  ),
}));

vi.mock('./CanvasV2', () => ({
  CanvasV2: (props: { counts?: Record<string, number> }) => (
    <div data-testid="canvas-v2" data-counts={JSON.stringify(props.counts ?? null)} />
  ),
}));

vi.mock('./buddy/BuddyDockController', () => ({
  BuddyDockController: () => <div data-testid="buddy-dock" />,
}));

vi.mock('./BrowserPanel', () => ({
  BrowserPanel: () => <div data-testid="browser-panel" />,
}));

vi.mock('./ScenarioDeckStore', () => ({
  useScenarioDeckStore: (selector?: (s: unknown) => unknown) => {
    const state = { decks: [], setDecks: vi.fn(), addStep: vi.fn(), updateStep: vi.fn(), removeStep: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

function makeManifest(scenarioCount: number, pageCount: number) {
  return {
    meta: { assessment_purpose: 'automated' },
    infrastructure: { base_url_override: 'https://example.com' },
    security_configuration: {},
    test_suites: {
      scenarios: Array.from({ length: scenarioCount }, (_, i) => ({
        scenario_name: `scenario-${i}`,
        description: '',
        continue_on_failure: false,
        steps: [{ step_id: `step-${i}`, description: '', constructor: '' }],
      })),
      pages: Object.fromEntries(
        Array.from({ length: pageCount }, (_, i) => [`page-${i}`, { title: `page-${i}`, constructor: '' }]),
      ),
      test_data_constructor: [],
      fuzzers: [],
      imports: [],
    },
  };
}

describe('StudioV2 (STU-V2 B1/B2/B4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('B1: без проверки и манифеста — честное пустое состояние', () => {
    render(<StudioV2 />);
    expect(screen.getByText('Проверка не выбрана')).toBeDefined();
    expect(screen.queryByTestId('studio-explorer')).toBeNull();
  });

  it('B1+B2: привязан к checkId — Explorer получает formData, CanvasV2 получает реальные счётчики', () => {
    const manifest = makeManifest(2, 1);
    render(<StudioV2 checkId="chk-12345678" initialManifest={manifest} />);

    // Explorer привязан именно к этому formData.
    const explorer = screen.getByTestId('studio-explorer');
    const explorerData = JSON.parse(explorer.getAttribute('data-formdata') ?? 'null');
    expect(explorerData).toEqual(manifest);

    // CanvasV2 счётчики — реальные (2 сценария, 1 страница), не литералы.
    const canvas = screen.getByTestId('canvas-v2');
    const counts = JSON.parse(canvas.getAttribute('data-counts') ?? 'null');
    expect(counts.scenarios).toBe(2);
    expect(counts.pages).toBe(1);
    expect(counts.modules).toBe(0);
  });

  it('B1: другая проверка — свои данные (перезагрузка formData)', () => {
    const first = makeManifest(2, 1);
    const second = makeManifest(1, 3);
    const { rerender } = render(<StudioV2 checkId="chk-aaa" initialManifest={first} />);

    rerender(<StudioV2 checkId="chk-bbb" initialManifest={second} />);

    const explorer = screen.getByTestId('studio-explorer');
    const explorerData = JSON.parse(explorer.getAttribute('data-formdata') ?? 'null');
    expect(explorerData).toEqual(second);

    const canvas = screen.getByTestId('canvas-v2');
    const counts = JSON.parse(canvas.getAttribute('data-counts') ?? 'null');
    expect(counts.scenarios).toBe(1);
    expect(counts.pages).toBe(3);
  });

  it('B4: вкладка «Код» открывает Monaco-конструктор на языке prettyk', () => {
    const manifest = makeManifest(1, 0);
    render(<StudioV2 checkId="chk-abc" initialManifest={manifest} />);

    fireEvent.click(screen.getByText('Код'));

    const editor = screen.getByTestId('mock-monaco-editor');
    expect(editor.getAttribute('data-language')).toBe('prettyk');
    expect(screen.getByText('PrettyK DSL')).toBeDefined();
  });
});
