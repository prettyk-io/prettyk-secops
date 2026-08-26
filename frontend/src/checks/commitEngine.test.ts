/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  createCommit,
  listCommits,
  getCommit,
  getLatestCommit,
  verifyProvenanceChain,
  computeContentHash,
  normalizeWired,
  stableEntityId,
  normalizeEntityArray,
  computeSemanticDiff,
  initCommitStore,
  __resetCommitStoreForTests,
  __getRawCommitStoreForTests,
  type CommitRecord,
  type SemanticChange,
} from '../checks/commitEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWired(scenarios?: Array<Record<string, unknown>>, pages?: Record<string, unknown>) {
  return {
    meta: { name: 'Test Check', target: 'https://example.com' },
    infrastructure: { protocol: 'https' },
    security_configuration: { max_scan_depth: 3 },
    test_suites: {
      scenarios: scenarios ?? [],
      pages: pages ?? {},
      imports: [],
      fuzzers: [],
    },
  };
}

function makeScenario(name: string, constructor: string): Record<string, unknown> {
  return {
    scenario_name: name,
    description: '',
    continue_on_failure: false,
    steps: [{ step_id: 'step-0', description: '', constructor }],
  };
}

// ---------------------------------------------------------------------------
// C1 — Immutable Commit Records
// ---------------------------------------------------------------------------

describe('Commit Engine — C1: Immutable Revisions', () => {
  beforeEach(() => {
    __resetCommitStoreForTests();
    initCommitStore();
  });

  it('creates a commit with all fields populated', () => {
    const commit = createCommit('check-1', makeWired([]), {}, {
      message: 'Initial commit',
      author: 'maxim',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(commit.commitId).toBeDefined();
    expect(commit.commitId.length).toBe(8);
    expect(commit.parentHash).toBeNull();
    expect(commit.contentHash).toBeDefined();
    expect(commit.message).toBe('Initial commit');
    expect(commit.author).toBe('maxim');
    expect(commit.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(commit.wired).toBeDefined();
    expect(commit.resources).toEqual({});
    expect(commit.provenance).toBeDefined();
  });

  it('generates unique commitIds for different content', () => {
    const c1 = createCommit('check-1', makeWired([makeScenario('A', 'line 1')]), {}, {
      message: 'First',
      author: 'maxim',
    });

    const c2 = createCommit('check-1', makeWired([makeScenario('A', 'line 2')]), {}, {
      message: 'Second',
      author: 'maxim',
    });

    expect(c1.commitId).not.toBe(c2.commitId);
  });

  it('generates same commitId for identical content + timestamp', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const wired = makeWired([]);

    const c1 = createCommit('check-1', wired, {}, { message: 'm', author: 'a', timestamp: ts });
    const c2 = createCommit('check-2', wired, {}, { message: 'm', author: 'a', timestamp: ts });

    expect(c1.commitId).toBe(c2.commitId);
  });

  it('parentHash is previous commit contentHash', () => {
    const c1 = createCommit('check-1', makeWired([]), {}, { message: 'First', author: 'a' });
    const c2 = createCommit('check-1', makeWired([makeScenario('S1', 'test')]), {}, { message: 'Second', author: 'a' });

    expect(c2.parentHash).toBe(c1.contentHash);
  });

  it('first commit always has null parentHash', () => {
    const c = createCommit('check-2', makeWired([]), {}, { message: 'init', author: 'a' });
    expect(c.parentHash).toBeNull();
  });

  it('listCommits returns all commits in order', () => {
    createCommit('check-1', makeWired([]), {}, { message: '1', author: 'a' });
    createCommit('check-1', makeWired([makeScenario('S1', 'x')]), {}, { message: '2', author: 'a' });
    createCommit('check-1', makeWired([makeScenario('S1', 'y')]), {}, { message: '3', author: 'a' });

    const list = listCommits('check-1');
    expect(list.length).toBe(3);
    expect(list[0]!.message).toBe('1');
    expect(list[1]!.message).toBe('2');
    expect(list[2]!.message).toBe('3');
  });

  it('listCommits returns empty array for unknown checkId', () => {
    expect(listCommits('nonexistent')).toEqual([]);
  });

  it('getCommit retrieves by commitId', () => {
    const c1 = createCommit('check-1', makeWired([]), {}, { message: 'first', author: 'a' });
    const c2 = createCommit('check-1', makeWired([makeScenario('S', 'd')]), {}, { message: 'second', author: 'a' });

    const item = getCommit('check-1', c1.commitId);
    expect(item!.message).toBe('first');
    const item2 = getCommit('check-1', c2.commitId);
    expect(item2!.message).toBe('second');
    expect(getCommit('check-1', 'nonexistent')).toBeUndefined();
  });

  it('getLatestCommit returns most recent', () => {
    createCommit('check-1', makeWired([]), {}, { message: 'first', author: 'a' });
    createCommit('check-1', makeWired([makeScenario('S', 'd')]), {}, { message: 'latest', author: 'a' });

    const latest = getLatestCommit('check-1');
    expect(latest?.message).toBe('latest');
  });

  it('getLatestCommit returns undefined for unknown checkId', () => {
    expect(getLatestCommit('nonexistent')).toBeUndefined();
  });

  it('verifyProvenanceChain passes for valid chain', () => {
    createCommit('check-1', makeWired([]), {}, { message: '1', author: 'a' });
    createCommit('check-1', makeWired([makeScenario('S', 'x')]), {}, { message: '2', author: 'a' });

    expect(verifyProvenanceChain('check-1')).toBe(true);
  });

  it('verifyProvenanceChain fails for tampered content', () => {
    createCommit('check-1', makeWired([]), {}, { message: '1', author: 'a' });

    // Simulate tampering: write through store
    const store = __getRawCommitStoreForTests();
    store.commits['check-1']![0]!.contentHash = 'deadbeef';

    expect(verifyProvenanceChain('check-1')).toBe(false);
  });

  it('verifyProvenanceChain returns true for empty checkId', () => {
    expect(verifyProvenanceChain('nonexistent')).toBe(true);
  });

  it('commits survive store reload', () => {
    createCommit('check-1', makeWired([]), {}, { message: '1', author: 'a' });

    // Re-init from localStorage
    initCommitStore();

    const list = listCommits('check-1');
    expect(list.length).toBe(1);
    expect(list[0]!.message).toBe('1');
  });

  it('commit resources are stored correctly', () => {
    const commit = createCommit('check-1', makeWired([]), { 'file.txt': 'hello' }, {
      message: 'with resources',
      author: 'a',
    });

    expect(commit.resources).toEqual({ 'file.txt': 'hello' });
  });

  it('contentHash changes when message differs', () => {
    const c1 = createCommit('check-1', makeWired([]), {}, { message: 'A', author: 'a', timestamp: '2026-01-01T00:00:00.000Z' });
    const c2 = createCommit('check-2', makeWired([]), {}, { message: 'B', author: 'a', timestamp: '2026-01-01T00:00:00.000Z' });

    expect(c1.contentHash).not.toBe(c2.contentHash);
  });

  it('isolates commits per checkId', () => {
    createCommit('check-A', makeWired([makeScenario('SA', 'a')]), {}, { message: 'A', author: 'a' });
    createCommit('check-B', makeWired([makeScenario('SB', 'b')]), {}, { message: 'B', author: 'a' });

    expect(listCommits('check-A').length).toBe(1);
    expect(listCommits('check-B').length).toBe(1);
    expect(listCommits('check-A')[0]!.message).toBe('A');
    expect(listCommits('check-B')[0]!.message).toBe('B');
  });

  it('verifyProvenanceChain fails on tampered provenance', () => {
    createCommit('check-1', makeWired([]), {}, { message: '1', author: 'a' });

    const store = __getRawCommitStoreForTests();
    store.commits['check-1']![0]!.provenance = 'tampered';

    expect(verifyProvenanceChain('check-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C2 — Domain Normalization
// ---------------------------------------------------------------------------

describe('Commit Engine — C2: Domain Normalization', () => {
  it('sorts object keys alphabetically', () => {
    const input = { zebra: 1, alpha: 2, gamma: 3 };
    const normalized = normalizeWired(input) as Record<string, unknown>;

    const keys = Object.keys(normalized);
    expect(keys).toEqual(['alpha', 'gamma', 'zebra']);
  });

  it('sorts nested object keys', () => {
    const input = {
      meta: { zebra: 1, alpha: 2 },
      test_suites: { gamma: 3, beta: 4 },
    };
    const normalized = normalizeWired(input) as Record<string, unknown>;

    const metaKeys = Object.keys(normalized.meta as Record<string, unknown>);
    const suiteKeys = Object.keys(normalized.test_suites as Record<string, unknown>);

    expect(metaKeys).toEqual(['alpha', 'zebra']);
    expect(suiteKeys).toEqual(['beta', 'gamma']);
  });

  it('preserves constructor/content/body keys unchanged', () => {
    const input = {
      constructor: 'line2\nline1',  // order matters inside DSL
      title: 'z',
      path: 'a',
    };
    const normalized = normalizeWired(input) as Record<string, unknown>;

    expect(normalized.constructor).toBe('line2\nline1'); // unchanged
    // Other keys are sorted; 'constructor' < 'path' alphabetically
    const keys = Object.keys(normalized);
    expect(keys.indexOf('constructor')).toBeLessThan(keys.indexOf('path'));
  });

  it('normalizes arrays recursively', () => {
    const input = {
      items: [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ],
    };
    const normalized = normalizeWired(input) as Record<string, unknown>;
    const items = normalized.items as Array<Record<string, unknown>>;

    expect(Object.keys(items[0]!)).toEqual(['a', 'b']);
    expect(Object.keys(items[1]!)).toEqual(['c', 'd']);
  });

  it('handles null and undefined gracefully', () => {
    expect(normalizeWired(null)).toBeNull();
    expect(normalizeWired(undefined)).toBeUndefined();
  });

  it('handles primitive values', () => {
    expect(normalizeWired(42)).toBe(42);
    expect(normalizeWired('hello')).toBe('hello');
    expect(normalizeWired(true)).toBe(true);
  });

  it('stableEntityId uses scenario_name', () => {
    expect(stableEntityId({ scenario_name: 'Login' }, 0)).toBe('scenario:Login');
    expect(stableEntityId({ scenario_name: 'Dashboard' }, 1)).toBe('scenario:Dashboard');
  });

  it('stableEntityId uses page title', () => {
    expect(stableEntityId({ title: 'HomePage' }, 0)).toBe('page:HomePage');
  });

  it('stableEntityId uses page path as fallback', () => {
    expect(stableEntityId({ path: '/home' }, 0)).toBe('page:/home');
  });

  it('stableEntityId uses import as', () => {
    expect(stableEntityId({ as: 'test_data' }, 0)).toBe('import:test_data');
  });

  it('stableEntityId falls back to index', () => {
    expect(stableEntityId({}, 42)).toBe('entity:42');
  });

  it('normalizeEntityArray builds stable map', () => {
    const arr = [
      { scenario_name: 'B', constructor: 'b' },
      { scenario_name: 'A', constructor: 'a' },
    ];
    const map = normalizeEntityArray(arr, 'scenario');

    expect(Object.keys(map).sort()).toEqual(['scenario:A', 'scenario:B']);
    expect(map['scenario:A']?.constructor).toBe('a');
    expect(map['scenario:B']?.constructor).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// C3 — Semantic Change Set
// ---------------------------------------------------------------------------

describe('Commit Engine — C3: Semantic Diff', () => {
  it('detects ADD_SCENARIO', () => {
    const prev = makeWired([]);
    const next = makeWired([makeScenario('NewScenario', 'line 1')]);

    const changes = computeSemanticDiff(prev, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('ADD_SCENARIO');
    expect(changes[0]!.entityId).toBe('scenario:NewScenario');
  });

  it('detects REMOVE_SCENARIO', () => {
    const prev = makeWired([makeScenario('OldScenario', 'line 1')]);
    const next = makeWired([]);

    const changes = computeSemanticDiff(prev, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe('REMOVE_SCENARIO');
    expect(changes[0]!.entityId).toBe('scenario:OldScenario');
  });

  it('detects RENAME_ENTITY when constructor matches across old and new name', () => {
    const prev = makeWired([makeScenario('OldName', 'line 1')]);
    const next = makeWired([makeScenario('NewName', 'line 1')]);

    const changes = computeSemanticDiff(prev, next);
    expect(changes.some((c) => c.kind === 'RENAME_ENTITY')).toBe(true);
    const rename = changes.find((c) => c.kind === 'RENAME_ENTITY');
    expect(rename?.before).toBe('OldName');
    expect(rename?.after).toBe('NewName');
  });

  it('detects MODIFY_STEP when constructor changes', () => {
    const prev = makeWired([makeScenario('Auth', 'SAFE_GET https://old.com')]);
    const next = makeWired([makeScenario('Auth', 'SAFE_GET https://new.com')]);

    const changes = computeSemanticDiff(prev, next);
    const modify = changes.find((c) => c.kind === 'MODIFY_STEP');
    expect(modify).toBeDefined();
    expect(modify!.before).toContain('old.com');
    expect(modify!.after).toContain('new.com');
  });

  it('detects ADD_STEP when step count increases', () => {
    const prev = makeWired([makeScenario('Auth', 'step 1')]);
    const nextWired = { ...makeWired([makeScenario('Auth', 'step 1')]) };
    // Add a second step manually
    const nextSc = (nextWired.test_suites as Record<string, unknown>).scenarios as Record<string, unknown>[];
    nextSc[0]!.steps = [
      { step_id: 'step-0', description: '', constructor: 'step 1' },
      { step_id: 'step-1', description: '', constructor: 'step 2' },
    ];

    const changes = computeSemanticDiff(prev, nextWired);
    expect(changes.some((c) => c.kind === 'ADD_STEP')).toBe(true);
  });

  it('detects REMOVE_STEP when step count decreases', () => {
    const prevWired = { ...makeWired([makeScenario('Auth', 'step 1')]) };
    const prevSc = (prevWired.test_suites as Record<string, unknown>).scenarios as Record<string, unknown>[];
    prevSc[0]!.steps = [
      { step_id: 'step-0', description: '', constructor: 'step 1' },
      { step_id: 'step-1', description: '', constructor: 'step 2' },
    ];

    const next = makeWired([makeScenario('Auth', 'step 1')]);

    const changes = computeSemanticDiff(prevWired, next);
    expect(changes.some((c) => c.kind === 'REMOVE_STEP')).toBe(true);
  });

  it('ignores field order noise (normalization applied)', () => {
    const prev = { zebra: 'z', alpha: 'a', test_suites: { scenarios: [makeScenario('S', 'dsl')], pages: {}, imports: [], fuzzers: [] }, meta: { name: 'T', target: 'https://x.com' }, infrastructure: {}, security_configuration: {} };
    const next = { alpha: 'a', zebra: 'z', test_suites: { scenarios: [makeScenario('S', 'dsl')], pages: {}, imports: [], fuzzers: [] }, meta: { name: 'T', target: 'https://x.com' }, infrastructure: {}, security_configuration: {} };

    const changes = computeSemanticDiff(prev, next);
    expect(changes).toHaveLength(0);
  });

  it('detects MODIFY_REGULATION for meta changes', () => {
    const prev = makeWired([]);
    const next = makeWired([]);
    (next.meta as Record<string, unknown>).name = 'New Name';

    const changes = computeSemanticDiff(prev, next);
    expect(changes.some((c) => c.kind === 'MODIFY_REGULATION')).toBe(true);
  });

  it('detects MODIFY_REGULATION for infrastructure changes', () => {
    const prev = makeWired([]);
    const next = makeWired([]);
    (next.infrastructure as Record<string, unknown>).protocol = 'http';

    const changes = computeSemanticDiff(prev, next);
    expect(changes.some((c) => c.kind === 'MODIFY_REGULATION')).toBe(true);
  });

  it('detects MODIFY_REGULATION for security_configuration changes', () => {
    const prev = makeWired([]);
    const next = makeWired([]);
    (next.security_configuration as Record<string, unknown>).max_scan_depth = 5;

    const changes = computeSemanticDiff(prev, next);
    expect(changes.some((c) => c.kind === 'MODIFY_REGULATION')).toBe(true);
  });

  it('detects ADD_RESOURCE', () => {
    const prev = makeWired([]);
    const next = makeWired([]);

    const changes = computeSemanticDiff(prev, next, {}, { 'new_file.txt': 'content' });
    expect(changes.some((c) => c.kind === 'ADD_RESOURCE')).toBe(true);
  });

  it('detects REMOVE_RESOURCE', () => {
    const prev = makeWired([]);
    const next = makeWired([]);

    const changes = computeSemanticDiff(prev, next, { 'old_file.txt': 'content' }, {});
    expect(changes.some((c) => c.kind === 'REMOVE_RESOURCE')).toBe(true);
  });

  it('detects MODIFY_RESOURCE', () => {
    const prev = makeWired([]);
    const next = makeWired([]);

    const changes = computeSemanticDiff(prev, next, { 'file.txt': 'old' }, { 'file.txt': 'new' });
    expect(changes.some((c) => c.kind === 'MODIFY_RESOURCE')).toBe(true);
  });

  it('returns empty array for identical content', () => {
    const wired = makeWired([makeScenario('S', 'dsl')]);
    const changes = computeSemanticDiff(wired, wired);
    expect(changes).toHaveLength(0);
  });

  it('handles page constructor changes', () => {
    const prev = makeWired([], { main: { title: 'Main', constructor: 'page v1' } });
    const next = makeWired([], { main: { title: 'Main', constructor: 'page v2' } });

    const changes = computeSemanticDiff(prev, next);
    expect(changes.some((c) => c.kind === 'MODIFY_STEP' && c.entityId.startsWith('page:'))).toBe(true);
  });

  it('handles multiple changes in one diff', () => {
    const prev = makeWired([
      makeScenario('Keep', 'unchanged'),
      makeScenario('Removed', 'bye'),
    ]);
    const next = makeWired([
      makeScenario('Keep', 'unchanged'),
      makeScenario('Added', 'new'),
    ]);
    // Also change meta
    (next.meta as Record<string, unknown>).name = 'New Check';

    const changes = computeSemanticDiff(prev, next);

    const kinds = changes.map((c) => c.kind);
    expect(kinds).toContain('REMOVE_SCENARIO');
    expect(kinds).toContain('ADD_SCENARIO');
    expect(kinds).toContain('MODIFY_REGULATION');
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });

  it('change set label is human-readable', () => {
    const prev = makeWired([]);
    const next = makeWired([makeScenario('Login Flow', 'dsl')]);

    const changes = computeSemanticDiff(prev, next);
    expect(changes[0]!.label).toContain('Login Flow');
  });

  it('returns empty array for empty inputs', () => {
    const changes = computeSemanticDiff({}, {});
    expect(changes).toHaveLength(0);
  });
});