import { describe, expect, it } from 'vitest';
import { freshCheckWiredData } from './freshCheck';

describe('freshCheckWiredData', () => {
  it('отдаёт schema defaults без juice demo suites', () => {
    const data = freshCheckWiredData() as {
      test_suites?: { scenarios?: unknown[] };
    };
    const scenarios = data.test_suites?.scenarios;
    expect(Array.isArray(scenarios) ? scenarios.length : 0).toBe(0);
  });
});
