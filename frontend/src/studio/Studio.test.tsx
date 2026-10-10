// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { Studio } from './Studio';

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

vi.mock('./Canvas', () => ({
  Canvas: (props: { counts?: Record<string, number> }) => (
    <div data-testid="canvas-v2" data-counts={JSON.stringify(props.counts ?? null)} />
  ),
}));

// STUDIO-FUZZER-FORM-SURFACE: дерево тяжёлое (dnd/antd-обвес) — в юнит-тестах
// Studio даём лёгкий стаб; сам StudioBlocksTree покрыт своим сьютом, живое
// дерево проверяется live-пруфом.
vi.mock('./StudioExplorer', () => ({
  StudioExplorer: (props: { onSelectTab: (id: string) => void }) => (
    <div data-testid="studio-explorer">
      <button data-testid="select-fuzzer-0" onClick={() => props.onSelectTab('fuzzer:0')} />
      <button data-testid="select-fuzzer-1" onClick={() => props.onSelectTab('fuzzer:1')} />
      <button data-testid="select-resource-0" onClick={() => props.onSelectTab('resource:0')} />
      <button
        data-testid="select-deleted-fuzzer"
        onClick={() => props.onSelectTab('fuzzer:9')}
      />
    </div>
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

function makeWired(scenarioCount: number, pageCount: number) {
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

describe('Studio (STU-V2 B1/B2/B4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('B1: без проверки и манифеста — честное пустое состояние', () => {
    render(<Studio />);
    expect(screen.getByText('Проверка не выбрана')).toBeDefined();
  });

  it('B1+B2: привязан к checkId — Canvas получает реальные счётчики из formData', () => {
    const wired = makeWired(2, 1);
    render(<Studio checkId="chk-12345678" initialWired={wired} />);

    // Canvas счётчики — реальные (2 сценария, 1 страница), не литералы.
    const canvas = screen.getByTestId('canvas-v2');
    const counts = JSON.parse(canvas.getAttribute('data-counts') ?? 'null');
    expect(counts.scenarios).toBe(2);
    expect(counts.pages).toBe(1);
    expect(counts.modules).toBe(0);
  });

  it('B1: другая проверка — свои данные (перезагрузка formData → счётчики Canvas)', () => {
    const first = makeWired(2, 1);
    const second = makeWired(1, 3);
    const { rerender } = render(<Studio checkId="chk-aaa" initialWired={first} />);

    rerender(<Studio checkId="chk-bbb" initialWired={second} />);

    const canvas = screen.getByTestId('canvas-v2');
    const counts = JSON.parse(canvas.getAttribute('data-counts') ?? 'null');
    expect(counts.scenarios).toBe(1);
    expect(counts.pages).toBe(3);
  });

  it('B4: вкладка «Код» открывает Monaco-конструктор на языке prettyk', () => {
    const wired = makeWired(1, 0);
    render(<Studio checkId="chk-abc" initialWired={wired} />);

    fireEvent.click(screen.getByText('Код'));

    const editor = screen.getByTestId('mock-monaco-editor');
    expect(editor.getAttribute('data-language')).toBe('prettyk');
    expect(screen.getByText('PrettyK DSL')).toBeDefined();
  });
});

function makeWiredWithForms() {
  const base = makeWired(0, 0);
  return {
    ...base,
    test_suites: {
      ...base.test_suites,
      fuzzers: [
        {
          id: 'juice_search_q',
          targets: [
            {
              url: 'http://juice-shop:3000/rest/products/search?q=',
              method: 'GET',
              corpus: 'intent_sqli_smoke',
            },
          ],
        },
        { id: 'juice0' },
      ],
      imports: [{ path: 'resources/customers.txt', kind: 'data_file', as: 'customers' }],
    },
  };
}

describe('Studio — STUDIO-FUZZER-FORM-SURFACE: форма вместо пустоты', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('выбор фаззера в дереве открывает прежнюю форму (корпус/словарь), без конструктора шагов', () => {
    render(<Studio formData={makeWiredWithForms()} onFormDataChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('select-fuzzer-0'));

    const surface = screen.getByTestId('studio-form-surface');
    expect(within(surface).getByText('Corpus (словарь)')).toBeDefined();
    expect(screen.getByDisplayValue('juice_search_q')).toBeDefined();
    // чужой контент (конструктор шагов Canvas) на форме не остаётся
    expect(screen.queryByTestId('canvas-v2')).toBeNull();
  }, 20000);

  it('второй фаззер чека (juice0) открывается той же формой', () => {
    render(<Studio formData={makeWiredWithForms()} onFormDataChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('select-fuzzer-1'));

    expect(screen.getByDisplayValue('juice0')).toBeDefined();
    expect(screen.getByText('Corpus (словарь)')).toBeDefined();
  }, 10000);

  it('правки формы сохраняются в чек (targets уходят в formData)', () => {
    const onFormDataChange = vi.fn();
    render(<Studio formData={makeWiredWithForms()} onFormDataChange={onFormDataChange} />);

    fireEvent.click(screen.getByTestId('select-fuzzer-0'));
    fireEvent.click(screen.getByText('+ Добавить цель'));

    expect(onFormDataChange).toHaveBeenCalled();
    const next = onFormDataChange.mock.calls.at(-1)?.[0] as {
      test_suites: { fuzzers: { targets: unknown[] }[] };
    };
    expect(next.test_suites.fuzzers[0]?.targets.length).toBe(2);
  }, 10000);

  it('выбор ресурса открывает форму ресурса (path/kind/as/содержимое)', () => {
    render(<Studio formData={makeWiredWithForms()} onFormDataChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('select-resource-0'));

    expect(screen.getByTestId('resource-form')).toBeDefined();
    expect(screen.getByDisplayValue('resources/customers.txt')).toBeDefined();
    expect(screen.getByDisplayValue('customers')).toBeDefined();
  }, 10000);

  it('негатив: удалённый фаззер → честное «не найдено», без фантомной формы', () => {
    render(<Studio formData={makeWiredWithForms()} onFormDataChange={vi.fn()} />);

    fireEvent.click(screen.getByTestId('select-deleted-fuzzer'));

    expect(screen.getByTestId('studio-form-surface-missing')).toBeDefined();
    expect(screen.queryByTestId('studio-form-surface')).toBeNull();
    expect(screen.getByText(/Элемент не найден/)).toBeDefined();
  }, 10000);
});
