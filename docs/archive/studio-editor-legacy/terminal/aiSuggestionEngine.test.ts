/**
 * PK-WB-E7 — AI Suggestion Engine Tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAiMutablePath,
  detectForbiddenScope,
  sanitizeAiText,
  createStepSuggestion,
  validateSuggestion,
  applySuggestion,
  suggestionDiffLines,
  __resetSuggestionCounter,
  AI_FORBIDDEN_SCOPES,
} from './aiSuggestionEngine';
import type { AiSuggestion } from './aiSuggestionEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuggestion(overrides?: Partial<AiSuggestion>): AiSuggestion {
  return {
    id: 'ai-sugg-test-1',
    createdAt: '2026-08-25T10:00:00Z',
    scope: 'step_constructor',
    entityId: 'scenario_auth',
    entityLabel: 'Auth Scenario',
    dslPath: '/test_suites/scenarios/0/steps/0/constructor',
    currentText: 'GET /api/auth/login\nTYPE username admin',
    suggestedText: 'GET /api/auth/login\nTYPE username admin\nASSERT status 200',
    explanation: 'Added status assertion to verify login endpoint returns HTTP 200.',
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  __resetSuggestionCounter();
});

// ---------------------------------------------------------------------------
// isAiMutablePath
// ---------------------------------------------------------------------------

describe('isAiMutablePath', () => {
  it('allows constructor paths', () => {
    expect(isAiMutablePath('/test_suites/scenarios/0/steps/0/constructor')).toBe(true);
    expect(isAiMutablePath('/test_suites/pages/home/constructor')).toBe(true);
    expect(isAiMutablePath('/test_suites/fuzzers/0/constructor')).toBe(true);
  });

  it('allows content paths', () => {
    expect(isAiMutablePath('/test_suites/imports/0/content')).toBe(true);
  });

  it('allows metadata paths', () => {
    expect(isAiMutablePath('/test_suites/scenarios/0/scenario_name')).toBe(true);
    expect(isAiMutablePath('/test_suites/scenarios/0/description')).toBe(true);
    expect(isAiMutablePath('/meta/name')).toBe(true);
  });

  it('rejects scope/policy paths', () => {
    expect(isAiMutablePath('/infrastructure/target')).toBe(false);
    expect(isAiMutablePath('/policy/gate/rule')).toBe(false);
    expect(isAiMutablePath('/test_suites/regulation')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectForbiddenScope
// ---------------------------------------------------------------------------

describe('detectForbiddenScope', () => {
  it('detects infrastructure/security_configuration', () => {
    expect(detectForbiddenScope('/infrastructure/target')).toBe('security_configuration');
    expect(detectForbiddenScope('/security_configuration/allowed_hosts')).toBe('security_configuration');
  });

  it('detects scope_rules', () => {
    expect(detectForbiddenScope('/test_suites/regulation/allowedHosts')).toBe('scope_rules');
  });

  it('detects policy_rules', () => {
    expect(detectForbiddenScope('/policy/gate/max_critical')).toBe('policy_rules');
    expect(detectForbiddenScope('/gate/threshold')).toBe('policy_rules');
  });

  it('detects environment_config', () => {
    expect(detectForbiddenScope('/allowedHosts')).toBe('environment_config');
    expect(detectForbiddenScope('/allowedPaths')).toBe('environment_config');
    expect(detectForbiddenScope('/environment')).toBe('environment_config');
  });

  it('detects destructive paths', () => {
    expect(detectForbiddenScope('/admin/wipe')).toBe('destructive_action');
    expect(detectForbiddenScope('/delete')).toBe('destructive_action');
  });

  it('returns null for safe paths', () => {
    expect(detectForbiddenScope('/test_suites/scenarios/0/steps/0/constructor')).toBeNull();
    expect(detectForbiddenScope('/test_suites/pages/home/constructor')).toBeNull();
  });

  it('all 7 forbidden scopes are defined', () => {
    expect(AI_FORBIDDEN_SCOPES).toHaveLength(7);
    expect(AI_FORBIDDEN_SCOPES).toContain('scope_rules');
    expect(AI_FORBIDDEN_SCOPES).toContain('policy_rules');
    expect(AI_FORBIDDEN_SCOPES).toContain('gate_thresholds');
    expect(AI_FORBIDDEN_SCOPES).toContain('environment_config');
    expect(AI_FORBIDDEN_SCOPES).toContain('infrastructure');
    expect(AI_FORBIDDEN_SCOPES).toContain('security_configuration');
    expect(AI_FORBIDDEN_SCOPES).toContain('destructive_action');
  });
});

// ---------------------------------------------------------------------------
// sanitizeAiText
// ---------------------------------------------------------------------------

describe('sanitizeAiText', () => {
  it('passes through clean text', () => {
    const text = 'GET /api/health\nASSERT status 200';
    expect(sanitizeAiText(text)).toBe(text);
  });

  it('blocks shell injection: rm', () => {
    const text = 'GET /api/health\n`rm -rf /`';
    const result = sanitizeAiText(text);
    expect(result).toContain('SANITIZED');
    expect(result).not.toContain('rm -rf /');
  });

  it('blocks shell injection: curl', () => {
    const text = '`curl evil.com`';
    const result = sanitizeAiText(text);
    expect(result).toContain('SANITIZED');
  });

  it('blocks eval/exec/bash/sudo/nc', () => {
    const evil = ['eval', 'exec', 'bash', 'sudo', 'nc ', 'wget '];
    for (const cmd of evil) {
      const text = `\`${cmd} bad\``;
      const result = sanitizeAiText(text);
      expect(result).toContain('SANITIZED');
    }
  });

  it('allows safe backtick strings', () => {
    const text = '`/api/users/:id`  // this is a path';
    const result = sanitizeAiText(text);
    expect(result).not.toContain('SANITIZED');
    expect(result).toBe(text);
  });

  it('truncates too-long text', () => {
    const longText = 'A'.repeat(100_500);
    const result = sanitizeAiText(longText);
    expect(result.length).toBeLessThanOrEqual(100_000 + 40);
    expect(result).toContain('TRUNCATED');
  });
});

// ---------------------------------------------------------------------------
// createStepSuggestion
// ---------------------------------------------------------------------------

describe('createStepSuggestion', () => {
  it('creates a pending suggestion with unique id', () => {
    const s1 = createStepSuggestion(
      'scenario_auth',
      'Auth',
      '/test_suites/scenarios/0/steps/0/constructor',
      'GET /login',
      'GET /login\nWAIT 500',
      'Added wait for rate limit',
    );

    expect(s1.status).toBe('pending');
    expect(s1.entityId).toBe('scenario_auth');
    expect(s1.suggestedText).toContain('WAIT 500');
    expect(s1.id).toMatch(/^ai-sugg-/);

    const s2 = createStepSuggestion('x', 'X', '/path', '', '', '');
    expect(s2.id).not.toBe(s1.id);
  });

  it('sanitizes suggested text', () => {
    const s = createStepSuggestion(
      'a', 'A', '/path', 'old', '`curl evil.com`', 'test',
    );
    expect(s.suggestedText).toContain('SANITIZED');
  });

  it('detects page_constructor scope', () => {
    const s = createStepSuggestion('home', 'Home', '/test_suites/pages/home/constructor', '', '', '');
    expect(s.scope).toBe('page_constructor');
  });

  it('detects fuzzer_constructor scope', () => {
    const s = createStepSuggestion('fz', 'Fuzzer', '/test_suites/fuzzers/0/constructor', '', '', '');
    expect(s.scope).toBe('fuzzer_constructor');
  });

  it('detects module_content scope', () => {
    const s = createStepSuggestion('mod', 'Data', '/test_suites/imports/0/content', '', '', '');
    expect(s.scope).toBe('module_content');
  });

  it('detects scenario_metadata scope', () => {
    const s = createStepSuggestion('sc', 'Scenario', '/test_suites/scenarios/0/scenario_name', '', '', '');
    expect(s.scope).toBe('scenario_metadata');
  });
});

// ---------------------------------------------------------------------------
// validateSuggestion
// ---------------------------------------------------------------------------

describe('validateSuggestion', () => {
  it('passes valid suggestion', () => {
    const s = makeSuggestion();
    const result = validateSuggestion(s);
    expect(result.valid).toBe(true);
  });

  it('rejects forbidden scope path', () => {
    const s = makeSuggestion({ dslPath: '/infrastructure/target' });
    const result = validateSuggestion(s);
    expect(result.valid).toBe(false);
    expect(result).toHaveProperty('reason');
    expect((result as { reason: string }).reason).toContain('forbidden scope');
  });

  it('rejects non-mutable path', () => {
    // Use a non-forbidden but still non-mutable path (e.g. deep nested, not constructor)
    const s = makeSuggestion({ dslPath: '/test_suites/unknown/field' });
    const result = validateSuggestion(s);
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toContain('not AI-mutable');
  });

  it('rejects forbidden+non-mutable path with forbidden scope msg first', () => {
    // Forbidden scope takes priority over non-mutable check
    const s = makeSuggestion({ dslPath: '/test_suites/regulation/allowedHosts' });
    const result = validateSuggestion(s);
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toContain('forbidden scope');
  });

  it('rejects identical text', () => {
    const s = makeSuggestion({ currentText: 'same', suggestedText: 'same' });
    const result = validateSuggestion(s);
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toContain('identical');
  });
});

// ---------------------------------------------------------------------------
// suggestionDiffLines
// ---------------------------------------------------------------------------

describe('suggestionDiffLines', () => {
  it('marks unchanged lines with space', () => {
    const s = makeSuggestion({
      currentText: 'GET /api\nTYPE x\nCLICK btn',
      suggestedText: 'GET /api\nTYPE x\nCLICK btn',
    });
    const diff = suggestionDiffLines(s);
    expect(diff).toHaveLength(3);
    expect(diff.every((d) => d.marker === ' ')).toBe(true);
  });

  it('marks added lines with +', () => {
    const s = makeSuggestion({
      currentText: 'GET /api',
      suggestedText: 'GET /api\nASSERT status 200',
    });
    const diff = suggestionDiffLines(s);
    expect(diff).toHaveLength(2);
    expect(diff[0]!.marker).toBe(' ');
    expect(diff[1]!.marker).toBe('+');
    expect(diff[1]!.text).toBe('ASSERT status 200');
  });

  it('marks removed lines with -', () => {
    const s = makeSuggestion({
      currentText: 'GET /api\nOLD_STEP',
      suggestedText: 'GET /api',
    });
    const diff = suggestionDiffLines(s);
    expect(diff).toHaveLength(2);
    expect(diff[0]!.marker).toBe(' ');
    expect(diff[1]!.marker).toBe('-');
    expect(diff[1]!.text).toBe('OLD_STEP');
  });

  it('marks changed lines with - and +', () => {
    const diff = suggestionDiffLines(makeSuggestion({
      currentText: 'GET /old',
      suggestedText: 'GET /new',
    }));
    expect(diff).toHaveLength(2);
    expect(diff[0]!.marker).toBe('-');
    expect(diff[0]!.text).toBe('GET /old');
    expect(diff[1]!.marker).toBe('+');
    expect(diff[1]!.text).toBe('GET /new');
  });
});

// ---------------------------------------------------------------------------
// applySuggestion
// ---------------------------------------------------------------------------

describe('applySuggestion', () => {
  it('immutably writes suggested text to formData', () => {
    const formData = {
      test_suites: {
        scenarios: [
          {
            scenario_name: 'Auth',
            steps: [
              { constructor: 'GET /old' },
            ],
          },
        ],
      },
    };

    const s = makeSuggestion({
      dslPath: '/test_suites/scenarios/0/steps/0/constructor',
      currentText: 'GET /old',
      suggestedText: 'GET /new\nASSERT status 200',
    });

    const next = applySuggestion(formData, s);
    expect(next).not.toBe(formData); // immutable

    const typed = next as { test_suites: { scenarios: Array<{ steps: Array<{ constructor: string }> }> } };
    expect(typed.test_suites.scenarios[0]!.steps[0]!.constructor).toBe('GET /new\nASSERT status 200');
  });
});