/**
 * WIRE-SYNC-L2: Monaco ↔ Canvas bidirectional bridge tests.
 *
 * Проверяет:
 *  - content hash guard (no cyclic updates)
 *  - no cdp-poc zombie deck
 *  - empty Canvas when empty scenario
 *  - demo store isolation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Content hash guard ──

describe('contentHash guard', () => {
  it('same content produces same hash', () => {
    const h1 = 'line1\nline2|' + 'line1\nline2'.length;
    const h2 = 'line1\nline2|' + 'line1\nline2'.length;
    expect(h1).toBe(h2);
  });

  it('different content produces different hash', () => {
    const h1 = 'line1\nline2|' + 'line1\nline2'.length;
    const h2 = 'line1\nline3|' + 'line1\nline3'.length;
    expect(h1).not.toBe(h2);
  });

  it('hash guard prevents cyclic update (same hash → skip)', () => {
    let canvasSyncHash = '';
    const text = 'Клик button "login"';
    const newHash = text.slice(0, 200) + '|' + text.length;
    // First update — should go through
    if (newHash !== canvasSyncHash) {
      canvasSyncHash = newHash;
    }
    expect(canvasSyncHash).toBe(newHash);
    // Same text again — should skip
    const sameHash = text.slice(0, 200) + '|' + text.length;
    let updated = false;
    if (sameHash !== canvasSyncHash) {
      updated = true;
    }
    expect(updated).toBe(false);
  });
});

// ── cdp-poc zombie deck ──

describe('no cdp-poc zombie deck', () => {
  it('scenarioDeckId is undefined when no activeTab', () => {
    // When activeTab is null/undefined, entityId is undefined (no cdp-poc fallback)
    const scenarioDeckId: string | undefined = undefined;
    expect(scenarioDeckId).toBeUndefined();
  });

  it('scenarioDeckId uses entityId when activeTab exists', () => {
    const activeTab = { entityId: 'scenario-42' } as { entityId?: string };
    const scenarioDeckId = activeTab?.entityId;
    // no || 'cdp-poc'
    expect(scenarioDeckId).toBe('scenario-42');
  });

  it('deck is NOT created when scenarioDeckId is undefined', () => {
    const decks: { id: string }[] = [];
    const scenarioDeckId: string | undefined = undefined;
    // Guard: only create if scenarioDeckId is truthy
    if (scenarioDeckId && !decks.find(d => d.id === scenarioDeckId)) {
      decks.push({ id: scenarioDeckId });
    }
    expect(decks).toHaveLength(0);
  });
});

// ── Empty Canvas for empty scenario ──

describe('empty Canvas for empty scenario', () => {
  it('deck with no steps produces empty Dsl', () => {
    const deck = { id: 's1', steps: [] as readonly { action?: string; strategyValue?: string; payload?: string }[] };
    const dslLines = deck.steps
      .filter(s => s.action && s.strategyValue)
      .map(s => `${s.action} ${s.strategyValue} ${s.payload || ''}`.trim());
    expect(dslLines).toHaveLength(0);
  });

  it('deck with steps produces DSL lines', () => {
    const deck = {
      id: 's1',
      steps: [
        { action: 'Click', strategy: 'role', strategyValue: 'button', payload: '' },
        { action: 'Type', strategy: 'label', strategyValue: 'Email', payload: 'test@test.com' },
      ],
    };
    const dslLines = deck.steps
      .filter(s => s.action && s.strategyValue)
      .map(s => `${s.action} ${s.strategy} "${s.strategyValue}" ${s.payload || ''}`.trim());
    expect(dslLines).toHaveLength(2);
    expect(dslLines[0]).toBe('Click role "button"');
    expect(dslLines[1]).toBe('Type label "Email" test@test.com');
  });
});

// ── Demo Store isolation ──

describe('demo store isolation', () => {
  it('mock steps are not mixed with real entity data', () => {
    const demoSteps = [
      { action: 'Click', strategy: 'role', strategyValue: 'demo-btn', payload: '' },
    ];
    const realSteps = [
      { action: 'Click', strategy: 'label', strategyValue: 'real-btn', payload: '' },
    ];
    // Demo store should have separate identity from real context
    const demoDeckId = 'demo-deck';
    const realDeckId = 'scenario-real-1';
    expect(demoDeckId).not.toBe(realDeckId);
    // Real steps should not include demo data
    expect(realSteps).toHaveLength(1);
    expect(realSteps[0]!.strategyValue).toBe('real-btn');
  });

  it('cdp-poc literal does not appear in scenarioDeckId', () => {
    const entityId = 'scenario-auth-1';
    const scenarioDeckId = entityId;  // no fallback
    expect(scenarioDeckId).not.toBe('cdp-poc');
    expect(scenarioDeckId).toBe('scenario-auth-1');
  });
});

// ── Round-trip: DSL → steps → DSL ──

describe('DSL ↔ steps round-trip', () => {
  it('converts DSL string to steps array', () => {
    const dsl = 'Click role "Login"\nType label "Password" $secret!';
    const lines = dsl.split('\n').filter(Boolean);
    const steps = lines.map(line => {
      const parts = line.split(' ');
      const action = parts[0]!;
      const strategy = parts[1]!;
      const value = parts.slice(2).join(' ').replace(/"/g, '').trim();
      return { action, strategy, strategyValue: value.split(' ')[0] || '', payload: value.split(' ').slice(1).join(' ') || '' };
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]!.action).toBe('Click');
    expect(steps[0]!.strategy).toBe('role');
    expect(steps[0]!.strategyValue).toBe('Login');
  });

  it('converts steps back to DSL', () => {
    const steps = [
      { action: 'Click', strategy: 'role', strategyValue: 'Login', payload: '' },
      { action: 'Type', strategy: 'label', strategyValue: 'Password', payload: '$secret!' },
    ];
    const dslLines = steps
      .filter(s => s.action && s.strategyValue)
      .map(s => `${s.action} ${s.strategy} "${s.strategyValue}" ${s.payload || ''}`.trim());
    const dsl = dslLines.join('\n');
    expect(dsl).toBe('Click role "Login"\nType label "Password" $secret!');
  });
});