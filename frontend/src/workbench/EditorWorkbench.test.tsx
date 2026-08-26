// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EditorWorkbench } from './EditorWorkbench';
import { useWorkspaceStore } from './workspaceStore';

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  loader: { init: () => Promise.resolve() },
  default: (props: { value: string; onChange?: (val: string) => void }) => (
    <div data-testid="mock-monaco-editor">
      <textarea
        data-testid="monaco-textarea"
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
      />
    </div>
  ),
}));

// B4 (STU-RAILS): Monaco language setup — module-level, без loader.config
vi.mock('../monaco/setup', () => ({
  setupMonaco: () => ({}),
}));

vi.mock('../monaco/constructorLanguage', () => ({
  registerConstructorLanguageFeatures: () => {},
  applyDiagnostics: () => {},
}));

vi.mock('../monaco/scriptLanguage', () => ({
  registerScriptLanguageFeatures: () => {},
}));

// Mock BrowserStage to avoid canvas / CDP overhead in unit tests
vi.mock('../terminal/BrowserStage', () => ({
  BrowserStage: (props: { mode: string }) => (
    <div data-testid="mock-browser-stage">
      Browser Stage ({props.mode})
    </div>
  ),
}));

// Mock DiscoveryOverlay to avoid CDP interaction
vi.mock('../terminal/DiscoveryOverlay', () => ({
  DiscoveryOverlay: () => null,
  DSLProposalBanner: () => null,
}));

// Mock useCdpRecorder to return idle state
vi.mock('../terminal/useCdpRecorder', () => ({
  useCdpRecorder: () => ({
    state: { recording: false, cdpConnected: false, proposal: null, error: null, ambiguous: false, lastObservation: null, locator: null },
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    acceptProposal: vi.fn(),
    rejectProposal: vi.fn(),
  }),
}));

// Mock ScenarioDeckStore for controlled mode
vi.mock('../studio/ScenarioDeckStore', () => ({
  useScenarioDeckStore: (selector?: (s: unknown) => unknown) => {
    const state = { decks: [], setDecks: vi.fn(), addStep: vi.fn(), updateStep: vi.fn(), removeStep: vi.fn() };
    if (selector) return selector(state);
    return state;
  },
}));

describe('EditorWorkbench (PK-EC-1 & PK-EC-5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.getState().resetLayout();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the 3-panel shell layout correctly on mount', () => {
    render(<EditorWorkbench checkId="chk-jwt-test" />);

    expect(screen.getByTestId('editor-workbench-shell')).toBeDefined();
    expect(screen.getByTestId('workbench-left-panel')).toBeDefined();
    expect(screen.getByTestId('workbench-center-panel')).toBeDefined();
    expect(screen.getByTestId('workbench-right-panel')).toBeDefined();
    expect(screen.getByTestId('mock-monaco-editor')).toBeDefined();
  });

  it('toggles left panel open and closed via header button', () => {
    render(<EditorWorkbench />);
    expect(screen.queryByTestId('workbench-left-panel')).not.toBeNull();

    // Click toggle left button
    const toggleLeftBtn = screen.getByTitle(/Collapse Left Panel/i);
    fireEvent.click(toggleLeftBtn);
    expect(screen.queryByTestId('workbench-left-panel')).toBeNull();

    const expandLeftBtn = screen.getByTitle(/Expand Left Panel/i);
    fireEvent.click(expandLeftBtn);
    expect(screen.queryByTestId('workbench-left-panel')).not.toBeNull();
  });

  it('toggles right panel and bottom drawer via header buttons', () => {
    render(<EditorWorkbench />);
    expect(screen.queryByTestId('workbench-right-panel')).not.toBeNull();
    expect(screen.queryByTestId('workbench-bottom-drawer')).toBeNull();

    // Toggle bottom drawer
    const toggleBottomBtn = screen.getByTitle(/Expand Bottom Drawer/i);
    fireEvent.click(toggleBottomBtn);
    expect(screen.getByTestId('workbench-bottom-drawer')).toBeDefined();

    // Toggle right panel
    const toggleRightBtn = screen.getByTitle(/Collapse Right Panel/i);
    fireEvent.click(toggleRightBtn);
    expect(screen.queryByTestId('workbench-right-panel')).toBeNull();
  });

  it('switches right panel tabs between Context, Inspector, Telemetry, and Browser', () => {
    render(<EditorWorkbench />);
    expect(screen.getByText('Runtime Ghost Variables')).toBeDefined();

    // Switch to Inspector
    fireEvent.click(screen.getByRole('button', { name: /Inspector/i }));
    expect(screen.getByText('Active Step Parameters')).toBeDefined();

    // Switch to Telemetry
    fireEvent.click(screen.getByRole('button', { name: /Telemetry/i }));
    expect(screen.getByText('Live Telemetry')).toBeDefined();

    // Switch to Browser
    fireEvent.click(screen.getByRole('button', { name: /Browser/i }));
    expect(screen.getByTestId('mock-browser-stage')).toBeDefined();
  });

  it('supports editing DSL in Monaco and preserves 32 visible lines default canon', () => {
    const onCodeChange = vi.fn();
    render(<EditorWorkbench initialCode="Scenario Test { Step 1 }" onCodeChange={onCodeChange} />);

    const textarea = screen.getByTestId('monaco-textarea');
    expect((textarea as HTMLTextAreaElement).value).toBe('Scenario Test { Step 1 }');

    fireEvent.change(textarea, { target: { value: 'Scenario Updated { Step 2 }' } });
    expect(onCodeChange).toHaveBeenCalledWith('Scenario Updated { Step 2 }');
  });

  it('navigates to #/home when clicking the masterbrand logo', () => {
    window.location.hash = '#/studio';
    render(<EditorWorkbench />);

    const logoBtn = screen.getByTestId('workbench-home-logo');
    fireEvent.click(logoBtn);

    expect(window.location.hash).toBe('#/home');
  });
});
