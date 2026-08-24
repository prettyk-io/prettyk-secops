import { describe, expect, it, vi } from 'vitest';
import {
  attackBaseFromForm,
  ensureHarResourceForPlay,
  moduleIdForTab,
} from './studioWorkspaceChainPlay';

describe('studioWorkspaceChainPlay', () => {
  it('attackBaseFromForm prefers infrastructure', () => {
    expect(
      attackBaseFromForm({
        infrastructure: { base_url_override: 'https://a.test' },
        security_configuration: { base_url_override: 'https://b.test' },
      }),
    ).toBe('https://a.test');
  });

  it('ensureHarResourceForPlay creates missing har', () => {
    const message = {
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    };
    const next = ensureHarResourceForPlay(
      { test_suites: { imports: [] } },
      'pay',
      message,
    );
    expect(next).toBeTruthy();
    const imports = (next as { test_suites: { imports: Array<{ as: string; kind: string }> } })
      .test_suites.imports;
    expect(imports.some((r) => r.as === 'pay' && r.kind === 'har_file')).toBe(true);
  });

  it('moduleIdForTab falls back', () => {
    expect(moduleIdForTab(undefined, {}, 'openapi')).toBe('openapi');
  });
});
