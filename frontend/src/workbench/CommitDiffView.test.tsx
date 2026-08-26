/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CommitDiffView, CommitTimeline, redactDslSecrets } from './CommitDiffView';
import {
  createCommit,
  __resetCommitStoreForTests,
  initCommitStore,
} from '../checks/commitEngine';

afterEach(() => { cleanup(); });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWired(name = 'Test') {
  return {
    meta: { name, target: 'https://example.com' },
    infrastructure: { protocol: 'https' },
    security_configuration: { max_scan_depth: 3 },
    test_suites: {
      scenarios: [
        {
          scenario_name: 'Main Scenario',
          description: '',
          continue_on_failure: false,
          steps: [
            {
              step_id: 'step-0',
              description: '',
              constructor: `SAFE_GET https://example.com${name === 'v2' ? '/v2' : ''}`,
            },
          ],
        },
      ],
      pages: {},
      imports: [],
      fuzzers: [],
    },
  };
}

beforeEach(() => {
  __resetCommitStoreForTests();
  initCommitStore();
});

// ---------------------------------------------------------------------------
// CommitTimeline
// ---------------------------------------------------------------------------

const T1 = 'commit-diff-t1';
const T2 = 'commit-diff-t2';
const T3 = 'commit-diff-t3';
const EMPTY = 'commit-diff-empty';

describe('CommitTimeline', () => {
  it('renders empty state for no commits', () => {
    render(<CommitTimeline checkId={EMPTY} />);
    expect(screen.getByText('No commits yet')).toBeDefined();
  });

  it('renders commit list', () => {
    createCommit(T1, makeWired(), {}, { message: 'Init', author: 'maxim' });
    createCommit(T1, makeWired('v2'), {}, { message: 'Update', author: 'maxim' });

    render(<CommitTimeline checkId={T1} />);

    expect(screen.getByText('Init')).toBeDefined();
    expect(screen.getByText('Update')).toBeDefined();
  });

  it('highlights active commit', () => {
    const c1 = createCommit(T2, makeWired(), {}, { message: 'First', author: 'a' });
    createCommit(T2, makeWired('v2'), {}, { message: 'Second', author: 'a' });

    render(<CommitTimeline checkId={T2} activeCommitId={c1.commitId} />);
    expect(screen.getByText('First')).toBeDefined();
  });

  it('fires onSelectCommit callback', () => {
    let selected: string | null = null;
    const c = createCommit(T3, makeWired(), {}, { message: 'Select me', author: 'a' });

    render(
      <CommitTimeline checkId={T3} onSelectCommit={(commit) => { selected = commit.commitId; }} />,
    );

    fireEvent.click(screen.getByText('Select me'));
    expect(selected).toBe(c.commitId);
  });
});

// ---------------------------------------------------------------------------
// CommitDiffView — empty / single commit states
// ---------------------------------------------------------------------------

const D1 = 'diff-d1';
const D2 = 'diff-d2';

describe('CommitDiffView — empty states', () => {
  it('renders empty state with no commits', () => {
    render(<CommitDiffView checkId={EMPTY} />);
    expect(screen.getAllByText('No commits yet').length).toBeGreaterThan(0);
  });

  it('renders single commit message', () => {
    createCommit(D1, makeWired(), {}, { message: 'Only commit', author: 'a' });
    render(<CommitDiffView checkId={D1} />);
    expect(screen.getByText('Only one commit')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CommitDiffView — diff with two commits
// ---------------------------------------------------------------------------

const DL = 'diff-long';

describe('CommitDiffView — diff rendering', () => {
  it('renders toolbar with Diff label', () => {
    createCommit(DL, makeWired(), {}, { message: 'V1', author: 'a' });
    createCommit(DL, makeWired('v2'), {}, { message: 'V2', author: 'a' });

    render(<CommitDiffView checkId={DL} />);
    expect(screen.getAllByText('DIFF').length).toBeGreaterThan(0);
  });

  it('shows semantic change count badge', () => {
    const BS = 'diff-badge';
    const v1 = makeWired();
    const v2 = makeWired('v2');
    (v2.test_suites.scenarios[0] as Record<string, unknown>).steps = [
      { step_id: 'step-0', description: '', constructor: 'SAFE_GET https://example.com/v2' },
    ];

    createCommit(BS, v1, {}, { message: 'V1', author: 'a' });
    createCommit(BS, v2, {}, { message: 'V2', author: 'a' });

    render(<CommitDiffView checkId={BS} />);

    expect(screen.getAllByText('2 changes').length).toBeGreaterThan(0);
  });

  it('shows semantic changes sidebar', () => {
    const SS = 'diff-semantic';
    const v1 = makeWired();
    const v2 = makeWired('v2');

    createCommit(SS, v1, {}, { message: 'V1', author: 'a' });
    createCommit(SS, v2, {}, { message: 'V2', author: 'a' });

    render(<CommitDiffView checkId={SS} />);

    expect(screen.getAllByText('Semantic Changes').length).toBeGreaterThan(0);
  });

  it('shows correct from/to commit IDs in diff header', () => {
    const HF = 'diff-header';
    const c1 = createCommit(HF, makeWired(), {}, { message: 'V1', author: 'a' });
    const c2 = createCommit(HF, makeWired('v2'), {}, { message: 'V2', author: 'a' });

    render(<CommitDiffView checkId={HF} />);

    expect(screen.getAllByText((content) => content.includes(c1.commitId.slice(0, 7))).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes(c2.commitId.slice(0, 7))).length).toBeGreaterThan(0);
  });

  it('renders from/to select dropdowns', () => {
    const DD = 'diff-dropdowns';
    createCommit(DD, makeWired(), {}, { message: 'V1', author: 'a' });
    createCommit(DD, makeWired('v2'), {}, { message: 'V2', author: 'a' });
    createCommit(DD, makeWired('v3'), {}, { message: 'V3', author: 'a' });

    render(<CommitDiffView checkId={DD} />);

    const selects = document.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('renders in standalone variant', () => {
    const SA = 'diff-standalone';
    createCommit(SA, makeWired(), {}, { message: 'V1', author: 'a' });
    createCommit(SA, makeWired('v2'), {}, { message: 'V2', author: 'a' });

    render(<CommitDiffView checkId={SA} variant="standalone" />);

    expect(screen.getAllByText('DIFF').length).toBeGreaterThan(0);
  });

  it('renders close button when onClose provided', () => {
    const CB = 'diff-close';
    createCommit(CB, makeWired(), {}, { message: 'V1', author: 'a' });
    createCommit(CB, makeWired('v2'), {}, { message: 'V2', author: 'a' });

    let closed = false;
    render(
      <CommitDiffView checkId={CB} onClose={() => { closed = true; }} />,
    );

    const closeBtn = screen.getByText('✕');
    fireEvent.click(closeBtn);
    expect(closed).toBe(true);
  });

  it('renders "No semantic changes detected" for identical commits', () => {
    const ID = 'diff-identical';
    const wired = makeWired();

    createCommit(ID, wired, {}, { message: 'V1', author: 'a', timestamp: '2026-01-01T00:00:00Z' });
    createCommit(ID, wired, {}, { message: 'V2', author: 'a', timestamp: '2026-01-01T00:00:01Z' });

    render(<CommitDiffView checkId={ID} />);
    expect(screen.getByText('No semantic changes detected')).toBeDefined();
  });

  it('does not render DIFF toolbar for zero commits', () => {
    // Use a fresh render in isolation — verify the empty state is shown instead of DIFF toolbar
    const { container } = render(<CommitDiffView checkId={EMPTY} />);
    // Empty state should show "No commits yet", not the DIFF toolbar
    expect(container.querySelector('.text-xs.font-bold.text-slate-300')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ER-5: redactDslSecrets
// ---------------------------------------------------------------------------

describe('redactDslSecrets (ER-5)', () => {
  it('masks token, password, secret, cookie and api-key values', () => {
    const input = [
      '# auth=bearer',
      '# token=superSecret123',
      '# password=myP@ss',
      '# cookie=sessionid=abc',
      'Header X-Api-Key = deadbeef',
      'SAFE_GET https://example.com',
    ].join('\n');

    const out = redactDslSecrets(input);
    expect(out).not.toContain('superSecret123');
    expect(out).not.toContain('myP@ss');
    expect(out).not.toContain('deadbeef');
    expect(out).toContain('token=••••••');
    expect(out).toContain('password=••••••');
    // Non-secret lines pass through unchanged
    expect(out).toContain('SAFE_GET https://example.com');
  });

  it('leaves text without secrets untouched', () => {
    const input = 'SAFE_GET https://example.com\nPOST https://api/scan';
    expect(redactDslSecrets(input)).toBe(input);
  });
});