import { describe, expect, it } from 'vitest';
import { adminPoliciesToRetentionPolicy } from './retentionPolicySerialize';
import { DEFAULT_ADMIN_POLICIES } from './defaults';

describe('retentionPolicySerialize', () => {
  it('maps artifact_retention_days and does not include gate fields', () => {
    const pol = adminPoliciesToRetentionPolicy({
      ...DEFAULT_ADMIN_POLICIES,
      artifact_retention_days: 30,
      max_critical: 99,
    });
    expect(pol).toEqual({ version: 1, artifact_retention_days: 30 });
    expect(pol).not.toHaveProperty('max_critical');
  });
});
