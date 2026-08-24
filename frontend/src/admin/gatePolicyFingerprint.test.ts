// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readLastGatePolicyPush, recordGatePolicyPush } from './gatePolicyFingerprint';

describe('gatePolicyFingerprint', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records and reads push meta', () => {
    const meta = recordGatePolicyPush({ max_critical: 0 }, '/tmp/policy.json');
    expect(meta.fingerprint.startsWith('gp_')).toBe(true);
    const again = readLastGatePolicyPush();
    expect(again?.fingerprint).toBe(meta.fingerprint);
    expect(again?.path).toBe('/tmp/policy.json');
  });
});
