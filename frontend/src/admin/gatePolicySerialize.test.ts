import { describe, expect, it } from 'vitest';
import { adminPoliciesToGatePolicy } from './gatePolicySerialize';
import { DEFAULT_ADMIN_POLICIES } from './defaults';

describe('adminPoliciesToGatePolicy', () => {
  it('serializes thresholds and filter flags for runner JSON', () => {
    const json = adminPoliciesToGatePolicy({
      ...DEFAULT_ADMIN_POLICIES,
      max_critical: 0,
      max_high: 1,
      filter_verified_only: true,
      filter_min_severity: 'High',
      filter_exclude_tags: 'noise, lab',
      filter_max_age_days: 14,
    });
    expect(json.max_high).toBe(1);
    expect(json.filter.verified_only).toBe(true);
    expect(json.filter.min_severity).toBe('high');
    expect(json.filter.exclude_tags).toEqual(['noise', 'lab']);
    expect(json.filter.max_age_days).toBe(14);
    expect(json.filter.require_active).toBe(true);
  });

  it('passes waivers into GatePolicy JSON', () => {
    const json = adminPoliciesToGatePolicy({
      ...DEFAULT_ADMIN_POLICIES,
      waivers: [
        {
          title: 'accepted XSS lab',
          severity: 'high',
          cwe: 'CWE-79',
          fingerprint: 'fp1',
          expires_at: '2026-12-31T00:00:00Z',
        },
      ],
    });
    expect(json.waivers).toHaveLength(1);
    expect(json.waivers[0]?.title).toBe('accepted XSS lab');
    expect(json.waivers[0]?.expires_at).toBe('2026-12-31T00:00:00Z');
  });
});
